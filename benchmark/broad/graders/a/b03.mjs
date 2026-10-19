import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {default: pMap, pMapSkip} = await import(pathToFileURL(path.join(process.cwd(), 'index.js')).href);
let failures = 0;
async function check(name, action) {
  try { await action(); console.log('PASS', name); }
  catch (error) { failures++; console.error('FAIL', name, error.message); }
}
const clean = signal => assert.equal(getEventListeners(signal, 'abort').length, 0, 'settled operation must not retain an abort listener');
await check('successful mapping releases the listener and keeps ordered results', async () => {
  const {signal} = new AbortController();
  assert.deepEqual(await pMap([3, 1, 2], async x => x * 2, {signal, concurrency: 2}), [6, 2, 4]);
  clean(signal);
});
await check('empty input releases listener', async () => {
  const {signal} = new AbortController();
  assert.deepEqual(await pMap([], x => x, {signal}), []);
  clean(signal);
});
await check('skipped results release listener', async () => {
  const {signal} = new AbortController();
  assert.deepEqual(await pMap([1, 2, 3], x => x === 2 ? pMapSkip : x, {signal}), [1, 3]);
  clean(signal);
});
await check('mapper rejection releases listener and preserves error identity', async () => {
  const {signal} = new AbortController();
  const error = new Error('mapping failed');
  await assert.rejects(pMap([1], () => { throw error; }, {signal}), candidate => candidate === error);
  clean(signal);
});
await check('aggregate rejection releases listener', async () => {
  const {signal} = new AbortController();
  await assert.rejects(pMap([1, 2], () => { throw new Error('failed'); }, {signal, stopOnError: false}), AggregateError);
  clean(signal);
});
await check('reusing one signal does not accumulate listeners', async () => {
  const {signal} = new AbortController();
  for (let index = 0; index < 5; index++) {
    assert.deepEqual(await pMap([index], x => x, {signal}), [index]);
    clean(signal);
  }
});
await check('active abort rejects with reason and releases listener', async () => {
  const controller = new AbortController();
  let release;
  let started;
  const gate = new Promise(resolve => { release = resolve; });
  const beginning = new Promise(resolve => { started = resolve; });
  const reason = new Error('cancelled');
  const mapping = pMap([1], async () => { started(); await gate; return 1; }, {signal: controller.signal});
  const rejected = assert.rejects(mapping, candidate => candidate === reason);
  await beginning;
  controller.abort(reason);
  await rejected;
  release();
  clean(controller.signal);
});
await check('without signal remains supported', async () => {
  assert.deepEqual(await pMap([2, 4], x => x + 1), [3, 5]);
});
process.exitCode = failures ? 1 : 0;
