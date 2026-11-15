import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWatchdog, rank, verifyClaim } from '../src/watchdog/index.mjs';

const TH = { stallMs: 1000, loopRepeats: 3, noProgressSteps: 2, tokensPerStep: 100 };

async function setup(t, th = TH) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'watchdog-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let now = 0;
  const clock = { now: () => now };
  const emitted = [];
  const bus = { on() { return () => {}; }, emit: (type, p) => emitted.push([type, p]) };
  const w = createWatchdog({ clock, bus, thresholds: th });
  let seq = 0;
  const ev = (type, stepKey, data) => ({ seq: ++seq, ts: now, runId: 'r1', type, stepKey, data });
  return { w, emitted, ev, advance: (ms) => { now += ms; }, setNow: (n) => { now = n; } };
}
const kinds = (w, run = 'r1') => w.findings(run).map((f) => f.kind);

test('thresholds are validated', () => {
  const clock = { now: () => 0 }, bus = { emit() {} };
  assert.throws(() => createWatchdog({ clock, bus }), TypeError);
  assert.throws(() => createWatchdog({ clock, bus, thresholds: { ...TH, stallMs: 0 } }), TypeError);
  assert.throws(() => createWatchdog({ clock, bus, thresholds: { ...TH, loopRepeats: 1 } }), TypeError);
  assert.throws(() => createWatchdog({ clock, bus, thresholds: { ...TH, noProgressSteps: 1.5 } }), TypeError);
  assert.throws(() => createWatchdog({ clock, bus, thresholds: { ...TH, tokensPerStep: 'x' } }), TypeError);
  assert.throws(() => createWatchdog({ clock: {}, bus, thresholds: TH }), TypeError);
  assert.throws(() => createWatchdog({ clock, bus: {}, thresholds: TH }), TypeError);
});

test('observe validates events', async (t) => {
  const { w } = await setup(t);
  assert.throws(() => w.observe(null), TypeError);
  assert.throws(() => w.observe({ type: 'x', runId: 'r1' }), TypeError);
});

test('stall: found after stallMs, not before, not once the step ended', async (t) => {
  const { w, ev, advance, emitted } = await setup(t);
  w.observe(ev('step.start', 's1'));
  w.observe(ev('step.start', 's2'));
  advance(1000);
  assert.deepEqual(w.tick(), []);
  advance(1);
  w.observe(ev('step.result', 's2', {}));
  const found = w.tick();
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'stall');
  assert.equal(found[0].stepKey, 's1');
  assert.equal(emitted[0][0], 'watchdog.finding');
  assert.equal(w.tick().length, 0); // not duplicated
});

test('stall: a later event for the step resets the timer', async (t) => {
  const { w, ev, advance } = await setup(t);
  w.observe(ev('step.start', 's1'));
  advance(900);
  w.observe(ev('tool', 's1', {}));
  advance(900);
  assert.deepEqual(w.tick(), []);
});

test('loop: same action repeated, whitespace-collapsed', async (t) => {
  const { w, ev } = await setup(t);
  w.observe(ev('tool', 's1', { action: 'ls  -la' }));
  w.observe(ev('tool', 's1', { action: 'ls -la ' }));
  assert.deepEqual(kinds(w), []);
  w.observe(ev('tool', 's1', { action: ' ls\t-la' }));
  assert.deepEqual(kinds(w), ['loop']);
  w.observe(ev('tool', 's1', { action: 'ls -la' }));
  assert.deepEqual(kinds(w), ['loop']); // one finding per step
});

test('loop: A,B,A,B alternation, and negatives', async (t) => {
  const { w, ev } = await setup(t, { ...TH, loopRepeats: 4 });
  for (const a of ['A', 'B', 'A']) w.observe(ev('tool', 's1', { action: a }));
  assert.deepEqual(kinds(w), []);
  w.observe(ev('tool', 's1', { action: 'B' }));
  assert.deepEqual(kinds(w), ['loop']);
  for (const a of ['A', 'B', 'C', 'A']) w.observe(ev('tool', 's2', { action: a }));
  assert.equal(w.findings('r1').filter((f) => f.stepKey === 's2').length, 0);
  // same action across different steps is not a loop
  for (const k of ['s3', 's4', 's5', 's6']) w.observe(ev('tool', k, { action: 'X' }));
  assert.equal(w.findings('r1').filter((f) => ['s3', 's4', 's5', 's6'].includes(f.stepKey)).length, 0);
});

