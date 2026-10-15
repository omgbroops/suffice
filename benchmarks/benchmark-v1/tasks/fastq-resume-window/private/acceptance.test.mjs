import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const W = resolve(process.env.SUFFICE_TASK_WORKSPACE || process.cwd());
const require = createRequire(resolve(W, 'src/package.json'));
const fastq = require('./queue.js');
function harness(capacity) {
  const starts = []; const completions = new Map();
  const q = fastq((value, done) => { starts.push(value); completions.set(value, done); }, capacity);
  return {q, starts, finish(value, error = null) { const done = completions.get(value); completions.delete(value); done(error, value); },
    state() { return [starts.slice(), q.running(), q.getQueue(), q.paused]; }};
}

test('F01 paused capacity increase must not dispatch', () => {
  const h = harness(1); h.q.pause(); h.q.push('a'); h.q.push('b'); h.q.concurrency = 3;
  assert.deepEqual(h.state(), [[], 0, ['a', 'b'], true]);
});
test('F02 paused active completions do not start backlog', () => {
  const h = harness(2); h.q.push('a'); h.q.pause(); h.q.push('b'); h.q.concurrency = 3; h.finish('a');
  assert.deepEqual(h.state(), [['a'], 0, ['b'], true]);
});
test('F03 resume fills all available worker slots', () => {
  const h = harness(3); h.q.pause(); for (const v of ['a','b','c','d']) h.q.push(v); h.q.resume();
  assert.deepEqual(h.state(), [['a','b','c'], 3, ['d'], false]);
});
test('F04 resume preserves existing running worker accounting', () => {
  const h = harness(3); h.q.push('active'); h.q.pause(); for (const v of ['a','b','c']) h.q.push(v); h.q.resume();
  assert.deepEqual(h.state(), [['active','a','b'], 3, ['c'], false]);
});
test('F05 resume at full capacity waits for a completion', () => {
  const h = harness(1); h.q.push('active'); h.q.pause(); h.q.push('waiting'); h.q.resume();
  assert.deepEqual(h.state(), [['active'], 1, ['waiting'], false]);
});
test('F06 resume retains unshift priority and FIFO tails', () => {
  const h = harness(2); h.q.pause(); h.q.push('tail1'); h.q.push('tail2'); h.q.unshift('head'); h.q.resume();
  assert.deepEqual(h.state(), [['head','tail1'], 2, ['tail2'], false]);
});
test('F07 completion replaces worker at exact capacity', () => {
  const h = harness(2); for (const v of ['a','b','c','d']) h.q.push(v); h.finish('a');
  assert.deepEqual(h.state(), [['a','b','c'], 2, ['d'], false]);
});
test('F08 serial queue fully drains without another push', () => {
  const h = harness(1); let drained = 0; h.q.drain = () => drained++;
  for (const v of ['a','b','c']) h.q.push(v);
  h.finish('a'); if (h.starts.includes('b')) h.finish('b'); if (h.starts.includes('c')) h.finish('c');
  assert.deepEqual([h.starts, h.q.running(), h.q.getQueue(), h.q.idle(), drained], [['a','b','c'], 0, [], true, 1]);
});
test('F09 lowered concurrency waits for excess active workers', () => {
  const h = harness(3); for (const v of ['a','b','c','d']) h.q.push(v); h.q.concurrency = 1;
  h.finish('a'); h.finish('b');
  assert.deepEqual(h.state(), [['a','b','c'], 1, ['d'], false]);
});
test('F10 lowered concurrency refills at its new limit', () => {
  const h = harness(3); for (const v of ['a','b','c','d']) h.q.push(v); h.q.concurrency = 1;
  h.finish('a'); h.finish('b'); h.finish('c');
  assert.deepEqual(h.state(), [['a','b','c','d'], 1, [], false]);
});
test('F11 raised concurrency fills free slots immediately', () => {
  const h = harness(1); for (const v of ['a','b','c','d']) h.q.push(v); h.q.concurrency = 3;
  assert.deepEqual(h.state(), [['a','b','c'], 3, ['d'], false]);
});
test('F12 repeated resume is idempotent', () => {
  const h = harness(2); h.q.pause(); h.q.push('a'); h.q.push('b'); h.q.resume(); const before = h.state(); h.q.resume();
  assert.deepEqual([before, h.state()], [[['a','b'],2,[],false],[['a','b'],2,[],false]]);
});
test('F13 synchronous completion reentrancy preserves task order', () => {
  const starts = []; const results = [];
  const q = fastq((v, done) => { starts.push(v); done(null, v * 2); }, 3);
  q.pause(); for (const v of [1,2,3,4]) q.push(v, (error, value) => results.push([error, value])); q.resume();
  assert.deepEqual([starts, results, q.running(), q.getQueue(), q.idle()], [[1,2,3,4],[[null,2],[null,4],[null,6],[null,8]],0,[],true]);
});
test('F14 queued callback and error handler retain context and payload', () => {
  const context = {}; const received = []; const pending = []; const failure = new Error('worker failure');
  const q = fastq(context, (v, done) => pending.push(done), 1);
  q.error((error, value) => received.push(['error', error === failure, value]));
  q.push('a'); q.push('b', function(error, value) { received.push(['callback', error === failure, value, this === context]); });
  pending.shift()(null, 'a'); if (pending.length) pending.shift()(failure, 'b-result');
  assert.deepEqual([received, q.idle()], [[['error',false,'a'],['error',true,'b'],['callback',true,'b-result',true]],true]);
});
test('F15 empty and drain callbacks reflect queue transitions', () => {
  const h = harness(2); const events = []; h.q.empty = () => events.push(['empty', h.q.length()]); h.q.drain = () => events.push(['drain', h.q.running()]);
  h.q.pause(); h.q.push('a'); h.q.push('b'); h.q.resume();
  h.finish('a'); if (h.starts.includes('b')) h.finish('b');
  assert.deepEqual(events, [['empty',0],['drain',0]]);
});
test('F16 promise queue resumes and resolves all ordered results', {timeout: 2000}, async () => {
  const q = fastq.promise(async value => value * 2, 2); q.pause();
  const values = [q.push(1), q.push(2), q.unshift(3)]; q.resume();
  const timeout = new Promise(resolve => setTimeout(() => resolve('unsettled'), 100));
  const result = await Promise.race([Promise.all(values), timeout]);
  assert.deepEqual(result, [2,4,6]);
});
