import test from 'node:test';
import assert from 'node:assert/strict';
import { runV4, V4Error, V4_RETRY_MESSAGE, V4_CHEAP_MODEL, V4_STRONG_MODEL } from '../src/v4-escalation.mjs';

const task = { id: 'demo-task', prompt: 'Fix the parser.' };

// Stub attempt: replays a fixed list of verdicts and records every call.
function stub(verdicts, costUsd = 0.01) {
  const calls = [];
  const attempt = async (call) => {
    calls.push(call);
    return { pass: verdicts.shift() ?? false, costUsd };
  };
  return { attempt, calls };
}

test('budget is required: missing, zero, or non-finite budgets are refused before any call', async () => {
  for (const budgetUsd of [undefined, 0, -1, Number.NaN]) {
    const { attempt, calls } = stub([true]);
    await assert.rejects(runV4(task, { attempt, budgetUsd }), (e) => e instanceof V4Error && e.code === 'BUDGET_REQUIRED');
    assert.equal(calls.length, 0);
  }
});

test('a first-attempt pass stops at one round and never escalates', async () => {
  const { attempt, calls } = stub([true]);
  const row = await runV4(task, { attempt, budgetUsd: 1 });
  assert.equal(calls.length, 1);
  assert.equal(row.firstAttemptPass, true);
  assert.equal(row.roundsUsed, 1);
  assert.equal(row.escalated, false);
  assert.equal(row.finalPass, true);
});

test('retries use the verdict message only, on the cheap model', async () => {
  const { attempt, calls } = stub([false, true]);
  const row = await runV4(task, { attempt, budgetUsd: 1 });
  assert.deepEqual(calls.map((c) => c.model), [V4_CHEAP_MODEL, V4_CHEAP_MODEL]);
  assert.equal(calls[0].prompt, task.prompt);
  assert.equal(calls[1].prompt, V4_RETRY_MESSAGE);
  assert.equal(row.roundsUsed, 2);
  assert.equal(row.firstAttemptPass, false);
  assert.equal(row.finalPass, true);
  assert.equal(row.escalated, false);
});

test('escalates to one strong attempt only after three failed cheap rounds', async () => {
  const { attempt, calls } = stub([false, false, false, true]);
  const row = await runV4(task, { attempt, budgetUsd: 1 });
  assert.deepEqual(calls.map((c) => c.model), [V4_CHEAP_MODEL, V4_CHEAP_MODEL, V4_CHEAP_MODEL, V4_STRONG_MODEL]);
  assert.equal(calls[3].prompt, task.prompt);
  assert.equal(row.roundsUsed, 3);
  assert.equal(row.escalated, true);
  assert.equal(row.finalPass, true);
  assert.deepEqual(row.roundCostsUsd, [0.01, 0.01, 0.01]);
});

test('a failed strong attempt is recorded as final failure without further calls', async () => {
  const { attempt, calls } = stub([false, false, false, false]);
  const row = await runV4(task, { attempt, budgetUsd: 1 });
  assert.equal(calls.length, 4);
  assert.equal(row.escalated, true);
  assert.equal(row.finalPass, false);
});

test('escalation is skipped when one strong attempt would exceed the budget', async () => {
  const { attempt, calls } = stub([false, false, false, true]);
  const row = await runV4(task, { attempt, budgetUsd: 0.05, strongEstimateUsd: 0.0705 });
  assert.equal(calls.length, 3);
  assert.equal(row.escalated, false);
  assert.equal(row.escalationSkipped, 'budget');
  assert.equal(row.finalPass, false);
});

test('unknown cost fails closed', async () => {
  const attempt = async () => ({ pass: true, costUsd: null });
  await assert.rejects(runV4(task, { attempt, budgetUsd: 1 }), (e) => e.code === 'COST_UNKNOWN');
});

test('row schema has exactly the reported fields', async () => {
  const { attempt } = stub([false, false, false, true]);
  const row = await runV4(task, { attempt, budgetUsd: 1 });
  assert.deepEqual(Object.keys(row).sort(), [
    'budgetUsd', 'cheapCostUsd', 'escalated', 'escalationSkipped', 'finalPass', 'firstAttemptPass',
    'roundCostsUsd', 'roundsUsed', 'strongCostUsd', 'task', 'variant',
  ]);
  assert.equal(row.variant, 'v4');
});