test('verifyClaim: pure, exit and tests claims', () => {
  const exec = (command, code) => ({ type: 'exec', data: { command, code } });
  assert.equal(verifyClaim({ kind: 'exit', command: 'npm test', code: 0 }, [exec('npm test', 0)]).ok, true);
  assert.equal(verifyClaim({ kind: 'exit', command: 'npm test', code: 0 }, [exec('npm test', 1)]).ok, false);
  assert.equal(verifyClaim({ kind: 'exit', command: 'npm test', code: 0 }, []).ok, false);
  assert.equal(verifyClaim({ kind: 'exit', command: 'npm test', code: 0 }, [exec('npm test', 1), exec('npm test', 0)]).ok, true);
  assert.equal(verifyClaim({ kind: 'tests', passed: true }, []).ok, false);
  assert.equal(verifyClaim({ kind: 'tests', passed: true }, [exec('x', 2)]).ok, false);
  assert.equal(verifyClaim({ kind: 'tests', passed: true }, [exec('x', 0)]).ok, true);
  // reverse case is never flagged
  assert.equal(verifyClaim({ kind: 'tests', passed: false }, [exec('x', 0)]).ok, true);
  assert.equal(verifyClaim({ kind: 'exit', command: 'x', code: 1 }, [exec('x', 0)]).ok, true);
});

test('claim mismatch: claimed pass, exec code 1 (known positive)', async (t) => {
  const { w, ev } = await setup(t);
  w.observe(ev('exec', 's1', { command: 'npm test', code: 1 }));
  w.observe(ev('step.result', 's1', { claims: [{ kind: 'exit', command: 'npm test', code: 0 }] }));
  const f = w.findings('r1');
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, 'claim-mismatch');
  assert.equal(f[0].severity, 'high');
  assert.equal(f[0].stepKey, 's1');
});

test('claim mismatch: no evidence at all', async (t) => {
  const { w, ev } = await setup(t);
  w.observe(ev('step.result', 's1', { claims: [{ kind: 'tests', passed: true }] }));
  assert.deepEqual(kinds(w), ['claim-mismatch']);
});

test('claim mismatch: negatives (backed claim, reverse case)', async (t) => {
  const { w, ev } = await setup(t);
  w.observe(ev('exec', 's1', { command: 'npm test', code: 0 }));
  w.observe(ev('step.result', 's1', { claims: [{ kind: 'exit', command: 'npm test', code: 0 }, { kind: 'tests', passed: true }] }));
  w.observe(ev('exec', 's2', { command: 'make', code: 2 }));
  w.observe(ev('step.result', 's2', { claims: [{ kind: 'exit', command: 'make', code: 2 }, { kind: 'tests', passed: false }] }));
  assert.deepEqual(kinds(w), []);
});

test('no-progress: consecutive zero diffStat results', async (t) => {
  const { w, ev } = await setup(t);
  w.observe(ev('step.result', 's1', { diffStat: { files: 0, insertions: 0, deletions: 0 } }));
  assert.deepEqual(kinds(w), []);
  w.observe(ev('step.result', 's2', { diffStat: { files: 0, insertions: 0, deletions: 0 } }));
  assert.deepEqual(kinds(w), ['no-progress']);
  w.observe(ev('step.result', 's3', { diffStat: 0 }));
  assert.deepEqual(kinds(w), ['no-progress']); // streak keeps growing, still one finding
});

test('no-progress: a real change or missing diffStat resets the streak', async (t) => {
  const { w, ev } = await setup(t);
  const zero = { files: 0, insertions: 0, deletions: 0 };
  w.observe(ev('step.result', 's1', { diffStat: zero }));
  w.observe(ev('step.result', 's2', { diffStat: { files: 1, insertions: 3, deletions: 0 } }));
  w.observe(ev('step.result', 's3', { diffStat: zero }));
  w.observe(ev('step.result', 's4', {}));
  w.observe(ev('step.result', 's5', { diffStat: zero }));
  assert.deepEqual(kinds(w), []);
});

