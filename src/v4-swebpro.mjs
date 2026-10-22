// SWE-bench Pro workspace provider for scripts/v4-bench.mjs.
// Mirrors scaleapi/SWE-bench_Pro-os swe_bench_pro_eval.py (create_entryscript + eval_with_docker),
// with the v2 ghcr image tag from the dataset row. Node built-ins only.
import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEnvrunBroker } from './v4-envrun.mjs';

const PLATFORM = 'linux/amd64';
const LIMITS = ['--cpus', '2', '--memory', '3g'];
const DEFAULT_TIMEOUT_MS = 1200_000;
const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(homedir(), '.cache', 'v4-swebpro');
const WORK = join(CACHE, 'work'); // under $HOME so colima can bind-mount it
const REPORTS = join(HERE, '..', 'reports', 'v4', 'failures');
const DATASET = 'https://datasets-server.huggingface.co/rows?dataset=ScaleAI/SWE-bench_Pro&config=default&split=test';
const SCRIPTS_RAW = 'https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/main/run_scripts';
const INSTRUCTION = 'Edit the source files in the current directory to resolve the issue above. '
  + 'Do not edit existing tests; you may add new test files (they do not affect grading). '
  + 'Run the project\'s tests the way its CI does via `envrun bash /run_tests.sh <test files>` (e.g. `envrun bash /run_tests.sh tests/unit/foo/test_bar.py`); `envrun <command>` runs any other command in the project\'s Linux container against your current files. '
  + 'Write and run a minimal test for the issue there. Work only inside the current directory.';
const REPO_BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- pure helpers (unit-tested) ----------

// Pass iff every FAIL_TO_PASS and PASS_TO_PASS name is PASSED in the parser output (eval semantics).
export function judge(output, failToPass, passToPass) {
  const passed = new Set((output?.tests ?? []).filter(t => t.status === 'PASSED').map(t => t.name));
  return [...failToPass, ...passToPass].every(name => passed.has(name));
}

// Files a patch touches, from its `diff --git a/X b/Y` headers (new paths win).
export function patchFiles(patch) {
  const files = new Set();
  for (const m of patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)) files.add(m[2]);
  return [...files];
}

export function lastLines(text, n = 60) {
  return text.split('\n').slice(-n).join('\n');
}

// Container script: the eval's entryscript with markers so failures classify without guessing.
// shortcut: env exports from the dockerfiles are skipped (image ENV is inherited at docker run), upgrade if an image needs build-time ENV.
export function buildEntryScript(row) {
  const base = row.base_commit;
  const selected = JSON.parse(row.selected_test_files_to_run).join(',');
  const testCmd = row.before_repo_set_cmd.trim().split('\n').pop()
    .replaceAll('/tests/test_patch.patch', '/workspace/test_patch.patch');
  return [
    'cd /app',
    `git reset --hard ${base}`,
    `git checkout ${base}`,
    'git apply -v /workspace/patch.diff || { echo PATCH_APPLY_FAILED; exit 97; }',
    `(${testCmd}) || { echo TEST_PATCH_APPLY_FAILED; exit 98; }`,
    `bash /workspace/run_script.sh ${selected} > /workspace/stdout.log 2> /workspace/stderr.log`,
    'python /workspace/parser.py /workspace/stdout.log /workspace/stderr.log /workspace/output.json',
    '',
  ].join('\n');
}

const TOOLCHAIN_CRASH = /segmentation fault|SIGSEGV|signal: segmentation|qemu:|exit (code|status) (137|139)\b/;

export function classify({ timedOut, dockerOut, hasOutput, output, row }) {
  if (timedOut) return 'timeout';
  if (/PATCH_APPLY_FAILED|TEST_PATCH_APPLY_FAILED/.test(dockerOut)) return 'patch_apply_failed';
  // toolchain crash under emulation or OOM kill: not a verdict on the patch
  if (TOOLCHAIN_CRASH.test(dockerOut) || !hasOutput) return 'infra_error';
  return judge(output, JSON.parse(row.fail_to_pass), JSON.parse(row.pass_to_pass)) ? 'pass' : 'test_fail';
}

// ---------- process + data helpers ----------

function run(cmd, args, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', d => out.push(d));
    child.stderr.on('data', d => err.push(d));
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, timedOut, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() });
    });
    child.on('error', e => { clearTimeout(timer); resolve({ code: -1, timedOut, stdout: '', stderr: String(e) }); });
  });
}

