import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createComputerAgent, createReplayCache, keyOf } from '../src/computer/index.mjs';

const fakeClock = () => ({ t: 0, now() { return this.t; } });

function fakeBrowser(pages, o = {}) {
  const s = { page: Object.keys(pages)[0], epoch: 0, snap: -1, typed: [], log: [], failClicks: 0, openFail: false };
  const cur = () => pages[s.page];
  const refOf = (i) => `e${i + 1}`;
  const ok = (extra = {}) => ({ ok: true, text: '', ...extra });
  const bad = (reason, error) => ({ ok: false, reason, error, text: '' });
  const find = (ref) => { const i = cur().els.findIndex((_, k) => `@${refOf(k)}` === String(ref)); return s.snap === 0 && i >= 0 ? cur().els[i] : null; };
  return {
    state: s,
    open: async (id, url) => { s.log.push(['open', url]); if (s.openFail) return bad('policy', 'domain not allowed'); s.snap = -1; return ok(); },
    snapshot: async () => { s.snap = 0; return ok({ text: cur().els.map((e, i) => `- ${e[0]} "${e[1]}" [ref=${refOf(i)}]`).join('\n') }); },
    get: async () => ok({ text: cur().url }),
    click: async (id, ref) => {
      s.log.push(['click', ref]);
      const el = find(ref);
      if (!el) return bad('stale_ref', 'stale_ref');
      if (s.failClicks > 0) { s.failClicks--; return bad('cli', 'click failed'); }
      if (el[2]?.to) { s.page = el[2].to; s.snap = -1; }
      return ok();
    },
    fill: async (id, ref, text) => { const el = find(ref); if (!el) return bad('stale_ref', 'stale_ref'); s.typed.push([el[1], text]); return ok(); },
    type: async () => ok(),
    press: async (id, key) => { s.log.push(['press', key]); return ok(); },
    wait: async () => ok(),
    screenshot: async () => ok(),
  };
}

const fakeDecide = (h = {}) => {
  const calls = []; const acts = [...(h.acts ?? [])];
  const fn = async (point, input, ctx) => {
    calls.push({ point, input, ctx });
    if (point === 'computer.act') return acts.shift() ?? { action: 'none', done: true, answer: 'out of script' };
    const f = h[point];
    if (typeof f === 'function') return f(input, ctx);
    if (f !== undefined) return f;
    if (point === 'computer.check') return { ok: true, reason: 'fake' };
    if (point === 'run.continue') return { continue: true, reason: 'fake' };
    return undefined;
  };
  fn.count = (p) => calls.filter((c) => c.point === p).length;
  fn.of = (p) => calls.filter((c) => c.point === p);
  return fn;
};

const PAY = { a: { url: 'https://p.test/a', els: [['button', 'Place order']] } };
const FLIP = { a: { url: 'https://t.test/a', els: [['button', 'Flip']] } };
const run = (agent, extra = {}) => agent.run({ goal: 'g', surface: 'browser', start: 'https://p.test/a', agentId: 'a1', ...extra });
const CLICK = [{ action: 'click', ref: '@e1' }];

// gap a: the recovery 'key' strategy is an action like any other
test('recovery key press on a payment page goes through action.approve and a deny stops it', async () => {
  const b = fakeBrowser(PAY); b.state.failClicks = 99;
  const d = fakeDecide({ acts: CLICK, 'action.approve': (i) => (i.action === 'press' ? { decision: 'deny', reason: 'no' } : { decision: 'allow' }) });
  await run(createComputerAgent({ browser: b, decide: d, clock: fakeClock(), limits: { maxEscalations: 0 } }));
  assert.ok(d.of('action.approve').some((c) => c.input.action === 'press'));
  assert.equal(b.state.log.some(([k, v]) => k === 'press' && v === 'Enter'), false);
});

test('recovery key press with no approval path fails closed on a payment page', async () => {
  const b = fakeBrowser(PAY); b.state.failClicks = 99;
  const d = fakeDecide({ acts: CLICK, 'action.approve': (i) => (i.action === 'press' ? { decision: 'ask' } : { decision: 'allow' }) });
  await run(createComputerAgent({ browser: b, decide: d, clock: fakeClock(), limits: { maxEscalations: 0 } }));
  assert.equal(b.state.log.some(([k, v]) => k === 'press' && v === 'Enter'), false);
});

test('recovery key press still fires when the press is allowed, and on untagged pages', async () => {
  const b = fakeBrowser(PAY); b.state.failClicks = 99;
  const d = fakeDecide({ acts: CLICK, 'action.approve': { decision: 'allow' } });
  await run(createComputerAgent({ browser: b, decide: d, clock: fakeClock(), limits: { maxEscalations: 0 } }));
  assert.ok(b.state.log.some(([k, v]) => k === 'press' && v === 'Enter'));
  const b2 = fakeBrowser(FLIP); b2.state.failClicks = 99;
  const d2 = fakeDecide({ acts: CLICK });
  await run(createComputerAgent({ browser: b2, decide: d2, clock: fakeClock(), limits: { maxEscalations: 0 } }));
  assert.ok(b2.state.log.some(([k, v]) => k === 'press' && v === 'Enter'));
  assert.equal(d2.count('action.approve'), 0);
});

