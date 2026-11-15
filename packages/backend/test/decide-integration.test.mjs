// Real createDecider wired into every caller: each point is configured with a non-default decider
// and the caller must follow it with zero fallbacks and zero input-schema failures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDecider } from '../src/decide/index.mjs';
import { createComputerAgent } from '../src/computer/index.mjs';
import { createEngine } from '../src/workflow/index.mjs';
import { createBrowser } from '../src/builtins/browser.mjs';
import { createDesktop } from '../src/builtins/desktop.mjs';
import { createWatchdog } from '../src/watchdog/index.mjs';
import { createBackend } from '../src/app/backend.mjs';
import { createFakeRunner, createExec } from '../src/runner/index.mjs';

const tick = () => new Promise((r) => setImmediate(r));
const fakeClock = () => ({ t: 0, now() { return this.t; } });

// ---- fakes copied from computer.test.mjs ----
const SHOP = {
  home: { url: 'https://shop.test/', els: [['textbox', 'Query'], ['button', 'Go', { to: 'results' }]] },
  results: { url: 'https://shop.test/r', els: [['link', 'Laptop', { to: 'item' }]] },
};
const DEL = { home: { url: 'https://d.test/', els: [['button', 'Delete account', { to: 'cart' }]] }, cart: { url: 'https://d.test/gone', els: [['heading', 'Gone']] } };
function fakeBrowser(pages = SHOP) {
  const s = { page: Object.keys(pages)[0], epoch: 0, snap: -1, log: [], executed: [] };
  const cur = () => pages[s.page];
  const refOf = (i) => `e${i + 1}`;
  const ok = (extra = {}) => ({ ok: true, text: '', ...extra });
  const find = (ref) => { const i = cur().els.findIndex((_, k) => refOf(k) === String(ref).replace('@', '')); return s.snap === s.epoch && i >= 0 ? cur().els[i] : null; };
  return {
    state: s,
    open: async (id, url) => { const k = Object.keys(pages).find((p) => pages[p].url === url); if (k) s.page = k; s.snap = -1; return ok(); },
    snapshot: async (id, { interactive = true } = {}) => { s.snap = s.epoch; s.log.push(['snapshot', interactive]); return ok({ text: cur().els.map((e, i) => `- ${e[0]} "${e[1]}" [ref=${refOf(i)}]`).join('\n') }); },
    get: async () => ok({ text: cur().url }),
    click: async (id, ref) => {
      s.log.push(['click', ref]);
      const el = find(ref);
      if (!el) return { ok: false, reason: 'stale_ref', error: 'stale_ref', text: '' };
      s.executed.push(['click', el[1]]);
      if (el[2]?.to) { s.page = el[2].to; s.snap = -1; }
      return ok();
    },
    fill: async () => ok(), type: async () => ok(), press: async () => ok(), wait: async () => ok(),
    screenshot: async (id, p) => { s.log.push(['screenshot', p]); return ok(); },
  };
}
const run = (agent, extra = {}) => agent.run({ goal: 'Buy a laptop', surface: 'browser', start: 'https://shop.test/', agentId: 'a1', ...extra });

// ---- harness: real decider, fake runner only for 'model' deciders ----
const captured = new Map(); // point -> a real caller input, replayed at the end through a strict decider
const modelRunner = { run: async () => ({ ok: true, value: { ok: true, reason: 'from model' } }) };
const mkD = (over = {}) => createDecider({ runners: { get: () => modelRunner }, ask: async () => undefined, clock: fakeClock(), strictInputs: false, ...over });
const cfg = (d, points) => { d.loadLayers({ user: { points } }); return d; };
const K = (output) => ({ kind: 'constant', output });
// the decide function callers receive; also records inputs and answers recordOutcome
const fn = (d) => Object.assign(async (point, input, ctx) => { if (!captured.has(point)) captured.set(point, structuredClone(input)); return d.decide(point, input, ctx); }, { recordOutcome: () => {} });
const clean = (d, point) => {
  const s = d.stats()[point];
  assert.ok(s && s.count > 0, `${point}: never asked`);
  assert.equal(s.fallbacks, 0, `${point}: fell back`);
  assert.equal(s.inputFailures, 0, `${point}: input rejected`);
};
const agentOf = (d, extra = {}) => { const b = fakeBrowser(extra.pages); return { b, agent: createComputerAgent({ browser: b, decide: fn(d), clock: fakeClock(), ...extra.opts }) }; };
const done = { action: 'none', done: true, answer: 'x' };

