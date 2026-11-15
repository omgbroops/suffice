import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBudget, createFileStore, ceilingAt } from '../src/budget/index.mjs';

const memStore = () => { let s = null; return { load: () => s && structuredClone(s), save: (x) => { s = structuredClone(x); } }; };
const mkClock = (iso) => { let t = Date.parse(iso); return { now: () => t, set: (i) => { t = Date.parse(i); } }; };
const use = (n) => ({ inputTokens: n, outputTokens: 0 });

test('hour window rolls at the exact instant', () => {
  const clock = mkClock('2026-11-16T10:30:00Z');
  const b = createBudget({ clock, store: memStore(), limits: [{ name: 'h', tokens: 100, period: 'hour' }] });
  b.record(use(60)); b.record({ inputTokens: 20, outputTokens: 20 });
  assert.equal(b.check(1).allow, false);
  clock.set('2026-11-16T10:59:59.999Z');
  assert.equal(b.check(1).allow, false);
  clock.set('2026-11-16T11:00:00.000Z');
  assert.deepEqual(b.check(100), { allow: true, remaining: 100 });
});

test('day window rolls at local midnight for an explicit UTC offset', () => {
  const clock = mkClock('2026-11-16T05:59:59.999Z');
  const b = createBudget({ clock, store: memStore(), limits: [{ name: 'd', tokens: 10, period: 'day', utcOffsetMinutes: -360 }] });
  b.record(use(10));
  assert.equal(b.check(1).allow, false);
  clock.set('2026-11-16T06:00:00Z');
  assert.equal(b.check(10).allow, true);
});

test('week window rolls at Saturday 19:00 at UTC-6', () => {
  const clock = mkClock('2026-11-15T00:59:59.999Z'); // Sat 18:59:59.999 local
  const limits = [{ name: 'w', tokens: 100, period: 'week', utcOffsetMinutes: -360, weekStart: { weekday: 6, hour: 19 } }];
  const b = createBudget({ clock, store: memStore(), limits });
  b.record(use(100));
  assert.equal(b.check(1).allow, false);
  clock.set('2026-11-15T01:00:00Z');
  assert.equal(b.check(100).allow, true);
  b.record(use(100));
  clock.set('2026-11-22T00:59:59.999Z');
  assert.equal(b.check(1).allow, false);
  clock.set('2026-11-22T01:00:00Z');
  assert.equal(b.check(100).allow, true);
});

test('run window never resets', () => {
  const clock = mkClock('2026-11-16T10:00:00Z');
  const b = createBudget({ clock, store: memStore(), limits: [{ name: 'r', tokens: 10, period: 'run' }] });
  b.record(use(10));
  clock.set('2030-01-01T00:00:00Z');
  assert.equal(b.check(1).allow, false);
});

const shareLimit = { name: 'wk', tokens: 1000, period: 'week', utcOffsetMinutes: -360, weekStart: { weekday: 6, hour: 19 },
  shares: { 6: 0.2, 0: 0.2, 1: 0.12, 2: 0.12, 3: 0.12, 4: 0.12, 5: 0.12 } };

test('ceilingAt: cumulative share per day', () => {
  const start = Date.parse('2026-11-15T01:00:00Z'), day = 86400000;
  const want = [200, 400, 520, 640, 760, 880, 1000];
  want.forEach((c, i) => {
    assert.equal(ceilingAt(shareLimit, start + i * day), c);
    assert.equal(ceilingAt(shareLimit, start + (i + 1) * day - 1), c);
  });
  assert.equal(ceilingAt({ name: 'x', tokens: 5, period: 'hour' }, 0), 5);
});

test('weekday ceilings are enforced and unused share carries', () => {
  const clock = mkClock('2026-11-15T02:00:00Z'); // Saturday
  const b = createBudget({ clock, store: memStore(), limits: [shareLimit] });
  assert.equal(b.check(201).allow, false);
  assert.equal(b.check(200).allow, true);
  b.record(use(150));
  clock.set('2026-11-16T12:00:00Z'); // Sunday: ceiling 400, 250 left
  assert.equal(b.check(250).allow, true);
  assert.equal(b.check(251).allow, false);
  assert.equal(b.check(1).remaining, 250);
  b.record(use(250));
  clock.set('2026-11-17T12:00:00Z'); // Monday: ceiling 520, 120 left
  assert.equal(b.check(121).allow, false);
  assert.equal(b.check(120).allow, true);
  clock.set('2026-11-20T12:00:00Z'); // Thursday: ceiling 880
  assert.equal(b.status()[0].ceiling, 880);
});

test('tightest window is named', () => {
  const clock = mkClock('2026-11-16T10:00:00Z');
  const b = createBudget({ clock, store: memStore(), limits: [
    { name: 'daily', tokens: 1000, period: 'day' }, { name: 'hourly', tokens: 50, period: 'hour' }] });
  const d = b.check(60);
  assert.equal(d.allow, false);
  assert.equal(d.remaining, 50);
  assert.match(d.reason, /hourly/);
  assert.doesNotMatch(d.reason, /daily/);
});

