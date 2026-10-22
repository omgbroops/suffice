import { appendFile, cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runNodeTests } from './workspace.mjs';
import { DEFAULT_TIERS, runV4, V4Error } from './v4-escalation.mjs';
import { buildAttempt } from './v4-adapters.mjs';
import { guardAttempt } from './v4-ledger.mjs';

const STATUS_BY_CODE = {
  COST_UNKNOWN: 'cost_unknown', HARNESS_ERROR: 'harness_error', RUN_TIMEOUT: 'run_timeout', PROVIDER_ERROR: 'provider_error',
  BUDGET_EXHAUSTED: 'budget_exhausted', BUDGET_REQUIRED: 'refused', GLOBAL_CAP: 'global_cap_refused',
};

// Default verdict: the hidden node test lives outside the agent workspace and only pass/fail leaves the verifier.
export const nodeTestVerdict = acceptancePath => async workspace =>
  (await runNodeTests(workspace, acceptancePath, { timeoutMs: 60_000 })).status === 'passed';

export const GATES = ['self', 'oracle'];

// Always resolves with one row, and appends it to `out`, even when the agent crashes, times out or the cost is unknown.
// `ledger` (openLedger) makes every attempt reserve its tier estimate first; `meta` (benchmark, difficulty, arm, contaminated) is copied into the row.
// gate 'self' (default): rounds and escalation use only selfSignal; the hidden verify runs after the last round, never inside it.
// gate 'oracle': the hidden verify decides each round (old behaviour, kept for comparison).
export async function runV4Task({ task, repeat = 1, budgetUsd, out, bin, timeoutMs, tiers = DEFAULT_TIERS, verify, ledger: globalLedger, meta = {}, gate = 'self', selfCheck }) {
  const ledger = { spentUsd: 0, costKnown: true };
  const base = { ...meta, task: task.id, variant: meta.arm ?? 'v4', repeat, budgetUsd, gate };
  let row, snapshot;
  try {
    if (!GATES.includes(gate)) throw new V4Error('GATE_INVALID');
    const workspace = await realpath(await mkdtemp(join(tmpdir(), `v4-${task.id}-`)));
    await cp(task.workspaceDir, workspace, { recursive: true });
    const verifyFn = verify ?? nodeTestVerdict(task.acceptancePath);
    if (gate === 'self') snapshot = await realpath(await mkdtemp(join(tmpdir(), `v4-${task.id}-r1-`)));
    const attempt = buildAttempt({ tiers, workspace, verify: verifyFn, ledger, bin, timeoutMs, gate, original: task.workspaceDir, selfCheck, snapshot });
    const guarded = globalLedger ? guardAttempt(globalLedger, tiers, attempt) : attempt;
    const result = await runV4(task, { attempt: guarded, budgetUsd, tiers, workspace });
    row = { ...base, status: 'completed', ...result, costUsd: ledger.spentUsd, costKnown: ledger.costKnown };
    if (gate === 'self') {
      // The one hidden verdict on the final workspace; round 1 is verified from its snapshot unless it was the last attempt. Nothing here feeds back into rounds.
      const finalPass = await verifyFn(workspace);
      const firstFinal = !result.escalated && result.roundsUsed === 1;
      const firstAttemptPass = firstFinal ? finalPass : await verifyFn(snapshot);
      row = { ...row, selfFinalPass: result.finalPass, firstAttemptPass, finalPass };
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