// ---- computer agent ----
test('computer.observe: constant screenshot mode is followed', async () => {
  const d = cfg(mkD(), { 'computer.observe': K({ mode: 'screenshot', depth: 2 }) });
  d.registerScript('act', () => done);
  d.loadLayers({ user: { points: { 'computer.observe': K({ mode: 'screenshot', depth: 2 }), 'computer.act': { kind: 'script', id: 'act' } } } });
  const { b, agent } = agentOf(d);
  await run(agent);
  assert.ok(b.state.log.some((l) => l[0] === 'screenshot'));
  clean(d, 'computer.observe');
});

test('computer.act + computer.check: a script drives the steps, a constant check marks them ok', async () => {
  let n = 0;
  const d = mkD();
  d.registerScript('act', () => (n++ === 0 ? { action: 'click', ref: '@e2' } : done));
  d.loadLayers({ user: { points: { 'computer.act': { kind: 'script', id: 'act' }, 'computer.check': K({ ok: true, reason: 'r' }) } } });
  const { b, agent } = agentOf(d);
  const r = await run(agent);
  assert.equal(r.answer, 'x');
  assert.equal(r.steps[0].ok, true);
  assert.equal(b.state.page, 'results');
  clean(d, 'computer.act'); clean(d, 'computer.check');
});

test('computer.check: a model decider through the fake runner is followed', async () => {
  const d = mkD();
  let n = 0;
  d.registerScript('act', () => (n++ === 0 ? { action: 'click', ref: '@e2' } : done));
  d.loadLayers({ user: { points: { 'computer.act': { kind: 'script', id: 'act' }, 'computer.check': { kind: 'model', model: 'small' } } } });
  const r = await run(agentOf(d).agent);
  assert.equal(r.steps[0].ok, true);
  clean(d, 'computer.check');
});

test('computer.ground: the model rung gets elements with labels and its pick is clicked', async () => {
  const d = mkD();
  let n = 0;
  d.registerScript('act', () => (n++ === 0 ? { action: 'click', ref: 'press this' } : done));
  d.registerScript('ground', (inp) => ({ ref: inp.elements.find((e) => e.label === 'Go')?.ref ?? 'none', confidence: 0.9 }));
  d.loadLayers({ user: { points: { 'computer.act': { kind: 'script', id: 'act' }, 'computer.ground': { kind: 'script', id: 'ground' } } } });
  const { b, agent } = agentOf(d);
  await run(agent);
  assert.deepEqual(b.state.executed, [['click', 'Go']]);
  clean(d, 'computer.ground');
});

test('action.approve (computer): allow runs a destructive click without asking the human', async () => {
  const d = mkD();
  let n = 0, human = 0;
  d.registerScript('act', () => (n++ === 0 ? { action: 'click', ref: 'delete account' } : done));
  d.loadLayers({ user: { points: { 'computer.act': { kind: 'script', id: 'act' }, 'action.approve': K({ decision: 'allow', reason: 'ok' }) } } });
  const { b, agent } = agentOf(d, { pages: DEL, opts: { approve: async () => { human++; return false; } } });
  await run(agent, { start: 'https://d.test/' });
  assert.equal(b.state.executed.length, 1);
  assert.equal(human, 0);
  clean(d, 'action.approve');
});

test('run.continue: constant stop halts the computer loop', async () => {
  const d = cfg(mkD(), { 'run.continue': K({ continue: false, reason: 'halt' }) });
  d.registerScript('act', () => ({ action: 'click', ref: '@e2' }));
  d.loadLayers({ user: { points: { 'run.continue': K({ continue: false, reason: 'halt' }), 'computer.act': { kind: 'script', id: 'act' }, 'computer.check': K({ ok: true, reason: 'r' }) } } });
  const r = await run(agentOf(d).agent);
  assert.equal(r.stopReason, 'stopped');
  clean(d, 'run.continue');
});

// ---- workflow engine ----
function engineWith(d, runnerFn, approve) {
  const events = [];
  const journal = { append: async (e) => { events.push(e); return { seq: events.length, ...e }; }, read: async () => events, lookup: async () => ({ hit: false }) };
  const runs = [], approvals = [];
  const runner = { run: async (req) => { runs.push(req); return runnerFn(req, runs.length); } };
  const engine = createEngine({
    journalFor: () => journal, runners: { get: () => runner }, decide: fn(d),
    budget: { check: () => ({ allow: true, remaining: 1e9 }), record() {} },
    bus: { on() { return () => {}; }, emit() {} }, clock: { now: () => 0 },
    approve: approve ?? (async (r) => { approvals.push(r); return true; }),
  });
  return { engine, runs, approvals };
}
const okRun = () => ({ ok: true, text: 'fine', usage: { inputTokens: 1, outputTokens: 1 }, ms: 0 });

