import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucket } from '../src/bucket.mjs';
test('bucket grants a take within capacity', () => {
  const bucket = new TokenBucket(2, 1, () => 0);
  assert.equal(bucket.tryTake(1), true);
});
