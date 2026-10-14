import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeed } from '../src/index.mjs';
test('single tenant events replay and unsubscribe', () => {
  const feed = createFeed(), received = [];
  feed.publishBatch('red', [{ type: 'added', payload: { value: 1 } }]);
  const unsubscribe = feed.subscribe('red', 0, record => received.push(record));
  feed.publishBatch('red', [{ type: 'added', payload: { value: 2 } }]);
  unsubscribe(); unsubscribe();
  feed.publishBatch('red', [{ type: 'added', payload: { value: 3 } }]);
  assert.deepEqual(received.map(record => record.sequence), [1, 2]);
  assert.deepEqual(feed.history('red', 1).map(record => record.sequence), [2, 3]);
});