test('model.select: a constant model choice reaches the runner', async () => {
  const d = cfg(mkD(), { 'model.select': K({ runner: 'default', model: 'm2', effort: 'low' }) });
  const { engine, runs } = engineWith(d, okRun);
  await engine.run('r', async (api) => api.agent('a'), null, {});
  assert.equal(runs[0].model, 'm2');
  clean(d, 'model.select');
});

test('model.escalate: a constant escalation re-runs a failed agent with the chosen model', async () => {
  const d = cfg(mkD(), { 'model.escalate': K({ escalate: true, model: 'big' }) });
  const { engine, runs } = engineWith(d, (req, n) => (n === 1 ? { ok: false, error: 'bad' } : okRun()));
  const r = await engine.run('r', async (api) => api.agent('a'), null, {});
  assert.equal(r.ok, true);
  assert.equal(runs.at(-1).model, 'big');
  clean(d, 'model.escalate');
});

test('action.approve (workflow): deny refuses without asking the human', async () => {
  const d = cfg(mkD(), { 'action.approve': K({ decision: 'deny', reason: 'no' }) });
  const { engine, approvals } = engineWith(d, okRun);
  const r = await engine.run('r', async (api) => api.approval('ship'), null, {});
  assert.equal(r.ok, false);
  assert.equal(approvals.length, 0);
  clean(d, 'action.approve');
});

// ---- browser and desktop built-ins ----
test('action.approve (browser): deny refuses before the cli runs', async () => {
  const d = cfg(mkD(), { 'action.approve': K({ decision: 'deny', reason: 'no' }) });
  let calls = 0;
  const b = createBrowser({ exec: async () => { calls++; return { code: 0, stdout: '{"ok":true}', stderr: '' }; }, clock: { now: () => 0 }, policy: { allowedDomains: ['ok.test'] }, decide: fn(d), approve: async () => true });
  const r = await b.open('a', 'https://ok.test/');
  assert.equal(r.reason, 'denied');
  assert.equal(calls, 0);
  clean(d, 'action.approve');
});

test('action.approve (desktop): deny refuses', async () => {
  const d = cfg(mkD(), { 'action.approve': K({ decision: 'deny', reason: 'no' }) });
  const snap = JSON.stringify({ ok: true, data: { snapshot_id: 's1', tree: { role: 'window', name: 'Notes', children: [{ role: 'button', name: 'Save', ref_id: 'e1' }] } } });
  const dk = createDesktop({ exec: async () => ({ code: 0, stdout: snap, stderr: '' }), clock: { now: () => 0 }, policy: { allowedApps: ['Notes'] }, approve: async () => true, decide: fn(d) });
  await dk.snapshot('a', 'Notes');
  const r = await dk.click('a', '@s1:e1');
  assert.equal(r.reason, 'denied');
  clean(d, 'action.approve');
});

// ---- watchdog ----
const TH = { stallMs: 1000, loopRepeats: 3, noProgressSteps: 5, tokensPerStep: 1000 };
test('watchdog.advise: a rule on the real remaining budget decides', async () => {
  const d = cfg(mkD(), { 'run.continue': { kind: 'rule', rules: [{ when: { lt: [{ var: 'budgetRemaining' }, 5] }, then: { continue: false, reason: 'low budget' } }], default: { continue: true, reason: 'ok' } } });
  const w = createWatchdog({ clock: { now: () => 0 }, bus: { emit() {} }, thresholds: TH, decide: fn(d), budgetStatus: () => [{ remaining: 3 }, { remaining: 50 }] });
  w.observe({ seq: 1, ts: 0, runId: 'r', type: 'run.start', data: {} });
  const a = await w.advise('r');
  assert.equal(a.continue, false);
  clean(d, 'run.continue');
  const rich = createWatchdog({ clock: { now: () => 0 }, bus: { emit() {} }, thresholds: TH, decide: fn(d), budgetStatus: () => [{ remaining: 500 }] });
  rich.observe({ seq: 1, ts: 0, runId: 'r2', type: 'run.start', data: {} });
  assert.equal((await rich.advise('r2')).continue, true);
});