// gap b: setup failures and journal failures end the run with a reason
test('a failed browser open stops the run before any model call', async () => {
  const b = fakeBrowser(FLIP); b.state.openFail = true;
  const d = fakeDecide({ acts: CLICK });
  const r = await run(createComputerAgent({ browser: b, decide: d, clock: fakeClock() }));
  assert.equal(r.ok, false);
  assert.equal(r.stopReason, 'open_failed');
  assert.equal(d.count('computer.act'), 0);
});

test('a failed desktop focus stops the run', async () => {
  const desktop = { focus: async () => ({ ok: false, reason: 'policy', error: 'app not allowed' }), snapshot: async () => { throw new Error('must not be reached'); } };
  const r = await createComputerAgent({ desktop, decide: fakeDecide(), clock: fakeClock() }).run({ goal: 'g', surface: 'desktop', start: 'Notes', agentId: 'a1' });
  assert.equal(r.stopReason, 'open_failed');
});

test('a throwing journal ends the run with journal_failed instead of rejecting', async () => {
  const b = fakeBrowser(FLIP);
  const d = fakeDecide({ acts: CLICK });
  const journal = { append: async () => { throw new Error('disk full'); } };
  const r = await run(createComputerAgent({ browser: b, decide: d, clock: fakeClock(), journal }), { start: 'https://t.test/a' });
  assert.equal(r.ok, false);
  assert.equal(r.stopReason, 'journal_failed');
});

test('a throwing slot publisher ends the run with journal_failed', async () => {
  const b = fakeBrowser(FLIP);
  const r = await run(createComputerAgent({ browser: b, decide: fakeDecide({ acts: CLICK }), clock: fakeClock(), slots: { publish: async () => { throw new Error('x'); } } }), { start: 'https://t.test/a' });
  assert.equal(r.stopReason, 'journal_failed');
});

// gap c: the wait strategy waits on the desktop too
const deskRun = (desktop, d) => createComputerAgent({ desktop, decide: d, clock: fakeClock(), limits: { maxEscalations: 0 } })
  .run({ goal: 'g', surface: 'desktop', start: 'Notes', agentId: 'a1' });
const snap = async () => ({ ok: true, data: { snapshot_id: 's1', tree: { role: 'window', name: 'Notes', children: [{ role: 'button', name: 'Save', ref_id: 'e1' }] } } });

test('desktop wait strategy calls desktop.wait when it exists', async () => {
  const waited = [];
  const desktop = { focus: async () => ({ ok: true }), snapshot: snap, screenshot: async () => ({ ok: true }), scroll: async () => ({ ok: true }), key: async () => ({ ok: true }),
    wait: async (id, c) => { waited.push(c); return { ok: true }; },
    click: async () => (waited.length ? { ok: true } : { ok: false, reason: 'cli', error: 'busy' }) };
  const r = await deskRun(desktop, fakeDecide({ acts: [{ action: 'click', ref: '@s1:e1' }] }));
  assert.equal(waited.length, 1);
  assert.equal(r.steps[0].ok, true);
  assert.ok(r.steps[0].recovery.includes('wait'));
});

test('desktop wait strategy really pauses when the desktop has no wait method', async () => {
  const t0 = Date.now();
  const desktop = { focus: async () => ({ ok: true }), snapshot: snap, screenshot: async () => ({ ok: true }), scroll: async () => ({ ok: true }), key: async () => ({ ok: true }),
    click: async () => (Date.now() - t0 >= 400 ? { ok: true } : { ok: false, reason: 'cli', error: 'busy' }) };
  const r = await deskRun(desktop, fakeDecide({ acts: [{ action: 'click', ref: '@s1:e1' }] }));
  assert.equal(r.steps[0].ok, true);
});

// gap d: a stored {{secret}} is a planned handoff, not a failure
test('replay hands a {{secret}} step to the model, resumes, and does not count a failure', async () => {
  const pages = {
    home: { url: 'https://p.test/a', els: [['button', 'Go', { to: 'form' }]] },
    form: { url: 'https://p.test/b', els: [['textbox', 'Code'], ['button', 'Next', { to: 'end' }]] },
    end: { url: 'https://p.test/c', els: [['heading', 'Done']] },
  };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gaps-'));
  const replay = createReplayCache({ dir });
  const key = keyOf('g', 'browser', 'https://p.test/a');
  await replay.put(key, [
    { action: 'click', role: 'button', name: 'Go' },
    { action: 'type', role: 'textbox', name: 'Code', text: '{{secret}}' },
    { action: 'click', role: 'button', name: 'Next' },
  ], 'stored answer');
  const b = fakeBrowser(pages);
  const d = fakeDecide({ acts: [{ action: 'type', ref: '@e1', text: 'hunter2' }] });
  const r = await run(createComputerAgent({ browser: b, decide: d, clock: fakeClock(), replay }));
  assert.equal(r.ok, true);
  assert.equal(r.stopReason, 'done');
  assert.equal(r.answer, 'stored answer');
  assert.equal(r.replay.fellBackAt, null);
  assert.equal(d.count('computer.act'), 1);
  assert.deepEqual(b.state.typed, [['Code', 'hunter2']]);
  assert.equal(b.state.page, 'end');
  assert.equal((await replay.get(key)).fails, 0);
  assert.equal((await replay.get(key)).steps[1].text, '{{secret}}');
});