test('tag limits apply only to matching records', () => {
  const clock = mkClock('2026-11-16T10:00:00Z');
  const b = createBudget({ clock, store: memStore(), limits: [
    { name: 'all', tokens: 1000, period: 'day' }, { name: 'haiku', tokens: 10, period: 'day', tag: { key: 'model', value: 'haiku' } }] });
  b.record(use(10), { model: 'haiku' });
  assert.equal(b.check(5, { model: 'haiku' }).allow, false);
  assert.equal(b.check(5, { model: 'sonnet' }).allow, true);
  assert.equal(b.check(5).allow, true);
  b.record(use(10), { model: 'sonnet' });
  assert.equal(b.status().find((s) => s.name === 'haiku').used, 10);
  assert.equal(b.status().find((s) => s.name === 'all').used, 20);
});

test('usage persists across a new createBudget with the same store', () => {
  const clock = mkClock('2026-11-16T10:00:00Z'), store = memStore();
  const limits = [{ name: 'd', tokens: 100, period: 'day' }];
  createBudget({ clock, store, limits }).record({ inputTokens: 30, outputTokens: 40 });
  const b2 = createBudget({ clock, store, limits });
  assert.equal(b2.check(1).remaining, 30);
  clock.set('2026-11-17T00:00:00Z');
  assert.equal(createBudget({ clock, store, limits }).check(1).remaining, 100);
});

test('file store writes JSON atomically and survives restart', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'budget-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'usage.json');
  const store = createFileStore(file);
  assert.equal(store.load(), null);
  const clock = mkClock('2026-11-16T10:00:00Z');
  const limits = [{ name: 'd', tokens: 100, period: 'day' }];
  createBudget({ clock, store, limits }).record(use(25));
  assert.deepEqual(await fs.readdir(dir), ['usage.json']);
  JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(createBudget({ clock, store: createFileStore(file), limits }).check(1).remaining, 75);
});

test('setLimits swaps windows and keeps matching usage', () => {
  const clock = mkClock('2026-11-16T10:00:00Z');
  const b = createBudget({ clock, store: memStore(), limits: [{ name: 'd', tokens: 100, period: 'day' }] });
  b.record(use(40));
  b.setLimits([{ name: 'd', tokens: 50, period: 'day' }]);
  assert.equal(b.check(1).remaining, 10);
  assert.throws(() => b.setLimits([{ name: 'd', tokens: -1, period: 'day' }]), TypeError);
  assert.equal(b.check(1).remaining, 10);
});

test('malformed limits are rejected', () => {
  const clock = mkClock('2026-11-16T10:00:00Z'), store = memStore();
  const bad = [
    null, {}, [null], [{ name: '', tokens: 1, period: 'day' }], [{ name: 'a', tokens: -1, period: 'day' }],
    [{ name: 'a', tokens: NaN, period: 'day' }], [{ name: 'a', tokens: 1, period: 'month' }],
    [{ name: 'a', tokens: 1, period: 'day' }, { name: 'a', tokens: 1, period: 'hour' }],
    [{ name: 'a', tokens: 1, period: 'day', shares: { 0: 1 } }],
    [{ name: 'a', tokens: 1, period: 'week', shares: { 7: 0.5 } }],
    [{ name: 'a', tokens: 1, period: 'week', shares: { 0: 0.8, 1: 0.8 } }],
    [{ name: 'a', tokens: 1, period: 'week', shares: { 0: -0.1 } }],
    [{ name: 'a', tokens: 1, period: 'week', weekStart: { weekday: 7, hour: 0 } }],
    [{ name: 'a', tokens: 1, period: 'week', weekStart: { weekday: 1, hour: 24 } }],
    [{ name: 'a', tokens: 1, period: 'day', utcOffsetMinutes: 'x' }],
    [{ name: 'a', tokens: 1, period: 'day', tag: { value: 1 } }],
  ];
  for (const limits of bad) assert.throws(() => createBudget({ clock, store, limits }), TypeError, JSON.stringify(limits));
  assert.throws(() => createBudget({ clock: {}, store, limits: [] }), TypeError);
  assert.throws(() => createBudget({ clock, store: {}, limits: [] }), TypeError);
});

test('negative or non-finite usage and estimates are rejected', () => {
  const clock = mkClock('2026-11-16T10:00:00Z');
  const b = createBudget({ clock, store: memStore(), limits: [{ name: 'd', tokens: 100, period: 'day' }] });
  for (const u of [use(-1), use(NaN), use(Infinity), { inputTokens: 1, outputTokens: -1 }, { inputTokens: 1 }, null, { inputTokens: '1', outputTokens: 0 }])
    assert.throws(() => b.record(u), TypeError);
  for (const e of [-1, NaN, Infinity, '5']) assert.throws(() => b.check(e), TypeError);
  assert.equal(b.check(1).remaining, 100);
});
