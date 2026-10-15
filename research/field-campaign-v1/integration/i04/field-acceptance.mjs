import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const fastq = require('./queue.js');
function fixture(concurrency) {
  const active = new Map(); const started = []; const finished = [];
  const queue = fastq((value, done) => {started.push(value); active.set(value, done);}, concurrency);
  function complete(value) {const done = active.get(value); assert.ok(done); active.delete(value); done(null, value); finished.push(value);}
  function drain() {while (active.size) complete(active.keys().next().value); assert.equal(queue.idle(), true);}
  return {queue, active, started, finished, complete, drain};
}
{
  const f = fixture(1);
  for (let i = 0; i < 6; i++) f.queue.push(i);
  for (let i = 0; i < 3; i++) {f.queue.pause(); f.queue.resume(); assert.equal(f.active.size, 1); assert.equal(f.queue.running(), 1);}
  f.drain(); assert.deepEqual(f.started, [0,1,2,3,4,5]);
}
{
  const f = fixture(1);
  for (let i = 0; i < 7; i++) f.queue.push(i);
  f.queue.concurrency = 3;
  assert.equal(f.active.size, 3);
  f.queue.concurrency = 1;
  f.queue.push(7); f.queue.unshift(8);
  assert.equal(f.active.size, 3); // Existing workers finish, new workers wait.
  f.complete(0); assert.equal(f.active.size, 2);
  f.complete(1); assert.equal(f.active.size, 1);
  f.complete(2); assert.equal(f.active.size, 1);
  assert.equal(f.started[3], 8);
  f.drain(); assert.deepEqual(f.started, [0,1,2,8,3,4,5,6,7]);
}
{
  const f = fixture(1);
  f.queue.pause(); f.queue.push(1); f.queue.push(2); f.queue.concurrency = 2;
  assert.equal(f.active.size, 0);
  f.queue.resume(); assert.equal(f.active.size, 2); f.drain();
  for (const invalid of [0, -1, NaN]) assert.throws(() => {f.queue.concurrency = invalid;});
  assert.equal(f.queue.concurrency, 2);
}
console.log('pause/resume, concurrency increase/decrease, push/unshift and invalid values passed');
