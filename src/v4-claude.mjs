import { spawn } from 'node:child_process';
import { V4Error } from './v4-escalation.mjs';

// Thin profile: tiny system prompt. Tool list comes from the tier config (default is these four).
export const V4_TOOLS = ['Read', 'Edit', 'Write', 'Bash'];
export const V4_SYSTEM_PROMPT = 'You are a coding agent. Make the requested change with a minimal correct edit to the files in the current directory. Preserve the public API. Work only inside the current directory: never search or list outside it (no find or ls on / or ~), the tests you cannot see are not elsewhere on disk. Use only Read, Edit, Write and Bash. Do not claim checks that did not run. Workflow: first write a minimal failing test from the issue when feasible, make the edit, run that test, then end your reply with one final line `SELFTEST: <command>` naming the command you ran (or `SELFTEST: none` if you ran none).';

// v5 arm: same claude call, tighter. Prompt already holds the ranked files and excerpts, so the model edits first and reads only ranges.
export const V5_SYSTEM_PROMPT = 'You are a coding agent. The prompt lists likely files with excerpts, ranked most likely first. Edit those files first. Read only with line ranges (Read offset/limit or sed -n A,Bp); never print a whole file. Search only if the listed files fail. Make a minimal correct edit and preserve the public API. Work only inside the current directory. Use only Read, Edit, Write and Bash. Before editing, write a minimal failing test from the issue when feasible, run it, edit, rerun it. Do not claim checks that did not run. End your reply with one final line `SELFTEST: <command>` naming the command you ran, or `SELFTEST: none`.';

export function runProcess(bin, args, { cwd, timeoutMs }) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.resume();
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolveRun({ code, stdout, timedOut }); });
  });
}

// Adapter contract: attempt({ model, effort, prompt, workspace, tools, remainingBudgetUsd }) -> { costUsd, usage, status }.
// costUsd null means unknown. The hidden verdict is added by buildAttempt, not here.
// Effort maps to `claude --effort` (low|medium|high|xhigh|max, from claude --help). Unverified live.
// Shortcut: Bash can read any absolute path, so the oracle is hidden by path and prompt only; upgrade to a sandbox before trusting pass rates.
export function makeClaudeAdapter({ bin = process.env.V4_CLAUDE_BIN ?? 'claude', timeoutMs = 360_000, lean = false } = {}) {
  let session = null; // resume only within the same model; escalation starts fresh with the task prompt
  return async ({ model, effort, prompt, workspace, tools, remainingBudgetUsd }) => {
    if (!(remainingBudgetUsd > 0)) throw new V4Error('BUDGET_EXHAUSTED');
    const resume = session?.model === model ? ['--resume', session.id] : [];
    const effortArgs = effort ? ['--effort', effort] : [];
    const leanArgs = lean ? ['--max-turns', '12'] : [];
    const args = ['-p', prompt, '--model', model, '--output-format', 'json', '--tools', tools.join(','), '--allowedTools', tools.join(','),
      '--strict-mcp-config', '--disable-slash-commands', '--setting-sources', 'project', // measured: default config loads ~262K tokens (about $0.26 per call on Haiku); lean flags ~$0.0004
      '--system-prompt', lean ? V5_SYSTEM_PROMPT : V4_SYSTEM_PROMPT, '--max-budget-usd', remainingBudgetUsd.toFixed(4), ...effortArgs, ...leanArgs, ...resume];
    const out = await runProcess(bin, args, { cwd: workspace, timeoutMs });
    if (out.timedOut) throw new V4Error('RUN_TIMEOUT');
    let json;
    try { json = JSON.parse(out.stdout); } catch { throw new V4Error(out.code === 0 ? 'HARNESS_ERROR' : 'PROVIDER_ERROR'); }
    if (out.code !== 0 || json.is_error) throw new V4Error(String(json.subtype ?? '').includes('budget') ? 'BUDGET_EXHAUSTED' : 'PROVIDER_ERROR');
    session = { model, id: json.session_id };
    const cost = json.total_cost_usd;
    return { costUsd: Number.isFinite(cost) ? cost : null, usage: json.usage ?? null, status: 'ok', text: String(json.result ?? '') };
  };
}