test('watchdog: more than the threshold of fallbacks for one point raises decision-fallback', () => {
  const h = {};
  const w = createWatchdog({ clock: { now: () => 0 }, bus: { emit() {}, on: (ev, f) => { h[ev] = f; } }, thresholds: { ...TH, fallbacksPerPoint: 3 }, decide: async () => ({}) });
  for (let i = 0; i < 3; i++) h.decision({ runId: 'r', point: 'computer.check', ok: false });
  assert.equal(w.findings('r').length, 0);
  h.decision({ runId: 'r', point: 'computer.check', ok: false });
  assert.deepEqual(w.findings('r').map((f) => [f.kind, f.evidence.point]), [['decision-fallback', 'computer.check']]);
});

// ---- strict inputs ----
const RC = { steps: 1, progress: 0, budgetRemaining: 10 };
test('strictInputs: a wrong-shape input throws; off it falls back and counts; output failures always fall back', async () => {
  const strict = mkD({ strictInputs: true });
  await assert.rejects(strict.decide('run.continue', { steps: 'many' }, {}));
  assert.equal(strict.stats()['run.continue'].inputFailures, 1);
  const loose = mkD();
  assert.ok(await loose.decide('run.continue', { steps: 'many' }, {}));
  assert.equal(loose.stats()['run.continue'].inputFailures, 1);
  strict.registerScript('bad', () => ({ continue: 'maybe' }));
  strict.loadLayers({ user: { points: { 'run.continue': { kind: 'script', id: 'bad' } } } });
  assert.equal(typeof (await strict.decide('run.continue', RC, {})).continue, 'boolean');
  assert.equal(strict.stats()['run.continue'].fallbacks, 1);
});

// ---- shadow timeout ----
test('shadow: a candidate that never answers times out on the injected timer; the primary is not delayed', async () => {
  const timers = [];
  const timer = { setTimeout: (f, ms) => { const h = { f, ms }; timers.push(h); return h; }, clearTimeout() {} };
  const d = mkD({ timer, shadowTimeoutMs: 777 });
  d.registerScript('slow', () => new Promise(() => {}));
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'shadow', primary: K({ continue: false, reason: 'p' }), candidate: { kind: 'script', id: 'slow' } } } } });
  const out = await d.decide('run.continue', RC, {});
  assert.equal(out.continue, false);
  assert.equal(d.stats()['run.continue'].timeouts, 0);
  timers.find((t) => t.ms === 777).f();
  await tick(); await tick();
  const s = d.stats()['run.continue'];
  assert.deepEqual([s.timeouts, s.disagreements], [1, 0]);
});

// ---- backend: strict wiring and advice slot ----
test('backend: a high finding publishes run:<id>:advice, never stops the run, with no input failures', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dint-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'decide'));
  fs.writeFileSync(path.join(dir, 'decide', 'user.json'), JSON.stringify({ points: { 'run.continue': K({ continue: false, reason: 'adv' }) } }));
  const claim = { ok: true, value: { claims: [{ kind: 'tests', passed: true, command: 'gate' }] } };
  const b = createBackend({ dataDir: dir, clock: { now: () => 0 }, exec: createExec(), approve: async () => false, runners: { default: createFakeRunner(() => claim) }, strict: true });
  const id = b.startRun(async (api) => api.agent('claimer'), {});
  const out = await b.wait(id);
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(out.ok, true);
  assert.ok(b.findings(id).some((f) => f.kind === 'claim-mismatch'));
  const v = b.reader().read(`run:${id}:advice`)?.value;
  assert.equal(v.continue, false);
  assert.equal(v.reason, 'adv');
  assert.equal(b.decide.stats()['run.continue'].inputFailures, 0);
  assert.ok(b.reader().read('decide:stats')?.value['run.continue']);
});

// ---- every point: the caller's real input passes strict validation (runs last; needs the inputs captured above) ----
for (const point of ['computer.observe', 'computer.ground', 'computer.act', 'computer.check', 'action.approve', 'run.continue', 'model.select', 'model.escalate']) {
  test(`input validity: ${point}`, async () => {
    assert.ok(captured.has(point), `${point}: no caller input captured`);
    const strict = mkD({ strictInputs: true });
    await strict.decide(point, captured.get(point), {}); // rejects on an input-schema failure
    assert.equal(strict.stats()[point].inputFailures, 0);
  });
}
