import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runBench, parseArgs, main } from '../scripts/v4-bench.mjs';
import { runV4Task } from '../src/v4-runner.mjs';

const fakeBin = resolve(import.meta.dirname, '../tests/fixtures/fake-claude.mjs');
const tmp = () => mkdtemp(join(tmpdir(), 'v4-cli-'));
const lines = async file => (await readFile(file, 'utf8')).trim().split('\n').map(l => JSON.parse(l));

// Stub provider: each item gets its own broken workspace; acceptance passes only once src/a.txt reads 'fixed'.
function stubProvider(root) {
  return {
    async prepWorkspace(item) {
      const dir = join(root, item.taskId);
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src/a.txt'), 'broken\n');
      return { dir, acceptanceCommand: 'stub', cleanup: async () => {} };
    },
    runAcceptance: async prep => (await readFile(join(prep.dir, 'src/a.txt'), 'utf8')).trim() === 'fixed',
  };
}

test('worker concurrency is capped at 3 and each item gets one row', async () => {
  const root = await tmp();
  const results = join(root, 'rows.jsonl');
  const items = Array.from({ length: 6 }, (_, i) => ({ taskId: `t${i}` }));
  let inFlight = 0, peak = 0;
  const runTask = async ({ task }) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise(r => setTimeout(r, 10));
    inFlight--;
    const row = { task: task.id, status: 'completed' };
    await appendFile(results, JSON.stringify(row) + '\n');
    return row;
  };
  await runBench({ items, arm: 'v4', workers: 3, globalCapUsd: 1, results, provider: stubProvider(root), probe: async () => 90, runTask });
  assert.equal(peak, 3);
  assert.equal((await lines(results)).length, 6);
});

test('a global-cap refusal mid-run stops launches: the refused item and the rest get rows, and no later provider call is made', async () => {
  const root = await tmp();
  const results = join(root, 'rows.jsonl');
  const log = join(root, 'calls.jsonl');
  process.env.FAKE_MODE = 'noop';
  process.env.FAKE_LOG = log;
  const items = ['t0', 't1', 't2'].map(taskId => ({ taskId }));
  await runBench({ items, arm: 'v4', workers: 1, globalCapUsd: 0.025, results, provider: stubProvider(root), probe: async () => 90, bin: fakeBin, runTask: runV4Task });
  const written = await lines(results);
  assert.deepEqual(written.map(r => r.status), ['global_cap_refused', 'aborted_cap', 'aborted_cap']);
  assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1); // only the first attempt reached the fake provider
});

test('a non-empty results file is refused before anything runs', async () => {
  const root = await tmp();
  const results = join(root, 'rows.jsonl');
  await writeFile(results, '{"old":1}\n');
  let called = false;
  await assert.rejects(runBench({ items: [{ taskId: 't0' }], arm: 'v4', globalCapUsd: 1, results, provider: stubProvider(root), probe: async () => 90, runTask: async () => { called = true; } }), /not empty/);
  assert.equal(called, false);
});

test('a missing global cap or results path is refused, and unknown flags are rejected', async () => {
  await assert.rejects(main(['--manifest=x.json', '--arm=v4', '--results=y.jsonl']), /usage/);
  assert.throws(() => parseArgs(['--bogus=1']), /unknown argument/);
  assert.deepEqual(parseArgs(['--arm=single:claude-opus-5-5']), { arm: 'single:claude-opus-5-5' });
});
