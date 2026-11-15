import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createEngine, BudgetError, GateError, ApprovalDenied } from '../src/workflow/index.mjs';

const tick = () => new Promise((r) => setImmediate(r));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

function fakeJournal(runId, events = []) {
  return {
    runId, events,
    async append(e) { const ev = { seq: events.length + 1, ts: 0, runId, ...e }; events.push(ev); return ev; },
    async read() { return [...events]; },
    async lookup(k) { const ev = events.findLast((x) => x.type === 'step.result' && x.stepKey === k); return ev ? { hit: true, value: ev.data } : { hit: false }; },
  };
}

async function setup(t, over = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-')); // temp dir per the module rules
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const journals = new Map();
  const calls = [];
  const emitted = [];
  const recorded = [];
  const approvals = [];
  const runner = over.runner || { async run(req) { calls.push(req.prompt); return { ok: true, text: `out:${req.prompt}`, usage: { inputTokens: 3, outputTokens: 4 }, ms: 0 }; } };
  const engine = createEngine({
    journalFor: (id) => { if (!journals.has(id)) journals.set(id, fakeJournal(id)); return journals.get(id); },
    runners: over.runners || { get: () => runner },
    exec: over.exec,
    budget: over.budget || { check: () => ({ allow: true, remaining: 1e9 }), record: (u) => recorded.push(u) },
    bus: { on() { return () => {}; }, emit: (type, p) => emitted.push([type, p]) },
    clock: { now: () => 0 },
    approve: over.approve || (async (r) => { approvals.push(r); return true; }),
  });
  return { engine, journals, calls, emitted, recorded, approvals };
}

test('happy path returns value, records usage, emits phase and log', async (t) => {
  const { engine, journals, recorded, emitted } = await setup(t);
  const r = await engine.run('r1', async (api, a) => { api.phase('plan'); api.log('hi'); return (await api.agent(`say ${a}`)) + '!'; }, 'x', {});
  assert.deepEqual(r, { ok: true, value: 'out:say x!' });
  assert.equal(recorded.length, 1);
  assert.deepEqual(emitted.map((e) => e[0]), ['phase', 'log']);
  const types = journals.get('r1').events.map((e) => e.type);
  for (const ty of ['run.start', 'phase', 'log', 'step.result', 'run.end']) assert.ok(types.includes(ty), ty);
});

test('resume replays finished steps and runs only the unfinished one', async (t) => {
  let boom = true;
  const calls = [];
  const runner = { async run(req) { calls.push(req.prompt); if (boom && req.prompt === 'b') throw new Error('crash'); return { ok: true, text: req.prompt, usage: { inputTokens: 1, outputTokens: 1 }, ms: 0 }; } };
  const { engine } = await setup(t, { runner });
  const wf = async (api) => [await api.agent('a'), await api.agent('b'), await api.agent('c')];
  const r1 = await engine.run('r', wf, null, {});
  assert.equal(r1.ok, false);
  assert.deepEqual(calls, ['a', 'b']);
  boom = false;
  const r2 = await engine.run('r', wf, null, {});
  assert.deepEqual(r2, { ok: true, value: ['a', 'b', 'c'] });
  assert.deepEqual(calls, ['a', 'b', 'b', 'c']);
  await engine.run('r', wf, null, {});
  assert.equal(calls.length, 4, 'full replay calls no runner');
});

test('changed prompt re-runs that step and later ones in its branch only', async (t) => {
  const { engine, calls } = await setup(t);
  const wf = (p) => async (api) => api.parallel([
    async () => [await api.agent(p), await api.agent('a2')],
    async () => [await api.agent('b1'), await api.agent('b2')],
  ]);
  await engine.run('r', wf('a1'), null, {});
  assert.equal(calls.length, 4);
  calls.length = 0;
  await engine.run('r', wf('a1-changed'), null, {});
  assert.deepEqual(calls, ['a1-changed', 'a2']);
});

test('explicit key memoizes regardless of prompt', async (t) => {
  const { engine, calls } = await setup(t);
  await engine.run('r', (api) => api.agent('one', { key: 'k' }), null, {});
  const r = await engine.run('r', (api) => api.agent('two', { key: 'k' }), null, {});
  assert.equal(r.value, 'out:one');
  assert.equal(calls.length, 1);
});

