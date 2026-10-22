import { appendFile, cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runNodeTests } from './workspace.mjs';
import { DEFAULT_TIERS, runV4, V4_RETRY_MESSAGE, V4Error } from './v4-escalation.mjs';
import { effortFor } from './v4-config.mjs';
import { buildAttempt } from './v4-adapters.mjs';
import { guardAttempt } from './v4-ledger.mjs';

export const STATUS_BY_CODE = {
  COST_UNKNOWN: 'cost_unknown', HARNESS_ERROR: 'harness_error', RUN_TIMEOUT: 'run_timeout', PROVIDER_ERROR: 'provider_error',
  BUDGET_EXHAUSTED: 'budget_exhausted', BUDGET_REQUIRED: 'refused', GLOBAL_CAP: 'global_cap_refused',
};

// Default verdict: the hidden node test lives outside the agent workspace and only pass/fail leaves the verifier.
export const nodeTestVerdict = acceptancePath => async workspace =>
  (await runNodeTests(workspace, acceptancePath, { timeoutMs: 60_000 })).status === 'passed';

export const GATES = ['self', 'oracle'];
export const PROTOCOLS = ['pass1', 'pass2'];

// pass2: one more attempt with the last tier's model after a failed hidden verify, prompted with the hidden output (3000 chars).
// pass1 is the existing finalPass and is never changed. pass2 is null when the retry is skipped for budget.
export async function pass2Retry({ row, tiers, attempt, workspace, ledger, budgetUsd, verify, verifyOutput }) {
  const out = { ...row, pass1: row.finalPass, pass2: row.finalPass ? true : null };
  if (row.finalPass) return out;
  const last = row.selfTests.at(-1);
  const tier = tiers.find(t => t.model === last?.model) ?? tiers[0];
  if (ledger.spentUsd + tier.costEstimateUsd > budgetUsd) return out;
  const prompt = `${V4_RETRY_MESSAGE}\n\nHidden test output (last 3000 chars):\n${String(verifyOutput?.(workspace) ?? '').slice(-3000)}`;
  await attempt({ model: tier.model, effort: effortFor(tier, tier.rounds), prompt, round: last.round + 1, tier: tier.name,
    workspace, tools: tier.tools, remainingBudgetUsd: budgetUsd - ledger.spentUsd });
  out.pass2 = (await verify(workspace)) === true;
  out.costUsd = ledger.spentUsd;
  return out;
}


// Always resolves with one row, and appends it to `out`, even when the agent crashes, times out or the cost is unknown.
// `ledger` (openLedger) makes every attempt reserve its tier estimate first; `meta` (benchmark, difficulty, arm, contaminated) is copied into the row.
// gate 'self' (default): rounds and escalation use only selfSignal; the hidden verify runs after the last round, never inside it.
// gate 'oracle': the hidden verify decides each round (old behaviour, kept for comparison).
// protocol 'pass2' (polyglot only): after a failed hidden verify, one more attempt with the last tier's model that sees the hidden output; reported as pass2.
export async function runV4Task({ task, repeat = 1, budgetUsd, out, bin, timeoutMs, tiers = DEFAULT_TIERS, verify, ledger: globalLedger, meta = {}, gate = 'self', selfCheck, rule = 'v4', protocol = 'pass1', verifyOutput }) {
  const ledger = { spentUsd: 0, costKnown: true };
  const base = { ...meta, task: task.id, variant: meta.arm ?? 'v4', repeat, budgetUsd, gate, protocol };
  let row, snapshot;
  try {
    if (!GATES.includes(gate)) throw new V4Error('GATE_INVALID');
    if (!PROTOCOLS.includes(protocol)) throw new V4Error('PROTOCOL_INVALID');
    const workspace = await realpath(await mkdtemp(join(tmpdir(), `v4-${task.id}-`)));
    await cp(task.workspaceDir, workspace, { recursive: true });
    const verifyFn = verify ?? nodeTestVerdict(task.acceptancePath);
    if (gate === 'self') snapshot = await realpath(await mkdtemp(join(tmpdir(), `v4-${task.id}-r1-`)));
    const attempt = buildAttempt({ tiers, workspace, verify: verifyFn, ledger, bin, timeoutMs, gate, original: task.workspaceDir, selfCheck, snapshot });
    const guarded = globalLedger ? guardAttempt(globalLedger, tiers, attempt) : attempt;
    const result = await runV4(task, { attempt: guarded, budgetUsd, tiers, workspace, rule });
    row = { ...base, status: 'completed', ...result, costUsd: ledger.spentUsd, costKnown: ledger.costKnown };
    if (gate === 'self') {
      // The one hidden verdict on the final workspace; round 1 is verified from its snapshot unless it was the last attempt. Nothing here feeds back into rounds.
      const finalPass = await verifyFn(workspace) === true;
      const firstFinal = !result.escalated && result.roundsUsed === 1;
      const firstAttemptPass = firstFinal ? finalPass : (await verifyFn(snapshot)) === true;
      row = { ...row, selfFinalPass: result.finalPass, firstAttemptPass, finalPass };
      if (protocol === 'pass2') row = await pass2Retry({ row, tiers, attempt: guarded, workspace, ledger, budgetUsd, verify: verifyFn, verifyOutput });
    }
  } catch (error) {
    const code = error instanceof V4Error ? error.code : undefined;
    row = { ...base, status: STATUS_BY_CODE[code] ?? 'harness_error', error: String(error?.message ?? error).slice(0, 200),
      costUsd: ledger.spentUsd, costKnown: ledger.costKnown };
  } finally {
    await mkdir(dirname(out), { recursive: true });
    await appendFile(out, JSON.stringify(row) + '\n');
    if (snapshot) await rm(snapshot, { recursive: true, force: true });
  }
  return row;
}
