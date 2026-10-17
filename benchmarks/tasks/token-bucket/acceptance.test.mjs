import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { TokenBucket } = await load('src/bucket.mjs');
test('refill never exceeds capacity', () => {
  let t = 0;
  const bucket = new TokenBucket(2, 1, () => t);
  assert.equal(bucket.tryTake(2), true);
  t = 10000;
  assert.equal(bucket.tryTake(2), true);
  assert.equal(bucket.tryTake(1), false);
});
test('refill is measured from the last refill, not from construction', () => {
  let t = 0;
  const bucket = new TokenBucket(10, 1, () => t);
  assert.equal(bucket.tryTake(10), true);
  t = 5000;
  assert.equal(bucket.tryTake(5), true);
  t = 6000;
  assert.equal(bucket.tryTake(2), false);
  assert.equal(bucket.tryTake(1), true);
});
test('a take larger than the balance is refused and leaves tokens intact', () => {
  let t = 0;
  const bucket = new TokenBucket(5, 1, () => t);
  assert.equal(bucket.tryTake(3), true);
  assert.equal(bucket.tryTake(4), false);
  assert.equal(bucket.tryTake(2), true);
});
test('waitTime converts a per-second refill rate to milliseconds', () => {
  let t = 0;
  const bucket = new TokenBucket(10, 2, () => t);
  assert.equal(bucket.tryTake(10), true);
  assert.equal(bucket.waitTime(3), 1500);
  assert.equal(bucket.waitTime(0), 0);
});
}
