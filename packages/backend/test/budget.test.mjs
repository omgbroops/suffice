import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBudget, createFileStore, ceilingAt, windowStart } from '../src/budget/index.mjs';

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

test('reserve: ten parallel agents against 25000 tokens at estimate 20000 admit exactly one', () => {
  const b = createBudget({ clock: mkClock('2026-11-16T10:00:00Z'), store: memStore(), limits: [{ name: 'd', tokens: 25000, period: 'day' }] });
  const rs = Array.from({ length: 10 }, () => b.reserve(20000));
  assert.equal(rs.filter((r) => r.allow).length, 1);
  assert.match(rs[1].reason, /d/);
  assert.equal(b.check(1).remaining, 5000, 'check sees holds but does not add one');
  assert.equal(b.check(1).remaining, 5000);
});

test('reserve: release frees the hold, settle swaps it for actual usage', () => {
  const b = createBudget({ clock: mkClock('2026-11-16T10:00:00Z'), store: memStore(), limits: [{ name: 'd', tokens: 25000, period: 'day' }] });
  const a = b.reserve(20000);
  a.release(); a.release();
  const c = b.reserve(20000);
  assert.equal(c.allow, true);
  c.settle({ inputTokens: 1000, outputTokens: 500 }); c.settle({ inputTokens: 1000, outputTokens: 500 });
  assert.equal(b.status()[0].used, 1500, 'settle is once-only');
  assert.equal(b.reserve(20000).allow, true);
});

test('reserve honours tags and rejects a bad estimate', () => {
  const b = createBudget({ clock: mkClock('2026-11-16T10:00:00Z'), store: memStore(), limits: [{ name: 'h', tokens: 10, period: 'day', tag: { key: 'model', value: 'haiku' } }] });
  assert.equal(b.reserve(10, { model: 'haiku' }).allow, true);
  assert.equal(b.reserve(10, { model: 'haiku' }).allow, false);
  assert.equal(b.reserve(10, { model: 'sonnet' }).allow, true);
  assert.throws(() => b.reserve(-1), TypeError);
});

test('run period is scoped to tags.runId and persisted per run id', () => {
  const clock = mkClock('2026-11-16T10:00:00Z'), store = memStore();
  const limits = [{ name: 'r', tokens: 10, period: 'run' }];
  const b = createBudget({ clock, store, limits });
  b.record(use(10), { runId: 'a' });
  assert.equal(b.check(1, { runId: 'a' }).allow, false);
  assert.equal(b.check(10, { runId: 'b' }).allow, true);
  assert.equal(createBudget({ clock, store, limits }).check(1, { runId: 'a' }).allow, false);
  assert.equal(createBudget({ clock, store, limits }).check(10, { runId: 'b' }).allow, true);
  const r = b.reserve(10, { runId: 'b' });
  assert.equal(b.check(1, { runId: 'b' }).allow, false, 'hold counts inside its run');
  assert.equal(b.check(10, { runId: 'c' }).allow, true, 'hold does not leak to another run');
  r.release();
  b.setLimits(limits);
  assert.equal(b.check(1, { runId: 'a' }).allow, false, 'setLimits keeps per-run usage');
});

test('windowStart floors correctly for instants before the epoch (negative modulo)', () => {
  const H = 3600000, D = 24 * H;
  assert.equal(windowStart({ period: 'hour' }, -1), -H);
  assert.equal(windowStart({ period: 'day' }, -1), -D);
  assert.equal(windowStart({ period: 'day', utcOffsetMinutes: -360 }, -1), -D + 6 * H);
  // 1969-12-31 is a Wednesday; the Sunday-midnight week containing it starts 4 days before the epoch
  assert.equal(windowStart({ period: 'week', weekStart: { weekday: 0, hour: 0 } }, -1), -4 * D);
  // before this week's start hour: falls back one week
  const thu = Date.parse('2026-11-19T10:00:00Z');
  assert.equal(windowStart({ period: 'week', weekStart: { weekday: 4, hour: 12 } }, thu), Date.parse('2026-11-12T12:00:00Z'));
});

