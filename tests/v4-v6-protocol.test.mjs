import test from 'node:test';
import assert from 'node:assert/strict';
import { runV4, selfRetryPrompt, V4_RETRY_MESSAGE } from '../src/v4-escalation.mjs';
import { pass2Retry } from '../src/v4-runner.mjs';
import { parseArgs, main } from '../scripts/v4-bench.mjs';
import { armTiers } from '../src/v4-config.mjs';

const task = { id: 'demo-task', prompt: 'Fix the parser.' };
const HAIKU = 'claude-haiku-5-5', SONNET = 'claude-sonnet-5-5';
const v5 = armTiers('v5');
const ok = { patchNonEmpty: true, patchApplies: true, inside: true, pass: false };

// Stub attempt: replays fixed self-gate results and records every call.
function stub(results, costUsd = 0.01) {
  const calls = [];
  const attempt = async call => {
    calls.push(call);
    return { costUsd, ...(results.shift() ?? { ...ok, pass: false, signal: 'fail' }) };
  };
  return { attempt, calls };
}

test('v5: a failed SELFTEST retry prompt carries the last 1500 chars of the agent\'s own output', async () => {
  const tail = 'x'.repeat(2000) + 'TAIL-END';
  const { attempt, calls } = stub([{ ...ok, signal: 'fail', selfTestCmd: 'npm test', selfTestTail: tail }, { ...ok, pass: true, signal: 'pass' }]);
  const row = await runV4(task, { attempt, budgetUsd: 1, tiers: v5, rule: 'v5' });
  assert.deepEqual(calls.map(c => c.model), [HAIKU, HAIKU]);
  assert.ok(calls[1].prompt.startsWith(V4_RETRY_MESSAGE));
  assert.ok(calls[1].prompt.includes('TAIL-END'));
  assert.ok(calls[1].prompt.includes('x'.repeat(1500 - 8) + 'TAIL-END'));
  assert.ok(!calls[1].prompt.includes('x'.repeat(1500 - 7) + 'TAIL-END'));
  assert.match(calls[1].prompt, /The test may itself be wrong: fix the test or the code\./);
  assert.equal(row.finalPass, true);
  assert.equal(row.escalated, false);
});

test('v5: a fail round escalates only after the cheap tier\'s rounds are used up', async () => {
  const { attempt, calls } = stub([{ ...ok, signal: 'fail' }, { ...ok, signal: 'fail' }, { ...ok, pass: true, signal: 'pass' }]);
  const row = await runV4(task, { attempt, budgetUsd: 1, tiers: v5, rule: 'v5' });
  assert.deepEqual(calls.map(c => c.model), [HAIKU, HAIKU, SONNET]);
  assert.equal(row.roundsUsed, 2);
  assert.equal(row.escalated, true);
});

test('v4 rule keeps the plain retry message after a failed round', async () => {
  const { attempt, calls } = stub([{ ...ok, signal: 'fail', selfTestTail: 'boom' }, { ...ok, pass: true, signal: 'pass' }]);
  await runV4(task, { attempt, budgetUsd: 1, tiers: v5, rule: 'v4' });
  assert.equal(calls[1].prompt, V4_RETRY_MESSAGE);
});

test('selfRetryPrompt tolerates a missing tail', () => {
  assert.equal(selfRetryPrompt(undefined), `${V4_RETRY_MESSAGE}\n\nYour own SELFTEST output (last 1500 chars):\n\n\nThe test may itself be wrong: fix the test or the code.`);
});

test('selfTests logs cmd, signal and the last 400 chars per round', async () => {
  const long = 'y'.repeat(900) + 'LOG-TAIL';
  const { attempt } = stub([{ ...ok, signal: 'fail', selfTestCmd: 'node t.js', selfTestTail: long }, { ...ok, pass: true, signal: 'pass', selfTestCmd: 'node t.js', selfTestTail: 'ok' }]);
  const row = await runV4(task, { attempt, budgetUsd: 1, tiers: v5, rule: 'v5' });
  assert.equal(row.selfTests.length, 2);
  assert.deepEqual(row.selfTests.map(s => [s.round, s.model, s.cmd, s.signal]), [[1, HAIKU, 'node t.js', 'fail'], [2, HAIKU, 'node t.js', 'pass']]);
  assert.equal(row.selfTests[0].tail.length, 400);
  assert.ok(row.selfTests[0].tail.endsWith('LOG-TAIL'));
});

// pass2Retry with fake attempt/verify: no network, no claude.
function pass2Setup({ verdicts, finalPass = false, spent = 0.02, budgetUsd = 1, selfTests = [{ round: 3, model: SONNET }] }) {
  const calls = [];
  const ledger = { spentUsd: spent, costKnown: true };
  const attempt = async call => { calls.push(call); ledger.spentUsd += 0.05; return { costUsd: 0.05 }; };
  const verified = [...verdicts];
  const verify = async () => verified.shift();
  const row = { task: task.id, finalPass, selfTests, roundsUsed: 2, escalated: true };
  const run = () => pass2Retry({ row, tiers: v5, attempt, workspace: "/ws", ledger, budgetUsd, verify, verifyOutput: () => "H".repeat(3500) + "HIDDEN-END" });
  return { run, calls };
}

test("pass2: after a failed hidden verify, one attempt on the last tier model with the hidden output (last 3000 chars), then re-verify", async () => {
  const { run, calls } = pass2Setup({ verdicts: [true] });
  const out = await run();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, SONNET);
  assert.equal(calls[0].round, 4);
  assert.ok(calls[0].prompt.startsWith(V4_RETRY_MESSAGE));
  assert.ok(calls[0].prompt.endsWith("H".repeat(2990) + "HIDDEN-END"));
  assert.equal(out.pass1, false);
  assert.equal(out.pass2, true);
  assert.equal(out.finalPass, false);
  assert.equal(out.costUsd, 0.07);
});

test("pass2: still failing after the retry gives pass2 false and leaves pass1 alone", async () => {
  const { run } = pass2Setup({ verdicts: [false] });
  const out = await run();
  assert.equal(out.pass2, false);
  assert.equal(out.pass1, false);
});

test("pass2: a pass1 pass makes no extra attempt and reports pass2 true", async () => {
  const { run, calls } = pass2Setup({ verdicts: [], finalPass: true });
  const out = await run();
  assert.equal(calls.length, 0);
  assert.equal(out.pass1, true);
  assert.equal(out.pass2, true);
});

test("pass2: a retry the budget cannot afford is skipped with pass2 null", async () => {
  const { run, calls } = pass2Setup({ verdicts: [], spent: 0.99 });
  const out = await run();
  assert.equal(calls.length, 0);
  assert.equal(out.pass2, null);
  assert.equal(out.pass1, false);
});

test("bench CLI: --protocol is a known flag and pass2 is refused for swebpro", async () => {
  assert.equal(parseArgs(["--protocol=pass2"]).protocol, "pass2");
  await assert.rejects(main(["--manifest=x.json", "--arm=v4", "--global-cap-usd=1", "--results=/tmp/x.jsonl", "--provider=swebpro", "--protocol=pass2"]), /polyglot-only/);
});
