import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { createFeed } = await import(pathToFileURL(resolve(workspace, 'src/index.mjs')).href);
const event = value => ({ type: 'added', payload: { nested: { value }, list: [value] } });
test('tenant filtering applies equally to replay and live delivery', () => {
  const feed = createFeed(), red = [], blue = [];
  feed.publishBatch('red', [event(1)]); feed.publishBatch('blue', [event(2)]);
  const stopRed = feed.subscribe('red', 0, record => red.push(record));
  const stopBlue = feed.subscribe('blue', 1, record => blue.push(record));
  feed.publishBatch('red', [event(3), event(4)]); feed.publishBatch('blue', [event(5)]);
  assert.deepEqual(red.map(record => record.sequence), [1, 3, 4]);
  assert.deepEqual(blue.map(record => record.sequence), [2, 5]);
  stopRed(); stopRed(); stopBlue();
  feed.publishBatch('red', [event(6)]);
  assert.equal(red.length, 3);
  assert.deepEqual(feed.history('blue', 2).map(record => record.sequence), [5]);
});
test('failed batches publish neither records nor sequence nor notifications', () => {
  const feed = createFeed(), seen = [];
  feed.subscribe('red', 0, record => seen.push(record));
  feed.publishBatch('red', [event(1)]);
  assert.throws(() => feed.publishBatch('red', [event(2), { type: '', payload: {} }]), /Invalid/);
  assert.deepEqual(feed.history('red').map(record => record.sequence), [1]);
  assert.deepEqual(seen.map(record => record.sequence), [1]);
  assert.equal(feed.publishBatch('blue', [event(3)])[0].sequence, 2);
  assert.deepEqual(feed.publishBatch('red', []), []);
});
test('nested snapshots isolate inputs, history, results and subscribers', () => {
  const feed = createFeed(), input = event(1);
  const published = feed.publishBatch('red', [input]);
  input.payload.nested.value = 8; input.payload.list.push(8);
  published[0].payload.nested.value = 9; published[0].payload.list.push(9);
  assert.deepEqual(feed.history('red')[0].payload, { nested: { value: 1 }, list: [1] });
  const history = feed.history('red'); history[0].payload.nested.value = 6;
  const observed = [];
  feed.subscribe('red', 0, record => { record.payload.nested.value = 7; record.payload.list.push(7); });
  feed.subscribe('red', 0, record => observed.push(record));
  feed.publishBatch('red', [event(2)]);
  assert.deepEqual(observed.map(record => record.payload.nested.value), [1, 2]);
  assert.deepEqual(observed.map(record => record.payload.list), [[1], [2]]);
  assert.equal(feed.history('red')[1].payload.nested.value, 2);
});
test('cursors and identities validate before registering subscribers', () => {
  const feed = createFeed();
  for (const cursor of [-1, 1.5, '0']) assert.throws(() => feed.subscribe('red', cursor, () => {}), /cursor/);
  assert.throws(() => feed.history('', 0), /tenant/);
  assert.throws(() => feed.publishBatch('red', [event(1), { type: 'x', payload: { method() {} } }]));
  assert.equal(feed.publishBatch('red', [event(2)])[0].sequence, 1);
});
}
