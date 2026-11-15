import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createPiRunner } from '../src/app/pi-runner.mjs';
import { createBackend } from '../src/app/backend.mjs';
import { createIpcBridge } from '../src/app/ipc.mjs';
import { createFakeRunner, createExec } from '../src/runner/index.mjs';

const run = promisify(execFile);
const clock = { now: () => 0 };
const CLI = fileURLToPath(new URL('../bin/suffice-flow.mjs', import.meta.url));
const tmp = async (t) => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'app-'));
  t.after(() => fs.rm(d, { recursive: true, force: true }));
  return d;
};

// ---- Pi runner against a fake session ----
const fakeSession = (over = {}) => {
  const s = { disposed: 0, aborted: 0, totals: { input: 7, output: 3 }, ...over };
  s.run ??= async () => 'hello';
  s.abort ??= () => { s.aborted++; };
  s.dispose = async () => { s.disposed++; };
  return s;
};
const never = () => new Promise(() => {});

test('pi runner: text and usage, session disposed', async () => {
  const s = fakeSession();
  const r = await createPiRunner({ createSession: async () => s, clock }).run({ prompt: 'hi' });
  assert.deepEqual([r.ok, r.text, r.usage], [true, 'hello', { inputTokens: 7, outputTokens: 3 }]);
  assert.equal(s.disposed, 1);
});

test('pi runner: zero usage when the session reports none', async () => {
  const s = fakeSession({ totals: undefined });
  const r = await createPiRunner({ createSession: async () => s, clock }).run({ prompt: 'hi' });
  assert.deepEqual(r.usage, { inputTokens: 0, outputTokens: 0 });
});

test('pi runner: abort signal aborts the session and disposes', async () => {
  const s = fakeSession({ run: never });
  const ac = new AbortController();
  const p = createPiRunner({ createSession: async () => s, clock }).run({ prompt: 'x', signal: ac.signal });
  setTimeout(() => ac.abort(), 10);
  const r = await p;
  assert.equal(r.ok, false);
  assert.match(r.error, /aborted/);
  assert.equal(s.aborted, 1);
  assert.equal(s.disposed, 1);
});

