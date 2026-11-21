// DeepSWE acceptance: apply the task's hidden test patch inside the run
// workspace, run the repo's own spec runner (jest/vitest/mocha), and grade on
// the task's f2p (fail-to-pass) and p2p (pass-to-pass) whitelists — same
// semantics as the DeepSWE grader, minus the docker frame.
import { spawn, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { runNodeTests } from './workspace.mjs';

// Suite-aware acceptance: DeepSWE tasks grade via hidden-patch + spec runner;
// everything else keeps the node --test path.
export async function runTaskAcceptance(workspace, task, opts = {}) {
  return task.deepswe ? runDeepSweAcceptance(workspace, task, opts) : runNodeTests(workspace, task.acceptancePath, opts);
}

function run(cmd, cwd, { timeoutMs, env = {} } = {}) {
  const started = Date.now();
  return new Promise(resolveResult => {
    const child = spawn('bash', ['-c', cmd], { cwd, env: {
      ...process.env, ...env, CI: '1', NODE_NO_WARNINGS: '1',
      PATH: `${resolve(cwd, 'node_modules', '.bin')}:${process.env.PATH}`,
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', d => { stdout += d; if (stdout.length > 2_000_000) stdout = stdout.slice(0, 2_000_000); });
    child.stderr.on('data', d => { stderr += d; if (stderr.length > 500_000) stderr = stderr.slice(0, 500_000); });
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', e => { clearTimeout(timer); resolveResult({ code: -1, stdout, stderr: stderr + String(e), timedOut, latencyMs: Date.now() - started }); });
    child.on('close', code => { clearTimeout(timer); resolveResult({ code, stdout, stderr, timedOut, latencyMs: Date.now() - started }); });
  });
}

// Extract the last parseable JSON object from noisy runner stdout.
function lastJson(stdout) {
  for (let i = stdout.length - 1; i >= 0; i--) {
    if (stdout[i] !== '{') continue;
    try { return JSON.parse(stdout.slice(i)); } catch { /* keep scanning */ }
  }
  return null;
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
      if (t.title) put(t.title, t.status);
    }
  }
  return map.size ? map : null;
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
      const map = resultsByName(meta.runner, r.stdout, src);
      if (!map) return { status: 'infrastructure_error', detail: `no ${meta.runner} JSON report for ${label} (exit ${r.code}): ${(r.stderr + r.stdout).slice(-1000)}` };
      mergeIn(map);
    }
    return null;
  };

  // new spec: every f2p whitelist id must pass
  const newErr = await runAll(newCommands, 'new', 4000);
  if (newErr) return { ...newErr, tests: 0, passed: 0, failed: meta.f2p.length };
  const baseErr = await runAll(baseCommands, 'base', 2000);
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
