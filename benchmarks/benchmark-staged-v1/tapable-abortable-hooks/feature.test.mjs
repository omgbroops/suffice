import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { AsyncSeriesHook, AsyncParallelHook } = require(resolve(process.env.SUFFICE_WORKSPACE || process.cwd(), 'src/lib/index.js'));

test('public feature pre-aborted invocations skip work and preserve the reason', async () => {
  for (const Constructor of [AsyncSeriesHook, AsyncParallelHook]) {
    const hook = new Constructor([]), controller = new AbortController(), reason = new Error('cancelled before invocation');
    let started = false;
    hook.tap('unstarted', () => { started = true; }); controller.abort(reason);
    await assert.rejects(hook.promiseWithSignal(controller.signal), error => error === reason);
    assert.equal(started, false);
  }
});

test('public feature cancellation stops ordered successors and completes once', () => {
  const hook = new AsyncSeriesHook([]), controller = new AbortController(), reason = { cancelled: true }, trace = [];
  let finish;
  hook.tapAsync('pending', done => { trace.push('pending'); finish = done; });
  hook.tap('unstarted', () => trace.push('unstarted'));
  const completions = [];
  hook.callAsyncWithSignal(controller.signal, (...args) => completions.push(args));
  assert.deepEqual(trace, ['pending']);
  controller.abort(reason);
  assert.deepEqual(completions, [[reason]]);
  finish(); finish(new Error('late callback'));
  assert.deepEqual(trace, ['pending']); assert.equal(completions.length, 1);
});

test('public feature parallel cancellation stops further launches while observing started work', () => {
  const hook = new AsyncParallelHook([]), controller = new AbortController(), reason = { cancelled: true }, trace = [];
  let finish;
  hook.tapAsync('pending', done => { trace.push('pending'); finish = done; });
  hook.tap('cancel', () => { trace.push('cancel'); controller.abort(reason); });
  hook.tap('unstarted', () => trace.push('unstarted'));
  const completions = [];
  hook.callAsyncWithSignal(controller.signal, (...args) => completions.push(args));
  assert.deepEqual(trace, ['pending', 'cancel']); assert.deepEqual(completions, [[reason]]);
  finish(new Error('late failure')); assert.equal(completions.length, 1);
});
