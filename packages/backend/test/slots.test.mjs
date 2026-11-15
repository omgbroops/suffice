import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlots, createReader, projectJournal } from '../src/slots/index.mjs';

const clock = { now: () => 1000 };
const mk = () => createSlots({ bus: { on() { return () => {}; }, emit() {} }, clock });
const def = (id, schema, extra = {}) => ({ id, title: id, schema, ...extra });
const objSchema = { type: 'object', required: ['n'], additionalProperties: false, properties: { n: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } }, k: { enum: ['a', 'b'] }, in: { type: 'object', properties: { x: { type: 'integer' } } } } };

test('schema validation names the path', () => {
  const s = mk();
  const h = s.define(def('t:a', objSchema), { n: 1 });
  assert.throws(() => h.set({}), (e) => e instanceof TypeError && /\bn\b/.test(e.message));
  assert.throws(() => h.set({ n: 1, tags: ['a', 2] }), (e) => e instanceof TypeError && /tags\[1\]/.test(e.message));
  assert.throws(() => h.set({ n: 1, k: 'z' }), /k/);
  assert.throws(() => h.set({ n: 1, extra: 1 }), /extra/);
  assert.throws(() => h.set({ n: 1, in: { x: 1.5 } }), /in\.x/);
  assert.throws(() => s.define(def('t:b', objSchema), { n: 'x' }), TypeError);
  assert.equal(s.read('t:a').version, 1);
  h.set({ n: 2, in: { x: 3 } });
  assert.equal(s.read('t:a').version, 2);
});

test('owner-only writes and patch/remove', () => {
  const s = mk();
  const h = s.define(def('t:a', objSchema), { n: 1 });
  assert.throws(() => s.define(def('t:a', objSchema), { n: 1 }), TypeError);
  assert.equal(s.set, undefined);
  h.patch({ n: 5 });
  assert.deepEqual(s.read('t:a').value, { n: 5 });
  assert.throws(() => h.patch({ n: 'x' }), TypeError);
  h.remove();
  assert.equal(s.read('t:a'), undefined);
  assert.throws(() => h.set({ n: 1 }), TypeError);
  assert.deepEqual(s.catalog(), []);
});

test('prefix subscribe, initial call, unsubscribe', () => {
  const s = mk();
  const a = s.define(def('run:1:timeline', { type: 'array' }), []);
  const calls = [];
  const un = s.subscribe('run:', (id, v, ver) => calls.push([id, v, ver]));
  assert.deepEqual(calls, [['run:1:timeline', [], 1]]);
  a.set([1]);
  s.define(def('run:2:timeline', { type: 'array' }), []);
  s.define(def('other:x', { type: 'array' }), []);
  assert.deepEqual(calls.map((c) => c[0]), ['run:1:timeline', 'run:1:timeline', 'run:2:timeline']);
  const exact = [];
  s.subscribe('other:x', (id) => exact.push(id));
  assert.deepEqual(exact, ['other:x']);
  un();
  a.set([2]);
  assert.equal(calls.length, 3);
});

test('equal value does not bump or notify', () => {
  const s = mk();
  const h = s.define(def('t:a', objSchema), { n: 1, tags: ['a'] });
  let n = 0;
  s.subscribe('t:a', () => n++);
  h.set({ n: 1, tags: ['a'] });
  assert.equal(n, 1);
  assert.equal(s.read('t:a').version, 1);
  h.set({ n: 2 });
  assert.equal(n, 2);
  assert.equal(s.read('t:a').version, 2);
});

test('secret slots are invisible to readers', () => {
  const s = mk();
  const k = s.define(def('vault:key', { type: 'string' }, { sensitivity: 'secret' }), 'hunter2');
  s.define(def('pub:x', { type: 'string' }), 'ok');
  const r = createReader(s, {});
  assert.equal(r.read('vault:key'), undefined);
  assert.deepEqual(r.catalog().map((d) => d.id), ['pub:x']);
  assert.equal(s.catalog().length, 2);
  const seen = [];
  r.subscribe('vault:', (id) => seen.push(id));
  r.subscribe('*', (id) => seen.push(id));
  k.set('other');
  k.remove();
  assert.deepEqual(seen, ['pub:x']);
  assert.equal(JSON.stringify(s.toSnapshot()).includes('hunter2'), false);
  assert.equal(JSON.stringify(s.toSnapshot()).includes('other'), false);
});

