import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBoard, createMemory, createHandoff, compact } from '../src/board/index.mjs';

async function tmp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'board-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
const mk = (start = 1000) => { const c = { t: start, now: () => c.t }; return c; };

test('claim race: exactly one of two wins', async (t) => {
  const b = createBoard({ dir: await tmp(t), clock: mk() });
  await b.addTask({ id: 't1', title: 'x' });
  const r = await Promise.all([b.claim('t1', 'a'), b.claim('t1', 'b')]);
  assert.equal(r.filter((x) => x.ok).length, 1);
  const task = await b.get('t1');
  assert.equal(task.state, 'claimed');
  assert.equal(task.owner, r[0].ok ? 'a' : 'b');
});

test('claim race across two board instances on one dir', async (t) => {
  const dir = await tmp(t);
  const b1 = createBoard({ dir, clock: mk() });
  const b2 = createBoard({ dir, clock: mk() });
  await b1.addTask({ id: 't1', title: 'x' });
  const r = await Promise.all([b1.claim('t1', 'a'), b2.claim('t1', 'b'), b1.claim('t1', 'c'), b2.claim('t1', 'd')]);
  assert.equal(r.filter((x) => x.ok).length, 1);
});

test('stale claim is taken over and recorded; fresh claim is not', async (t) => {
  const clock = mk();
  const b = createBoard({ dir: await tmp(t), clock, ttlMs: 100 });
  await b.addTask({ id: 't1', title: 'x' });
  assert.ok((await b.claim('t1', 'a')).ok);
  clock.t += 50;
  assert.equal((await b.claim('t1', 'b')).ok, false);
  clock.t += 100;
  const r = await b.claim('t1', 'b');
  assert.deepEqual([r.ok, r.takeover, r.from], [true, true, 'a']);
  const task = await b.get('t1');
  assert.equal(task.owner, 'b');
  assert.ok(task.notes.some((n) => /takeover/.test(n) && /a/.test(n)));
  assert.ok((await b.since(0)).some((m) => m.text.includes('takeover')));
});

test('concurrent stale takeover has one winner', async (t) => {
  const clock = mk();
  const b = createBoard({ dir: await tmp(t), clock, ttlMs: 10 });
  await b.addTask({ id: 't1', title: 'x' });
  await b.claim('t1', 'a');
  clock.t += 50;
  const r = await Promise.all(['b', 'c', 'd'].map((x) => b.claim('t1', x)));
  assert.equal(r.filter((x) => x.ok).length, 1);
});

test('deps block claims until done', async (t) => {
  const b = createBoard({ dir: await tmp(t), clock: mk() });
  await b.addTask({ id: 'a', title: 'a' });
  await b.addTask({ id: 'b', title: 'b', deps: ['a'] });
  const r = await b.claim('b', 'x');
  assert.equal(r.ok, false);
  assert.match(r.reason, /deps/);
  await b.claim('a', 'x');
  await b.complete('a', 'x');
  assert.ok((await b.claim('b', 'x')).ok);
  assert.equal((await b.claim('a', 'y')).ok, false);
});

test('log order and since', async (t) => {
  const dir = await tmp(t);
  const b = createBoard({ dir, clock: mk() });
  const b2 = createBoard({ dir, clock: mk() });
  await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? b : b2).post({ from: 'a', text: `m${i}` })));
  const all = await b.since(0);
  assert.equal(all.length, 20);
  all.forEach((m, i) => assert.equal(m.seq, i + 1));
  assert.deepEqual((await b.since(18)).map((m) => m.seq), [19, 20]);
  await assert.rejects(() => b.post({}), TypeError);
});

test('blocked task cannot be claimed; release reopens', async (t) => {
  const b = createBoard({ dir: await tmp(t), clock: mk() });
  await b.addTask({ id: 'a', title: 'a' });
  await b.block('a', 'waiting');
  assert.equal((await b.claim('a', 'x')).ok, false);
  await b.release('a');
  assert.ok((await b.claim('a', 'x')).ok);
});

test('board rejects bad ids', async (t) => {
  const b = createBoard({ dir: await tmp(t), clock: mk() });
  await assert.rejects(() => b.addTask({ id: '../x', title: 't' }), TypeError);
  await assert.rejects(() => b.addTask({ id: 'a' }), TypeError);
  await assert.rejects(() => b.claim('nope', 'x'), TypeError);
});

test('memory save/get/update/list/remove/index', async (t) => {
  const clock = mk();
  const m = createMemory({ dir: await tmp(t), clock });
  await m.save({ name: 'one', description: 'first fact', type: 'user', body: 'hello\nworld' });
  clock.t = 2000;
  const u = await m.save({ name: 'one', description: 'first fact v2', type: 'user', body: 'changed' });
  assert.equal(u.previousModified, 1000);
  const got = await m.get('one');
  assert.deepEqual([got.description, got.body, got.modified, got.previousModified], ['first fact v2', 'changed', 2000, 1000]);
  await m.save({ name: 'two', description: 'second', type: 'project', body: 'b' });
  assert.deepEqual((await m.list()).map((x) => x.name), ['one', 'two']);
  const idx = await m.index();
  assert.equal(idx.trim().split('\n').length, 2);
  assert.match(idx, /- \[one\]\(one\.md\) — first fact v2/);
  assert.equal(await m.get('zzz'), undefined);
  assert.equal(await m.remove('two'), true);
  assert.equal(await m.remove('two'), false);
  assert.equal((await m.list()).length, 1);
});

