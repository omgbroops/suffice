import test from 'node:test';
import assert from 'node:assert/strict';
import { LruCache } from '../src/lru.mjs';
test('cache reuses a loaded value', async () => {
  const cache = new LruCache(2);
  assert.equal(await cache.getOrLoad('k', async () => 0), 0);
  assert.equal(await cache.getOrLoad('k', async () => assert.fail('unexpected load')), 0);
});
