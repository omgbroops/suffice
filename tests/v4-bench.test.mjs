import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule, loadManifest } from '../scripts/v4-bench.mjs';

const items = Array.from({ length: 5 }, (_, i) => ({ taskId: `t${i}` }));

test('every item gets exactly one row, with at most N workers in flight', async () => {
  let inFlight = 0, peak = 0;
  const written = [];
  const runItem = async item => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise(r => setTimeout(r, 5));
    inFlight--;
    return { task: item.taskId, status: 'completed' };
  };
  await schedule({ items, workers: 3, runItem, probe: async () => 90, out: 'x', write: async (_, s) => written.push(s) });
  assert.equal(peak, 3);
  assert.equal(written.length, 0); // runItem writes its own rows, so the scheduler writes none here
});

test('memory below 30% aborts launches; un-started items still get a row', async () => {
  const written = [];
  let calls = 0;
  const probe = async () => (++calls === 1 ? 90 : 20);
  const runItem = async item => ({ task: item.taskId, status: 'completed' });
  const rows = await schedule({ items, workers: 1, runItem, probe, out: 'x', write: async (_, s) => written.push(JSON.parse(s)) });
  assert.equal(rows.length, 5); // one row per item: 1 completed plus 4 aborted
  assert.deepEqual(written.map(r => r.status), ['aborted_memory', 'aborted_memory', 'aborted_memory', 'aborted_memory']);
});

test('a failed probe aborts (fail closed) and a crashing item still gets a harness_error row', async () => {
  const written = [];
  const write = async (_, s) => written.push(JSON.parse(s));
  await schedule({ items: items.slice(0, 1), workers: 1, runItem: async () => { throw new Error('boom'); }, probe: async () => { throw new Error('no tool'); }, out: 'x', write });
  assert.equal(written[0].status, 'aborted_memory');
  const crashed = [];
  await schedule({ items: items.slice(0, 1), workers: 1, runItem: async () => { throw new Error('boom'); }, probe: async () => 90, out: 'x', write: async (_, s) => crashed.push(JSON.parse(s)) });
  assert.equal(crashed[0].status, 'harness_error');
});

test('workers outside 1..16 are refused', async () => {
  await assert.rejects(schedule({ items, workers: 17, runItem: async () => ({}), out: 'x' }), /workers/);
});

test('polyglot manifest loads with nine tasks', () => {
  assert.equal(loadManifest('/Users/abhayg/suffice-v4/config/bench-manifest.polyglot.json').length, 9);
});
