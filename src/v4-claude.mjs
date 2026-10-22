import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { V4Error } from './v4-escalation.mjs';

// Thin profile: tiny system prompt. Tool list comes from the tier config (default is these four).
export const V4_TOOLS = ['Read', 'Edit', 'Write', 'Bash'];
export const V4_SYSTEM_PROMPT = 'You are a coding agent. Make the requested change with a minimal correct edit to the files in the current directory. Preserve the public API. Work only inside the current directory: never search or list outside it (no find or ls on / or ~), the tests you cannot see are not elsewhere on disk. Use only Read, Edit, Write and Bash. Do not claim checks that did not run. Workflow: first write a minimal failing test from the issue when feasible, make the edit, run that test, then end your reply with one final line `SELFTEST: <command>` naming the command you ran (or `SELFTEST: none` if you ran none).';

// v5 arm: same claude call, tighter. Prompt already holds the ranked files and excerpts, so the model edits first and reads only ranges.
export const V5_SYSTEM_PROMPT = 'You are a coding agent. The prompt lists likely files with excerpts, ranked most likely first. Edit those files first. Read only with line ranges (Read offset/limit or sed -n A,Bp); never print a whole file. Search only if the listed files fail. Make a minimal correct edit and preserve the public API. Work only inside the current directory. Use only Read, Edit, Write and Bash. Before editing, write a minimal failing test from the issue when feasible, run it, edit, rerun it. Do not claim checks that did not run. End your reply with one final line `SELFTEST: <command>` naming the command you ran, or `SELFTEST: none`.';

// SBPL string literal: escape backslash and double quote.
export function sbplString(path) { return `"${path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }

// Realpath plus its /System/Volumes/Data alias on macOS (SBPL matches the resolved path).
export function pathVariants(path) {
  let real = path;
  try { real = realpathSync(path); } catch { /* missing path: keep the raw form */ }
  return [...new Set([real, '/System/Volumes/Data' + real])];
}

// ~/.cache/v4-swebpro holds rows.json (hidden test_patch, FAIL_TO_PASS, PASS_TO_PASS); its work/ subdir is re-allowed via `allowed`.
export function sandboxProfile({ denied = [join(homedir(), 'bench-repos'), join(homedir(), 'suffice-v4'), join(homedir(), '.cache', 'v4-swebpro'), tmpdir()], allowed, literal = [] }) {
  const lines = ['(version 1)', '(allow default)'];
  for (const dir of denied) for (const p of pathVariants(dir)) lines.push(`(deny file-read-data (subpath ${sbplString(p)}))`);
  // Last matching rule wins, so the workspace base re-allows reads inside a denied tree.
  for (const dir of allowed) for (const p of pathVariants(dir)) lines.push(`(allow file-read-data (subpath ${sbplString(p)}))`);
  for (const file of literal) for (const p of pathVariants(file)) lines.push(`(allow file-read-data (literal ${sbplString(p)}))`);
  return lines.join('\n');
}

// macOS only: wraps the agent command in sandbox-exec and redirects TMPDIR into the workspace base.
export async function sandboxCommand(bin, args, workspace) {
  if (process.platform !== 'darwin') return { bin, args, env: {} };
  const base = dirname(resolve(workspace));
  const tmp = join(base, 'tmp');
  await mkdir(tmp, { recursive: true });
  // The agent binary itself must stay readable even when it sits in a denied tree (e.g. a test fixture in this repo).
  const literal = bin.includes('/') ? [resolve(bin)] : [];
  return { bin: 'sandbox-exec', args: ['-p', sandboxProfile({ allowed: [base], literal }), bin, ...args], env: { TMPDIR: tmp } };
}

export function runProcess(bin, args, { cwd, timeoutMs, env }) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(bin, args, { cwd, env: env ? { ...process.env, ...env } : process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.resume();
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolveRun({ code, stdout, timedOut }); });
  });
}

// --max-budget-usd value, rounded down so the CLI cap never exceeds what is left; 0 means exhausted.
export function budgetFlag(remainingBudgetUsd) {
  return (Math.floor(remainingBudgetUsd * 1e4) / 1e4).toFixed(4);
}

// Adapter contract: attempt({ model, effort, prompt, workspace, tools, remainingBudgetUsd }) -> { costUsd, usage, status }.
// costUsd null means unknown. The hidden verdict is added by buildAttempt, not here.
// Effort maps to `claude --effort` (low|medium|high|xhigh|max, from claude --help). Unverified live.
// On macOS the agent runs under sandbox-exec (sandboxCommand): reads of bench-repos, this repo and the temp dir are denied, the workspace base is allowed.
// shortcut: non-darwin runs are unsandboxed (oracle hidden by path and prompt only), add a Linux sandbox before trusting pass rates there.
export function makeClaudeAdapter({ bin = process.env.V4_CLAUDE_BIN ?? 'claude', timeoutMs = 360_000, lean = false, systemPrompt } = {}) {
  let session = null; // resume only within the same model; escalation starts fresh with the task prompt
  return async ({ model, effort, prompt, workspace, tools, remainingBudgetUsd, maxTurns }) => {
    const cap = budgetFlag(remainingBudgetUsd);
    if (!(Number(cap) > 0)) throw new V4Error('BUDGET_EXHAUSTED');
    const resume = session?.model === model ? ['--resume', session.id] : [];
    const effortArgs = effort ? ['--effort', effort] : [];
    const turns = maxTurns ?? (lean ? 12 : null);
    const leanArgs = turns ? ['--max-turns', String(turns)] : [];
    // Keeps the system prompt prefix stable across calls (per-machine sections move out of it), so the cache hits.
    const args = ['-p', prompt, '--model', model, '--output-format', 'json', '--tools', tools.join(','), '--allowedTools', tools.join(','),
      '--strict-mcp-config', '--disable-slash-commands', '--setting-sources', 'project', '--exclude-dynamic-system-prompt-sections', // measured: default config loads ~262K tokens (about $0.26 per call on Haiku); lean flags ~$0.0004
      '--system-prompt', systemPrompt ?? (lean ? V5_SYSTEM_PROMPT : V4_SYSTEM_PROMPT), '--max-budget-usd', cap,...effortArgs, ...leanArgs, ...resume];
    const sandboxed = await sandboxCommand(bin, args, workspace);
    const out = await runProcess(sandboxed.bin, sandboxed.args, { cwd: workspace, timeoutMs, env: sandboxed.env });
    if (out.timedOut) throw new V4Error('RUN_TIMEOUT');
    let json;
    try { json = JSON.parse(out.stdout); } catch { throw new V4Error(out.code === 0 ? 'HARNESS_ERROR' : 'PROVIDER_ERROR'); }
    if (out.code !== 0 || json.is_error) throw new V4Error(String(json.subtype ?? '').includes('budget') ? 'BUDGET_EXHAUSTED' : 'PROVIDER_ERROR');
    session = { model, id: json.session_id };
    const cost = json.total_cost_usd;
    return { costUsd: Number.isFinite(cost) ? cost : null, usage: json.usage ?? null, numTurns: json.num_turns ?? null, status: 'ok', text: String(json.result ?? '') };
  };
}