test('parallel respects the limit', async (t) => {
  const { engine } = await setup(t);
  let inflight = 0, max = 0;
  const gates = Array.from({ length: 5 }, deferred);
  const thunks = gates.map((g) => async () => { inflight++; max = Math.max(max, inflight); await g.promise; inflight--; return 1; });
  const run = engine.run('r', (api) => api.parallel(thunks, { limit: 2 }), null, {});
  for (const g of gates) { await tick(); g.resolve(); }
  const r = await run;
  assert.deepEqual(r.value, [1, 1, 1, 1, 1]);
  assert.equal(max, 2);
});

test('a failed thunk resolves to null', async (t) => {
  const { engine } = await setup(t);
  const r = await engine.run('r', (api) => api.parallel([async () => 1, async () => { throw new Error('x'); }, () => { throw new Error('sync'); }]), null, {});
  assert.deepEqual(r, { ok: true, value: [1, null, null] });
});

test('pipeline has no barrier between stages', async (t) => {
  const { engine } = await setup(t);
  const b1 = deferred();
  const order = [];
  const s1 = async (item) => { if (item === 'B') await b1.promise; order.push(`s1${item}`); return item; };
  const s2 = async (prev, item, i) => { order.push(`s2${item}`); assert.equal(prev, item); return i; };
  const run = engine.run('r', (api) => api.pipeline(['A', 'B'], s1, s2), null, {});
  await tick(); await tick();
  assert.deepEqual(order, ['s1A', 's2A']);
  b1.resolve();
  assert.deepEqual((await run).value, [0, 1]);
});

test('pipeline stage that throws yields null for that item', async (t) => {
  const { engine } = await setup(t);
  const r = await engine.run('r', (api) => api.pipeline([1, 2], async (x) => { if (x === 1) throw new Error('no'); return x; }, async (x) => x * 10), null, {});
  assert.deepEqual(r.value, [null, 20]);
});

test('gate passes on code 0 and throws GateError otherwise', async (t) => {
  const { engine, journals } = await setup(t);
  const ok = await engine.run('r1', async (api) => { api.gate('tests', { code: 0, stdout: 'FAIL text', stderr: '', timedOut: false }); return 1; }, null, {});
  assert.equal(ok.ok, true);
  let caught;
  const bad = await engine.run('r2', async (api) => { try { await api.gate('tests', { code: 2, stdout: 'all passed', stderr: '', timedOut: false }); } catch (e) { caught = e; throw e; } }, null, {});
  assert.ok(caught instanceof GateError);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /tests/);
  assert.ok(journals.get('r2').events.some((e) => e.type === 'gate'));
});

test('approval denied throws; approved is memoized across resume', async (t) => {
  const { engine, approvals } = await setup(t);
  const wf = async (api) => { await api.approval('ship', { why: 1 }); return 'done'; };
  assert.equal((await engine.run('r', wf, null, {})).ok, true);
  assert.equal((await engine.run('r', wf, null, {})).ok, true);
  assert.equal(approvals.length, 1);
  const d = await setup(t, { approve: async () => false });
  let caught;
  const r = await d.engine.run('r', async (api) => { try { await api.approval('ship', {}); } catch (e) { caught = e; throw e; } }, null, {});
  assert.ok(caught instanceof ApprovalDenied);
  assert.equal(r.ok, false);
});

test('budget refusal appends a budget event and ends the run without calling the runner', async (t) => {
  let asked;
  const budget = { check: (n) => { asked = n; return { allow: false, reason: 'weekly cap hit', remaining: 0 }; }, record() {} };
  const { engine, calls, journals } = await setup(t, { budget });
  let caught;
  const r = await engine.run('r', async (api) => { try { await api.agent('p', { estimateTokens: 777 }); } catch (e) { caught = e; throw e; } }, null, {});
  assert.ok(caught instanceof BudgetError);
  assert.equal(asked, 777);
  assert.equal(r.ok, false);
  assert.match(r.error, /weekly cap hit/);
  assert.equal(calls.length, 0);
  assert.ok(journals.get('r').events.some((e) => e.type === 'budget'));
});

test('default estimate is 20000 and budget refusal inside parallel still ends the run', async (t) => {
  let asked;
  const budget = { check: (n) => { asked = n; return { allow: false, reason: 'no', remaining: 0 }; }, record() {} };
  const { engine } = await setup(t, { budget });
  const r = await engine.run('r', (api) => api.parallel([() => api.agent('p')]), null, {});
  assert.equal(asked, 20000);
  assert.equal(r.ok, false);
});

