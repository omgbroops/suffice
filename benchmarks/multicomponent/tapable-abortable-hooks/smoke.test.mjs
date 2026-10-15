import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { AsyncSeriesHook, AsyncParallelHook, AsyncSeriesBailHook, AsyncSeriesWaterfallHook, SyncHook } = require(resolve(process.env.SUFFICE_WORKSPACE || process.cwd(), 'src/lib/index.js'));

test('existing series entry points run mixed taps in registration order', async () => {
  const hook = new AsyncSeriesHook(['value']);
  const trace = [];
  hook.tap('sync', value => trace.push(['sync', value]));
  hook.tapAsync('callback', (value, done) => { trace.push(['callback', value]); done(); });
  hook.tapPromise('promise', value => { trace.push(['promise', value]); return Promise.resolve(); });
  assert.equal(await hook.promise(4), undefined);
  await new Promise((resolve, reject) => hook.callAsync(7, error => error ? reject(error) : resolve()));
  assert.deepEqual(trace, [['sync', 4], ['callback', 4], ['promise', 4], ['sync', 7], ['callback', 7], ['promise', 7]]);
});

test('existing parallel entry points start work before waiting for completion', async () => {
  const hook = new AsyncParallelHook([]);
  const gate = Promise.withResolvers();
  const trace = [];
  let finish;
  hook.tapAsync('callback', done => { trace.push('callback'); finish = done; });
  hook.tapPromise('promise', () => { trace.push('promise'); return gate.promise; });
  const pending = hook.promise();
  assert.deepEqual(trace, ['callback', 'promise']);
  finish(); gate.resolve();
  assert.equal(await pending, undefined);
});

test('existing hook kinds preserve bail waterfall and synchronous behavior', async () => {
  const bail = new AsyncSeriesBailHook([]);
  bail.tap('empty', () => undefined); bail.tapPromise('value', () => Promise.resolve(9));
  bail.tap('unreachable', () => { throw new Error('bail did not stop'); });
  assert.equal(await bail.promise(), 9);
  const waterfall = new AsyncSeriesWaterfallHook(['value']);
  waterfall.tap('add', value => value + 2);
  waterfall.tapAsync('multiply', (value, done) => done(null, value * 3));
  assert.equal(await waterfall.promise(4), 18);
  const sync = new SyncHook(['value']);
  let seen; sync.tap('observe', value => { seen = value; }); sync.call(11);
  assert.equal(seen, 11);
});

test('existing compilation updates after tap and interceptor registration', async () => {
  const hook = new AsyncSeriesHook([]);
  const trace = [];
  hook.tap('first', () => trace.push('first'));
  await hook.promise();
  hook.tap('second', () => trace.push('second'));
  hook.intercept({ call() { trace.push('call'); }, done() { trace.push('done'); } });
  await hook.promise();
  assert.deepEqual(trace, ['first', 'call', 'first', 'second', 'done']);
});
