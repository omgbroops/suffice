import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { LruCache } = await load('src/lru.mjs');
const delay = (ms, value) => new Promise(resolveDelay => setTimeout(() => resolveDelay(value), ms));
test('a hit refreshes recency before eviction', async () => {
  const cache = new LruCache(2); let loads = 0;
  const loader = value => async () => { loads++; return value; };
  assert.equal(await cache.getOrLoad('a', loader('A')), 'A');
  assert.equal(await cache.getOrLoad('b', loader('B')), 'B');
  assert.equal(await cache.getOrLoad('a', async () => assert.fail('unexpected load')), 'A');
  assert.equal(await cache.getOrLoad('c', loader('C')), 'C');
  assert.equal(await cache.getOrLoad('a', async () => assert.fail('a was evicted')), 'A');
  assert.equal(await cache.getOrLoad('b', loader('B2')), 'B2');
  assert.equal(loads, 4);
});
test('concurrent loads for one key share a single loader call', async () => {
  const cache = new LruCache(2); let calls = 0;
  const loader = async () => { calls++; await delay(5); return 'v'; };
  const values = await Promise.all([cache.getOrLoad('k', loader), cache.getOrLoad('k', loader), cache.getOrLoad('k', loader)]);
  assert.deepEqual(values, ['v', 'v', 'v']);
  assert.equal(calls, 1);
});
test('a rejected load is not cached and leaves no in-flight residue', async () => {
  const cache = new LruCache(2);
  await assert.rejects(cache.getOrLoad('x', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await cache.getOrLoad('a', async () => 'A'), 'A');
  assert.equal(await cache.getOrLoad('a', async () => assert.fail('a was not cached')), 'A');
  assert.equal(await cache.getOrLoad('x', async () => 'X'), 'X');
});
test('falsy values are cached', async () => {
  const cache = new LruCache(4);
  assert.equal(await cache.getOrLoad('z', async () => 0), 0);
  assert.equal(await cache.getOrLoad('e', async () => ''), '');
  assert.equal(await cache.getOrLoad('n', async () => null), null);
  assert.equal(await cache.getOrLoad('f', async () => false), false);
  assert.equal(await cache.getOrLoad('z', async () => assert.fail('0 not cached')), 0);
  assert.equal(await cache.getOrLoad('n', async () => assert.fail('null not cached')), null);
});
test('settled entries alone count toward capacity and in-flight loads are never evicted', async () => {
  const cache = new LruCache(2);
  assert.equal(await cache.getOrLoad('a', async () => 'A'), 'A');
  assert.equal(await cache.getOrLoad('b', async () => 'B'), 'B');
  assert.equal(await cache.getOrLoad('a', async () => assert.fail('a evicted by settled count')), 'A');
  assert.equal(await cache.getOrLoad('b', async () => assert.fail('b evicted by settled count')), 'B');
  const slow = cache.getOrLoad('p', () => delay(10, 'P'));
  assert.equal(await cache.getOrLoad('q', async () => 'Q'), 'Q');
  assert.equal(await slow, 'P');
});
}
