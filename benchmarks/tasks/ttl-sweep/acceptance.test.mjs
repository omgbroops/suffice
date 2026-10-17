import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { TtlCache } = await load('src/ttl.mjs');
test('an entry is expired exactly at ttl, not one millisecond later', () => {
  let t = 0;
  const cache = new TtlCache(100, () => t);
  cache.set('a', 'A');
  t = 99;
  assert.equal(cache.get('a'), 'A');
  t = 100;
  assert.equal(cache.get('a'), undefined);
});
test('setting an existing key restarts its lifetime', () => {
  let t = 0;
  const cache = new TtlCache(100, () => t);
  cache.set('a', 1);
  t = 60;
  cache.set('a', 2);
  t = 120;
  assert.equal(cache.get('a'), 2);
  t = 160;
  assert.equal(cache.get('a'), undefined);
});
test('size counts only live entries, not expired unswept ones', () => {
  let t = 0;
  const cache = new TtlCache(100, () => t);
  cache.set('a', 1);
  cache.set('b', 2);
  t = 150;
  assert.equal(cache.size(), 0);
  cache.set('c', 3);
  assert.equal(cache.size(), 1);
});
test('sweep removes all adjacent expired entries and keeps live ones', () => {
  let t = 0;
  const cache = new TtlCache(100, () => t);
  for (const key of ['k1', 'k2', 'k3', 'k4', 'k5']) cache.set(key, key);
  t = 150;
  cache.set('live', 'L');
  assert.equal(cache.sweep(), 5);
  assert.equal(cache.get('live'), 'L');
  assert.equal(cache.size(), 1);
  assert.equal(cache.sweep(), 0);
});
}