test('budget burn: usage summed per step over the limit', async (t) => {
  const { w, ev } = await setup(t);
  w.observe(ev('model', 's1', { usage: { inputTokens: 40, outputTokens: 30 } }));
  assert.deepEqual(kinds(w), []);
  w.observe(ev('model', 's1', { usage: { inputTokens: 20, outputTokens: 10 } }));
  assert.deepEqual(kinds(w), []); // 100 is not above 100
  w.observe(ev('model', 's1', { usage: { inputTokens: 1, outputTokens: 0 } }));
  assert.deepEqual(kinds(w), ['budget-burn']);
  w.observe(ev('model', 's1', { usage: { inputTokens: 50, outputTokens: 0 } }));
  assert.deepEqual(kinds(w), ['budget-burn']);
  w.observe(ev('model', 's2', { usage: { inputTokens: 99, outputTokens: 0 } }));
  assert.equal(w.findings('r1').length, 1); // other step is separate
});

test('same event observed twice yields no duplicate findings or bus emits', async (t) => {
  const { w, ev, emitted } = await setup(t);
  const e = ev('step.result', 's1', { claims: [{ kind: 'tests', passed: true }] });
  w.observe(e);
  w.observe(e);
  w.observe({ ...e });
  assert.equal(w.findings('r1').length, 1);
  assert.equal(emitted.length, 1);
  // double observation must not double-count usage or loop actions either
  const u = ev('model', 's9', { usage: { inputTokens: 60, outputTokens: 0 } });
  w.observe(u); w.observe(u);
  assert.equal(w.findings('r1').filter((f) => f.kind === 'budget-burn').length, 0);
  const a = ev('tool', 's8', { action: 'x' });
  w.observe(a); w.observe(a); w.observe(a);
  assert.equal(w.findings('r1').filter((f) => f.kind === 'loop').length, 0);
});

test('findings are scoped per run and emit the documented payload', async (t) => {
  const { w, emitted } = await setup(t);
  w.observe({ seq: 1, ts: 0, runId: 'other', type: 'step.result', stepKey: 'a', data: { claims: [{ kind: 'tests', passed: true }] } });
  assert.equal(w.findings('r1').length, 0);
  assert.equal(w.findings('other').length, 1);
  const [type, p] = emitted[0];
  assert.equal(type, 'watchdog.finding');
  assert.equal(p.runId, 'other');
  assert.equal(p.kind, 'claim-mismatch');
  assert.equal(p.stepKey, 'a');
  assert.ok(p.evidence);
  assert.throws(() => w.findings(5), TypeError);
});

test('rank: severity first, then recency; does not mutate input', () => {
  const f = [
    { kind: 'a', severity: 'low', ts: 9 },
    { kind: 'b', severity: 'high', ts: 1 },
    { kind: 'c', severity: 'high', ts: 5 },
    { kind: 'd', severity: 'medium', ts: 7 },
  ];
  const copy = [...f];
  assert.deepEqual(rank(f).map((x) => x.kind), ['c', 'b', 'd', 'a']);
  assert.deepEqual(f, copy);
  assert.throws(() => rank('x'), TypeError);
});

test('claim mismatch: a later successful exec does not back a claim about an earlier failed run', async (t) => {
  const { w } = await setup(t);
  w.observe({ seq: 1, ts: 0, runId: 'r1', type: 'exec', stepKey: 'e1', data: { command: 'npm', args: ['test'], code: 1 } });
  w.observe({ seq: 3, ts: 0, runId: 'r1', type: 'exec', stepKey: 'e2', data: { command: 'npm', args: ['test'], code: 0 } });
  w.observe({ seq: 2, ts: 0, runId: 'r1', type: 'step.result', stepKey: 's1', data: { claims: [{ kind: 'exit', command: 'npm', code: 0 }] } });
  assert.deepEqual(kinds(w), ['claim-mismatch']);
  const ev = [{ seq: 1, type: 'exec', stepKey: 'a', data: { command: 'x', code: 1 } }, { seq: 3, type: 'exec', stepKey: 'a', data: { command: 'x', code: 0 } }];
  assert.equal(verifyClaim({ kind: 'exit', command: 'x', code: 0 }, ev, { seq: 2, stepKey: 'a' }).ok, false);
  assert.equal(verifyClaim({ kind: 'exit', command: 'x', code: 0 }, ev, { seq: 4, stepKey: 'a' }).ok, true);
});

