import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSessionState } from '../src/sessionstate/index.mjs';
import { createSlots } from '../src/slots/index.mjs';

const fx = (n) => fs.readFileSync(new URL(`./fixtures/sessionstate/${n}.txt`, import.meta.url), 'utf8');
const mk = (opts = {}) => {
  const clock = { t: 1000, now: () => clock.t, adv(ms) { clock.t += ms; } };
  return { clock, ss: createSessionState({ clock, ...opts }) };
};
const user = (id) => ({ id, role: 'user', text: 'hi', ts: 0 });
const asst = (id) => ({ id, role: 'assistant', text: 'done', ts: 0 });
const call = (id) => ({ id, role: 'tool', text: '', tool: { name: 'Bash', input: {} }, ts: 0 });
const result = (id) => ({ id, role: 'tool', text: '', tool: { name: '', output: 'ok' }, ts: 0 });

test('starting -> working -> waiting_input via transcript, with idle + settle', () => {
  const { clock, ss } = mk();
  const t = ss.track('s1', { agent: 'claude' });
  assert.equal(t.state().state, 'starting');
  t.onMessages([user('a')]);
  clock.adv(300); t.tick();
  assert.equal(t.state().state, 'working');
  assert.equal(t.state().turns, 1);
  t.onMessages([asst('b')]);
  clock.adv(1499); t.tick();
  assert.equal(t.state().state, 'working', 'idle window not elapsed');
  clock.adv(1); t.tick();
  assert.equal(t.state().state, 'working', 'idle elapsed but settle not yet');
  clock.adv(300); t.tick();
  assert.equal(t.state().state, 'waiting_input');
  t.onMessages([user('c')]);
  clock.adv(300); t.tick();
  assert.equal(t.state().state, 'working');
});

test('debounce: a flap shorter than settleMs emits nothing', () => {
  const { clock, ss } = mk();
  const t = ss.track('s', { agent: 'claude' });
  const seen = []; t.subscribe((s) => seen.push(s.state));
  t.onMessages([user('a')]); clock.adv(100); t.tick();
  t.onMessages([user('b')]); clock.adv(100); t.tick();
  assert.deepEqual(seen, [], 'working held only 200ms');
  clock.adv(200); t.tick();
  assert.deepEqual(seen, ['working']);
});

test('tool-call pairing keeps state working until the result arrives', () => {
  const { clock, ss } = mk();
  const t = ss.track('s', { agent: 'codex' });
  t.onMessages([user('a'), asst('b'), call('c')]);
  clock.adv(5000); t.tick(); clock.adv(300); t.tick();
  assert.equal(t.state().state, 'working');
  assert.equal(t.state().toolCalls, 1);
  t.onMessages([result('d'), asst('e')]);
  clock.adv(1500); t.tick(); clock.adv(300); t.tick();
  assert.equal(t.state().state, 'waiting_input');
  t.onMessages([call('f'), call('g'), result('h')]);
  clock.adv(5000); t.tick(); clock.adv(300); t.tick();
  assert.equal(t.state().state, 'working', 'one of two calls still open');
  assert.equal(t.state().toolCalls, 3);
});

test('duplicate message ids are ignored', () => {
  const { ss } = mk();
  const t = ss.track('s', {});
  t.onMessages([user('a'), call('c')]);
  t.onMessages([user('a'), call('c')]);
  assert.equal(t.state().turns, 1);
  assert.equal(t.state().toolCalls, 1);
});

for (const [agent, file] of [['claude', 'claude-permission'], ['codex', 'codex-permission'], ['opencode', 'opencode-permission'], ['mystery', 'generic-permission'], ['claude', 'generic-permission']]) {
  test(`permission prompt: ${agent} / ${file} emits at once and clears`, () => {
    const { clock, ss } = mk();
    const t = ss.track('s', { agent });
    t.onMessages([user('a'), call('c')]);
    t.onScreen(fx(file));
    assert.equal(t.state().state, 'needs_permission', 'no settle wait');
    clock.adv(10); t.onScreen('all good\n$ ');
    clock.adv(300); t.tick();
    assert.equal(t.state().state, 'working');
  });
}

