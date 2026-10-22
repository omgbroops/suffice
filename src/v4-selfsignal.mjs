import { lstat, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { runProcess, sandboxCommand } from './v4-claude.mjs';

// Oracle-free gate signal. The hidden acceptance test never reaches this file: only the agent's own SELFTEST command and a tree diff are used.
const SELFTEST_LINE = /^SELFTEST:\s*(.+?)\s*$/gm;

// Last `SELFTEST: <cmd>` line wins; `none` or no line means the agent reported no check.
export function parseSelfTest(text = '') {
  const cmd = [...String(text).matchAll(SELFTEST_LINE)].map(m => m[1]).at(-1);
  return !cmd || cmd === 'none' ? null : cmd;
}

// Graders parse test output, not exit codes (qutebrowser's xvfb teardown exits nonzero after all tests pass).
export function pytestPassed(text = '') {
  const last = [...String(text).matchAll(/^=+ (.*\b(?:passed|failed|error|errors)\b.*?) in [\d.]+s.*=+\s*$/gm)].at(-1);
  if (!last) return false;
  return /\bpassed\b/.test(last[1]) && !/\b(?:failed|errors?)\b/.test(last[1]);
}

// shortcut: runs the agent's command through /bin/sh, so Windows needs a cmd.exe branch before it is used there.
// Returns { signal, cmd, tail }; tail is the last 1500 chars of the agent's own SELFTEST output (never hidden-test output).
// The agent's command runs in the same sandbox and env as the agent (envrun on PATH, broker socket), since its tail goes back into the retry prompt.
export function makeSelfCheck({ timeoutMs = 300_000 } = {}) {
  return async ({ workspace, text, env = {} }) => {
    const cmd = parseSelfTest(text);
    if (!cmd) return { signal: 'unverified', cmd: null, tail: '' };
    const sb = await sandboxCommand('/bin/sh', ['-c', cmd], workspace, env.V4_ENVRUN_SOCK);
    const out = await runProcess(sb.bin, sb.args, { cwd: workspace, timeoutMs, env: { ...env, ...sb.env } });
    const all = String(out.stdout ?? '') + String(out.stderr ?? '');
    return { signal: !out.timedOut && (out.code === 0 || pytestPassed(all)) ? 'pass' : 'fail', cmd, tail: all.slice(-1500) };
  };
}

// Paths (relative to the workspace) that differ between the untouched task copy and the workspace.
export async function changedPaths(original, workspace) {
  const src = resolve(original);
  const { code, stdout, timedOut } = await runProcess('diff', ['-rq', src, workspace], { cwd: workspace, timeoutMs: 60_000 });
  if (timedOut || code === null || code > 1) throw new Error('diff failed');
  const rels = new Set();
  const rel = path => (path.startsWith(src + sep) ? relative(src, path) : relative(workspace, path));
  for (const line of stdout.split('\n')) {
    const only = /^Only in (.+?): (.+)$/.exec(line);
    const pair = /^(?:Binary f|F)iles (.+?) and (.+?) differ$/.exec(line);
    if (only) rels.add(rel(join(only[1], only[2])));
    else if (pair) rels.add(relative(workspace, pair[2]));
  }
  return [...rels];
}

// shortcut: "applies" means every changed path is a regular file, directory or deletion inside cwd; it is not a real `patch --dry-run`. Upgrade before trusting it for patch-level claims.
async function checkPaths(workspace, rels) {
  let applies = true, inside = true;
  for (const rel of rels) {
    const abs = resolve(workspace, rel);
    if (!(abs + sep).startsWith(workspace + sep)) { inside = false; continue; }
    try {
      const real = await realpath(abs);
      if (real !== workspace && !real.startsWith(workspace + sep)) inside = false;
      const st = await lstat(abs);
      if (!st.isFile() && !st.isDirectory()) applies = false;
    } catch (error) {
      if (error.code !== 'ENOENT') applies = false; // a deleted file is fine; anything else is not
    }
  }
  return { applies, inside };
}

// Returns the per-round gate decision. `signal` is 'pass' | 'fail' | 'unverified' and drives the escalation rule in runV4.
export async function selfSignal({ original, workspace, text, selfCheck = makeSelfCheck(), env }) {
  const ws = await realpath(workspace);
  const rels = await changedPaths(original, ws);
  const { applies, inside } = await checkPaths(ws, rels);
  const { signal, cmd, tail } = await selfCheck({ workspace: ws, text, env });
  const patchNonEmpty = rels.length > 0;
  return { pass: patchNonEmpty && applies && inside && signal === 'pass', signal, patchNonEmpty, patchApplies: applies, inside, selfTestCmd: cmd, selfTestTail: tail };
}
