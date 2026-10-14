import test from 'node:test';
import assert from 'node:assert/strict';
import { ExpiringStore } from '../src/store.mjs';
import { TenantCache } from '../src/cache.mjs';
test('cache reuses a value for the same tenant and resource', async () => {
  const cache = new TenantCache(new ExpiringStore());
  assert.equal(await cache.getOrLoad('tenant', 'item', async () => 0), 0);
  assert.equal(await cache.getOrLoad('tenant', 'item', async () => assert.fail('unexpected load')), 0);
});
