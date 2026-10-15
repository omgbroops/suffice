import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { getEventListeners } from 'node:events';
const require = createRequire(import.meta.url);
const api = require(resolve(process.env.SUFFICE_WORKSPACE || process.cwd(), 'src/lib/index.js'));
const { AsyncSeriesHook, AsyncParallelHook } = api;
const constructors = [AsyncSeriesHook, AsyncParallelHook];
const listeners = signal => getEventListeners(signal, 'abort').length;

function callbackInvocation(hook, signal, ...args) {
  const outcome = Promise.withResolvers();
  const completions = [];
  hook.callAsyncWithSignal(signal, ...args, (...values) => {
    completions.push(values);
    outcome.resolve(values);
  });
  return { outcome: outcome.promise, completions };
}

test('stage one opt-in methods exist only on supported hook kinds and complete empty invocations', async () => {
  for (const Constructor of constructors) {
    const hook = new Constructor([]), controller = new AbortController();
    assert.equal(typeof hook.callAsyncWithSignal, 'function');
    assert.equal(typeof hook.promiseWithSignal, 'function');
    assert.equal(await hook.promiseWithSignal(controller.signal), undefined);
    const result = callbackInvocation(hook, controller.signal);
    assert.deepEqual(await result.outcome, []);
    assert.equal(result.completions.length, 1);
    assert.equal(listeners(controller.signal), 0);
  }
  for (const name of ['SyncHook', 'SyncBailHook', 'SyncLoopHook', 'SyncWaterfallHook', 'AsyncSeriesBailHook', 'AsyncSeriesWaterfallHook', 'AsyncSeriesLoopHook', 'AsyncParallelBailHook']) {
    const hook = new api[name](['value']);
    assert.equal(hook.callAsyncWithSignal, undefined);
    assert.equal(hook.promiseWithSignal, undefined);
  }
});

test('stage one pre-abort skips call and tap interception while preserving every reason', async () => {
  for (const Constructor of constructors) for (const reason of [new Error('cancel'), { cause: 8 }, null, false, 0]) {
    const hook = new Constructor([]), controller = new AbortController(), errors = [];
    let starts = 0, calls = 0;
    hook.tap('never', () => starts++);
    hook.intercept({ call() { calls++; }, tap() { starts++; }, error(error) { errors.push(error); } });
    controller.abort(reason);
    await assert.rejects(hook.promiseWithSignal(controller.signal), error => error === reason);
    const result = callbackInvocation(hook, controller.signal);
    assert.deepEqual(result.completions, [[reason]], 'pre-aborted callback is synchronous');
    assert.deepEqual(await result.outcome, [reason]);
    assert.equal(starts, 0); assert.equal(calls, 0);
    assert.deepEqual(errors, [reason, reason]);
    assert.equal(listeners(controller.signal), 0);
  }
});

test('stage one both abortable caches invalidate on new taps and interceptors', async () => {
  for (const Constructor of constructors) {
    const hook = new Constructor(['value']), trace = [];
    hook.tap('first', value => trace.push(`first:${value}`));
    await hook.promiseWithSignal(new AbortController().signal, 'warm-promise');
    await callbackInvocation(hook, new AbortController().signal, 'warm-callback').outcome;
    hook.tap('second', value => trace.push(`second:${value}`));
    await hook.promiseWithSignal(new AbortController().signal, 'new-promise');
    await callbackInvocation(hook, new AbortController().signal, 'new-callback').outcome;
    hook.intercept({ call(value) { trace.push(`call:${value}`); }, done() { trace.push('done'); } });
    await hook.promiseWithSignal(new AbortController().signal, 'intercept-promise');
    await callbackInvocation(hook, new AbortController().signal, 'intercept-callback').outcome;
    assert.deepEqual(trace, [
      'first:warm-promise', 'first:warm-callback',
      'first:new-promise', 'second:new-promise', 'first:new-callback', 'second:new-callback',
      'call:intercept-promise', 'first:intercept-promise', 'second:intercept-promise', 'done',
      'call:intercept-callback', 'first:intercept-callback', 'second:intercept-callback', 'done'
    ]);
  }
});

