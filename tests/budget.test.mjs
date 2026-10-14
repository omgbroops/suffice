import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBudgetLedger } from '../src/budget.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-budget-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'ledger.jsonl');
}

test('reservations survive re-creation and hard-stop at exactly two dollars', async (t) => {
  const path = await fixture(t);
  const ledger = createBudgetLedger(path);
  assert.equal((await ledger.snapshot()).calls, 0);
  for (let i = 0; i < 200; i++) await ledger.reserve();
  const restarted = createBudgetLedger(path);
  assert.deepEqual(await restarted.snapshot(), { limitUsd: 2, reservedUsd: 2, remainingUsd: 0, calls: 200 });
  await assert.rejects(restarted.reserve(), { code: 'BUDGET_EXHAUSTED' });
  assert.equal((await readFile(path, 'utf8')).trim().split('\n').length, 200);
});

test('independent ledger instances serialize reservations by exclusive lock', async (t) => {
  const path = await fixture(t);
  const attempts = await Promise.allSettled(Array.from({ length: 16 }, () => createBudgetLedger(path).reserve()));
  const successes = attempts.filter((r) => r.status === 'fulfilled');
  assert.ok(successes.length >= 1);
  assert.equal((await createBudgetLedger(path).snapshot()).calls, successes.length);
  for (const r of attempts.filter((r) => r.status === 'rejected')) assert.equal(r.reason.code, 'LEDGER_LOCKED');
});

test('truncated, duplicate, and invalid ledger records fail closed', async (t) => {
  const path = await fixture(t);
  const ledger = createBudgetLedger(path);
  await ledger.reserve();
  const line = await readFile(path, 'utf8');
  for (const corrupt of [line.trim(), line + line, '{"version":1}\n', '']) {
    await writeFile(path, corrupt);
    await assert.rejects(ledger.reserve(), { code: 'LEDGER_CORRUPT' });
  }
});

test('crash lock blocks later spending and is never automatically reclaimed', async (t) => {
  const path = await fixture(t);
  await writeFile(`${path}.lock`, '');
  await assert.rejects(createBudgetLedger(path).reserve(), { code: 'LEDGER_LOCKED' });
});
