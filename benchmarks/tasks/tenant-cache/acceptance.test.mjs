import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { ExpiringStore } = await load('src/store.mjs');
const { TenantCache } = await load('src/cache.mjs');
test('pair identity cannot collide through separators', async () => {
  const cache = new TenantCache(new ExpiringStore());
  assert.equal(await cache.getOrLoad('a:b', 'c', async () => 'first'), 'first');
  assert.equal(await cache.getOrLoad('a', 'b:c', async () => 'second'), 'second');
  assert.equal(await cache.getOrLoad('', ':', async () => false), false);
  assert.equal(await cache.getOrLoad(':', '', async () => 'fourth'), 'fourth');
});
test('injected clock governs write and exact expiration', async () => {
  let now = 40; let loads = 0;
  const cache = new TenantCache(new ExpiringStore({ now: () => now }));
  const loader = async () => ++loads;
  assert.equal(await cache.getOrLoad('t', 'r', loader, 10), 1);
  now = 49; assert.equal(await cache.getOrLoad('t', 'r', loader, 10), 1);
  now = 50; assert.equal(await cache.getOrLoad('t', 'r', loader, 10), 2);
  now = 60; assert.equal(await cache.getOrLoad('t', 'r', loader, 0), 3);
  assert.equal(await cache.getOrLoad('t', 'r', loader, 0), 4);
});
}
