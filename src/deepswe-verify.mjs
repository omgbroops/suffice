// DeepSWE acceptance: apply the task's hidden test patch inside the run
// workspace, run the repo's own spec runner (jest/vitest/mocha), and grade on
// the task's f2p (fail-to-pass) and p2p (pass-to-pass) whitelists — same
// semantics as the DeepSWE grader, minus the docker frame.
import { spawn, execFileSync } from 'node:child_process';
import { readFile, open, unlink, readdir, lstat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { runNodeTests } from './workspace.mjs';
import { runQnaAcceptance } from './aa-qna-verify.mjs';

// Suite-aware acceptance: DeepSWE tasks grade via hidden-patch + spec runner;
// QnA-AA tasks grade via the Luna rubric judge; everything else keeps the
// node --test path.
export async function runTaskAcceptance(workspace, task, opts = {}) {
  if (task.qna) return runQnaAcceptance(workspace, task, opts);
  return task.deepswe ? runDeepSweAcceptance(workspace, task, opts) : runNodeTests(workspace, task.acceptancePath, opts);
}

// Runners that print a JSON report then call process.exit() can lose the
// tail of a *piped* stdout (unflushed pipe data is dropped on exit) — jest
// does exactly this with --json. Capture to temp files instead: file writes
// are flushed before exit.
function run(cmd, cwd, { timeoutMs, env = {} } = {}) {
  const started = Date.now();
  return new Promise(async resolveResult => {
    const tag = `.dsw-verify-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    const outPath = resolve(cwd, `${tag}.out`);
    const errPath = resolve(cwd, `${tag}.err`);
    let outFd, errFd, child;
    try {
      outFd = await open(outPath, 'w');
      errFd = await open(errPath, 'w');
      child = spawn('bash', ['-c', cmd], { cwd, env: {
        ...process.env, ...env, CI: '1', NODE_NO_WARNINGS: '1',
        PATH: `${resolve(cwd, 'node_modules', '.bin')}:${process.env.PATH}`,
      }, stdio: ['ignore', outFd.fd, errFd.fd] });
    } catch (e) {
      await outFd?.close(); await errFd?.close();
      return resolveResult({ code: -1, stdout: '', stderr: String(e), timedOut: false, latencyMs: 0 });
    }
    let timedOut = false;
    const finish = async (code, extraErr = '') => {
      clearTimeout(timer);
      await outFd.close(); await errFd.close();
      const [stdoutRaw, stderrRaw] = await Promise.all([
        readFile(outPath, 'utf8').catch(() => ''), readFile(errPath, 'utf8').catch(() => ''),
      ]);
      await unlink(outPath).catch(() => {}); await unlink(errPath).catch(() => {});
      resolveResult({
        code,
        stdout: stdoutRaw.length > 32_000_000 ? stdoutRaw.slice(-32_000_000) : stdoutRaw,
        stderr: (stderrRaw + extraErr).slice(-500_000),
        timedOut, latencyMs: Date.now() - started,
      });
    };
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', e => finish(-1, String(e)));
    child.on('close', code => finish(code));
  });
}

// Extract a test-report JSON object from noisy runner stdout: runner output
// may carry deprecation warnings, coverage tables, or summaries around the
// JSON, so walk braces string-aware and keep the first complete object that
// looks like a report (scanning from the end — the report is printed last).
// One pass collecting every complete top-level {...} span, string-aware.
function topLevelObjects(s) {
  const spans = [];
  let depth = 0, inStr = false, esc = false, start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}' && --depth === 0) spans.push([start, i + 1]);
  }
  return spans;
}

function lastJson(stdout) {
  const looksReport = o => o && typeof o === 'object'
    && (o.testResults || o.assertionResults || o.passes || o.failures || o.stats || o.numTotalTests !== undefined);
  const spans = topLevelObjects(stdout);
  for (let i = spans.length - 1; i >= 0; i--) {
    try {
      const o = JSON.parse(stdout.slice(spans[i][0], spans[i][1]));
      if (looksReport(o)) return o;
    } catch { /* not a standalone object */ }
  }
  return null;
}


// Newest-first vitest/jest report files under src (reporter configs that
// write JSON to disk instead of stdout). Skips node_modules.
async function findReportFiles(dir) {
  const out = [];
  const walk = async (d, depth) => {
    if (depth > 5) return;
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = resolve(d, e.name);
      if (e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.git')) await walk(p, depth + 1);
      else if (e.isFile() && /output.*\.json|report.*\.json/.test(e.name) && /vitest|jest|test-results|reports/.test(p)) {
        out.push([p, (await lstat(p)).mtimeMs]);
      }
    }
  };
  await walk(dir, 0);
  return out.sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

// name -> 'passed'|'failed'|'pending' map across runner JSON shapes.
function resultsByName(runner, stdout, cwd) {
  const json = lastJson(stdout);
  if (!json) return null;
  const map = new Map();
  const put = (k, v) => { if (k && !map.has(k)) map.set(k, v); };
  if (runner === 'mocha') {
    for (const t of json.passes ?? []) put(t.fullTitle ?? t.title, 'passed');
    for (const t of json.pending ?? []) put(t.fullTitle ?? t.title, 'pending');
    for (const t of json.failures ?? []) put(t.fullTitle ?? t.title, 'failed');
    return map;
  }
  // jest + vitest --reporter=json share the assertionResults shape. DeepSWE
  // vitest ids are "<file>: <a > b > title>" — emit that form plus fullName.
  for (const file of json.testResults ?? []) {
    const fileRel = file.name && cwd ? relative(cwd, file.name).replaceAll('\\', '/') : file.name;
    for (const t of file.assertionResults ?? []) {
      const chain = [...(t.ancestorTitles ?? []), t.title].filter(Boolean);
      put(t.fullName, t.status);
      put(chain.join(' > '), t.status);
      if (fileRel) put(`${fileRel}: ${chain.join(' > ')}`, t.status);
      if (fileRel) put(`${fileRel}: ${t.title}`, t.status);
      // Monorepo commands run inside a package dir (`cd packages/core && vitest`)
      // while whitelist ids are package-relative (`tests/x.test.ts: ...`).
      const rels = new Set([fileRel].filter(Boolean));
      // Monorepo commands run inside a package dir (`cd packages/core && vitest`)
      // while whitelist ids are package-relative (`tests/x.test.ts: ...`).
      const pkgRel = fileRel?.replace(/^(?:packages|apps|libs)\/[^/]+\//, '');
      if (pkgRel) rels.add(pkgRel);
      // Repos whose package dir is a bare first segment (e.g. `drizzle-orm/`):
      // strip it when the remainder still looks like a spec path.
      const segRel = fileRel?.replace(/^[^/]+\//, '');
      if (segRel && /^(?:tests?|__tests__|src|spec)\//.test(segRel)) rels.add(segRel);
      for (const rel of rels) {
        put(`${rel}: ${chain.join(' > ')}`, t.status);
        put(`${rel}: ${t.title}`, t.status);
      }
      if (t.title) put(t.title, t.status);
    }
  }
  // An empty map is still a report (e.g. the spec suite failed to load —
  // its whitelist ids grade as missing => failed, never infra).
  return map;
}

function grade(ids, map) {
  const missing = [], failed = [];
  for (const id of ids) {
    const status = map?.get(id);
    if (status === 'passed') continue;
    (map?.has(id) ? failed : missing).push(id);
  }
  return { missing, failed };
}

export async function runDeepSweAcceptance(workspace, task, { timeoutMs = 900_000 } = {}) {
  const src = resolve(workspace, 'src');
  const meta = JSON.parse(await readFile(task.acceptancePath, 'utf8'));
  const patchPath = resolve(import.meta.dirname, '..', 'benchmarks', 'real-deepswe', 'hidden', `${task.id}.patch`);
  const patch = await readFile(patchPath, 'utf8');

  // The agent may have written a file at a path the hidden spec also adds
  // (e.g. it guessed the spec's filename). git apply refuses to overwrite an
  // untracked file, so park the agent's copy and retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      execFileSync('git', ['apply', '--whitespace=nowarn', patchPath], { cwd: src, stdio: 'pipe' });
      break;
    } catch (e) {
      const conflicts = [...String(e.stderr ?? e).matchAll(/(\S+): already exists in working directory/g)];
      if (attempt === 0 && conflicts.length) {
        const { renameSync } = await import('node:fs');
        for (const c of conflicts) renameSync(resolve(src, c[1]), resolve(src, `${c[1]}.agent-superseded`));
        continue;
      }
      return { status: 'failed', reason: 'hidden_patch_conflict', detail: String(e.stderr ?? e).slice(0, 2000), tests: 0, passed: 0, failed: meta.f2p.length };
    }
  }

  const detail = {};
  const perCmd = Math.max(60_000, (timeoutMs - 60_000) / 2);
  const newCommands = meta.newCommands ?? (meta.newCommand ? [meta.newCommand] : []);
  const baseCommands = meta.baseCommands ?? (meta.baseCommand ? [meta.baseCommand] : []);
  // Run every suite and merge the results: p2p whitelist ids are graded
  // against whichever run covers them (the new spec file can contain
  // pass-at-base tests, and the base suite guards regressions). Merge keeps
  // the strongest status per test (passed > failed > pending) so a filtered
  // out row can never shadow a real result from the run that covered it.
  const score = { pending: 0, skipped: 0, failed: 1, passed: 2 };
  const merged = new Map();
  const mergeIn = map => { for (const [k, v] of map) { if ((score[v] ?? 0) >= (score[merged.get(k)] ?? -1)) merged.set(k, v); } };
  const runAll = async (commands, label, tail) => {
    for (const command of commands) {
      const r = await run(command, src, { timeoutMs: perCmd });
      if (r.timedOut) return { status: 'timeout', detail: `${label} spec timed out` };
      detail[label] = { command, code: r.code, latencyMs: r.latencyMs, tail: (r.stderr + '\n' + r.stdout).slice(-tail) };
      // Some repos' runner configs route --reporter=json to a file instead
      // of stdout (vitest writes .vitest/json/output.json when configured).
      // If stdout carried no report, fall back to the freshest report file.
      let reportText = r.stdout;
      if (!lastJson(reportText)) {
        const found = await findReportFiles(src);
        for (const f of found) {
          const text = await readFile(f, 'utf8').catch(() => '');
          if (lastJson(text)) { reportText = text; detail[label].reportFile = f; break; }
        }
      }
      const map = resultsByName(meta.runner, reportText, src);
      // DeepSWE semantics: a suite that produces no report (build fails before
      // the runner starts, spec can't compile against the unfixed API, runner
      // exits early) contributes nothing — its whitelist ids grade as
      // missing => failed, matching the real grader's "no report = failed".
      if (map) mergeIn(map);
    }
    return null;
  };

  // new spec: every f2p whitelist id must pass
  const newErr = await runAll(newCommands, 'new', 4000);
  if (newErr) return { ...newErr, tests: 0, passed: 0, failed: meta.f2p.length };

  // Base suite runs WITHOUT the hidden spec (real test.sh mv's it to .bak):
  // a spec that can't compile against the base repo must not block base.
  const addedByPatch = [...patch.matchAll(/--- \/dev\/null\n\+\+\+ b\/(\S+)/g)].map(m => m[1]);
  const { renameSync } = await import('node:fs');
  const parked = [];
  for (const rel of addedByPatch) {
    try { renameSync(resolve(src, rel), resolve(src, `${rel}.dsw-bak`)); parked.push(rel); } catch { }
  }
  const baseErr = await runAll(baseCommands, 'base', 2000);
  for (const rel of parked) {
    try { renameSync(resolve(src, `${rel}.dsw-bak`), resolve(src, rel)); } catch { }
  }
  if (baseErr) return { ...baseErr, tests: 0, passed: 0, failed: meta.f2p.length };

  const f2p = grade(meta.f2p, merged);
  detail.f2p = { total: meta.f2p.length, missing: f2p.missing.length, failed: f2p.failed.length, failing: [...f2p.missing, ...f2p.failed].slice(0, 10) };
  const p2p = grade(meta.p2p, merged);
  detail.p2p = { total: meta.p2p.length, missing: p2p.missing.length, failed: p2p.failed.length, failing: [...p2p.missing, ...p2p.failed].slice(0, 10) };

  const ok = f2p.missing.length + f2p.failed.length + p2p.missing.length + p2p.failed.length === 0;
  return {
    status: ok ? 'passed' : 'failed',
    tests: meta.f2p.length + meta.p2p.length,
    passed: meta.f2p.length - f2p.failed.length - f2p.missing.length + meta.p2p.length - p2p.failed.length - p2p.missing.length,
    failed: f2p.failed.length + f2p.missing.length + p2p.failed.length + p2p.missing.length,
    detail,
    stdout: detail.new.tail,
  };
}
