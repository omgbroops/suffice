// Prepare DeepSWE JS/TS tasks for the real-deepswe benchmark suite.
// Reproduces each task's environment/Dockerfile locally (ECR images are
// rate-limited): clone repo @ base commit with fix history pruned, run the
// same install/build steps, freeze into .suffice/deepswe-tasks/<id>/workspace/src.
// Extracts the hidden test patch + verifier commands into benchmarks/real-deepswe/.
// Usage: node scripts/prepare-deepswe.mjs [--tasks-dir=/tmp/deep-swe/tasks] [--only=id1,id2]
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, stateDir } from '../src/runtime.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(s => { const at = s.indexOf('='); return at < 0 ? [s, true] : [s.slice(0, at), s.slice(at + 1)]; }));
const tasksDir = args['--tasks-dir'] ?? '/tmp/deep-swe/tasks';
const only = args['--only'] ? String(args['--only']).split(',') : null;
const outRoot = resolve(root, 'benchmarks/real-deepswe');
const freezeRoot = resolve(stateDir, 'deepswe-tasks');

function toml(text, key) { const m = text.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm')); return m?.[1] ?? null; }
const sh = (cmd, cwd) => execFileSync('bash', ['-c', `set -e; cd ${JSON.stringify(cwd)}; ${cmd}`], { stdio: ['ignore', 'inherit', 'inherit'] });

// Extract a file's added content from a unified-diff patch (new-file hunks only).
function extractAddedFiles(patchText) {
  const files = {};
  const fileRe = /^diff --git a\/(\S+) b\/\S+\n(?:new file mode[^\n]*\n)?(?:[^\n]*\n)*?--- \/dev\/null\n\+\+\+ b\/\1\n@@ -\d+,0 \+1,(\d+) @@\n((?:\+[^\n]*\n?)*)/gm;
  let m;
  while ((m = fileRe.exec(patchText))) {
    files[m[1]] = m[3].split('\n').filter(l => l.startsWith('+')).map(l => l.slice(1)).join('\n');
  }
  return files;
}

// Pull the base)/new) command strings out of the in-repo test.sh the patch adds.
// Two formats exist: case-branch (`base)`/`new)` blocks) and the newer frame
// style (`# BASE mode (p2p):` / `# NEW mode (f2p):` comments preceding the run).
function extractTestShCommands(testSh) {
  // Each extractor returns an ARRAY of logical commands — a mode may run the
  // suite in several invocations (e.g. p2p as three `-t` filtered runs).
  const splitCmds = text => {
    const cmds = [];
    for (const raw of text.split('\n')) {
      const l = raw.trim();
      if (!l || l.startsWith('#')) continue;
      if (/^(log\b|set\b|rm\b|for\b|if\b|done\b|exit\b|run_log\b|then\b|else\b|fi\b|esac\b|:)/.test(l)) continue;
      if (cmds.length && cmds.at(-1).endsWith('\\')) cmds[cmds.length - 1] += ` ${l}`;
      else cmds.push(l);
    }
    return cmds.map(c => c.replace(/\\\s+/g, ' ').trim()).filter(Boolean);
  };
  const grab = mode => {
    const m = testSh.match(new RegExp(`^\\s*${mode}\\)\\s*\\n([\\s\\S]*?);;`, 'm'));
    if (!m) return null;
    const cmds = splitCmds(m[1]);
    return cmds.length ? cmds : null;
  };
  const grabFrame = marker => {
    const i = testSh.indexOf(marker);
    if (i < 0) return null;
    // Commands after the marker until the first non-runner bookkeeping line;
    // a command is a non-comment line containing a runner binary or npx.
    const rest = testSh.slice(i).split('\n').slice(1);
    const cmdLines = [];
    let collecting = false;
    for (const raw of rest) {
      const l = raw.trim();
      if (!l || l.startsWith('#')) { if (collecting && !cmdLines.at(-1)?.endsWith('\\')) break; continue; }
      if (/^(log\b|set\b|rm\b|for\b|if\b|done\b|exit\b|run_log\b|:)/.test(l)) { if (collecting) break; continue; }
      if (!collecting && !/mocha|jest|vitest|npx|deno|bun|yarn|pnpm|npm/.test(l)) continue;
      collecting = true;
      cmdLines.push(l);
      if (!l.endsWith('\\')) break;
    }
    return cmdLines.length ? [cmdLines.join(' ').replace(/\\\s+/g, ' ').trim()] : null;
  };
  // Last resort: the frame that writes mode reports — a logical command whose
  // args or redirect mention /logs/verifier/base* vs /logs/verifier/new*.
  const grabOutfile = word => {
    // Collect logical commands (join \ continuations), then find the runner
    // command whose own text — or the 2 commands after it (e.g. the `mv
    // ctrf-report.json base_ctrf.json` fixup) — mentions the mode's output.
    const cmds = [];
    let buf = '';
    for (const raw of testSh.split('\n')) {
      const l = raw.trim();
      if (!l || l.startsWith('#')) continue;
      buf = buf ? `${buf} ${l}` : l;
      if (buf.endsWith('\\')) { buf = buf.slice(0, -1); continue; }
      cmds.push(buf); buf = '';
    }
    const runnerRe = /mocha|jest|vitest|deno test|bun test/;
    const hits = [];
    for (let i = 0; i < cmds.length; i++) {
      if (!runnerRe.test(cmds[i])) continue;
      // The command itself plus non-runner bookkeeping after it (mv/log);
      // stop before the next runner command — that's the other mode.
      const window = [cmds[i]];
      for (let j = i + 1; j < cmds.length && !runnerRe.test(cmds[j]); j++) window.push(cmds[j]);
      if (new RegExp(`\\b${word}(_ctrf|_run|\\.xml|-run|_mocha|_jest|_vitest)|\\b${word}_ctrf\\.json|\\b${word}\\.xml`).test(window.join(' '))) hits.push(cmds[i]);
    }
    return hits.length ? hits : null;
  };
  const base = grab('base') ?? grabFrame('# BASE mode') ?? grabOutfile('base');
  const fresh = grab('new') ?? grabFrame('# NEW mode') ?? grabOutfile('new');
  return { base, new: fresh };
}

// Turn a verifier command into an argv list with a JSON reporter we can parse.
function normalizeCommand(cmd) {
  if (!cmd) return null;
  let c = cmd
    .replace(/^run_log\s+/, '')
    .replace(/\|\s*(tee|xargs|jq|head|tail)\b.*$/, '')
    .replace(/^corepack\s+/, '')
    .replace(/^pnpm\s+exec\s+/, 'npx ')
    .replace(/^pnpm\s+--filter/, 'corepack pnpm --filter')
    .replace(/^pnpm\s+(vitest|jest|mocha)/, 'npx $1')
    .replace(/^yarn\s+(vitest|jest|mocha)/, 'npx $1')
    .replace(/\/app/g, '.')
    .replace(/LHSWE_\w+=\S+\s*/g, '')
    .replace(/2>&1/g, '')
    .replace(/>\s*\S+/g, '')
    .trim();
  c = c.replace(/--reporters?=\S+/g, '').replace(/--reporters?\s+\S+/g, '')
    .replace(/--reporter-options(=\S+|\s+\S+)?/g, '')
    .replace(/--outputFile(=\S+|\s+\S+)?/g, '').replace(/--reporter-destination=\S+/g, '')
    .replace(/\s{2,}/g, ' ').trim();
  const toks = c.split(/\s+/);
  if (/\bjest\b/.test(c)) return { runner: 'jest', argv: [...toks, '--json', '--no-coverage'] };
  if (/\bvitest\b/.test(c)) return { runner: 'vitest', argv: [...toks, '--reporter=json'] };
  if (/\bmocha\b/.test(c)) return { runner: 'mocha', argv: toks.map(t => t === 'mocha' ? './node_modules/.bin/mocha' : t).concat(['--reporter', 'json']) };
  return null;
}

const cleanPrompt = text => text.split('\n')
  .filter(l => !/new branch|commit everything|commit your|git commit|open a PR|pull request/i.test(l))
  .join('\n').replace(/\n{3,}/g, '\n\n').trim();

// Reproduce the Dockerfile locally: clone at base sha (history pruned so the
// upstream fix can't leak), then run each in-repo RUN step verbatim.
async function reproduceEnvironment(taskDir, wsSrc, baseSha, repoUrl) {
  await mkdir(wsSrc, { recursive: true });
  const dockerfile = await readFile(resolve(taskDir, 'environment', 'Dockerfile'), 'utf8');
  const env = {};
  for (const m of dockerfile.matchAll(/^ENV\s+(\w+)=("[^"]*"|[^\s]+)/gm)) env[m[1]] = m[2].replace(/"/g, '');

  sh(`git clone ${repoUrl} . && \
DEFAULT="$(git remote show origin | sed -n 's/.*HEAD branch: //p')" && \
git checkout -B "$DEFAULT" ${baseSha} && \
git remote remove origin && \
for b in $(git for-each-ref --format='%(refname:short)' refs/heads | grep -vx "$DEFAULT"); do git branch -D "$b" || true; done && \
for t in $(git tag); do git merge-base --is-ancestor "$t" HEAD 2>/dev/null || git tag -d "$t"; done && \
git reflog expire --expire=now --all && \
git gc --prune=now && \
(git submodule update --init --recursive || true)`, wsSrc);

  // Run Dockerfile RUN steps after the clone block, minus out-of-tree installs
  // (/opt CTRF reporters — our verifier uses native JSON output instead).
  const envPrefix = Object.entries(env).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
  for (const m of dockerfile.matchAll(/^RUN\s+([\s\S]*?)(?=^RUN |^ENV |^ARG |^CMD |^WORKDIR |^FROM |\n?\s*$)/gm)) {
    let step = m[1].replace(/\\\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!step) continue;
    if (/\/opt\/|\/logs\/|-g\s|npm install -g|corepack enable/.test(step)) continue;
    if (/^\s*git clone\b/.test(step) || /\bgit clone\s+\S+\s+\.\s*(&|$)/.test(step)) continue; // clone is done above
    step = step.replace(/cd \/app\s*&&?\s*/g, '').replace(/\/app/g, '.')
      .replace(/(^|&&|\|\||;|\|)\s*corepack\s+/g, '$1 ')
      .replace(/(^|&&|\|\||;|\|)\s*pnpm\b/g, '$1 corepack pnpm')
      .replace(/(^|&&|\|\||;|\|)\s*yarn\b/g, '$1 corepack yarn')
      // Freeze dirs live under the parent repo's pnpm-workspace.yaml; stop the
      // upward lookup so the task's own package installs standalone.
      .replace(/\bpnpm install\b(?![^\n]*--ignore-workspace)/g, 'pnpm install --ignore-workspace');
    try { sh(`${envPrefix} ${step}`, wsSrc); }
    catch (e) { console.log(`  step failed (continuing): ${step.slice(0, 100)}`); }
  }
}

// Whether the Dockerfile installs deps (npm/pnpm/yarn/bun). Tasks that don't
// (e.g. deno) freeze fine without node_modules.
async function needsDeps(taskDir) {
  try {
    const df = await readFile(resolve(taskDir, 'environment/Dockerfile'), 'utf8');
    return /\b(npm|pnpm|yarn|bun)\b[^\n]*\b(install|add|i\b)/.test(df);
  } catch { return true; }
}

const dirs = (await readdir(tasksDir, { withFileTypes: true })).filter(d => d.isDirectory() && (!only || only.includes(d.name)));
const tasks = [];
for (const dir of dirs) {
  const id = dir.name;
  const taskDir = resolve(tasksDir, id);
  const taskToml = await readFile(resolve(taskDir, 'task.toml'), 'utf8');
  const language = toml(taskToml, 'language');
  if (!['javascript', 'typescript'].includes(language)) { console.log(`skip ${id}: language=${language}`); continue; }
  const repoUrl = toml(taskToml, 'repository_url');
  const base = toml(taskToml, 'base_commit_hash');
  const title = toml(taskToml, 'display_title') ?? id;

  const wsSrc = resolve(freezeRoot, id, 'workspace', 'src');
  const depsDir = resolve(freezeRoot, id, 'deps');
  // Reuse only a fully frozen task: repo + installed deps. A partial freeze
  // (clone ok, install died) gets wiped and redone.
  const frozen = existsSync(resolve(wsSrc, 'package.json'))
    && (existsSync(resolve(depsDir, 'node_modules')) || existsSync(resolve(wsSrc, 'node_modules')) || !needsDeps(taskDir));
  if (!frozen) {
    console.log(`freeze ${id} (${repoUrl} @ ${base.slice(0, 8)})`);
    await rm(resolve(freezeRoot, id), { recursive: true, force: true });
    try { await reproduceEnvironment(taskDir, wsSrc, base, repoUrl); }
    catch (e) { console.log(`skip ${id}: environment failed (${String(e.message ?? e).split('\n')[0].slice(0, 120)})`); continue; }
  } else console.log(`reuse ${id}`);
  // node_modules lives outside the frozen workspace: it is hardlinked into
  // each run dir (466MB+ per task) instead of copied — see experiment.mjs.
  if (existsSync(resolve(wsSrc, 'node_modules')) && !existsSync(resolve(depsDir, 'node_modules'))) {
    await mkdir(depsDir, { recursive: true });
    await rename(resolve(wsSrc, 'node_modules'), resolve(depsDir, 'node_modules'));
  }

  const testPatch = await readFile(resolve(taskDir, 'tests', 'test.patch'), 'utf8');
  const config = JSON.parse(await readFile(resolve(taskDir, 'tests', 'config.json'), 'utf8'));
  const added = extractAddedFiles(testPatch);
  // Frame-style tasks ship tests/test.sh outside the patch (only spec files
  // are patched in); patch-added test.sh wins when present.
  const testSh = added['test.sh'] ?? await readFile(resolve(taskDir, 'tests', 'test.sh'), 'utf8').catch(() => null);
  if (!testSh) { console.log(`skip ${id}: patch adds no test.sh`); continue; }
  const modes = extractTestShCommands(testSh);
  const normalizeAll = cmds => (cmds ?? []).map(normalizeCommand).filter(Boolean);
  const newCmds = normalizeAll(modes.new);
  const baseCmds = normalizeAll(modes.base);
  if (!newCmds.length) { console.log(`skip ${id}: no parseable new-mode command (${(modes.new ?? []).join(' | ').slice(0, 120)})`); continue; }

  const instruction = await readFile(resolve(taskDir, 'instruction.md'), 'utf8');
  const prompt = cleanPrompt(instruction);

  await mkdir(resolve(outRoot, 'hidden'), { recursive: true });
  await mkdir(resolve(outRoot, 'meta'), { recursive: true });
  await writeFile(resolve(outRoot, 'hidden', `${id}.patch`), testPatch);
  const meta = {
    id, repo: repoUrl, baseCommit: base, title,
    runner: newCmds[0].runner,
    newCommands: newCmds.map(c => c.argv.join(' ')),
    baseCommands: baseCmds.map(c => c.argv.join(' ')),
    f2p: config.f2p_node_ids ?? [],
    p2p: config.p2p_node_ids ?? [],
  };
  await writeFile(resolve(outRoot, 'meta', `${id}.json`), JSON.stringify(meta, null, 2));
  const agentTest = (meta.baseCommands.length ? meta.baseCommands : meta.newCommands).join(' && ');
  await writeFile(resolve(freezeRoot, id, 'workspace', 'deepswe.json'), JSON.stringify({ agentTest }, null, 2));
  tasks.push({ id, title, prompt, repoUrl, runner: newCmds[0].runner });
  console.log(`ok ${id} (${newCmds[0].runner}) f2p=${meta.f2p.length} p2p=${meta.p2p.length}`);
}

const tasksMjs = `import { resolve } from 'node:path';
import { stateDir } from '../../src/runtime.mjs';
// Generated by scripts/prepare-deepswe.mjs — DeepSWE (datacurve) JS/TS tasks.
export const deepTasks = ${JSON.stringify(tasks.map(t => ({ id: t.id, title: t.title, prompt: t.prompt })), null, 2)}
  .map(t => ({ ...t, deepswe: true,
    workspaceDir: resolve(stateDir, 'deepswe-tasks', t.id, 'workspace'),
    depsDir: resolve(stateDir, 'deepswe-tasks', t.id, 'deps'),
    acceptancePath: resolve(import.meta.dirname, 'meta', t.id + '.json') }));
`;
await writeFile(resolve(outRoot, 'tasks.mjs'), tasksMjs);
console.log(`wrote ${tasks.length} tasks to benchmarks/real-deepswe/tasks.mjs`);
