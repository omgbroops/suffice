import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJournal, createBus } from '../src/journal/index.mjs';
import { createBudget } from '../src/budget/index.mjs';
import { createWatchdog } from '../src/watchdog/index.mjs';
import { createEngine } from '../src/workflow/index.mjs';

const clock = { now: () => Date.now() };
const usage = { inputTokens: 100, outputTokens: 50 };
const TH = { stallMs: 60000, loopRepeats: 3, noProgressSteps: 5, tokensPerStep: 100000 };

async function rig(t, { limits = [], runner, code = 0 } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suffice-int-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const calls = [];
  const fakeRunner = runner ?? { async run(req) { calls.push(req.prompt); await new Promise((r) => setImmediate(r)); return { ok: true, text: `out:${req.prompt}`, usage, ms: 1 }; } };
  const execs = [];
  const exec = async (cmd, args) => { execs.push([cmd, ...args].join(' ')); return { code, stdout: 'all tests passed', stderr: '', timedOut: false }; };
  const budget = createBudget({ clock, store: { load: () => null, save() {} }, limits });
  // a fresh engine and journal objects per call model a restarted process on the same files
  const boot = () => {
    const journalFor = (runId) => createJournal({ dir, runId, clock });
    const engine = createEngine({ journalFor, runners: { get: () => fakeRunner }, budget, bus: createBus(), clock, approve: async () => true, exec });
    return { engine, journalFor };
  };
  return { boot, calls, execs, budget };
}

test('a failing gate ends the run ok:false and the gate event is in the real journal', async (t) => {
  const { boot } = await rig(t, { code: 1 });
  const { engine, journalFor } = boot();
  const r = await engine.run('g1', async (api) => { await api.gate('tests', await api.exec('npm', ['test'])); return 'shipped'; }, null, {});
  assert.equal(r.ok, false);
  const ev = await journalFor('g1').read();
  assert.deepEqual(ev.find((e) => e.type === 'gate').data, { name: 'tests', code: 1, ok: false });
  assert.equal(ev.find((e) => e.type === 'exec').data.code, 1);
  assert.equal(ev.at(-1).type, 'run.end');
  assert.equal(ev.at(-1).data.ok, false);
});

test('resume after a crash replays finished steps without calling the runner', async (t) => {
  let crash = true;
  const calls = [];
  const runner = { async run(req) { calls.push(req.prompt); if (crash && req.prompt === 'two') throw new Error('process died'); return { ok: true, text: `out:${req.prompt}`, usage, ms: 1 }; } };
  const { boot } = await rig(t, { runner });
  const wf = async (api) => [await api.agent('one'), await api.agent('two')];
  assert.equal((await boot().engine.run('c1', wf, null, {})).ok, false);
  crash = false;
  const r = await boot().engine.run('c1', wf, null, {});
  assert.deepEqual(r, { ok: true, value: ['out:one', 'out:two'] });
  assert.deepEqual(calls, ['one', 'two', 'two'], 'step one was replayed from disk');
  assert.equal((await boot().engine.run('c1', wf, null, {})).ok, true);
  assert.equal(calls.length, 3, 'a finished run replays entirely');
});

for (const [code, flagged] of [[1, true], [0, false]]) {
  test(`watchdog on the real journal: exec code ${code} ${flagged ? 'flags' : 'does not flag'} a "tests passed" claim`, async (t) => {
    const claim = { kind: 'tests', passed: true, command: 'npm test' };
    const runner = { async run() { return { ok: true, value: { summary: 'done', claims: [claim] }, usage, ms: 1 }; } };
    const { boot } = await rig(t, { runner, code });
    const { engine, journalFor } = boot();
    await engine.run('w1', async (api) => { await api.exec('npm', ['test']); return api.agent('implement'); }, null, {});
    const w = createWatchdog({ clock, bus: createBus(), thresholds: TH });
    for (const e of await journalFor('w1').read()) w.observe(e);
    assert.deepEqual(w.findings('w1').map((f) => f.kind), flagged ? ['claim-mismatch'] : []);
  });
}

test('budget reservation holds under parallel: one of five 20000-token agents fits in 25000', async (t) => {
  const { boot, calls, budget } = await rig(t, { limits: [{ name: 'run', tokens: 25000, period: 'run' }] });
  const { engine, journalFor } = boot();
  const r = await engine.run('b1', (api) => api.parallel(Array.from({ length: 5 }, (_, i) => () => api.agent(`p${i}`))), null, {});
  assert.equal(r.ok, false);
  assert.match(r.error, /budget/);
  assert.equal(calls.length, 1);
  assert.ok((await journalFor('b1').read()).some((e) => e.type === 'budget'));
  assert.equal(budget.status()[0].used, 0, 'run limits are per run id; status has no run');
  assert.equal(budget.check(20000, { runId: 'b1' }).remaining, 24850);
  assert.equal(budget.check(20000, { runId: 'other' }).remaining, 25000);
});