test('stage two generated adapters preserve arguments and original tap errors', async () => {
  for (const Constructor of constructors) for (const type of ['sync', 'callback', 'promise']) {
    const hook = new Constructor(['value', 'other']), controller = new AbortController();
    const expected = new Error(type), seen = [];
    const fail = (value, other) => { seen.push([value, other]); throw expected; };
    if (type === 'sync') hook.tap('failure', fail);
    if (type === 'callback') hook.tapAsync('failure', (value, other, done) => { seen.push([value, other]); done(expected); });
    if (type === 'promise') hook.tapPromise('failure', (value, other) => { seen.push([value, other]); return Promise.reject(expected); });
    await assert.rejects(hook.promiseWithSignal(controller.signal, 4, 'argument'), error => error === expected);
    const result = callbackInvocation(hook, controller.signal, 9, 'callback');
    assert.deepEqual(await result.outcome, [expected]);
    assert.deepEqual(seen, [[4, 'argument'], [9, 'callback']]);
    assert.equal(result.completions.length, 1);
    assert.equal(listeners(controller.signal), 0);
  }
});

test('stage two duplicate callbacks and throws after completion cannot settle twice', async () => {
  for (const Constructor of constructors) {
    const hook = new Constructor([]), controller = new AbortController();
    const ignored = new Error('late'), trace = [];
    hook.tapAsync('bad-caller', done => { done(); done(ignored); throw ignored; });
    hook.tap('next', () => trace.push('next'));
    const result = callbackInvocation(hook, controller.signal);
    assert.deepEqual(await result.outcome, []);
    controller.abort(ignored);
    assert.equal(result.completions.length, 1);
    assert.deepEqual(trace, ['next']);
    assert.equal(listeners(controller.signal), 0);
  }
});

test('stage two tap and terminal callback receivers keep unbound invocation conventions', async () => {
  for (const Constructor of constructors) {
    const hook = new Constructor(['value']), receivers = [], argumentsSeen = [];
    hook.tap('sync', function(value) { receivers.push(this); argumentsSeen.push(value); });
    hook.tapAsync('callback', function(value, done) { receivers.push(this); argumentsSeen.push(value); done(); });
    hook.tapPromise('promise', function(value) { receivers.push(this); argumentsSeen.push(value); return Promise.resolve(); });
    let callbackReceiver, callbackArguments;
    await new Promise((resolve, reject) => hook.callAsyncWithSignal(new AbortController().signal, 12, function(...args) {
      callbackReceiver = this; callbackArguments = args; args.length ? reject(args[0]) : resolve();
    }));
    assert.deepEqual(receivers, [undefined, undefined, undefined]);
    assert.deepEqual(argumentsSeen, [12, 12, 12]);
    assert.equal(callbackReceiver, undefined); assert.deepEqual(callbackArguments, []);
  }
});

test('stage two interceptor terminal notifications follow cleanup and precede completion', async () => {
  for (const Constructor of constructors) for (const failure of [false, true]) {
    const hook = new Constructor([]), controller = new AbortController(), trace = [], expected = new Error('tap failure');
    hook.intercept({
      tag: 'receiver',
      call() { assert.equal(this.tag, 'receiver'); trace.push('call'); },
      tap(tap) { assert.equal(this.tag, 'receiver'); trace.push(`tap:${tap.name}`); },
      done() { assert.equal(listeners(controller.signal), 0); trace.push('done'); },
      error(error) { assert.equal(listeners(controller.signal), 0); assert.equal(error, expected); trace.push('error'); }
    });
    hook.tap('work', () => { trace.push('work'); if (failure) throw expected; });
    let outcome;
    hook.callAsyncWithSignal(controller.signal, (...args) => { trace.push('callback'); outcome = args; });
    assert.deepEqual(trace, ['call', 'tap:work', 'work', failure ? 'error' : 'done', 'callback']);
    assert.deepEqual(outcome, failure ? [expected] : []);
  }
});

test('stage two cancellation from call or tap interception prevents subsequent starts', async () => {
  for (const Constructor of constructors) for (const phase of ['call', 'tap']) {
    const hook = new Constructor([]), controller = new AbortController(), reason = { phase }, trace = [];
    hook.intercept({
      call() { trace.push('call'); if (phase === 'call') controller.abort(reason); },
      tap() { trace.push('tap'); if (phase === 'tap') controller.abort(reason); },
      error(error) { assert.equal(error, reason); assert.equal(listeners(controller.signal), 0); trace.push('error'); },
      done() { trace.push('unexpected done'); }
    });
    hook.tap('never', () => trace.push('unexpected tap'));
    const result = callbackInvocation(hook, controller.signal);
    assert.deepEqual(await result.outcome, [reason]);
    assert.deepEqual(trace, phase === 'call' ? ['call', 'error'] : ['call', 'tap', 'error']);
    assert.equal(result.completions.length, 1);
  }
});

