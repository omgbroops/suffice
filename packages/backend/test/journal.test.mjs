import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJournal, createBus, listRuns, step } from '../src/journal/index.mjs';

async function tmp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
const clock = () => { let n = 1000; return { now: () => n++ }; };

test('100 concurrent appends keep order and count', async (t) => {
  const dir = await tmp(t);
  const j = createJournal({ dir, runId: 'r1', clock: clock() });
  await Promise.all(Array.from({ length: 100 }, (_, i) => j.append({ type: 'x', data: i })));
  const ev = await j.read();
  assert.equal(ev.length, 100);
  ev.forEach((e, i) => { assert.equal(e.seq, i + 1); assert.equal(e.data, i); assert.equal(e.runId, 'r1'); });
  assert.equal((await fs.readFile(path.join(dir, 'r1.jsonl'), 'utf8')).split('\n').length, 101);
});

test('truncated tail is ignored and seq continues', async (t) => {
  const dir = await tmp(t);
  const j = createJournal({ dir, runId: 'r', clock: clock() });
  await j.append({ type: 'a' });
  await j.append({ type: 'b' });
  await fs.appendFile(path.join(dir, 'r.jsonl'), '{"seq":3,"ts":1,"ru');
  const j2 = createJournal({ dir, runId: 'r', clock: clock() });
  assert.equal((await j2.read()).length, 2);
  const e = await j2.append({ type: 'c' });
  assert.equal(e.seq, 3);
  const ev = await j2.read();
  assert.deepEqual(ev.map((x) => x.type), ['a', 'b', 'c']);
});

test('step memoizes across a fresh journal (resume)', async (t) => {
  const dir = await tmp(t);
  let calls = 0;
  const fn = async () => { calls++; return { v: 42 }; };
  assert.deepEqual(await step(createJournal({ dir, runId: 'r', clock: clock() }), 'k', fn), { v: 42 });
  assert.deepEqual(await step(createJournal({ dir, runId: 'r', clock: clock() }), 'k', fn), { v: 42 });
  assert.equal(calls, 1);
});

test('error then retry runs fn again', async (t) => {
  const dir = await tmp(t);
  const j = createJournal({ dir, runId: 'r', clock: clock() });
  await assert.rejects(step(j, 'k', async () => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(await j.lookup('k'), { hit: false });
  assert.equal(await step(j, 'k', async () => 'ok'), 'ok');
  assert.deepEqual(await j.lookup('k'), { hit: true, value: 'ok' });
  const types = (await j.read()).map((e) => e.type);
  assert.deepEqual(types, ['step.start', 'step.error', 'step.start', 'step.result']);
});

test('non-serialisable value rejected before anything is written', async (t) => {
  const dir = await tmp(t);
  const j = createJournal({ dir, runId: 'r', clock: clock() });
  const cyc = {}; cyc.self = cyc;
  await assert.rejects(j.append({ type: 'x', data: cyc }), TypeError);
  await assert.rejects(j.append({ type: 'x', data: 1n }), TypeError);
  await assert.rejects(j.append({ type: 'x', data: () => 1 }), TypeError);
  assert.deepEqual(await j.read(), []);
  await assert.rejects(j.append({}), TypeError);
});

test('runId with path separators rejected', async (t) => {
  const dir = await tmp(t);
  for (const runId of ['a/b', 'a\\b', '..', '', '../x', 5])
    assert.throws(() => createJournal({ dir, runId, clock: clock() }), TypeError);
  assert.throws(() => createJournal({ dir, runId: 'ok', clock: {} }), TypeError);
});

test('bus: throwing listener does not stop others; unsubscribe works', () => {
  const bus = createBus();
  const got = [];
  bus.on('t', () => { throw new Error('bad'); });
  const off = bus.on('t', (p) => got.push(p));
  bus.emit('t', 1);
  off();
  bus.emit('t', 2);
  bus.emit('none', 3);
  assert.deepEqual(got, [1]);
});

test('listRuns reports first, last and ended', async (t) => {
  const dir = await tmp(t);
  const c = clock();
  const a = createJournal({ dir, runId: 'a', clock: c });
  await a.append({ type: 'run.start' });
  await a.append({ type: 'run.end' });
  const b = createJournal({ dir, runId: 'b', clock: c });
  await b.append({ type: 'run.start' });
  const runs = (await listRuns(dir)).sort((x, y) => x.runId.localeCompare(y.runId));
  assert.deepEqual(runs, [
    { runId: 'a', first: 1000, last: 1001, ended: true },
    { runId: 'b', first: 1002, last: 1002, ended: false },
  ]);
  assert.deepEqual(await listRuns(path.join(dir, 'missing')), []);
});

test('corrupt middle line is skipped, later events kept, nothing truncated', async (t) => {
  const dir = await tmp(t);
  const f = path.join(dir, 'r.jsonl');
  const line = (seq) => JSON.stringify({ seq, ts: 1, runId: 'r', type: 't' });
  await fs.writeFile(f, `${line(1)}\n{garbage\n${line(2)}\n${line(3)}\n`);
  const j = createJournal({ dir, runId: 'r', clock: clock() });
  assert.deepEqual((await j.read()).map((e) => e.seq), [1, 2, 3]);
  assert.deepEqual(await j.stats(), { skipped: 1 });
  assert.equal((await j.append({ type: 'n' })).seq, 4);
  const text = await fs.readFile(f, 'utf8');
  assert.ok(text.includes('{garbage\n') && text.includes(line(3)));
  assert.deepEqual((await j.read()).map((e) => e.seq), [1, 2, 3, 4]);
});

test('two instances on one runId share a queue and keep seq unique', async (t) => {
  const dir = await tmp(t);
  const a = createJournal({ dir, runId: 'r', clock: clock() });
  const b = createJournal({ dir, runId: 'r', clock: clock() });
  await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).append({ type: 'x', data: i })));
  assert.deepEqual((await a.read()).map((e) => e.seq), Array.from({ length: 20 }, (_, i) => i + 1));
});

test('values JSON.stringify would alter are rejected', async (t) => {
  const dir = await tmp(t);
  const j = createJournal({ dir, runId: 'r', clock: clock() });
  for (const data of [{ a: undefined }, [undefined], { a: { b: () => 1 } }, { s: Symbol('x') }, NaN, { n: Infinity }, [-Infinity]])
    await assert.rejects(j.append({ type: 'x', data }), TypeError);
  assert.deepEqual(await j.read(), []);
  await j.append({ type: 'x', data: { a: null, b: [1, 'x', { c: false }] } });
  assert.equal((await j.read()).length, 1);
});
