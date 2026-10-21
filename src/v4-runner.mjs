import { appendFile, cp, mkdir, mkdtemp, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runV4, V4Error } from './v4-escalation.mjs';
import { makeClaudeAttempt } from './v4-claude.mjs';

const STATUS_BY_CODE = {
  COST_UNKNOWN: 'cost_unknown', HARNESS_ERROR: 'harness_error', RUN_TIMEOUT: 'run_timeout', PROVIDER_ERROR: 'provider_error',
  BUDGET_EXHAUSTED: 'budget_exhausted', BUDGET_REQUIRED: 'refused',
};

// Always resolves with one row, and appends it to `out`, even when the agent crashes, times out or the cost is unknown.
export async function runV4Task({ task, repeat = 1, budgetUsd, out, bin, timeoutMs }) {
  const ledger = { spentUsd: 0, costKnown: true };
  const base = { task: task.id, variant: 'v4', repeat, budgetUsd };
  let row;
  try {
    const workspace = await realpath(await mkdtemp(join(tmpdir(), `v4-${task.id}-`)));
    await cp(task.workspaceDir, workspace, { recursive: true });
    const attempt = makeClaudeAttempt({ workspace, acceptancePath: task.acceptancePath, ledger, budgetUsd, bin, timeoutMs });
    const result = await runV4(task, { attempt, budgetUsd });
    row = { ...base, status: 'completed', ...result, costUsd: ledger.spentUsd, costKnown: ledger.costKnown };
  } catch (error) {
    const code = error instanceof V4Error ? error.code : undefined;
    row = { ...base, status: STATUS_BY_CODE[code] ?? 'harness_error', error: String(error?.message ?? error).slice(0, 200),
      costUsd: ledger.spentUsd, costKnown: ledger.costKnown };
  } finally {
    await mkdir(dirname(out), { recursive: true });
    await appendFile(out, JSON.stringify(row) + '\n');
  }
  return row;
}