test('stage two abort cleanup is immediate and late callbacks or rejections stay observed', async () => {
  for (const Constructor of constructors) {
    const hook = new Constructor([]), controller = new AbortController(), late = Promise.withResolvers();
    let finish;
    hook.tapAsync('pending-callback', done => { finish = done; });
    hook.tapPromise('pending-promise', () => late.promise);
    const result = callbackInvocation(hook, controller.signal);
    assert.equal(listeners(controller.signal), 1);
    const reason = { cancelled: true };
    controller.abort(reason);
    assert.equal(listeners(controller.signal), 0);
    assert.deepEqual(result.completions, [[reason]], 'abort completion occurs in abort dispatch');
    finish(); finish(new Error('late callback'));
    // In series, the promise tap must never start, so its unattached gate is not rejected.
    if (Constructor === AsyncParallelHook) late.reject(new Error('late promise'));
    assert.deepEqual(await result.outcome, [reason]);
    await new Promise(setImmediate); // Flush the host rejection reporting turn, not a workload delay.
    assert.equal(result.completions.length, 1);
  }
});

test('stage two synchronous abort inside a promise tap still observes its rejected return', async () => {
  for (const Constructor of constructors) {
    const hook = new Constructor([]), controller = new AbortController(), reason = new Error('abort first');
    hook.tapPromise('abort-and-reject', () => { controller.abort(reason); return Promise.reject(new Error('late rejection')); });
    await assert.rejects(hook.promiseWithSignal(controller.signal), error => error === reason);
    await new Promise(setImmediate);
    assert.equal(listeners(controller.signal), 0);
  }
});

test('stage three series continuations wait for each mixed tap before starting the next', async () => {
  const hook = new AsyncSeriesHook(['value']), gate = Promise.withResolvers(), trace = [];
  let finish;
  hook.tap('sync', value => trace.push(`sync:${value}`));
  hook.tapAsync('callback', (value, done) => { trace.push(`callback:${value}`); finish = done; });
  hook.tapPromise('promise', value => { trace.push(`promise:${value}`); return gate.promise; });
  hook.tap('last', value => trace.push(`last:${value}`));
  const pending = hook.promiseWithSignal(new AbortController().signal, 5);
  assert.deepEqual(trace, ['sync:5', 'callback:5']);
  finish();
  assert.deepEqual(trace, ['sync:5', 'callback:5', 'promise:5']);
  gate.resolve(); await pending;
  assert.deepEqual(trace, ['sync:5', 'callback:5', 'promise:5', 'last:5']);
});

test('stage three abort or error stops ordered successors and first terminal event wins', async () => {
  const hook = new AsyncSeriesHook([]), controller = new AbortController(), expected = new Error('tap failed first');
  let finish, starts = 0;
  hook.tapAsync('pending', done => { finish = done; });
  hook.tap('unstarted', () => starts++);
  const result = callbackInvocation(hook, controller.signal);
  finish(expected); controller.abort(new Error('abort lost')); finish();
  assert.deepEqual(await result.outcome, [expected]);
  assert.equal(result.completions.length, 1); assert.equal(starts, 0);
  const later = new AbortController(), pending = callbackInvocation(hook, later.signal), reason = { later: true };
  later.abort(reason); finish(new Error('error lost'));
  assert.deepEqual(await pending.outcome, [reason]); assert.equal(starts, 0);
});

test('stage four parallel dispatch starts all pending taps without serializing them', async () => {
  const hook = new AsyncParallelHook(['value']), gate = Promise.withResolvers(), trace = [];
  let finish;
  hook.tapAsync('callback', (value, done) => { trace.push(`callback:${value}`); finish = done; });
  hook.tapPromise('promise', value => { trace.push(`promise:${value}`); return gate.promise; });
  hook.tap('sync', value => trace.push(`sync:${value}`));
  const controller = new AbortController(), result = callbackInvocation(hook, controller.signal, 6);
  assert.deepEqual(trace, ['callback:6', 'promise:6', 'sync:6']);
  assert.equal(result.completions.length, 0);
  finish(); finish();
  assert.equal(result.completions.length, 0);
  gate.resolve(); assert.deepEqual(await result.outcome, []);
  assert.equal(listeners(controller.signal), 0);
});

test('stage four abort during parallel dispatch prevents later launches and ignores late failure', async () => {
  const hook = new AsyncParallelHook([]), controller = new AbortController(), trace = [], late = Promise.withResolvers();
  const reason = { stop: true };
  hook.tapPromise('started', () => { trace.push('started'); return late.promise; });
  hook.tap('abort', () => { trace.push('abort'); controller.abort(reason); });
  hook.tap('never', () => trace.push('never'));
  const result = callbackInvocation(hook, controller.signal);
  assert.deepEqual(trace, ['started', 'abort']);
  assert.deepEqual(await result.outcome, [reason]);
  late.reject(new Error('late failure'));
  await new Promise(setImmediate);
  assert.equal(result.completions.length, 1); assert.equal(listeners(controller.signal), 0);
});

