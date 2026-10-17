import test from 'node:test';
import assert from 'node:assert/strict';
import { Batcher } from '../src/batcher.mjs';
test('a full batch resolves each item with its result', async () => {
  const batcher = new Batcher(async items => items.map(item => item * 2), 2, 10);
  assert.deepEqual(await Promise.all([batcher.add(1), batcher.add(2)]), [2, 4]);
});