test('claim mismatch: a tests claim without a command only uses exec events of its own step', async (t) => {
  const { w, ev } = await setup(t);
  w.observe(ev('exec', 'other', { command: 'npm', args: ['test'], code: 0 }));
  w.observe(ev('step.result', 's1', { claims: [{ kind: 'tests', passed: true }] }));
  assert.deepEqual(kinds(w), ['claim-mismatch']);
  w.observe(ev('exec', 's2', { command: 'npm', args: ['test'], code: 0 }));
  w.observe(ev('step.result', 's2', { claims: [{ kind: 'tests', passed: true }] }));
  assert.equal(w.findings('r1').length, 1);
});

test('claim mismatch: the command may be the full command line, and claims may sit under data.value', async (t) => {
  const { w, ev } = await setup(t);
  w.observe(ev('exec', 'e', { command: 'npm', args: ['test'], code: 1 }));
  w.observe(ev('step.result', 's1', { value: { claims: [{ kind: 'exit', command: 'npm test', code: 0 }] }, usage: { inputTokens: 1, outputTokens: 1 } }));
  assert.deepEqual(kinds(w), ['claim-mismatch']);
});

test('loop: loopRepeats 2 needs the same action twice, not any two different ones', async (t) => {
  const { w, ev } = await setup(t, { ...TH, loopRepeats: 2 });
  w.observe(ev('tool', 's1', { action: 'A' }));
  w.observe(ev('tool', 's1', { action: 'B' }));
  assert.deepEqual(kinds(w), []);
  w.observe(ev('tool', 's1', { action: 'A' }));
  assert.deepEqual(kinds(w), []);
  w.observe(ev('tool', 's1', { action: 'B' }));
  assert.deepEqual(kinds(w), ['loop'], 'A,B,A,B is two full cycles');
  w.observe(ev('tool', 's2', { action: 'X' }));
  w.observe(ev('tool', 's2', { action: 'X' }));
  assert.equal(w.findings('r1').filter((f) => f.stepKey === 's2').length, 1);
});

test('loopRepeats below 2 is rejected at construction', () => {
  for (const n of [0, 1, -3, 1.5]) assert.throws(() => createWatchdog({ clock: { now: () => 0 }, bus: { emit() {} }, thresholds: { ...TH, loopRepeats: n } }), TypeError);
});

test('stall: a step waiting on an approval is not stalled until it is answered', async (t) => {
  const { w, ev, advance } = await setup(t);
  w.observe(ev('step.start', 's1'));
  w.observe(ev('approval', 's1', { name: 'ship' }));
  advance(5000);
  assert.deepEqual(w.tick(), []);
  w.observe(ev('approval', 's1', { name: 'ship', approved: true }));
  advance(1001);
  assert.deepEqual(w.tick().map((f) => f.kind), ['stall']);
});

test('stall: a step still open after run.end is not flagged', async (t) => {
  const { w, ev, advance } = await setup(t);
  w.observe(ev('step.start', 's1'));
  w.observe(ev('run.end', undefined, { ok: false }));
  advance(5000);
  assert.deepEqual(w.tick(), []);
});

test('duplicate seq from two writers: only identical (seq, type, stepKey) events collapse', async (t) => {
  const { w } = await setup(t);
  const e = (type, stepKey, data) => ({ seq: 2, ts: 0, runId: 'r1', type, stepKey, data });
  w.observe(e('exec', 'x', { command: 'npm', code: 1 }));
  w.observe(e('step.result', 's1', { claims: [{ kind: 'exit', command: 'npm', code: 0 }] }));
  w.observe(e('step.result', 's1', { claims: [{ kind: 'exit', command: 'npm', code: 0 }] }));
  assert.deepEqual(kinds(w), ['claim-mismatch']);
});