test('memory recall ranks by overlap, ties newest first', async (t) => {
  const clock = mk();
  const m = createMemory({ dir: await tmp(t), clock });
  await m.save({ name: 'a-old', description: 'rust build cache', type: 'reference', body: 'x' });
  clock.t = 2000;
  await m.save({ name: 'b-new', description: 'rust build cache', type: 'reference', body: 'x' });
  clock.t = 3000;
  await m.save({ name: 'c-strong', description: 'rust build cache', type: 'reference', body: 'build cache rust build' });
  await m.save({ name: 'd-none', description: 'unrelated', type: 'user', body: 'nothing' });
  const r = await m.recall('rust build cache');
  assert.deepEqual(r.map((x) => x.name), ['c-strong', 'b-new', 'a-old']);
  assert.deepEqual((await m.recall('rust build cache', { limit: 1 })).map((x) => x.name), ['c-strong']);
  assert.deepEqual(await m.recall('zzzz'), []);
});

test('memory backlinks', async (t) => {
  const m = createMemory({ dir: await tmp(t), clock: mk() });
  await m.save({ name: 'target', description: 'd', type: 'user', body: 'x' });
  await m.save({ name: 'src1', description: 'd', type: 'user', body: 'see [[target]] and [[other]]' });
  await m.save({ name: 'src2', description: 'd', type: 'user', body: 'no link' });
  assert.deepEqual((await m.backlinks('target')).map((x) => x.name), ['src1']);
  assert.deepEqual(await m.backlinks('src2'), []);
  assert.deepEqual((await m.get('src1')).links, ['target', 'other']);
});

test('memory rejects invalid names, types and fields', async (t) => {
  const m = createMemory({ dir: await tmp(t), clock: mk() });
  const ok = { description: 'd', type: 'user', body: 'b' };
  for (const name of ['Bad', '../x', 'a_b', 'a b', '', 'a.md', 5]) await assert.rejects(() => m.save({ ...ok, name }), TypeError);
  await assert.rejects(() => m.save({ ...ok, name: 'x', type: 'nope' }), TypeError);
  await assert.rejects(() => m.save({ ...ok, name: 'x', description: 'a\nb' }), TypeError);
  await assert.rejects(() => m.get('../x'), TypeError);
  await assert.rejects(() => m.remove('A'), TypeError);
});

test('handoff round trip and validation', async (t) => {
  const h = createHandoff({ dir: await tmp(t), clock: mk() });
  const w = await h.writeHandoff({ runId: 'r1', done: ['a'], open: [], next: 'ship', pointers: ['f.txt'] });
  assert.equal(w.runId, 'r1');
  const got = await h.readHandoff('r1');
  assert.deepEqual([got.done, got.open, got.next, got.pointers], [['a'], [], 'ship', ['f.txt']]);
  assert.equal(await h.readHandoff('none'), undefined);
  await h.writeHandoff({ runId: 'r2', done: [], open: ['x'], next: 'go' });
  assert.deepEqual((await h.readHandoff('r2')).pointers, []);
  await assert.rejects(() => h.writeHandoff({ runId: 'r3', done: ['a'], open: [] }), TypeError);
  await assert.rejects(() => h.writeHandoff({ runId: 'r3', done: ['a'], open: [], next: ' ' }), TypeError);
  await assert.rejects(() => h.writeHandoff({ runId: 'r3', done: [], open: [], next: 'n' }), TypeError);
  await assert.rejects(() => h.writeHandoff({ runId: '../r', done: ['a'], open: [], next: 'n' }), TypeError);
  await assert.rejects(() => h.writeHandoff({ runId: 'r3', done: 'a', open: [], next: 'n' }), TypeError);
});

const msgs = (n) => Array.from({ length: n }, (_, i) => ({ role: 'user', content: `message-${i}-` + 'x'.repeat(20) }));

test('compact keeps first, last keep and pinned; counts the gap; deterministic', () => {
  const m = msgs(10);
  m[4].pinned = true;
  const a = compact(m, { maxChars: 100000, keep: 2 });
  assert.equal(a[0], m[0]);
  assert.deepEqual(a.slice(-2), m.slice(-2));
  assert.ok(a.includes(m[4]));
  assert.equal(a.length, 1 + 1 + 1 + 1 + 2); // first, gap(1-3), pinned, gap(5-7), last 2
  assert.match(a[1].content, /3 messages omitted/);
  assert.match(a[3].content, /3 messages omitted/);
  assert.deepEqual(compact(m, { maxChars: 100000, keep: 2 }), a);
  assert.equal(compact(msgs(3), { maxChars: 100000, keep: 2 }).length, 3);
});

test('compact fits maxChars by dropping oldest unpinned tail; never splits', () => {
  const m = msgs(10);
  m[9].pinned = true;
  const size = (arr) => arr.reduce((n, x) => n + x.content.length, 0);
  const out = compact(m, { maxChars: 140, keep: 4 });
  assert.ok(size(out) <= 140, `size ${size(out)}`);
  assert.equal(out[0], m[0]);
  assert.ok(out.includes(m[9]));
  for (const x of out) assert.ok(m.includes(x) || /omitted/.test(x.content));
  const tiny = compact(m, { maxChars: 1, keep: 4 });
  assert.ok(tiny.includes(m[0]) && tiny.includes(m[9]));
  assert.throws(() => compact('no', { maxChars: 1, keep: 1 }), TypeError);
});