test('integration concurrent invocations isolate signals listeners and compilation snapshots', async () => {
  for (const Constructor of constructors) {
    const hook = new Constructor(['label']), finishes = new Map(), trace = [];
    hook.tapAsync('gate', (label, done) => { finishes.set(label, done); });
    hook.tap('old', label => trace.push(`old:${label}`));
    const controller = new AbortController();
    const first = callbackInvocation(hook, controller.signal, 'first');
    const second = callbackInvocation(hook, controller.signal, 'second');
    assert.equal(listeners(controller.signal), 2);
    hook.tap('new', label => trace.push(`new:${label}`));
    const intercepted = [];
    hook.intercept({ call(label) { intercepted.push(label); } });
    finishes.get('first')(); assert.deepEqual(await first.outcome, []);
    assert.equal(listeners(controller.signal), 1);
    const reason = new Error('second cancelled'); controller.abort(reason);
    assert.deepEqual(await second.outcome, [reason]); finishes.get('second')();
    assert.equal(listeners(controller.signal), 0);
    const fresh = new AbortController(), third = callbackInvocation(hook, fresh.signal, 'third');
    finishes.get('third')(); assert.deepEqual(await third.outcome, []);
    // Parallel old taps start immediately, including the one in the cancelled invocation.
    const expected = Constructor === AsyncSeriesHook ? ['old:first', 'old:third', 'new:third'] : ['old:first', 'old:second', 'old:third', 'new:third'];
    assert.deepEqual(trace, expected);
    assert.deepEqual(intercepted, ['third']);
    assert.equal(listeners(fresh.signal), 0);
  }
});

test('integration plugin pipeline composes ordered parallel cancellation cleanup and cache reuse', async () => {
  const pipeline = new AsyncSeriesHook(['ctx']), plugins = new AsyncParallelHook(['ctx']);
  const events = [];
  for (const [name, hook] of [['pipeline', pipeline], ['plugins', plugins]]) {
    hook.intercept({ call() { events.push(`${name}:call`); }, tap(tap) { events.push(`${name}:tap:${tap.name}`); }, error(reason) { events.push([name, reason]); }, done() { events.push(`${name}:done`); } });
  }
  pipeline.tapAsync('prepare', (ctx, done) => { ctx.trace.push('prepare'); ctx.prepared = done; });
  pipeline.tapPromise('plugins', ctx => plugins.promiseWithSignal(ctx.signal, ctx));
  pipeline.tap('commit', ctx => ctx.trace.push('commit'));
  plugins.tapAsync('compile', (ctx, done) => { ctx.trace.push('compile'); ctx.compiled = done; });
  plugins.tapPromise('assets', ctx => { ctx.trace.push('assets'); ctx.assets = Promise.withResolvers(); return ctx.assets.promise; });
  const firstController = new AbortController(), first = { signal: firstController.signal, trace: [] };
  const pending = pipeline.promiseWithSignal(first.signal, first);
  assert.deepEqual(first.trace, ['prepare']);
  first.prepared(); assert.deepEqual(first.trace, ['prepare', 'compile', 'assets']);
  const reason = { cancelledPipeline: true }; firstController.abort(reason);
  await assert.rejects(pending, error => error === reason);
  first.compiled(new Error('late callback')); first.assets.reject(new Error('late plugin promise'));
  await new Promise(setImmediate);
  assert.equal(listeners(first.signal), 0);
  assert.deepEqual(first.trace, ['prepare', 'compile', 'assets']);
  assert.equal(events.filter(event => Array.isArray(event) && event[1] === reason).length, 2);
  plugins.tap('audit', ctx => ctx.trace.push('audit'));
  pipeline.tap('final', ctx => ctx.trace.push('final'));
  const nextController = new AbortController(), next = { signal: nextController.signal, trace: [] };
  const callback = callbackInvocation(pipeline, next.signal, next);
  next.prepared(); assert.deepEqual(next.trace, ['prepare', 'compile', 'assets', 'audit']);
  next.compiled(); next.compiled(new Error('duplicate')); next.assets.resolve();
  assert.deepEqual(await callback.outcome, []);
  assert.deepEqual(next.trace, ['prepare', 'compile', 'assets', 'audit', 'commit', 'final']);
  assert.equal(callback.completions.length, 1); assert.equal(listeners(next.signal), 0);
  assert.ok(events.includes('plugins:done')); assert.ok(events.includes('pipeline:done'));
});
