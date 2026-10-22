import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runV4Task } from '../src/v4-runner.mjs';
import { parseSelfTest, pytestPassed } from '../src/v4-selfsignal.mjs';
import { parseArgs, runBench } from '../scripts/v4-bench.mjs';

const fakeBin = resolve(import.meta.dirname, 'fixtures/fake-claude.mjs');

async function setup(mode) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'v4-selfgate-')));
  const workspaceDir = join(dir, 'workspace');
  await mkdir(join(workspaceDir, 'src'), { recursive: true });
  await writeFile(join(workspaceDir, 'src/a.txt'), 'broken\n');
  const task = { id: 'fixture', prompt: 'Make src/a.txt read fixed.', workspaceDir, acceptancePath: join(dir, 'unused') };
  const log = join(dir, 'calls.jsonl');
  const out = join(dir, 'rows.jsonl');
  process.env.FAKE_MODE = mode;
  process.env.FAKE_LOG = log;
  const agentCalls = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).length : 0;
  // Records how many agent calls had happened when each hidden verify ran; the hidden verdict is "a.txt reads fixed".
  const verifyAt = [];
  const verify = async ws => { verifyAt.push(agentCalls()); return (await readFile(join(ws, 'src/a.txt'), 'utf8')).trim() === 'fixed'; };
  const models = async () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l).model) : [];
  const run = (extra = {}) => runV4Task({ task, budgetUsd: 1, out, bin: fakeBin, verify, ...extra });
  return { run, verifyAt, agentCalls, models, out };
}

test('parseSelfTest: last SELFTEST line wins, none or missing means no check', () => {
  assert.equal(parseSelfTest('x\nSELFTEST: npm test\n'), 'npm test');
  assert.equal(parseSelfTest('SELFTEST: a\nmore\nSELFTEST: node --test x.mjs'), 'node --test x.mjs');
  assert.equal(parseSelfTest('SELFTEST: none'), null);
  assert.equal(parseSelfTest('done'), null);
});

test('pytestPassed: reads the last pytest summary line, not the exit code', () => {
  assert.equal(pytestPassed('== 3 passed in 0.4s ==\nXIO: fatal IO error'), true);
  assert.equal(pytestPassed('== 1 failed, 2 passed in 1s =='), false);
  assert.equal(pytestPassed('== 2 passed, 1 error in 1s =='), false);
  assert.equal(pytestPassed('all good, no summary'), false);
});

test('self gate: a passing first attempt calls the hidden verify once, after the agent finished', async () => {
  const s = await setup('fix');
  const row = await s.run();
  assert.equal((await s.models()).length, 1);
  assert.deepEqual(s.verifyAt, [1], 'one verify, after the single agent call');
  assert.equal(row.gate, 'self');
  assert.equal(row.firstAttemptPass, true);
  assert.equal(row.finalPass, true);
  assert.equal(row.selfFinalPass, true);
  assert.equal(s.agentCalls(), 1);
});

test('self gate: failing rounds escalate on the self signal; verify runs only after the last round (round 1 + final)', async () => {
  const s = await setup('wrong');
  const row = await s.run();
  assert.deepEqual(await s.models(), ['claude-haiku-5-5', 'claude-haiku-5-5', 'claude-haiku-5-5', 'claude-opus-5-5']);
  assert.equal(s.verifyAt.length, 2, 'final verdict plus round-1 verdict');
  assert.deepEqual(s.verifyAt, [4, 4], 'no verify before the final round');
  assert.equal(row.firstAttemptPass, false);
  assert.equal(row.finalPass, false);
  assert.equal(row.escalated, true);
});

test('self gate: an unverified round gets one cheap retry, then escalates', async () => {
  const s = await setup('unverified');
  const row = await s.run();
  assert.deepEqual(await s.models(), ['claude-haiku-5-5', 'claude-haiku-5-5', 'claude-opus-5-5']);
  assert.equal(row.escalated, true);
  assert.deepEqual(s.verifyAt, [3, 3]);
});

test('oracle gate: the hidden verdict decides every round (old behaviour), labelled gate=oracle', async () => {
  const s = await setup('wrong');
  const row = await s.run({ gate: 'oracle' });
  assert.equal((await s.models()).length, 4);
  assert.equal(s.verifyAt.length, 4);
  assert.equal(row.gate, 'oracle');
  assert.equal(row.selfFinalPass, undefined);
});

test('invalid gate writes a harness_error row and never calls the agent', async () => {
  const s = await setup('fix');
  const row = await s.run({ gate: 'bogus' });
  assert.equal(row.status, 'harness_error');
  assert.equal(await s.agentCalls(), 0);
});

test('bench CLI accepts --gate and refuses unknown gates before any spend', async () => {
  assert.equal(parseArgs(['--gate=oracle']).gate, 'oracle');
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'v4-gate-cli-')));
  await assert.rejects(runBench({ items: [], arm: 'v4', globalCapUsd: 1, results: join(dir, 'r.jsonl'), gate: 'bogus', provider: {} }), /--gate/);
  assert.equal(existsSync(join(dir, 'r.jsonl')), false);
});
