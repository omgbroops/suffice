import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { run } from '../src/sessioncli/index.mjs';

const NOW = 1_700_000_000_000;
const mk = (id, agent, cwd, ageS) => ({ id, agent, cwd, created: NOW / 1000 - ageS, attachCommand: `tmux -L suffice attach -t sfx-${id}` });
function harness({ list = [mk('abc123', 'claude', '/home/u/proj', 90), mk('abd999', 'codex', '/other', 7200)], code = 0 } = {}) {
  const calls = []; const spawned = []; let o = ''; let e = '';
  const sessions = {
    list: async () => list,
    start: async (a) => { calls.push(['start', a]); return mk('new111', a.agent, a.cwd, 0); },
    resume: async (a) => { calls.push(['resume', a]); return mk('res222', a.agent, a.cwd, 0); },
    stop: async (id) => calls.push(['stop', id]),
    send: async (id, t) => calls.push(['send', id, t]),
    screen: async (id) => { calls.push(['screen', id]); return { text: 'hello\nworld\n', ansi: '\x1b[1mhello' }; },
    history: { list: (q) => { calls.push(['history', q]); return q.agent === 'claude' ? [{ agent: 'claude', sessionId: 's1', cwd: '/home/u/x', startedAt: NOW - 5000, title: 'fix it' }] : []; } },
  };
  const spawn = (bin, args, opts) => { spawned.push([bin, args, opts]); const c = new EventEmitter(); queueMicrotask(() => c.emit('close', code)); return c; };
  const go = (argv, env = {}) => run(argv, { sessions, spawn, stdout: { write: (s) => (o += s) }, stderr: { write: (s) => (e += s) }, env, home: '/home/u', now: () => NOW });
  return { go, calls, spawned, out: () => o, err: () => e };
}

test('ls table shortens home, shows age, no escape codes', async () => {
  const h = harness();
  assert.equal(await h.go(['ls'], { NO_COLOR: '1' }), 0);
  assert.match(h.out(), /abc123\s+claude\s+~\/proj\s+1m/);
  assert.match(h.out(), /abd999\s+codex\s+\/other\s+2h/);
  assert.doesNotMatch(h.out(), /\x1b/);
});
test('ls --json parses', async () => {
  const h = harness(); await h.go(['ls', '--json']);
  assert.deepEqual(JSON.parse(h.out()).map((s) => s.id), ['abc123', 'abd999']);
});
test('new starts, prints id, attaches with exact argv; extra args passed', async () => {
  const h = harness({ code: 3 });
  assert.equal(await h.go(['new', 'claude', '--cwd', '/w', '--', '--model', 'x']), 3);
  assert.deepEqual(h.calls[0], ['start', { agent: 'claude', cwd: '/w', args: ['--model', 'x'] }]);
  assert.equal(h.out().trim(), 'new111');
  assert.deepEqual(h.spawned[0], ['tmux', ['-L', 'suffice', 'attach', '-t', 'sfx-new111'], { stdio: 'inherit' }]);
});
test('new --detach does not spawn', async () => {
  const h = harness(); assert.equal(await h.go(['new', 'codex', '--detach']), 0);
  assert.equal(h.spawned.length, 0);
});
test('attach by unique prefix and exits with child code', async () => {
  const h = harness({ code: 5 });
  assert.equal(await h.go(['attach', 'abc']), 5);
  assert.deepEqual(h.spawned[0][1], ['-L', 'suffice', 'attach', '-t', 'sfx-abc123']);
});
test('attach ambiguous prefix lists matches, exit 2, no spawn', async () => {
  const h = harness(); assert.equal(await h.go(['attach', 'ab']), 2);
  assert.match(h.err(), /ambiguous/); assert.match(h.err(), /abc123/); assert.match(h.err(), /abd999/);
  assert.equal(h.spawned.length, 0);
});
test('attach with no id: one session attaches, several exit 2', async () => {
  const one = harness({ list: [mk('only1', 'claude', '/a', 1)] });
  assert.equal(await one.go(['attach']), 0); assert.equal(one.spawned.length, 1);
  const many = harness(); assert.equal(await many.go(['attach']), 2);
  assert.equal(many.spawned.length, 0); assert.match(many.err(), /abc123/);
});
test('unknown prefix is an error (1)', async () => {
  const h = harness(); assert.equal(await h.go(['stop', 'zzz']), 1); assert.match(h.err(), /no session matches/);
});
test('send joins text, stop, screen', async () => {
  const h = harness();
  assert.equal(await h.go(['send', 'abc1', 'hello', 'there']), 0);
  assert.equal(await h.go(['stop', 'abc1']), 0);
  assert.equal(await h.go(['screen', 'abc1']), 0);
  assert.deepEqual(h.calls, [['send', 'abc123', 'hello there'], ['stop', 'abc123'], ['screen', 'abc123']]);
  assert.equal(h.out(), 'hello\nworld\n');
});
test('history filters, --json valid, merges agents when none given', async () => {
  const h = harness();
  await h.go(['history', '--json']);
  assert.equal(JSON.parse(h.out())[0].sessionId, 's1');
  assert.deepEqual(h.calls.map((c) => c[1].agent), ['claude', 'codex']);
  const t = harness(); await t.go(['history', '--agent', 'claude', '--cwd', '/home/u/x']);
  assert.match(t.out(), /s1\s+~\/x\s+5s\s+fix it/);
  assert.deepEqual(t.calls[0][1], { agent: 'claude', cwd: '/home/u/x' });
});
test('resume starts with resume args and attaches', async () => {
  const h = harness(); assert.equal(await h.go(['resume', 'claude', 'sid1', '--cwd', '/w']), 0);
  assert.deepEqual(h.calls[0], ['resume', { agent: 'claude', sessionId: 'sid1', cwd: '/w' }]);
  assert.equal(h.spawned[0][1].at(-1), 'sfx-res222');
});
test('usage errors exit 2 to stderr; backend errors exit 1', async () => {
  for (const argv of [[], ['bogus'], ['send', 'abc1'], ['ls', '--nope'], ['new']]) {
    const h = harness(); assert.equal(await h.go(argv), 2, argv.join(' ')); assert.match(h.err(), /usage/); assert.equal(h.out(), '');
  }
  let e = '';
  const r = await run(['new', 'nope'], { sessions: { start: async () => { throw new TypeError('unknown agent nope'); } }, stdout: { write() {} }, stderr: { write: (x) => (e += x) }, home: '/h' });
  assert.equal(r, 1); assert.match(e, /unknown agent/);
});