test('permission wording of one agent does not trigger another, and unknown agent uses generic only', () => {
  const { ss } = mk();
  const a = ss.track('a', { agent: 'claude' }); a.onScreen(fx('codex-permission'));
  assert.notEqual(a.state().state, 'needs_permission');
  const b = ss.track('b', { agent: 'mystery' }); b.onScreen(fx('claude-permission'));
  assert.notEqual(b.state().state, 'needs_permission');
});

test('only the last 15 screen lines are matched', () => {
  const { ss } = mk();
  const t = ss.track('s', { agent: 'claude' });
  t.onScreen(fx('claude-permission') + 'line\n'.repeat(20));
  assert.notEqual(t.state().state, 'needs_permission');
});

test('screen fallback without transcript: busy marker (ANSI stripped) then idle', () => {
  const { clock, ss } = mk();
  const t = ss.track('s', { agent: 'claude' });
  t.onScreen(fx('claude-working'));
  clock.adv(300); t.tick();
  assert.equal(t.state().state, 'working');
  t.onScreen(fx('claude-idle'));
  clock.adv(1500); t.tick(); clock.adv(300); t.tick();
  assert.equal(t.state().state, 'waiting_input');
});

test('screen error per agent; transcript quiet does not hide it', () => {
  const { ss } = mk();
  const t = ss.track('s', { agent: 'codex' });
  t.onMessages([user('a')]);
  t.onScreen(fx('codex-error'));
  assert.equal(t.state().state, 'error');
});

test('exit: code 0 -> exited, nonzero -> error, both immediate and final', () => {
  const { clock, ss } = mk();
  const a = ss.track('a', {}); a.onMessages([user('x')]); a.onExit(0);
  assert.equal(a.state().state, 'exited');
  const b = ss.track('b', {}); b.onExit(2);
  assert.equal(b.state().state, 'error');
  assert.match(b.state().reason, /2/);
  clock.adv(9999); a.onScreen('x'); a.tick();
  assert.equal(a.state().state, 'exited');
});

test('unsubscribe stops notifications; throwing listener is isolated', () => {
  const { ss } = mk();
  const t = ss.track('s', {});
  const seen = [];
  t.subscribe(() => { throw new Error('boom'); });
  const off = t.subscribe((s) => seen.push(s.state));
  t.onExit(0);
  assert.deepEqual(seen, ['exited']);
  off();
  const t2 = ss.track('s2', {}); const seen2 = [];
  const off2 = t2.subscribe((s) => seen2.push(s.state)); off2(); t2.onExit(0);
  assert.deepEqual(seen2, []);
});

test('slots: per-session state and attention ordered oldest first', () => {
  const slots = createSlots();
  const { clock, ss } = mk({ slots });
  const a = ss.track('a', { agent: 'claude' }), b = ss.track('b', { agent: 'claude' }), c = ss.track('c', { agent: 'claude' });
  assert.deepEqual(slots.read('sessions:attention').value, []);
  b.onScreen(fx('claude-permission'));
  clock.adv(50);
  a.onScreen(fx('claude-permission'));
  clock.adv(50);
  c.onExit(1);
  assert.deepEqual(slots.read('sessions:attention').value, ['b', 'a', 'c']);
  assert.equal(slots.read('session:a:state').value.state, 'needs_permission');
  a.onExit(0);
  assert.deepEqual(slots.read('sessions:attention').value, ['b', 'c']);
  assert.deepEqual(Object.keys(ss.all()), ['a', 'b', 'c']);
  assert.equal(ss.track('a'), a, 'track is idempotent');
});

test('no timers left running', () => {
  const before = process.getActiveResourcesInfo().filter((r) => /Timeout|Immediate/.test(r)).length;
  const { clock, ss } = mk();
  const t = ss.track('s', { agent: 'claude' }); t.onMessages([user('a'), asst('b')]); clock.adv(5000); ss.tick();
  assert.equal(process.getActiveResourcesInfo().filter((r) => /Timeout|Immediate/.test(r)).length, before);
});
