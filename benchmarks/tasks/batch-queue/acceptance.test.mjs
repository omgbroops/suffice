import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { Batcher } = await load('src/batcher.mjs');
const settle = () => new Promise(resolve => setImmediate(resolve));
test('a batch flushes as soon as it reaches maxSize', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const batcher = new Batcher(async items => { calls.push(items); return items; }, 2, 10);
  batcher.add('a');
  batcher.add('b');
  await settle();
  assert.deepEqual(calls, [['a', 'b']]);
});
test('a failed flush rejects every item in that batch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const batcher = new Batcher(async () => { throw new Error('boom'); }, 2, 10);
  const outcomes = [batcher.add('a'), batcher.add('b')].map(p => p.then(() => 'resolved', () => 'rejected'));
  const result = await Promise.race([Promise.all(outcomes), settle().then(() => 'pending')]);
  assert.deepEqual(result, ['rejected', 'rejected']);
});
test('items added while a flush is in flight are flushed later, not lost', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  let release;
  const batcher = new Batcher(items => {
    calls.push(items);
    return new Promise(resolve => { release = resolve; });
  }, 2, 10);
  batcher.add('a');
  batcher.add('b');
  batcher.add('c');
  release(['A', 'B']);
  await settle();
  t.mock.timers.tick(10);
  await settle();
  assert.deepEqual(calls, [['a', 'b'], ['c']]);
});
test('a size-triggered flush cancels the pending timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const batcher = new Batcher(async items => { calls.push(items); return items; }, 2, 10);
  batcher.add('a');
  batcher.add('b');
  await settle();
  t.mock.timers.tick(5);
  batcher.add('c');
  t.mock.timers.tick(5);
  await settle();
  assert.deepEqual(calls, [['a', 'b']]);
  t.mock.timers.tick(5);
  await settle();
  assert.deepEqual(calls, [['a', 'b'], ['c']]);
});
}
