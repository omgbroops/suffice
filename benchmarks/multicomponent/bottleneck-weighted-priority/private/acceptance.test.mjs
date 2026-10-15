import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const Bottleneck = require(resolve(process.env.SUFFICE_WORKSPACE || process.cwd(), 'src/lib/index.js'));

async function hold(limiter, weight = 1) {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const promise = limiter.schedule({ weight }, async () => { entered.resolve(); await release.promise; return 'blocker'; });
  await entered.promise;
  return { release: release.resolve, promise };
}

async function enqueue(limiter, options, task) {
  const queued = Promise.withResolvers();
  limiter.on('queued', event => { if (event.options.id === options.id) queued.resolve(); });
  const promise = limiter.schedule(options, task);
  // Keep expected task failures handled even while awaiting the queue event.
  promise.catch(() => {});
  await queued.promise;
  return { promise };
}

test('queued priorities run from smaller number to larger number with FIFO ties', { timeout: 2000 }, async () => {
  const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 0 });
  const blocker = await hold(limiter);
  const order = [], pending = [];
  for (const [id, priority] of [['low', 8], ['high-a', 1], ['medium', 4], ['high-b', 1]]) {
    pending.push((await enqueue(limiter, { id, priority }, () => { order.push(id); return id; })).promise);
  }
  assert.equal(limiter.queued(), 4);
  blocker.release();
  await Promise.all([blocker.promise, ...pending]);
  assert.deepEqual(order, ['high-a', 'high-b', 'medium', 'low']);
  assert.equal(limiter.queued(), 0);
  await limiter.disconnect();
});

test('successful weighted jobs release their entire reservation exactly once', { timeout: 2000 }, async () => {
  const limiter = new Bottleneck({ maxConcurrent: 5, minTime: 0 });
  const blocker = await hold(limiter, 4);
  assert.equal(await limiter.running(), 4);
  blocker.release();
  assert.equal(await blocker.promise, 'blocker');
  assert.equal(await limiter.running(), 0);
  assert.equal(await limiter.done(), 4);
  assert.equal(await limiter.schedule({ weight: 5 }, () => 'full capacity reused'), 'full capacity reused');
  assert.equal(await limiter.running(), 0);
  assert.equal(await limiter.done(), 9);
  await limiter.disconnect();
});

test('failed weighted jobs release capacity and retain rejection identity', { timeout: 2000 }, async () => {
  const limiter = new Bottleneck({ maxConcurrent: 4, minTime: 0 });
  const expected = new Error('user supplied failure');
  await assert.rejects(limiter.schedule({ weight: 3 }, async () => { throw expected; }), error => error === expected);
  assert.equal(await limiter.running(), 0);
  assert.equal(await limiter.done(), 3);
  assert.equal(await limiter.schedule({ weight: 4 }, () => 17), 17);
  assert.equal(await limiter.running(), 0);
  await limiter.disconnect();
});

test('priority selection and weighted release compose across backlog waves', { timeout: 2000 }, async () => {
  const limiter = new Bottleneck({ maxConcurrent: 4, minTime: 0 });
  for (let wave = 0; wave < 2; wave++) {
    const blocker = await hold(limiter, 4);
    const started = [], observedRunning = [], pending = [];
    const releaseHigh = Promise.withResolvers(), highEntered = Promise.withResolvers();
    for (const [suffix, priority, weight] of [['low', 8, 1], ['high', 0, 4], ['mid', 4, 2]]) {
      const id = `${wave}-${suffix}`;
      const queued = await enqueue(limiter, { id, priority, weight }, async () => {
        started.push(suffix);
        observedRunning.push(await limiter.running());
        if (suffix === 'high') { highEntered.resolve(); await releaseHigh.promise; }
        return id;
      });
      pending.push(queued.promise);
    }
    blocker.release();
    // This is a dependency gate, not an elapsed-time target. The timeout only bounds broken queues.
    await highEntered.promise;
    assert.deepEqual(started, ['high']);
    assert.equal(limiter.queued(), 2);
    assert.equal(await limiter.running(), 4);
    releaseHigh.resolve();
    assert.deepEqual(await Promise.all(pending), [`${wave}-low`, `${wave}-high`, `${wave}-mid`]);
    await blocker.promise;
    assert.deepEqual(started, ['high', 'mid', 'low']);
    assert.ok(observedRunning.every(value => value > 0 && value <= 4));
    assert.equal(await limiter.running(), 0);
    assert.equal(limiter.queued(), 0);
    assert.equal(await limiter.done(), (wave + 1) * 11);
  }
  await limiter.disconnect();
});

test('oversized jobs reject without consuming running capacity', { timeout: 2000 }, async () => {
  const limiter = new Bottleneck({ maxConcurrent: 2, minTime: 0 });
  let invoked = false;
  await assert.rejects(limiter.schedule({ weight: 3 }, () => { invoked = true; }));
  assert.equal(invoked, false);
  assert.equal(await limiter.running(), 0);
  assert.equal(await limiter.done(), 0);
  assert.equal(await limiter.schedule({ weight: 2 }, () => 'ok'), 'ok');
  await limiter.disconnect();
});

test('zero weight completion leaves running capacity unchanged', { timeout: 2000 }, async () => {
  const limiter = new Bottleneck({ maxConcurrent: 3, minTime: 0 });
  assert.equal(await limiter.schedule({ weight: 0 }, () => 'zero'), 'zero');
  assert.equal(await limiter.running(), 0);
  assert.equal(await limiter.done(), 0);
  assert.equal(await limiter.schedule({ weight: 3 }, () => 'three'), 'three');
  assert.equal(await limiter.running(), 0);
  assert.equal(await limiter.done(), 3);
  await limiter.disconnect();
});
