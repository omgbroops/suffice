import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import pLimit from './index.js';

// Strict unhandled-rejection mode makes an unobserved scheduled mapper fatal.
for (const count of [1, 4]) {
  const iteratorError = new Error('iterator failure');
  const started = [];
  function* inputs() {
    for (let index = 0; index < count; index++) yield index;
    throw iteratorError;
  }
  const limit = pLimit(2);
  await assert.rejects(limit.map(inputs(), async (value, index) => {
    started.push([value, index]);
    await delay(5);
    throw new Error('mapper failure');
  }), error => error === iteratorError);
  await delay(50);
  assert.deepEqual(started, Array.from({length: count}, (_, i) => [i, i]));
  assert.equal(limit.activeCount, 0);
  assert.equal(limit.pendingCount, 0);
}
const limit = pLimit(1);
const expected = new Error('mapper only');
await assert.rejects(limit.map([1], async () => {throw expected;}), error => error === expected);
assert.deepEqual(await limit.map({0: 3, 1: 5, length: 2}, (value, index) => value + index), [3, 6]);

// Iteration failure must reject immediately without waiting for queued work.
let release;
const gate = new Promise(resolve => {release = resolve;});
const blocked = limit(() => gate);
const error = new Error('stop iteration');
function* queued() {yield 'queued'; throw error;}
let observed = false;
const failed = limit.map(queued(), async () => {throw new Error('queued failure');}).catch(e => {assert.equal(e, error); observed = true;});
await delay(15);
assert.equal(observed, true);
release();
await blocked;
await failed;
await delay(25);
console.log('iterator identity, scheduled rejection observation, queue recovery and immediate failure passed');
