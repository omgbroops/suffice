import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import pDebounce from './index.js';

test('slow leading call keeps suppressed callers pending for the same result', async () => {
  let finish;
  let calls = 0;
  const debounced = pDebounce(() => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  }, 10, {before: true});
  const first = debounced();
  let secondSettled = false;
  const second = debounced().then(value => {
    secondSettled = true;
    return value;
  });
  await delay(40);
  const settledBeforeResult = secondSettled;
  finish(42);
  const results = await Promise.all([first, second]);
  console.log({settledBeforeResult, results, calls});
  assert.equal(settledBeforeResult, false);
  assert.deepEqual(results, [42, 42]);
  assert.equal(calls, 1);
});
