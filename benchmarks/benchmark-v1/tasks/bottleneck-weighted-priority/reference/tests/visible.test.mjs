import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const Bottleneck = require(resolve(process.env.SUFFICE_WORKSPACE || process.cwd(), 'src/lib/index.js'));

test('unit weight scheduling preserves results and releases capacity', async () => {
  const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 0 });
  assert.deepEqual(await Promise.all([limiter.schedule(() => 3), limiter.schedule(() => 7)]), [3, 7]);
  assert.equal(await limiter.running(), 0);
  assert.equal(await limiter.done(), 2);
  await limiter.disconnect();
});

test('same priority queued jobs keep FIFO order', async () => {
  const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 0 });
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const first = limiter.schedule(async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const order = [];
  const queued = Promise.withResolvers();
  limiter.on('queued', event => { if (event.options.id === 'second') queued.resolve(); });
  const a = limiter.schedule({ id: 'first', priority: 4 }, () => order.push('first'));
  const b = limiter.schedule({ id: 'second', priority: 4 }, () => order.push('second'));
  await queued.promise;
  assert.equal(limiter.queued(), 2);
  release.resolve();
  await Promise.all([first, a, b]);
  assert.deepEqual(order, ['first', 'second']);
  await limiter.disconnect();
});

test('rejections preserve the original error and permit later work', async () => {
  const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 0 });
  const expected = new Error('caller failure');
  await assert.rejects(limiter.schedule(() => { throw expected; }), error => error === expected);
  assert.equal(await limiter.schedule(() => 11), 11);
  assert.equal(await limiter.running(), 0);
  await limiter.disconnect();
});
