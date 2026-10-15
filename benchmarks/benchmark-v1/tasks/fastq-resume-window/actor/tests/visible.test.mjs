import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const W = resolve(process.env.SUFFICE_TASK_WORKSPACE || process.cwd());
const require = createRequire(resolve(W, 'src/package.json'));
const fastq = require('./queue.js');

test('FV01 immediate callback and context', () => {
  const context = {factor: 3}; let seen;
  const q = fastq(context, function(value, done) { done(null, value * this.factor); }, 1);
  q.push(7, function(error, value) { seen = [error, value, this === context]; });
  assert.deepEqual([seen, q.running(), q.idle()], [[null, 21, true], 0, true]);
});
test('FV02 promise immediate result', async () => {
  const q = fastq.promise(async value => value + 2, 2);
  assert.equal(await q.push(5), 7);
});
test('FV03 paused queue stores FIFO and unshift', () => {
  const q = fastq((value, done) => done(null, value), 1);
  q.pause(); q.push('tail'); q.unshift('head');
  assert.deepEqual([q.getQueue(), q.running(), q.length(), q.paused], [['head', 'tail'], 0, 2, true]);
});
