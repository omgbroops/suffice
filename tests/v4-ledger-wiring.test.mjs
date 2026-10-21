import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runV4Task } from '../src/v4-runner.mjs';
import { openLedger } from '../src/v4-ledger.mjs';

const fakeBin = resolve(import.meta.dirname, '../tests/fixtures/fake-claude.mjs');

// Fake claude reports 0.01 USD per call; FAKE_MODE 'noop' leaves the file broken so the verdict fails and the ladder keeps going.
async function setup(mode, cap) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'v4-wire-')));
  const workspaceDir = join(dir, 'workspace');
  await mkdir(join(workspaceDir, 'src'), { recursive: true });
  await writeFile(join(workspaceDir, 'src/a.txt'), 'broken\n');
  const acceptancePath = join(dir, 'acceptance.test.mjs');
  await writeFile(acceptancePath, "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\ntest('a is fixed', () => assert.equal(readFileSync('src/a.txt', 'utf8').trim(), 'fixed'));\n");
  process.env.FAKE_MODE = mode;
  process.env.FAKE_LOG = join(dir, 'calls.jsonl');
  const ledger = openLedger({ file: join(dir, 'ledger.jsonl'), globalCapUsd: cap });
  const task = { id: 'wire', prompt: 'Make src/a.txt read fixed.', workspaceDir, acceptancePath };
  const out = join(dir, 'rows.jsonl');
  const run = () => runV4Task({ task, budgetUsd: 1, out, bin: fakeBin, timeoutMs: 20_000, ledger, meta: { benchmark: 'b', difficulty: 'easy', arm: 'v4', contaminated: false } });
  const calls = async () => existsSync(process.env.FAKE_LOG) ? (await readFile(process.env.FAKE_LOG, 'utf8')).trim().split('\n').filter(Boolean) : [];
  const rows = async () => (await readFile(out, 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  return { ledger, run, calls, rows, ledgerFile: join(dir, 'ledger.jsonl') };
}

test('cap refusal mid-run: the second attempt is refused, the row says global_cap_refused, and spend stays under the cap', async () => {
  const { ledger, run, calls, rows } = await setup('noop', 0.025);
  const row = await run();
  assert.equal(row.status, 'global_cap_refused');
  assert.match(row.error, /GLOBAL_CAP/);
  assert.equal(row.costUsd, 0.01);
  assert.equal((await calls()).length, 1); // the refused attempt never reached the provider
  assert.equal(await ledger.committed(), 0.01);
  const written = await rows();
  assert.equal(written.length, 1);
  assert.equal(written[0].benchmark, 'b');
  assert.equal(written[0].arm, 'v4');
});

test('unknown cost settles at the reserve and is flagged in the ledger', async () => {
  const { ledger, run, ledgerFile } = await setup('nocost', 1);
  const row = await run();
  assert.equal(row.status, 'cost_unknown');
  const entries = (await readFile(ledgerFile, 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  const settle = entries.find(e => e.op === 'settle');
  assert.equal(settle.usd, 0.02);
  assert.equal(settle.flag, 'unknown_cost');
  assert.equal(await ledger.committed(), 0.02);
});

test('a cap that fits the whole run leaves every attempt settled at its actual cost', async () => {
  const { ledger, run } = await setup('noop', 1);
  const row = await run();
  assert.equal(row.status, 'completed');
  assert.equal(row.roundsUsed, 3);
  assert.equal(await ledger.committed(), row.costUsd);
});
