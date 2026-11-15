import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../src/workflow/index.mjs';
import { createBrowser } from '../src/builtins/browser.mjs';
import { createDesktop } from '../src/builtins/desktop.mjs';
import { createWatchdog } from '../src/watchdog/index.mjs';
import { createPluginHost } from '../src/plugins/index.mjs';
import { createBackend } from '../src/app/backend.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wire-'));
const BIN = fileURLToPath(new URL('../bin/suffice-flow.mjs', import.meta.url));

// ---- workflow ----
function engineWith(decide, runnerFn, approve) {
  const events = [];
  const journal = { append: async (e) => { events.push(e); return { seq: events.length, ...e }; }, read: async () => events, lookup: async () => ({ hit: false }) };
  const runs = [];
  const runner = { run: async (req) => { runs.push(req); return runnerFn(req, runs.length); } };
  const approvals = [];
  const engine = createEngine({
    journalFor: () => journal, runners: { get: () => runner }, decide,
    budget: { check: () => ({ allow: true, remaining: 1e9 }), record() {} },
    bus: { on() { return () => {}; }, emit() {} }, clock: { now: () => 0 },
    approve: approve ?? (async (r) => { approvals.push(r); return true; }),
  });
  return { engine, runs, approvals };
}
const okRun = () => ({ ok: true, text: 'fine', usage: { inputTokens: 1, outputTokens: 1 }, ms: 0 });

test('workflow: model.select fills unset model, explicit opts win, outcome is recorded', async () => {
  const asked = []; const outcomes = [];
  const decide = async (p) => { asked.push(p); return { runner: 'default', model: 'm2', effort: 'low', decisionId: 'd1' }; };
  decide.recordOutcome = (id, o) => outcomes.push([id, o.ok]);
  const { engine, runs } = engineWith(decide, okRun);
  await engine.run('r', async (api) => { await api.agent('a'); await api.agent('b', { model: 'mine' }); }, null, {});
  assert.deepEqual(runs.map((r) => r.model), ['m2', 'mine']);
  assert.equal(asked.filter((p) => p === 'model.select').length, 1);
  assert.deepEqual(outcomes, [['d1', true]]);
});

test('workflow: model.escalate retries once with the chosen model', async () => {
  const decide = async (p) => (p === 'model.escalate' ? { escalate: true, model: 'big' } : undefined);
  const { engine, runs } = engineWith(decide, (req, n) => (n === 1 ? { ok: false, error: 'bad' } : okRun()));
  const r = await engine.run('r', async (api) => api.agent('a'), null, {});
  assert.equal(r.ok, true);
  assert.deepEqual(runs.map((x) => x.model), [undefined, 'big']);
});

test('workflow: no decide leaves a failed agent failed after one call', async () => {
  const { engine, runs } = engineWith(undefined, () => ({ ok: false, error: 'bad' }));
  const r = await engine.run('r', async (api) => api.agent('a'), null, {});
  assert.equal(r.ok, false);
  assert.equal(runs.length, 1);
});

test('workflow: action.approve deny stops approval without asking; allow, ask and a throw still ask', async () => {
  const deny = engineWith(async () => ({ decision: 'deny' }), okRun);
  const r = await deny.engine.run('r', async (api) => api.approval('ship'), null, {});
  assert.equal(r.ok, false);
  assert.equal(deny.approvals.length, 0);
  for (const d of [async () => ({ decision: 'allow' }), async () => ({ decision: 'ask' }), async () => { throw new Error('x'); }]) {
    const e = engineWith(d, okRun);
    assert.equal((await e.engine.run('r', async (api) => api.approval('ship'), null, {})).ok, true);
    assert.equal(e.approvals.length, 1);
  }
  const no = engineWith(async () => ({ decision: 'allow' }), okRun, async () => false);
  assert.equal((await no.engine.run('r', async (api) => api.approval('ship'), null, {})).ok, false); // allow never grants
});

// ---- browser / desktop ----
const bexec = () => { const calls = []; return { calls, exec: async (cmd, args) => { calls.push(args); return { code: 0, stdout: '{"ok":true}', stderr: '' }; } }; };
const brow = (decide, approve, policy = { allowedDomains: ['ok.test'] }) => { const x = bexec(); return { x, b: createBrowser({ exec: x.exec, clock: { now: () => 0 }, policy, decide, approve }) }; };

test('browser: deny refuses before the cli runs; allow never bypasses the url check', async () => {
  const d = brow(async () => ({ decision: 'deny', reason: 'no' }));
  const r = await d.b.open('a', 'https://ok.test/');
  assert.equal(r.ok, false); assert.equal(r.reason, 'denied'); assert.equal(d.x.calls.length, 0);
  const a = brow(async () => ({ decision: 'allow' }));
  const bad = await a.b.open('a', 'https://evil.test/');
  assert.equal(bad.ok, false); assert.notEqual(bad.reason, undefined); assert.equal(a.x.calls.length, 0);
});

test('browser: ask calls approve, false is denied; a throwing decide proceeds', async () => {
  const seen = [];
  const yes = brow(async () => ({ decision: 'ask' }), async (r) => { seen.push(r); return true; });
  assert.equal((await yes.b.open('a', 'https://ok.test/')).ok, true);
  assert.equal(seen[0].tool, 'browser');
  const no = brow(async () => ({ decision: 'ask' }), async () => false);
  assert.equal((await no.b.open('a', 'https://ok.test/')).reason, 'denied');
  const boom = brow(async () => { throw new Error('x'); });
  assert.equal((await boom.b.open('a', 'https://ok.test/')).ok, true);
  const none = brow(undefined);
  assert.equal((await none.b.open('a', 'https://ok.test/')).ok, true);
});

