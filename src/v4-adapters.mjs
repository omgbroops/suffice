import { V4Error } from './v4-escalation.mjs';
import { cp } from 'node:fs/promises';
import { makeClaudeAdapter, runProcess } from './v4-claude.mjs';
import { makeSelfCheck, selfSignal } from './v4-selfsignal.mjs';

// Generic adapter: tier.command is an argv array. Placeholders {model} {effort} {prompt} {workspace} {tools} {budgetUsd}
// are substituted per element, so no shell is involved. stdout must be JSON with a numeric costUsd.
export function makeCommandAdapter({ tier, timeoutMs = 360_000 }) {
  return async ({ model, effort, prompt, workspace, tools, remainingBudgetUsd }) => {
    if (!(remainingBudgetUsd > 0)) throw new V4Error('BUDGET_EXHAUSTED');
    const vars = { model, effort: effort ?? '', prompt, workspace, tools: tools.join(','), budgetUsd: remainingBudgetUsd.toFixed(4) };
    const [bin, ...args] = tier.command.map(part => part.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)));
    const out = await runProcess(bin, args, { cwd: workspace, timeoutMs });
    if (out.timedOut) throw new V4Error('RUN_TIMEOUT');
    let json;
    try { json = JSON.parse(out.stdout); } catch { throw new V4Error(out.code === 0 ? 'HARNESS_ERROR' : 'PROVIDER_ERROR'); }
    if (out.code !== 0 || json.error) throw new V4Error('PROVIDER_ERROR');
    return { costUsd: Number.isFinite(json.costUsd) ? json.costUsd : null, usage: json.usage ?? null, status: 'ok', text: String(json.result ?? json.text ?? '') };
  };
}

// One attempt function for runV4. gate 'self' (default): the round decision is selfSignal, oracle-free; verify is never called here.
// gate 'oracle': the old behaviour, the hidden verdict decides each round. Unknown cost returns costUsd null, so runV4 fails closed.
// snapshot: in self mode round 1 is copied there so runV4Task can verify the first attempt afterwards.
export function buildAttempt({ tiers, workspace, verify, ledger, bin, timeoutMs, gate = 'self', original, selfCheck = makeSelfCheck(), snapshot }) {
  const adapters = new Map(tiers.map(tier => [tier.name, tier.provider === 'claude'
    ? makeClaudeAdapter({ bin, timeoutMs, lean: tier.lean === true })
    : makeCommandAdapter({ tier, timeoutMs })]));
  return async call => {
    const result = await adapters.get(call.tier)({ ...call, workspace });
    if (!Number.isFinite(result.costUsd)) { ledger.costKnown = false; return { pass: false, costUsd: null }; }
    ledger.spentUsd += result.costUsd;
    if (gate === 'oracle') return { pass: await verify(workspace), costUsd: result.costUsd, usage: result.usage, status: result.status };
    if (call.round === 1 && snapshot) await cp(workspace, snapshot, { recursive: true });
    const { pass, signal, patchNonEmpty, patchApplies, inside, selfTestCmd, selfTestTail } = await selfSignal({ original, workspace, text: result.text, selfCheck });
    return { pass, signal, patchNonEmpty, patchApplies, inside, selfTestCmd, selfTestTail, costUsd: result.costUsd, usage: result.usage, status: result.status };
  };
}
