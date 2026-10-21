import { spawn } from 'node:child_process';
import { runNodeTests } from './workspace.mjs';
import { V4Error } from './v4-escalation.mjs';

// Thin profile: tiny system prompt and only four tools.
export const V4_TOOLS = ['Read', 'Edit', 'Write', 'Bash'];
export const V4_SYSTEM_PROMPT = 'You are a coding agent. Repair the requested behavior with a minimal correct change in src/. Preserve the public API. Use only Read, Edit, Write and Bash. Do not claim checks that did not run.';

function runProcess(bin, args, { cwd, timeoutMs }) {
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

// Returns attempt({ model, prompt }) -> { pass, costUsd } for runV4. Hidden acceptance runs here, outside the agent's view.
// Shortcut: Bash can read any absolute path, so the oracle is hidden by path and prompt only, not by sandbox; upgrade to a sandbox before trusting pass rates.
export function makeClaudeAttempt({ workspace, acceptancePath, ledger, budgetUsd, bin = process.env.V4_CLAUDE_BIN ?? 'claude', timeoutMs = 360_000 }) {
  let session = null; // resume only within the same model; escalation starts fresh with the task prompt
  return async ({ model, prompt }) => {
    const remaining = budgetUsd - ledger.spentUsd;
    if (!(remaining > 0)) throw new V4Error('BUDGET_EXHAUSTED');
    const resume = session?.model === model ? ['--resume', session.id] : [];
    const args = ['-p', prompt, '--model', model, '--output-format', 'json', '--tools', V4_TOOLS.join(','), '--allowedTools', V4_TOOLS.join(','),
      '--system-prompt', V4_SYSTEM_PROMPT, '--max-budget-usd', remaining.toFixed(4), ...resume];
    const out = await runProcess(bin, args, { cwd: workspace, timeoutMs });
    if (out.timedOut) throw new V4Error('RUN_TIMEOUT');
    let json;
    try { json = JSON.parse(out.stdout); } catch { throw new V4Error(out.code === 0 ? 'HARNESS_ERROR' : 'PROVIDER_ERROR'); }
    if (out.code !== 0 || json.is_error) throw new V4Error(String(json.subtype ?? '').includes('budget') ? 'BUDGET_EXHAUSTED' : 'PROVIDER_ERROR');
    session = { model, id: json.session_id };
    const cost = json.total_cost_usd;
    if (!Number.isFinite(cost)) { ledger.costKnown = false; return { pass: false, costUsd: null }; }
    ledger.spentUsd += cost;
    const verdict = await runNodeTests(workspace, acceptancePath, { timeoutMs: 60_000 });
    return { pass: verdict.status === 'passed', costUsd: cost };
  };
}
