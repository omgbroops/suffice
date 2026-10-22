import { effortFor, loadTiers } from './v4-config.mjs';

// Default ladder comes from config/v4-tiers.json (cheap haiku x3, then strong opus x1 by default).
export const DEFAULT_TIERS = loadTiers();
export const V4_CHEAP_MODEL = DEFAULT_TIERS[0].model;
export const V4_STRONG_MODEL = DEFAULT_TIERS[1].model;
// Copied from decomp-v2 bench/polyglot.py:19. Retries carry this verdict and never the test text.
export const V4_RETRY_MESSAGE = 'The hidden check failed: tests did not pass. Investigate and fix.';

export class V4Error extends Error {
  constructor(code) { super(code); this.name = 'V4Error'; this.code = code; }
}

function costOf(result) {
  // Unknown cost fails closed: an unpriced attempt cannot be checked against the budget.
  if (!Number.isFinite(result?.costUsd)) throw new V4Error('COST_UNKNOWN');
  return result.costUsd;
}

// attempt({ model, effort, prompt, round, tier, workspace, tools, remainingBudgetUsd }) must resolve to { pass, costUsd }.
// Tier i+1 runs only if spent + its costEstimateUsd fits the per-run budget. Each tier starts with the task prompt; later rounds get the verdict only.
// rounds_used and roundCostsUsd count tier 0 (the cheap tier), so the row schema matches the original ladder.
// v5 self rule. Escalate only when the patch is broken or its SELFTEST ran and failed; an empty patch gets one more cheap round;
// 'SELFTEST: none' (unverified) is accepted as is.
export function v5Decision(result) {
  if (!result.patchNonEmpty) return 'retry';
  if (result.patchApplies === false || result.inside === false || result.signal === 'fail') return 'escalate';
  return 'accept';
}

// v5 retry prompt after a failed SELFTEST: the agent sees its own test output only, never the hidden verdict.
export function selfRetryPrompt(tail = '') {
  return `${V4_RETRY_MESSAGE}\n\nYour own SELFTEST output (last 1500 chars):\n${String(tail).slice(-1500)}\n\nThe test may itself be wrong: fix the test or the code.`;
}

// rule 'v4' (default) is the original self/oracle rule; rule 'v5' uses v5Decision on the self-gate fields.
// v5: a non-accepted round stays in its tier until the tier's rounds run out, so the cheap tier gets its retry before escalation.
// strict (opt-in): a cheap accept counts only if every cheap round so far signalled 'pass'; otherwise escalate.
export async function runV4(task, { attempt, budgetUsd, tiers = DEFAULT_TIERS, workspace, tools, rule = 'v4', strict = false } = {}) {
  // Hard refusal: a per-run budget must be passed explicitly.
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new V4Error('BUDGET_REQUIRED');
  const row = {
    task: task.id, variant: 'v4', budgetUsd,
    firstAttemptPass: false, roundsUsed: 0, roundCostsUsd: [],
    cheapCostUsd: 0, escalated: false, escalationSkipped: null,
    strongCostUsd: 0, finalPass: false, selfTests: [],
  };
  let spent = 0, round = 0, unverified = 0, cheapClean = true;
  for (const [index, tier] of tiers.entries()) {
    if (index > 0) {
      if (spent + tier.costEstimateUsd > budgetUsd) { row.escalationSkipped = 'budget'; return row; }
      row.escalated = true;
    }
    let prompt = task.prompt;
    for (let r = 1; r <= tier.rounds; r++) {
      if (index === 0 && unverified >= 2) break; // self gate: one cheap retry for an unverified round, then escalate
      round++;
      const result = await attempt({
        model: tier.model, effort: effortFor(tier, r), prompt, round, tier: tier.name,
        workspace, tools: tools ?? tier.tools, remainingBudgetUsd: budgetUsd - spent,
      });
      const cost = costOf(result);
      spent += cost;
      if (index === 0) { row.roundCostsUsd.push(cost); row.cheapCostUsd += cost; row.roundsUsed = r; } else row.strongCostUsd += cost;
      if (round === 1) row.firstAttemptPass = result.pass === true;
      row.selfTests.push({ round, model: tier.model, cmd: result.selfTestCmd ?? null, signal: result.signal ?? null, tail: String(result.selfTestTail ?? '').slice(-400) });
      if (index === 0 && result.signal !== 'pass') cheapClean = false;
      if (result.pass === true || (rule === 'v5' && v5Decision(result) === 'accept')) {
        if (index > 0 || !strict || cheapClean) { row.finalPass = true; return row; }
        break; // strict: a cheap accept after a non-pass cheap round is not taken; escalate
      }
      if (rule !== 'v5' && result.signal === 'unverified') unverified++;
      const more = r < tier.rounds || index < tiers.length - 1;
      if (more && spent >= budgetUsd) { row.escalationSkipped = 'budget'; return row; }
      prompt = rule === 'v5' && result.signal === 'fail' ? selfRetryPrompt(result.selfTestTail) : V4_RETRY_MESSAGE;
    }
  }
  return row;
}