test('two processes sharing one budget file cannot both reserve the same room; settle frees the unspent part', async (t) => {
  const { spawn } = await import('node:child_process');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'budget-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'budget.json');
  const src = fileURLToPath(new URL('../src/budget/index.mjs', import.meta.url));
  const child = `import {createBudget,createFileStore} from ${JSON.stringify(src)};
    const b=createBudget({clock:{now:()=>Date.now()},store:createFileStore(${JSON.stringify(file)}),limits:[{name:'d',tokens:100,period:'day'}]});
    const r=b.reserve(80);console.log(r.allow);setTimeout(()=>{r.settle({inputTokens:10,outputTokens:0})},700);setTimeout(()=>{},800);`;
  const run = () => new Promise((res) => { let out = ''; const p = spawn(process.execPath, ['--input-type=module', '-e', child]); p.stdout.on('data', (d) => { out += d; }); p.on('close', () => res(out.trim())); });
  const results = await Promise.all([run(), run(), run(), run()]);
  assert.deepEqual(results.sort(), ['false', 'false', 'false', 'true']);
  const after = createBudget({ clock: { now: () => Date.now() }, store: createFileStore(file), limits: [{ name: 'd', tokens: 100, period: 'day' }] });
  assert.equal(after.check(1).remaining, 90); // 10 used, hold gone
});

const holder = async (t, file, body) => { // child takes the lock, prints "held", then runs body
  const { spawn } = await import('node:child_process');
  const src = fileURLToPath(new URL('../src/budget/index.mjs', import.meta.url));
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import {createFileStore} from ${JSON.stringify(src)};
    createFileStore(${JSON.stringify(file)}).withLock(()=>{console.log('held');${body}});`]);
  t.after(() => { try { child.kill('SIGKILL'); } catch {} });
  await new Promise((res) => child.stdout.once('data', res));
  return child;
};
const exited = (c) => new Promise((r) => (c.exitCode !== null || c.signalCode ? r() : c.on('exit', r)));
const sleepForever = 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000)';

test('a holder paused past the stale age keeps its lock and is never broken', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bud-lock-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'b.json'), child = await holder(t, file, sleepForever);
  const old = new Date(Date.now() - 600000); await fs.utimes(`${file}.lock`, old, old); // lock looks ten minutes old
  child.kill('SIGSTOP');
  let ran = false;
  assert.throws(() => createFileStore(file, { waitMs: 100 }).withLock(() => { ran = true; }), /lock busy/);
  assert.equal(ran, false);
  assert.ok((await fs.readdir(dir)).includes('b.json.lock'), 'holder lock still in place');
  child.kill('SIGCONT'); child.kill('SIGKILL'); await exited(child);
});

test('a lock whose holder died is broken, and the break leaves no lock behind', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bud-lock-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'b.json'), child = await holder(t, file, sleepForever);
  child.kill('SIGKILL'); await exited(child);
  let ran = false; createFileStore(file).withLock(() => { ran = true; });
  assert.equal(ran, true);
  assert.deepEqual((await fs.readdir(dir)).filter((f) => f.includes('.lock')), []);
});

test('release removes only its own lock', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bud-lock-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'b.json'), lock = `${file}.lock`;
  createFileStore(file).withLock(() => { // another holder takes over mid-section (what a wrong stale break used to allow)
    fsSync.rmSync(lock, { recursive: true }); fsSync.mkdirSync(lock); fsSync.writeFileSync(`${lock}/owner`, `${process.pid}-other`);
  });
  assert.equal(fsSync.readFileSync(`${lock}/owner`, 'utf8'), `${process.pid}-other`);
});

test('status().remaining excludes holds and extend grows a hold only while the window has room', () => {
  const b = createBudget({ clock: mkClock('2026-03-02T12:00:00Z'), store: memStore(), limits: [{ name: 'd', tokens: 300000, period: 'day' }] });
  b.record(use(240000));
  const h = b.reserve(50000);
  assert.equal(b.status()[0].remaining, 10000);
  assert.equal(b.status()[0].held, 50000);
  assert.equal(h.extend(20000), false); assert.equal(h.held, 50000);
  assert.equal(h.extend(10000), true); assert.equal(h.held, 60000);
  assert.equal(b.status()[0].remaining, 0);
});

test('a live holder paused briefly makes a waiter wait, not throw', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bud-lock-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'b.json'), child = await holder(t, file, 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1500)');
  child.kill('SIGSTOP');
  const { spawn } = await import('node:child_process');
  spawn('sh', ['-c', `sleep 1.2; kill -CONT ${child.pid}`], { stdio: 'ignore' }).unref(); // paused ~1.2 s, then finishes and releases
  let ran = false;
  createFileStore(file, { waitMs: 20000 }).withLock(() => { ran = true; });
  assert.equal(ran, true);
  child.kill('SIGKILL'); await exited(child);
});