test('desktop: deny refuses; allow still needs first-touch approval unless the app is autoApprove', async () => {
  const snapJson = JSON.stringify({ ok: true, data: { snapshot_id: 's1', tree: { role: 'window', name: 'Notes', children: [{ role: 'button', name: 'Save', ref_id: 'e1' }] } } });
  const mk = (decide, approve, policy) => createDesktop({ exec: async () => ({ code: 0, stdout: snapJson, stderr: '' }), clock: { now: () => 0 }, policy: { allowedApps: ['Notes'], ...policy }, approve, decide });
  const go = async (d) => { await d.snapshot('a', 'Notes'); const ref = '@s1:e1'; return d.click('a', ref); };
  const denied = await go(mk(async () => ({ decision: 'deny' }), async () => true));
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'denied');
  let asked = 0;
  const allow = await go(mk(async () => ({ decision: 'allow' }), async () => { asked++; return false; }));
  assert.equal(allow.ok, false); assert.equal(asked, 1);
  const auto = await go(mk(async () => ({ decision: 'allow' }), async () => false, { autoApprove: ['Notes'] }));
  assert.equal(auto.ok, true);
});

// ---- watchdog ----
test('watchdog: advise asks run.continue and returns the decision; errors give null; never stops the run', async () => {
  const mk = (decide) => createWatchdog({ clock: { now: () => 0 }, bus: { emit() {} }, thresholds: { stallMs: 10, loopRepeats: 3, noProgressSteps: 5, tokensPerStep: 100 }, decide });
  let got;
  const w = mk(async (p, i) => { got = [p, i]; return { continue: false, reason: 'stuck' }; });
  w.observe({ seq: 1, ts: 0, runId: 'r1', type: 'run.start', stepKey: undefined, data: {} });
  assert.deepEqual(await w.advise('r1'), { continue: false, reason: 'stuck' });
  assert.equal(got[0], 'run.continue');
  assert.equal(Number.isInteger(got[1].steps), true);
  assert.equal(await mk(async () => { throw new Error('x'); }).advise('r1'), null);
  assert.equal(await mk(undefined).advise('r1'), null);
});

// ---- plugins ----
test('plugins: points and deciders are kinds and reach onRegister', async () => {
  const dir = tmp(); const pdir = path.join(dir, 'p1'); fs.mkdirSync(pdir);
  fs.writeFileSync(path.join(pdir, 'plugin.json'), JSON.stringify({ name: 'p1', version: '1.0.0', main: 'm.mjs', contributes: { points: ['pt'], deciders: ['s'] } }));
  fs.writeFileSync(path.join(pdir, 'm.mjs'), "export function activate(c){ c.register('points','pt',{input:{type:'object'},output:{type:'object'},default:{}}); c.register('deciders','s',()=>({})); }");
  const seen = [];
  const host = createPluginHost({ dirs: [dir], bus: { on() {}, emit() {} }, grant: () => true, clock: { now: () => 0 }, onRegister: (k, id) => seen.push([k, id]) });
  await host.discover(); await host.activate('p1');
  assert.deepEqual(seen, [['points', 'p1:pt'], ['deciders', 'p1:s']]);
});

// ---- backend ----
test('backend: layers load from files, a bad file is reported, decide and stats slots exist', async () => {
  const dir = tmp(); fs.mkdirSync(path.join(dir, 'decide'));
  fs.writeFileSync(path.join(dir, 'decide', 'org.json'), JSON.stringify({ points: { 'action.approve': { kind: 'constant', output: { decision: 'deny', reason: 'org' } } } }));
  fs.writeFileSync(path.join(dir, 'decide', 'user.json'), '{ not json');
  const b = createBackend({ dataDir: dir });
  assert.equal(typeof b.decide.explain, 'function');
  assert.equal(b.decide.explain('action.approve').winner.layer, 'org');
  assert.deepEqual(await b.decide.decide('action.approve', { tool: 't', action: 'a', target: 'x' }), { decision: 'deny', reason: 'org' });
  assert.ok(Object.keys(b.slots.read('decide:config').value.errors).includes('user'));
  assert.equal(typeof b.slots.read('decide:stats').value, 'object');
  await b.dispose();
});

// ---- cli ----
test('cli: explain and config validate print JSON and set the exit code', () => {
  const dir = tmp();
  const ex = spawnSync('node', [BIN, 'explain', 'model.select', '--data', dir], { encoding: 'utf8' });
  assert.equal(ex.status, 0);
  assert.equal(JSON.parse(ex.stdout).point, 'model.select');
  const good = path.join(dir, 'g.json'); fs.writeFileSync(good, JSON.stringify({ builtin: { router: 'balanced' } }));
  assert.equal(JSON.parse(execFileSync('node', [BIN, 'config', 'validate', good, '--data', dir], { encoding: 'utf8' })).ok, true);
  const bad = path.join(dir, 'b.json'); fs.writeFileSync(bad, JSON.stringify({ builtin: { nope: 1 } }));
  const r = spawnSync('node', [BIN, 'config', 'validate', bad, '--data', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).ok, false);
});