test('reader values are frozen copies; allow limits ids', () => {
  const s = mk();
  const h = s.define(def('pub:o', { type: 'object' }), { a: { b: 1 } });
  s.define(def('hid:o', { type: 'object' }), {});
  const r = createReader(s, { allow: ['pub:'] });
  const got = r.read('pub:o');
  assert.ok(Object.isFrozen(got.value) && Object.isFrozen(got.value.a));
  assert.throws(() => { 'use strict'; got.value.a.b = 2; }, TypeError);
  assert.equal(s.read('pub:o').value.a.b, 1);
  assert.notEqual(got.value, s.read('pub:o').value);
  assert.equal(r.read('hid:o'), undefined);
  let sub;
  r.subscribe('pub:o', (id, v) => { sub = v; });
  assert.ok(Object.isFrozen(sub));
  h.set({ a: { b: 3 } });
  assert.equal(sub.a.b, 3);
});

test('transport: stale remote update dropped, newer applied in order', () => {
  const be = mk();
  const ui = mk();
  const h = be.define(def('pub:c', { type: 'number' }), 0);
  const msgs = [];
  createReader(be, {}).subscribe('*', (id, value, version) => msgs.push({ id, version, value }));
  h.set(1); h.set(2);
  assert.deepEqual(msgs.map((m) => m.version), [1, 2, 3]);
  assert.equal(ui.applyRemote(msgs[2]), true);
  assert.equal(ui.applyRemote(msgs[1]), false);
  assert.equal(ui.applyRemote(msgs[2]), false);
  assert.deepEqual(ui.read('pub:c'), { value: 2, version: 3 });
  const seen = [];
  ui.subscribe('pub:', (id, v) => seen.push(v));
  ui.applyRemote({ id: 'pub:c', version: 4, value: 9 });
  assert.deepEqual(seen, [2, 9]);
  assert.throws(() => ui.applyRemote({ id: 'pub:c' }), TypeError);
  assert.deepEqual(be.toSnapshot(), [{ id: 'pub:c', version: 3, value: 2 }]);
});

test('journal projection from a hand-written event list', () => {
  const s = mk();
  const obs = projectJournal(s, { runId: 'r1' });
  const obs2 = projectJournal(s, { runId: 'r2' });
  const ev = (seq, type, stepKey, data, ts = seq * 10) => ({ seq, ts, runId: 'r1', type, stepKey, data });
  obs(ev(1, 'run.start'));
  obs2({ seq: 1, ts: 5, runId: 'r2', type: 'run.start' });
  obs(ev(2, 'step.start', 'a', { label: 'Plan' }));
  obs(ev(3, 'step.result', 'a', { usage: { inputTokens: 10, outputTokens: 5 } }));
  obs(ev(4, 'step.start', 'b'));
  obs(ev(5, 'step.error', 'b', { usage: { inputTokens: 1, outputTokens: 1 } }));
  obs(ev(5, 'step.error', 'b', { usage: { inputTokens: 1, outputTokens: 1 } })); // duplicate
  obs({ seq: 9, ts: 1, runId: 'zzz', type: 'run.start' }); // other run ignored
  assert.deepEqual(s.read('run:r1:timeline').value.map((e) => [e.seq, e.type, e.stepKey, e.label, e.state]), [
    [1, 'run.start', undefined, 'run.start', 'info'],
    [2, 'step.start', 'a', 'Plan', 'running'],
    [3, 'step.result', 'a', 'a', 'done'],
    [4, 'step.start', 'b', 'b', 'running'],
    [5, 'step.error', 'b', 'b', 'failed'],
  ]);
  assert.deepEqual(s.read('run:r1:budget').value, { total: 17, steps: { a: 15, b: 2 } });
  assert.deepEqual(s.read('runs:list').value, [
    { runId: 'r1', state: 'running', lastActivity: 50 },
    { runId: 'r2', state: 'running', lastActivity: 5 },
  ]);
  obs(ev(6, 'run.end', undefined, { ok: true }, 70));
  obs2({ seq: 2, ts: 8, runId: 'r2', type: 'run.end', data: { ok: false } });
  assert.deepEqual(s.read('runs:list').value.map((r) => r.state), ['ended', 'failed']);
  assert.deepEqual(s.read('runs:list').value[0].lastActivity, 70);
});