test('cancel mid-run passes the signal to the runner and resolves cancelled', async (t) => {
  let seen;
  const started = deferred();
  const runner = { run(req) { seen = req.signal; started.resolve(); return new Promise((_, rej) => req.signal.addEventListener('abort', () => rej(new Error('aborted')))); } };
  const { engine } = await setup(t, { runner });
  const ac = new AbortController();
  let later = false;
  const run = engine.run('r', async (api) => { await api.agent('slow'); later = true; await api.agent('never'); }, null, { signal: ac.signal });
  await started.promise;
  ac.abort();
  assert.deepEqual(await run, { ok: false, cancelled: true });
  assert.equal(seen, ac.signal);
  assert.equal(later, false);
});

test('no step starts after abort', async (t) => {
  const { engine, calls } = await setup(t);
  const ac = new AbortController();
  ac.abort();
  const r = await engine.run('r', (api) => api.agent('x'), null, { signal: ac.signal });
  assert.equal(r.cancelled, true);
  assert.equal(calls.length, 0);
});

test('step keys do not depend on completion order', async (t) => {
  async function keysFor(id, firstDone) {
    const gates = [deferred(), deferred()];
    const runner = { async run(req) { await gates[req.prompt.startsWith('A') ? 0 : 1].promise; return { ok: true, text: req.prompt, usage: { inputTokens: 0, outputTokens: 0 }, ms: 0 }; } };
    const s = await setup(t, { runner });
    const run = s.engine.run(id, (api) => api.parallel([
      async () => { await api.agent('A1'); return api.agent('A2'); },
      async () => { await api.agent('B1'); return api.agent('B2'); },
    ]), null, {});
    await tick();
    gates[firstDone].resolve(); await tick();
    gates[1 - firstDone].resolve();
    await run;
    const m = {};
    for (const e of s.journals.get(id).events) if (e.type === 'step.result') m[e.data.value] = e.stepKey;
    return m;
  }
  const k1 = await keysFor('r', 0);
  const k2 = await keysFor('r', 1);
  assert.equal(Object.keys(k1).length, 4);
  assert.deepEqual(k1, k2);
});

test('bad inputs throw TypeError', async (t) => {
  assert.throws(() => createEngine({}), TypeError);
  const { engine } = await setup(t);
  await assert.rejects(engine.run('', () => {}, null, {}), TypeError);
  await assert.rejects(engine.run('r', 'nope', null, {}), TypeError);
});

const sh = (code, stdout = '') => ({ code, stdout, stderr: '', timedOut: false });

test('exec is memoized, journals an exec event, and the gate reads the exit code only', async (t) => {
  let n = 0;
  const { engine, journals } = await setup(t, { exec: async () => { n++; return sh(1, 'all tests passed'); } });
  const wf = async (api) => { const r = await api.exec('npm', ['test'], { cwd: '/x' }); await api.gate('tests', r); };
  const r1 = await engine.run('r', wf, null, {});
  assert.equal(r1.ok, false);
  assert.match(r1.error, /tests/);
  assert.deepEqual(journals.get('r').events.find((e) => e.type === 'exec').data, { command: 'npm', args: ['test'], code: 1, timedOut: false });
  assert.equal((await engine.run('r', wf, null, {})).ok, false);
  assert.equal(n, 1);
  assert.equal(journals.get('r').events.filter((e) => e.type === 'exec').length, 1);
});

test('exec without an injected exec throws a TypeError', async (t) => {
  const { engine } = await setup(t);
  const r = await engine.run('r', (api) => api.exec('ls', []), null, {});
  assert.equal(r.ok, false);
  assert.match(r.error, /exec/);
});

test('agent step.result carries usage, and replay returns the bare value', async (t) => {
  const { engine, journals, calls } = await setup(t);
  const wf = (api) => api.agent('p');
  await engine.run('r', wf, null, {});
  const ev = journals.get('r').events.find((e) => e.type === 'step.result');
  assert.deepEqual(ev.data, { value: 'out:p', usage: { inputTokens: 3, outputTokens: 4 } });
  assert.equal((await engine.run('r', wf, null, {})).value, 'out:p');
  assert.equal(calls.length, 1);
});

test('GateError, ApprovalDenied and BudgetError in parallel or pipeline end the run; ordinary errors stay null', async (t) => {
  const { engine } = await setup(t, { approve: async () => false });
  const bad = {
    gate: (api) => api.gate('g', sh(1)),
    approval: (api) => api.approval('a', {}),
  };
  for (const [name, fn] of Object.entries(bad)) {
    const p = await engine.run(`p-${name}`, (api) => api.parallel([async () => 1, () => fn(api)]), null, {});
    assert.equal(p.ok, false, `parallel ${name}`);
    const l = await engine.run(`l-${name}`, (api) => api.pipeline([1, 2], async (x) => { if (x === 2) await fn(api); return x; }), null, {});
    assert.equal(l.ok, false, `pipeline ${name}`);
  }
  const o = await engine.run('o', (api) => api.pipeline([1, 2], async (x) => { if (x === 2) throw new Error('plain'); return x; }), null, {});
  assert.deepEqual(o, { ok: true, value: [1, null] });
});