const docker = (args, opts) => run('docker', args, opts);

async function getJson(url) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (res?.ok) {
      const body = await res.json();
      if (!body.error) return body;
    }
    await sleep(5000 * (i + 1));
  }
  throw new Error(`datasets-server unavailable: ${url}`);
}

async function loadRows() {
  const file = join(CACHE, 'rows.json');
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const page = await getJson(`${DATASET}&offset=${offset}&length=100`);
    rows.push(...page.rows.map(x => x.row));
    if (page.rows.length < 100) break;
  }
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(rows));
  return rows;
}

export async function loadRow(instanceId) {
  const row = (await loadRows()).find(r => r.instance_id === instanceId);
  if (!row) throw new Error(`instance not in ScaleAI/SWE-bench_Pro: ${instanceId}`);
  return row;
}

// Per-instance run_script.sh and parser.py from the eval repo, cached on disk.
async function loadScripts(instanceId) {
  const dir = join(CACHE, 'scripts', instanceId);
  const out = {};
  for (const name of ['run_script.sh', 'parser.py']) {
    const file = join(dir, name);
    if (!existsSync(file)) {
      const res = await fetch(`${SCRIPTS_RAW}/${instanceId}/${name}`, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`missing eval script ${name} for ${instanceId} (${res.status})`);
      await mkdir(dir, { recursive: true });
      await writeFile(file, await res.text());
    }
    out[name] = await readFile(file, 'utf8');
  }
  return out;
}

// Image refcount so cleanup removes an image only when no prep still uses it.
const imageUsers = new Map();

// ---------- provider ----------