test('pi runner: timeout aborts and disposes', async () => {
  const s = fakeSession({ run: never });
  const r = await createPiRunner({ createSession: async () => s, clock, timeoutMs: 20 }).run({ prompt: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.error, /timed out/);
  assert.equal(s.aborted, 1);
  assert.equal(s.disposed, 1);
});

test('pi runner: a throwing run is a failed result and still disposes, even if dispose throws', async () => {
  const s = fakeSession({ run: async () => { throw new Error('boom'); } });
  s.dispose = async () => { s.disposed++; throw new Error('log error'); };
  const r = await createPiRunner({ createSession: async () => s, clock }).run({ prompt: 'x' });
  assert.deepEqual([r.ok, r.error], [false, 'boom']);
  assert.equal(s.disposed, 1);
});

test('pi runner: session creation failure is a failed result', async () => {
  const r = await createPiRunner({ createSession: async () => { throw new Error('no model'); }, clock }).run({ prompt: 'x' });
  assert.deepEqual([r.ok, r.error], [false, 'no model']);
  assert.deepEqual(r.usage, { inputTokens: 0, outputTokens: 0 });
});

// ---- composed backend ----
const gateFiles = async (dir) => {
  const flag = path.join(dir, 'flag');
  const gate = path.join(dir, 'gate.mjs');
  await fs.writeFile(gate, `import fs from 'node:fs'; process.exit(fs.existsSync(${JSON.stringify(flag)}) ? 0 : 1);`);
  return { flag, args: { task: 'add x', test: { cmd: process.execPath, args: [gate] } } };
};
const byLabel = (extra = {}) => (req) => {
  if (extra[req.label]) return extra[req.label](req);
  return { ok: true, text: `done ${req.label}` };
};
const mk = async (t, runner, opts = {}) => {
  const dir = await tmp(t);
  const b = createBackend({ dataDir: path.join(dir, 'data'), clock, exec: createExec(), approve: async () => true, runners: { default: runner }, ...opts });
  t.after(() => b.dispose());
  return { b, dir };
};
const timelineOf = (b, id) => b.reader().read(`run:${id}:timeline`)?.value;

test('backend: passing gate; slots show the run and its timeline; no watchdog findings', async (t) => {
  const { b, dir } = await mk(t, createFakeRunner(byLabel()));
  const { flag, args } = await gateFiles(dir);
  await fs.writeFile(flag, '');
  const id = b.startRun('plan-build-review', args);
  assert.equal(typeof id, 'string');
  const out = await b.wait(id);
  assert.equal(out.ok, true);
  const row = b.reader().read('runs:list').value.find((r) => r.runId === id);
  assert.equal(row.state, 'ended');
  const tl = timelineOf(b, id);
  assert.ok(tl.some((e) => e.type === 'run.start') && tl.some((e) => e.type === 'gate') && tl.at(-1).type === 'run.end');
  assert.deepEqual(b.findings(id), []);
  assert.equal((await b.listRuns()).length, 1);
});

test('backend: failed gate, repair claims tests passed, watchdog flags it, run stops', async (t) => {
  const claim = { ok: true, value: { claims: [{ kind: 'tests', passed: true, command: 'gate' }] } };
  const { b, dir } = await mk(t, createFakeRunner(byLabel({ builder: () => claim, repair: () => claim })));
  const { args } = await gateFiles(dir); // flag never created: gate exits 1
  args.test.cmd = process.execPath;
  const id = b.startRun('plan-build-review', args);
  const out = await b.wait(id);
  assert.equal(out.ok, false);
  assert.match(out.error, /gate/);
  const f = b.findings(id).filter((x) => x.kind === 'claim-mismatch');
  assert.ok(f.length >= 1);
  assert.equal(b.reader().read('runs:list').value.find((r) => r.runId === id).state, 'failed');
});

test('backend: failed gate then repair passes', async (t) => {
  let flag;
  const { b, dir } = await mk(t, createFakeRunner(byLabel({ repair: async () => { await fs.writeFile(flag, ''); return { ok: true, text: 'fixed' }; } })));
  const g = await gateFiles(dir);
  flag = g.flag;
  const out = await b.wait(b.startRun('plan-build-review', g.args));
  assert.equal(out.ok, true);
  assert.equal(out.value.repaired, true);
});

test('backend: cancel then resume', async (t) => {
  let n = 0;
  const hang = (req) => (n++ === 0 ? new Promise((res) => req.signal.addEventListener('abort', () => res({ ok: false, error: 'aborted' }))) : { ok: true, text: 'ok' });
  const { b, dir } = await mk(t, createFakeRunner(hang));
  const { flag, args } = await gateFiles(dir);
  await fs.writeFile(flag, '');
  const id = b.startRun('plan-build-review', args);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(b.cancelRun(id), true);
  const c = await b.wait(id);
  assert.equal(c.cancelled, true);
  const again = await b.resumeRun(id);
  assert.equal(again, id);
  const out = await b.wait(id);
  assert.equal(out.ok, true);
});

test('backend: budget refusal ends the run', async (t) => {
  const { b, dir } = await mk(t, createFakeRunner(byLabel()), { limits: [{ name: 'tiny', tokens: 100, period: 'run' }] });
  const { args } = await gateFiles(dir);
  const out = await b.wait(b.startRun('plan-build-review', args));
  assert.equal(out.ok, false);
  assert.match(out.error, /budget refused/);
});

test('backend: research-relay and best-of-n run with a fake runner', async (t) => {
  const { b, dir } = await mk(t, createFakeRunner(byLabel()));
  const r = await b.wait(b.startRun('research-relay', { topic: 'x', lanes: 2 }));
  assert.equal(r.ok, true);
  const { flag, args } = await gateFiles(dir);
  await fs.writeFile(flag, '');
  const o = await b.wait(b.startRun('best-of-n', { ...args, n: 3 }));
  assert.equal(o.ok, true);
  assert.equal(o.value.attempts.length, 3);
  assert.notEqual(o.value.winner, null);
});

test('backend: unknown workflow is refused', async (t) => {
  const { b } = await mk(t, createFakeRunner(byLabel()));
  assert.throws(() => b.startRun('nope', {}), /unknown workflow/);
});

// ---- IPC bridge ----
test('ipc: every message type, invalid rejected, ordered pushes, secret slot hidden', async (t) => {
  const { b, dir } = await mk(t, createFakeRunner(byLabel()));
  b.slots.define({ id: 'vault:key', title: 'k', schema: {}, sensitivity: 'secret' }, 'sekrit');
  const ipc = createIpcBridge(b);
  const pushed = [];
  ipc.subscribe((m) => pushed.push(m));

  for (const bad of [null, 'x', {}, { type: 'nope' }, { type: 'flow.start' }, { type: 'flow.start', workflow: 5 }, { type: 'slots.read' }, { type: 'flow.cancel', runId: '' }]) {
    const r = await ipc.handle(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
  }

  const sub = await ipc.handle({ type: 'slots.subscribe', selector: '*' });
  assert.equal(sub.ok, true);
  const { flag, args } = await gateFiles(dir);
  await fs.writeFile(flag, '');
  const started = await ipc.handle({ type: 'flow.start', workflow: 'plan-build-review', args });
  assert.equal(started.ok, true);
  const id = started.result.runId;
  await b.wait(id);

  const list = await ipc.handle({ type: 'flow.list' });
  assert.equal(list.result.find((r) => r.runId === id).state, 'ended');
  const cat = await ipc.handle({ type: 'slots.catalog' });
  assert.ok(cat.result.some((d) => d.id === 'runs:list'));
  assert.ok(!cat.result.some((d) => d.id === 'vault:key'));
  assert.equal((await ipc.handle({ type: 'slots.read', id: 'vault:key' })).ok, false);
  const rd = await ipc.handle({ type: 'slots.read', id: `run:${id}:timeline` });
  assert.ok(rd.result.value.length > 3);
  assert.equal((await ipc.handle({ type: 'flow.cancel', runId: id })).result, false);
  assert.equal((await ipc.handle({ type: 'flow.resume', runId: 'missing' })).ok, false);

  const tl = pushed.filter((m) => m.id === `run:${id}:timeline`);
  assert.ok(tl.length > 3);
  assert.deepEqual(tl.map((m) => m.version), [...tl.map((m) => m.version)].sort((a, c) => a - c));
  assert.ok(pushed.every((m) => m.type === 'slot' && m.id !== 'vault:key'));
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(pushed)));

  const n = pushed.length;
  await ipc.handle({ type: 'slots.unsubscribe', selector: '*' });
  b.slots.define({ id: 'misc:x', title: 'x', schema: {} }, 1).set(2);
  assert.equal(pushed.length, n);
});

// ---- CLI ----
test('cli: run, list, show with --runner fake', async (t) => {
  const dir = await tmp(t);
  const data = path.join(dir, 'data');
  const args = JSON.stringify({ task: 't', test: { cmd: process.execPath, args: ['-e', 'process.exit(0)'] } });
  const cli = (...a) => run(process.execPath, [CLI, ...a, '--data', data]);
  const r = await cli('run', 'plan-build-review', '--args', args, '--runner', 'fake');
  const out = JSON.parse(r.stdout);
  assert.equal(out.result.ok, true);
  const l = JSON.parse((await cli('list')).stdout);
  assert.equal(l[0].runId, out.runId);
  const s = JSON.parse((await cli('show', out.runId)).stdout);
  assert.equal(s.at(-1).type, 'run.end');
});