test('a denied approval is memoized: resume does not ask again and fails the same way', async (t) => {
  let asked = 0;
  const { engine } = await setup(t, { approve: async () => { asked++; return false; } });
  const wf = (api) => api.approval('ship', {});
  const r1 = await engine.run('r', wf, null, {});
  const r2 = await engine.run('r', wf, null, {});
  assert.equal(asked, 1);
  assert.deepEqual(r2, r1);
  assert.equal(r2.ok, false);
  assert.match(r2.error, /denied/);
});

test('approval journals a request without an answer before asking', async (t) => {
  const seen = [];
  const { engine, journals } = await setup(t, { approve: async () => { seen.push(journals.get('r').events.filter((e) => e.type === 'approval').length); return true; } });
  await engine.run('r', (api) => api.approval('ship', {}), null, {});
  assert.deepEqual(seen, [1]);
  const ev = journals.get('r').events.filter((e) => e.type === 'approval');
  assert.equal(ev[0].data.approved, undefined);
  assert.equal(ev[1].data.approved, true);
  assert.equal(ev[0].stepKey, ev[1].stepKey);
});

test('a failed agent step re-runs on resume', async (t) => {
  let fail = true, n = 0;
  const runner = { async run() { n++; return fail ? { ok: false, error: 'bad', usage: { inputTokens: 0, outputTokens: 0 }, ms: 0 } : { ok: true, text: 'ok', usage: { inputTokens: 0, outputTokens: 0 }, ms: 0 }; } };
  const { engine } = await setup(t, { runner });
  assert.equal((await engine.run('r', (api) => api.agent('p'), null, {})).ok, false);
  fail = false;
  assert.equal((await engine.run('r', (api) => api.agent('p'), null, {})).value, 'ok');
  assert.equal(n, 2);
});

test('runners.get that throws ends the run with a clear error, even inside parallel', async (t) => {
  const { engine } = await setup(t, { runners: { get: (n) => { throw new Error(`no such runner ${n}`); } } });
  const r = await engine.run('r', (api) => api.parallel([() => api.agent('p', { runner: 'zzz' })]), null, {});
  assert.equal(r.ok, false);
  assert.match(r.error, /zzz/);
  const u = await setup(t, { runners: { get: () => undefined } });
  assert.match((await u.engine.run('r', (api) => api.agent('p'), null, {})).error, /default/);
});

test('budget.reserve runs before the agent and settle after; failures release', async (t) => {
  const order = [];
  let tags;
  const budget = {
    check() { throw new Error('check must not be used when reserve exists'); }, record() {},
    reserve(n, tg) { tags = tg; order.push(`reserve ${n}`); return { allow: true, remaining: 1, release: () => order.push('release'), settle: (u) => order.push(`settle ${u.inputTokens}`) }; },
  };
  const runner = { async run(req) { order.push('run'); if (req.prompt === 'boom') throw new Error('x'); return { ok: true, text: 't', usage: { inputTokens: 3, outputTokens: 4 }, ms: 0 }; } };
  const { engine } = await setup(t, { budget, runner });
  await engine.run('rid', (api) => api.agent('p', { estimateTokens: 50 }), null, {});
  assert.deepEqual(order, ['reserve 50', 'run', 'settle 3']);
  assert.equal(tags.runId, 'rid');
  order.length = 0;
  await engine.run('rid2', (api) => api.agent('boom'), null, {});
  assert.deepEqual(order, ['reserve 20000', 'run', 'release']);
});

test('replay reads a journal written before the {value, usage} shape', async (t) => {
  const { engine, journals, calls } = await setup(t);
  const wf = (api) => api.agent('p');
  await engine.run('r', wf, null, {});
  const ev = journals.get('r').events.find((e) => e.type === 'step.result');
  ev.data = 'out:p'; // legacy: the bare value
  assert.deepEqual(await engine.run('r', wf, null, {}), { ok: true, value: 'out:p' });
  ev.data = { k: 1 }; // legacy bare object without a `value` key
  assert.deepEqual((await engine.run('r', wf, null, {})).value, { k: 1 });
  assert.equal(calls.length, 1);
});
