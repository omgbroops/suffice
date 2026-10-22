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
export async function runV4(task, { attempt, budgetUsd, tiers = DEFAULT_TIERS, workspace, tools } = {}) {
  // Hard refusal: a per-run budget must be passed explicitly.
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new V4Error('BUDGET_REQUIRED');
  const row = {
    task: task.id, variant: 'v4', budgetUsd,
    firstAttemptPass: false, roundsUsed: 0, roundCostsUsd: [],
    cheapCostUsd: 0, escalated: false, escalationSkipped: null,
    strongCostUsd: 0, finalPass: false,
  };
  let spent = 0, round = 0, unverified = 0;
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
      if (result.pass === true) { row.finalPass = true; return row; }
      if (result.signal === 'unverified') unverified++;
      const more = r < tier.rounds || index < tiers.length - 1;
      if (more && spent >= budgetUsd) { row.escalationSkipped = 'budget'; return row; }
      prompt = V4_RETRY_MESSAGE;
    }
  }
  return row;
}
