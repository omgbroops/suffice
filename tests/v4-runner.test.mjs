import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runV4Task } from '../src/v4-runner.mjs';
import { V4_RETRY_MESSAGE } from '../src/v4-escalation.mjs';
import { V4_TOOLS } from '../src/v4-claude.mjs';

const root = resolve(import.meta.dirname, '..');
const fakeBin = resolve(root, 'tests/fixtures/fake-claude.mjs');

// Fixture task: the agent workspace has a broken file; the hidden acceptance test lives outside it.
async function fixtureTask() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'v4-fixture-'))); // realpath: node --permission checks the entry's real path
  const workspaceDir = join(dir, 'workspace');
  await mkdir(join(workspaceDir, 'src'), { recursive: true });
  await writeFile(join(workspaceDir, 'src/a.txt'), 'broken\n');
  const acceptancePath = join(dir, 'acceptance.test.mjs');
  await writeFile(acceptancePath, "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\ntest('a is fixed', () => assert.equal(readFileSync('src/a.txt', 'utf8').trim(), 'fixed'));\n");
  return { id: 'fixture', prompt: 'Make src/a.txt read fixed.', workspaceDir, acceptancePath, dir };
}

async function setup(mode, timeoutMs) {
  const task = await fixtureTask();
  const out = join(task.dir, 'rows.jsonl');
  const log = join(task.dir, 'calls.jsonl');
  process.env.FAKE_MODE = mode;
  process.env.FAKE_LOG = log;
  const run = budgetUsd => runV4Task({ task, budgetUsd, out, bin: fakeBin, timeoutMs });
  const calls = async () => existsSync(log) ? (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const rows = async () => existsSync(out) ? (await readFile(out, 'utf8')).trim().split('\n').map(l => JSON.parse(l)) : [];
  return { task, run, calls, rows };
}

test('crash: a dying agent still leaves exactly one row with status and cost', async () => {
  const { run, calls, rows } = await setup('crash');
  const row = await run(1);
  const written = await rows();
  assert.equal(written.length, 1);
  assert.equal(written[0].status, 'provider_error');
  assert.equal(written[0].costKnown, true);
  assert.equal(written[0].costUsd, 0);
  assert.equal(row.status, 'provider_error');
  assert.equal((await calls()).length, 1);
});

test('timeout: a hung agent is killed and recorded as run_timeout', async () => {
  const { run, rows } = await setup('hang', 300);
  await run(1);
  const written = await rows();
  assert.equal(written.length, 1);
  assert.equal(written[0].status, 'run_timeout');
});

test('unknown cost: recorded as cost_unknown with no escalation', async () => {
  const { run, calls, rows } = await setup('nocost');
  await run(1);
  const written = await rows();
  assert.equal(written[0].status, 'cost_unknown');
  assert.equal(written[0].costKnown, false);
  assert.equal((await calls()).length, 1);
});

test('first pass stops at one haiku call and writes a passing row', async () => {
  const { run, calls, rows } = await setup('fix');
  const row = await run(1);
  assert.equal((await calls()).length, 1);
  assert.equal(row.firstAttemptPass, true);
  assert.equal((await rows())[0].finalPass, true);
});

test('verdict-only retries: three haiku rounds, then one opus attempt with the task prompt', async () => {
  const { task, run, calls, rows } = await setup('wrong');
  const row = await run(1);
  const log = await calls();
  assert.deepEqual(log.map(c => c.model), ['claude-haiku-5-5', 'claude-haiku-5-5', 'claude-haiku-5-5', 'claude-opus-5-5']);
  assert.equal(log[0].prompt, task.prompt);
  assert.equal(log[1].prompt, V4_RETRY_MESSAGE);
  assert.equal(log[2].prompt, V4_RETRY_MESSAGE);
  assert.equal(log[3].prompt, task.prompt);
  assert.ok(!log[1].prompt.includes('fixed') && !log[1].prompt.includes('readFileSync'), 'retry must not carry test text');
  assert.equal(log[1].resume, 'sess-1');
  assert.equal(log[3].resume, undefined, 'escalation starts a fresh session');
  assert.equal(log[0].budget, '1.0000');
  assert.equal(log[3].budget, '0.9700', 'each attempt is capped at the remaining budget');
  assert.equal(row.escalated, true);
  assert.equal((await rows())[0].status, 'completed');
});

test('budget is required: the CLI refuses without --budget-usd or with a non-positive value and writes no row', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'v4-cli-')));
  const out = join(dir, 'rows.jsonl');
  for (const flags of [[], ['--budget-usd'], ['--budget-usd=0'], ['--budget-usd=abc']]) {
    const result = spawnSync(process.execPath, [resolve(root, 'scripts/v4-run.mjs'), `--out=${out}`, '--tasks=retry-idempotency', ...flags], { encoding: 'utf8' });
    assert.equal(result.status, 2, `flags ${flags.join(' ')}`);
    assert.match(result.stderr, /--budget-usd/);
  }
  assert.equal(existsSync(out), false);
});

test('tool profile is limited to Read, Edit, Write and Bash', () => {
  assert.deepEqual(V4_TOOLS, ['Read', 'Edit', 'Write', 'Bash']);
});
