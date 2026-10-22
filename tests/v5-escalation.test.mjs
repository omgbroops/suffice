import test from 'node:test';
import assert from 'node:assert/strict';
import { runV4, v5Decision } from '../src/v4-escalation.mjs';
import { armTiers } from '../src/v4-config.mjs';

const task = { id: 'demo-task', prompt: 'Fix the parser.' };
const HAIKU = 'claude-haiku-5-5', SONNET = 'claude-sonnet-5-5', OPUS = 'claude-opus-5-5';
const ok = { patchNonEmpty: true, patchApplies: true, inside: true, signal: 'unverified', pass: false };
const selfResult = (over) => ({ ...ok, ...over, pass: false });

// Stub attempt: replays fixed self-gate results and records every call.
function stub(results, costUsd = 0.01) {
  const calls = [];
  const attempt = async (call) => {
    calls.push(call);
    return { costUsd, ...(results.shift() ?? selfResult({ pass: false, signal: 'fail' })) };
  };
  return { attempt, calls };
}

const v5 = armTiers('v5');

test('v5 ladder: Haiku at most 2 rounds, then one Sonnet rung; Opus only with top opus', () => {
  assert.deepEqual(v5.map(t => [t.model, t.rounds]), [[HAIKU, 2], [SONNET, 1]]);
  assert.equal(v5[1].costEstimateUsd, 0.05);
  const [, opus] = armTiers('v5', undefined, { top: 'opus' });
  assert.deepEqual([opus.model, opus.rounds], [OPUS, 1]);
  assert.throws(() => armTiers('v5', undefined, { top: 'gpt' }), /unknown v5 top/);
  assert.equal(armTiers('v4')[0].rounds, 3, 'v4 ladder is untouched');
});

test('v5Decision: accept when the patch applies and SELFTEST is absent or passed', () => {
  assert.equal(v5Decision(selfResult({ signal: 'unverified' })), 'accept');
  assert.equal(v5Decision(selfResult({ pass: true, signal: 'pass' })), 'accept');
});

test('rule: SELFTEST none does not escalate; the patch is accepted on the first round', async () => {
  const { attempt, calls } = stub([selfResult({ signal: 'unverified' })]);
  const row = await runV4(task, { attempt, budgetUsd: 1, tiers: v5, rule: 'v5' });
  assert.deepEqual(calls.map(c => c.model), [HAIKU]);
  assert.equal(row.finalPass, true);
  assert.equal(row.escalated, false);
});

test('rule: a failed SELFTEST retries in the cheap tier, then escalates to Sonnet', async () => {
  const { attempt, calls } = stub([selfResult({ signal: 'fail' }), selfResult({ signal: 'fail' }), selfResult({ pass: true, signal: 'pass' })]);
  const row = await runV4(task, { attempt, budgetUsd: 1, tiers: v5, rule: 'v5' });
  assert.deepEqual(calls.map(c => c.model), [HAIKU, HAIKU, SONNET]);
  assert.match(calls[1].prompt, /^The hidden check failed/);
  assert.match(calls[1].prompt, /test may itself be wrong/);
  assert.equal(row.escalated, true);
  assert.equal(row.finalPass, true);
});

test('rule: a patch that does not apply escalates to Sonnet', async () => {
  const { attempt, calls } = stub([selfResult({ patchApplies: false }), selfResult({ patchApplies: false }), selfResult({ pass: true, signal: 'pass' })]);
  const row = await runV4(task, { attempt, budgetUsd: 1, tiers: v5, rule: 'v5' });
  assert.deepEqual(calls.map(c => c.model), [HAIKU, HAIKU, SONNET]);
  assert.equal(row.escalated, true);
});

test('rule: a patch outside cwd escalates to Sonnet', async () => {
  const { attempt, calls } = stub([selfResult({ inside: false }), selfResult({ signal: 'unverified' })]);
  const row = await runV4(task, { attempt, budgetUsd: 1, tiers: v5, rule: 'v5' });
  assert.deepEqual(calls.map(c => c.model), [HAIKU, HAIKU]);
  assert.equal(row.finalPass, true);
});

test('rule: an empty patch gets one more Haiku round, and is accepted if that round fills it', async () => {
  const { attempt, calls } = stub([selfResult({ patchNonEmpty: false }), selfResult({ signal: 'unverified' })]);
  const row = await runV4(task, { attempt, budgetUsd: 1, tiers: v5, rule: 'v5' });
  assert.deepEqual(calls.map(c => c.model), [HAIKU, HAIKU]);
  assert.equal(calls[1].prompt, 'The hidden check failed: tests did not pass. Investigate and fix.');
  assert.equal(row.escalated, false);
  assert.equal(row.finalPass, true);
});

test('rule: an empty patch twice escalates to Sonnet', async () => {
  const { attempt, calls } = stub([selfResult({ patchNonEmpty: false }), selfResult({ patchNonEmpty: false }), selfResult({ pass: true, signal: 'pass' })]);
  const row = await runV4(task, { attempt, budgetUsd: 1, tiers: v5, rule: 'v5' });
  assert.deepEqual(calls.map(c => c.model), [HAIKU, HAIKU, SONNET]);
  assert.equal(row.escalated, true);
  assert.equal(row.finalPass, true);
});

test('rule: a failing Sonnet rung is the final failure with no further calls', async () => {
  const { attempt, calls } = stub([selfResult({ signal: 'fail' }), selfResult({ signal: 'fail' }), selfResult({ signal: 'fail' })]);
  const row = await runV4(task, { attempt, budgetUsd: 1, tiers: v5, rule: 'v5' });
  assert.equal(calls.length, 3);
  assert.equal(row.finalPass, false);
});

test('rule: Sonnet is skipped when its 0.05 reservation would exceed the budget', async () => {
  const { attempt, calls } = stub([selfResult({ signal: 'fail' })]);
  const row = await runV4(task, { attempt, budgetUsd: 0.04, tiers: v5, rule: 'v5' });
  assert.equal(calls.length, 2); // second cheap round runs; Sonnet reservation then fails
  assert.equal(row.escalationSkipped, 'budget');
  assert.equal(row.finalPass, false);
});

test('strict: a cheap pass after a failed cheap round escalates; non-strict accepts it', async () => {
  const fail = selfResult({ signal: 'fail' }), pass = selfResult({ pass: true, signal: 'pass' });
  const strict = stub([fail, pass, pass]);
  const s = await runV4(task, { attempt: strict.attempt, budgetUsd: 1, tiers: v5, rule: 'v5', strict: true });
  assert.equal(s.escalated, true);
  assert.deepEqual(strict.calls.map(c => c.model), [HAIKU, HAIKU, SONNET]);
  const loose = stub([fail, pass]);
  const l = await runV4(task, { attempt: loose.attempt, budgetUsd: 1, tiers: v5, rule: 'v5' });
  assert.equal(l.escalated, false);
  assert.equal(l.finalPass, true);
});