export async function prepWorkspace(item) {
  if (item?.benchmark !== 'swebpro') throw new Error('swebpro provider got a non-swebpro item');
  const row = await loadRow(item.taskId);
  const image = row.docker_image;
  imageUsers.set(image, (imageUsers.get(image) ?? 0) + 1);
  let cid = null;
  let dir = null;
  let broker = null;
  const release = async () => {
    // Every step runs even if an earlier one throws (else images leak); rethrow the first error at the end.
    const errors = [];
    const step = async fn => { try { await fn(); } catch (e) { errors.push(e); } };
    const c = cid; cid = null;
    const d = dir; dir = null;
    const b = broker; broker = null;
    if (b) await step(() => b.close());
    if (c) await step(() => docker(['rm', '-f', c], { timeoutMs: 60_000 }));
    if (d) await step(() => rm(d, { recursive: true, force: true }));
    const left = imageUsers.get(image) - 1;
    imageUsers.set(image, left);
    if (left === 0) { imageUsers.delete(image); await step(() => docker(['rmi', image], { timeoutMs: 120_000 })); }
    if (errors.length) throw errors[0];
  };
  try {
    const pulled = await docker(['pull', '--platform', PLATFORM, image], { timeoutMs: 1800_000 });
    if (pulled.code !== 0) throw new Error(`pull failed: ${lastLines(pulled.stderr, 5)}`);
    const created = await docker(['create', '--platform', PLATFORM, ...LIMITS, image], { timeoutMs: 120_000 });
    if (created.code !== 0) throw new Error(`create failed: ${lastLines(created.stderr, 5)}`);
    cid = created.stdout.trim();
    await mkdir(WORK, { recursive: true });
    dir = realpathSync(await mkdtemp(join(WORK, 'ws-')));
    const copied = await docker(['cp', `${cid}:/app/.`, dir], { timeoutMs: 900_000 });
    if (copied.code !== 0) throw new Error(`docker cp failed: ${lastLines(copied.stderr, 5)}`);
    // Test files come from the eval's test patch; keep them out of the agent's workspace.
    const hidden = patchFiles(row.test_patch);
    for (const f of hidden) await rm(join(dir, f), { force: true });
    await rm(join(dir, '.git'), { recursive: true, force: true });
    const git = ['-C', dir, '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'user.name=v4-swebpro', '-c', 'user.email=v4-swebpro@local'];
    await run('git', ['-C', dir, 'init', '-q'], { timeoutMs: 60_000 });
    await run('git', [...git, 'add', '-A'], { timeoutMs: 600_000 });
    await run('git', [...git, 'commit', '-q', '--allow-empty', '-m', 'baseline'], { timeoutMs: 600_000 });
    item.prompt = `${row.problem_statement}\n\n${INSTRUCTION}`;
    const instanceId = item.taskId;
    // Agent env: only the broker socket (image and hidden list stay with the harness) and the repo bin on PATH.
    await loadScripts(instanceId); // ensures the cached run_script.sh exists on disk before the broker mounts it
    broker = await startEnvrunBroker({ image, platform: PLATFORM, removed: hidden, runScript: join(CACHE, 'scripts', instanceId, 'run_script.sh') });
    const env = { V4_ENVRUN_SOCK: broker.sock, PATH: `${REPO_BIN}:${process.env.PATH ?? ''}` };
    return { dir, cleanup: release, cid, image, row, instanceId, prompt: item.prompt, item, env };
  } catch (error) {
    await release();
    throw error;
  }
}

// Pristine copy for verify: prep.dir is the agent's workspace, so re-prepare the same item (fresh docker cp of the baseline).
export const cloneForVerify = prep => prepWorkspace(prep.item);

async function gitDiff(dir) {
  await run('git', ['-C', dir, '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'add', '-A'], { timeoutMs: 600_000 });
  const d = await run('git', ['-C', dir, 'diff', '--cached', '--binary', 'HEAD'], { timeoutMs: 600_000 });
  if (d.code !== 0) throw new Error(`git diff failed: ${lastLines(d.stderr, 5)}`);
  return d.stdout;
}

export async function runAcceptance(prep, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const { row, dir, image, instanceId } = prep;
  const label = process.env.V4_RUN_LABEL || 'adhoc';
  const reportDir = join(REPORTS, label);
  await mkdir(reportDir, { recursive: true });
  const diff = await gitDiff(dir);
  let result;
  let log = '';
  if (!diff.trim()) {
    result = { pass: false, kind: 'empty_patch', output: '' };
    log = 'empty diff; no container run\n';
  } else {
    // Outside WORK: the agent can read WORK siblings, and this dir holds test_patch.patch.
    const evalDir = join(CACHE, 'eval', `eval-${instanceId}-${process.pid}-${Date.now()}`);
    await mkdir(evalDir, { recursive: true });
    const scripts = await loadScripts(instanceId);
    await writeFile(join(evalDir, 'patch.diff'), diff);
    await writeFile(join(evalDir, 'test_patch.patch'), row.test_patch);
    await writeFile(join(evalDir, 'run_script.sh'), scripts['run_script.sh']);
    await writeFile(join(evalDir, 'parser.py'), scripts['parser.py']);
    await writeFile(join(evalDir, 'entryscript.sh'), buildEntryScript(row));
    const name = `v4swp-${process.pid}-${Date.now()}`;
    const r = await docker(['run', '--rm', '--name', name, '--platform', PLATFORM, ...LIMITS,
      '-v', `${evalDir}:/workspace`, '--entrypoint', '/bin/bash', image,
      '-c', 'bash /workspace/entryscript.sh'], { timeoutMs });
    if (r.timedOut) await docker(['rm', '-f', name], { timeoutMs: 60_000 });
    const dockerOut = r.stdout + r.stderr;
    const outFile = join(evalDir, 'output.json');
    const hasOutput = existsSync(outFile);
    const output = hasOutput ? JSON.parse(await readFile(outFile, 'utf8')) : null;
    const stdoutLog = existsSync(join(evalDir, 'stdout.log')) ? await readFile(join(evalDir, 'stdout.log'), 'utf8') : '';
    const stderrLog = existsSync(join(evalDir, 'stderr.log')) ? await readFile(join(evalDir, 'stderr.log'), 'utf8') : '';
    const kind = classify({ timedOut: r.timedOut, dockerOut: dockerOut + stdoutLog + stderrLog, hasOutput, output, row });
    result = { pass: kind === 'pass', kind, output: lastLines(dockerOut + stdoutLog + stderrLog) };
    log = `docker exit ${r.code}\n--- docker ---\n${dockerOut}\n--- stdout.log ---\n${stdoutLog}\n--- stderr.log ---\n${stderrLog}\n--- output.json ---\n${output ? JSON.stringify(output, null, 2) : '(none)'}\n`;
    await rm(evalDir, { recursive: true, force: true });
  }
  await writeFile(join(reportDir, `${instanceId}.log`), `kind=${result.kind} pass=${result.pass}\n${log}`);
  await writeFile(join(reportDir, `${instanceId}.diff`), diff);
  return result;
}

export default { prepWorkspace, runAcceptance };
