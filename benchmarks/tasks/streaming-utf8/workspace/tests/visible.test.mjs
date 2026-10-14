import test from 'node:test';
import assert from 'node:assert/strict';
import { readLines } from '../src/lines.mjs';
test('ASCII lines and a final tail', async () => {
  const bytes = new TextEncoder().encode('one\ntwo\ntail');
  assert.deepEqual(await readLines([bytes]), ['one', 'two', 'tail']);
});
