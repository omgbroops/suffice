export const V4_CHEAP_MODEL = 'claude-haiku-5-5';
export const V4_STRONG_MODEL = 'claude-opus-5-5';
export const V4_ROUNDS = 3;
// Rate-card estimate from decomp-v2, unreconciled. Used only for the pre-escalation budget check.
export const V4_STRONG_ESTIMATE_USD = 0.0705;
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

// attempt({ model, prompt, round }) must resolve to { pass, costUsd } only.
// The oracle test stays inside the verifier, so the agent sees a verdict, not the test.
export async function runV4(task, {
  attempt, budgetUsd, rounds = V4_ROUNDS, strongEstimateUsd = V4_STRONG_ESTIMATE_USD,
} = {}) {
  // Hard refusal: a per-run budget must be passed explicitly.
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new V4Error('BUDGET_REQUIRED');
  const row = {
    task: task.id, variant: 'v4', budgetUsd,
    firstAttemptPass: false, roundsUsed: 0, roundCostsUsd: [],
    cheapCostUsd: 0, escalated: false, escalationSkipped: null,
    strongCostUsd: 0, finalPass: false,
  };
  let prompt = task.prompt;
  for (let round = 1; round <= rounds; round++) {
    const result = await attempt({ model: V4_CHEAP_MODEL, prompt, round });
    const cost = costOf(result);
    row.roundCostsUsd.push(cost);
    row.cheapCostUsd += cost;
    row.roundsUsed = round;
    if (round === 1) row.firstAttemptPass = result.pass === true;
    if (result.pass === true) { row.finalPass = true; return row; }
    if (row.cheapCostUsd >= budgetUsd) { row.escalationSkipped = 'budget'; return row; }
    prompt = V4_RETRY_MESSAGE;
  }
  // Escalate only if one strong attempt still fits the remaining per-run budget.
  if (row.cheapCostUsd + strongEstimateUsd > budgetUsd) { row.escalationSkipped = 'budget'; return row; }
  row.escalated = true;
  const result = await attempt({ model: V4_STRONG_MODEL, prompt: task.prompt, round: rounds + 1 });
  row.strongCostUsd = costOf(result);
  row.finalPass = result.pass === true;
  return row;
}
