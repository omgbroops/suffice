import test from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from '../src/ttl.mjs';
test('cache returns a fresh value', () => {
  const cache = new TtlCache(1000, () => 0);
  cache.set('a', 1);
  assert.equal(cache.get('a'), 1);
});
