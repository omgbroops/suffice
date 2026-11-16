import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSessionMeta } from '../src/sessionmeta/index.mjs';

const mkClock = (t = 1000) => ({ now: () => t, adv: (ms) => { t += ms; } });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-meta-'));
const PRICES = { 'm-a': { input: 3, output: 15 }, 'm-b': { input: 1, output: 2 } };
function mk(extra = {}) {
  const clock = mkClock();
  const m = createSessionMeta({ clock, prices: PRICES, ...extra });
  return { clock, m };
}
// fake git: map of "args joined" -> result; records calls
function fakeExec(map, calls = []) {
  const fn = async (cmd, args, opts) => {
    calls.push({ cmd, args, cwd: opts?.cwd });
    const k = args.join(' ');
    const r = typeof map === 'function' ? map(k, opts) : map[k];
    if (r instanceof Error) throw r;
    if (r === undefined || r === null) return { code: 128, stdout: '', stderr: 'fatal: not a git repository', timedOut: false };
    return { code: 0, stdout: r, stderr: '', timedOut: false };
  };
  fn.calls = calls;
  return fn;
}
const GIT = { 'rev-parse --show-toplevel': '/w/proj\n', 'rev-parse --abbrev-ref HEAD': 'feat/x\n', 'status --porcelain': ' M a.js\n?? b.js\n', 'rev-parse HEAD': 'abc123\n' };

// ---------- construction
test('requires a clock', () => assert.throws(() => createSessionMeta({}), /clock/));
test('exec must be a function', () => assert.throws(() => createSessionMeta({ clock: mkClock(), exec: {} }), /exec/));
test('budget needs check', () => assert.throws(() => createSessionMeta({ clock: mkClock(), budget: {} }), /check/));
test('session id must be non-empty string', () => { const { m } = mk(); assert.throws(() => m.noteState('', 'working'), TypeError); assert.throws(() => m.totals(5), TypeError); });

// ---------- 1 attention
test('waiting notification appears only after the 2 s debounce', () => {
  const { clock, m } = mk();
  m.noteState('a', 'working'); m.noteState('a', 'waiting_input');
  assert.deepEqual(m.attention(), []);
  clock.adv(1999); assert.equal(m.attention().length, 0);
  clock.adv(1); const q = m.attention();
  assert.equal(q.length, 1); assert.equal(q[0].sessionId, 'a'); assert.match(q[0].reason, /input/);
});
test('brief wait that resolves inside the debounce never notifies', () => {
  const { clock, m } = mk();
  m.noteState('a', 'waiting_input'); clock.adv(1000); m.noteState('a', 'working'); clock.adv(5000);
  assert.deepEqual(m.attention(), []);
});
test('one notification per transition into waiting, repeated state is ignored', () => {
  const { clock, m } = mk();
  m.noteState('a', 'waiting_input'); clock.adv(2000); assert.equal(m.tick().length, 1);
  m.noteState('a', 'waiting_input'); clock.adv(5000); assert.equal(m.tick().length, 0);
  assert.equal(m.attention().length, 1);
});
test('waiting then needs_permission in one spell stays one notification', () => {
  const { clock, m } = mk();
  m.noteState('a', 'waiting_input'); clock.adv(2000); m.tick();
  m.noteState('a', 'needs_permission'); clock.adv(3000);
  assert.equal(m.attention().length, 1);
});
test('a new spell after working notifies again', () => {
  const { clock, m } = mk();
  m.noteState('a', 'waiting_input'); clock.adv(2000); m.tick();
  m.noteState('a', 'working'); assert.equal(m.attention().length, 0);
  m.noteState('a', 'waiting_input'); clock.adv(2000);
  assert.equal(m.tick().length, 1);
});
test('needs_permission says permission', () => {
  const { clock, m } = mk(); m.noteState('a', 'needs_permission'); clock.adv(2000);
  assert.match(m.attention()[0].reason, /permission/);
});
test('non-waiting states never notify', () => {
  const { clock, m } = mk();
  for (const s of ['starting', 'working', 'exited', 'error']) { m.noteState('a', s); clock.adv(3000); }
  assert.deepEqual(m.attention(), []);
});
test('focused session gets no notification', () => {
  const { clock, m } = mk(); m.setFocused('a'); m.noteState('a', 'waiting_input'); clock.adv(3000);
  assert.deepEqual(m.attention(), []);
});
test('noteState focused option', () => {
  const { clock, m } = mk(); m.noteState('a', 'waiting_input', { focused: true }); clock.adv(3000);
  assert.deepEqual(m.attention(), []);
});
test('focusing drops an existing notification', () => {
  const { clock, m } = mk(); m.noteState('a', 'waiting_input'); clock.adv(2000); assert.equal(m.attention().length, 1);
  m.setFocused('a'); assert.equal(m.attention().length, 0);
});
test('unfocusing does not resurrect a dropped notification', () => {
  const { clock, m } = mk(); m.noteState('a', 'waiting_input'); clock.adv(2000); m.attention();
  m.setFocused('a'); m.setFocused('a', false); clock.adv(5000);
  assert.equal(m.attention().length, 0);
});
test('answer clears the notification', () => {
  const { clock, m } = mk(); m.noteState('a', 'waiting_input'); clock.adv(2000); assert.equal(m.attention().length, 1);
  m.answer('a'); assert.equal(m.attention().length, 0);
});
test('answer before debounce cancels the pending one', () => {
  const { clock, m } = mk(); m.noteState('a', 'waiting_input'); m.answer('a'); clock.adv(5000);
  assert.equal(m.attention().length, 0);
});
test('leaving waiting clears the queue entry', () => {
  const { clock, m } = mk(); m.noteState('a', 'waiting_input'); clock.adv(2000); m.attention();
  m.noteState('a', 'exited'); assert.equal(m.attention().length, 0);
});
test('queue is ordered oldest first', () => {
  const { clock, m } = mk();
  m.noteState('b', 'waiting_input'); clock.adv(500); m.noteState('a', 'waiting_input'); clock.adv(500); m.noteState('c', 'needs_permission');
  clock.adv(3000);
  assert.deepEqual(m.attention().map((n) => n.sessionId), ['b', 'a', 'c']);
});
test('attention event fires once on promotion', () => {
  const { clock, m } = mk(); const ev = []; m.on((e) => ev.push(e));
  m.noteState('a', 'waiting_input'); clock.adv(2000); m.tick(); m.tick(); m.attention();
  assert.equal(ev.filter((e) => e.type === 'attention').length, 1);
});
test('listener unsubscribe works and listener errors are contained', () => {
  const { clock, m } = mk(); const ev = [];
  m.on(() => { throw new Error('boom'); }); const off = m.on((e) => ev.push(e)); off();
  m.noteState('a', 'waiting_input'); clock.adv(2000); assert.equal(m.tick().length, 1); assert.equal(ev.length, 0);
});
test('custom debounce', () => {
  const { clock, m } = mk({ debounceMs: 100 }); m.noteState('a', 'waiting_input'); clock.adv(100);
  assert.equal(m.attention().length, 1);
});

// ---------- 2 totals
test('totals zero when unknown', () => {
  const { m } = mk();
  assert.deepEqual(m.totals('nope'), { input: 0, output: 0, cost: 0, program: null, byModel: {} });
  const all = m.totals(); assert.equal(all.input, 0); assert.deepEqual(all.byProgram, {}); assert.deepEqual(all.byModel, {});
});
test('per session totals and cost from price table', () => {
  const { m } = mk();
  m.recordUsage('a', { program: 'claude', model: 'm-a', inputTokens: 1_000_000, outputTokens: 100_000 });
  const t = m.totals('a'); assert.equal(t.input, 1_000_000); assert.equal(t.output, 100_000);
  assert.ok(Math.abs(t.cost - 4.5) < 1e-9);
});
test('usage accumulates', () => {
  const { m } = mk();
  m.recordUsage('a', { program: 'claude', model: 'm-a', inputTokens: 10, outputTokens: 5 });
  m.recordUsage('a', { program: 'claude', model: 'm-a', inputTokens: 20, outputTokens: 5 });
  assert.equal(m.totals('a').input, 30); assert.equal(m.totals('a').output, 10);
});
test('unknown model counts tokens with zero cost', () => {
  const { m } = mk(); m.recordUsage('a', { program: 'claude', model: 'mystery', inputTokens: 100, outputTokens: 50 });
  assert.equal(m.totals('a').cost, 0); assert.equal(m.totals('a').input, 100);
});
test('negative, NaN and missing token values count as zero', () => {
  const { m } = mk(); m.recordUsage('a', { inputTokens: -5, outputTokens: NaN }); m.recordUsage('a');
  assert.equal(m.totals('a').input, 0); assert.equal(m.totals('a').output, 0);
});
test('per model breakdown within a session', () => {
  const { m } = mk();
  m.recordUsage('a', { program: 'claude', model: 'm-a', inputTokens: 1000, outputTokens: 0 });
  m.recordUsage('a', { program: 'claude', model: 'm-b', inputTokens: 2000, outputTokens: 0 });
  const t = m.totals('a'); assert.equal(t.byModel['m-a'].input, 1000); assert.equal(t.byModel['m-b'].input, 2000);
});
test('across sessions: sum, byProgram, byModel, bySession', () => {
  const { m } = mk();
  m.recordUsage('a', { program: 'claude', model: 'm-a', inputTokens: 1_000_000, outputTokens: 0 });
  m.recordUsage('b', { program: 'codex', model: 'm-b', inputTokens: 1_000_000, outputTokens: 1_000_000 });
  m.recordUsage('c', { program: 'claude', model: 'm-a', inputTokens: 1_000_000, outputTokens: 0 });
  const t = m.totals();
  assert.equal(t.input, 3_000_000); assert.equal(t.output, 1_000_000);
  assert.ok(Math.abs(t.cost - 9) < 1e-9, `cost ${t.cost}`);
  assert.equal(t.byProgram.claude.input, 2_000_000); assert.equal(t.byProgram.codex.output, 1_000_000);
  assert.equal(t.byModel['m-a'].input, 2_000_000); assert.equal(t.byModel['m-b'].output, 1_000_000);
  assert.deepEqual(Object.keys(t.bySession).sort(), ['a', 'b', 'c']);
});
test('program defaults to unknown', () => {
  const { m } = mk(); m.recordUsage('a', { model: 'm-a', inputTokens: 1 });
  assert.ok('unknown' in m.totals().byProgram);
});
test('totals returns copies, not live state', () => {
  const { m } = mk(); m.recordUsage('a', { model: 'm-a', inputTokens: 5 });
  m.totals('a').byModel['m-a'].input = 999; assert.equal(m.totals('a').byModel['m-a'].input, 5);
});
test('empty price table gives zero cost', () => {
  const m = createSessionMeta({ clock: mkClock() }); m.recordUsage('a', { model: 'm-a', inputTokens: 1e6 });
  assert.equal(m.totals('a').cost, 0);
});

// ---------- 3 budget
const mkBudget = () => { const b = { allow: true, calls: [], check(n, tags) { b.calls.push({ n, tags }); return b.allow ? { allow: true, remaining: 100 } : { allow: false, reason: 'Daily token limit reached (1000 of 1000).', remaining: 0 }; } }; return b; };
test('no budget event while under limit', () => {
  const b = mkBudget(); const { m } = mk({ budget: b }); const ev = []; m.on((e) => ev.push(e));
  m.recordUsage('a', { model: 'm-a', inputTokens: 10 }); assert.equal(ev.filter((e) => e.type === 'budget').length, 0);
  assert.equal(b.calls.length, 1);
});
test('budget event with plain-words reason when check refuses', () => {
  const b = mkBudget(); const { m } = mk({ budget: b }); const ev = []; m.on((e) => ev.push(e));
  m.recordUsage('a', { model: 'm-a', inputTokens: 10 }); b.allow = false; m.recordUsage('a', { model: 'm-a', inputTokens: 10 });
  const be = ev.filter((e) => e.type === 'budget'); assert.equal(be.length, 1);
  assert.match(be[0].reason, /limit/); assert.equal(be[0].sessionId, 'a'); assert.equal(be[0].totalTokens, 20);
});
test('budget event fires once per crossing, re-arms after recovery', () => {
  const b = mkBudget(); const { m } = mk({ budget: b }); const ev = []; m.on((e) => ev.push(e));
  b.allow = false; m.recordUsage('a', { inputTokens: 1 }); m.recordUsage('a', { inputTokens: 1 });
  b.allow = true; m.recordUsage('a', { inputTokens: 1 }); b.allow = false; m.recordUsage('a', { inputTokens: 1 });
  assert.equal(ev.filter((e) => e.type === 'budget').length, 2);
});
test('budget never stops a session: no stop calls, recording continues', () => {
  const b = mkBudget(); b.allow = false; const { m } = mk({ budget: b });
  m.recordUsage('a', { model: 'm-a', inputTokens: 7 }); m.recordUsage('a', { model: 'm-a', inputTokens: 7 });
  assert.equal(m.totals('a').input, 14);
});
test('a throwing budget is ignored', () => {
  const { m } = mk({ budget: { check() { throw new Error('x'); } } });
  assert.doesNotThrow(() => m.recordUsage('a', { inputTokens: 1 }));
});
test('budget reason falls back to plain words', () => {
  const { m } = mk({ budget: { check: () => ({ allow: false, remaining: 0 }) } }); const ev = []; m.on((e) => ev.push(e));
  m.recordUsage('a', { inputTokens: 1 }); assert.match(ev[0].reason, /budget/i);
});

// ---------- 4 workspace
test('workspace facts for a git folder', async () => {
  const { m } = mk({ exec: fakeExec(GIT) });
  const f = await m.startSession('a', { folder: '/w/proj' });
  assert.equal(f.branch, 'feat/x'); assert.equal(f.worktree, '/w/proj'); assert.equal(f.dirty, 2); assert.equal(f.folder, '/w/proj'); assert.equal(f.isGit, true);
});
test('workspace uses the session folder as cwd', async () => {
  const ex = fakeExec(GIT); const { m } = mk({ exec: ex });
  await m.startSession('a', { folder: '/w/proj' });
  assert.ok(ex.calls.length >= 3 && ex.calls.every((c) => c.cmd === 'git' && c.cwd === '/w/proj'));
});
test('non-git folder gives nulls, not a throw', async () => {
  const { m } = mk({ exec: fakeExec({}) });
  const f = await m.startSession('a', { folder: '/nowhere' });
  assert.deepEqual([f.branch, f.worktree, f.dirty, f.startCommit, f.isGit], [null, null, null, null, false]); assert.equal(f.folder, '/nowhere');
});
test('exec that throws gives nulls', async () => {
  const { m } = mk({ exec: fakeExec(() => new Error('spawn ENOENT')) });
  const f = await m.startSession('a', { folder: '/x' }); assert.equal(f.branch, null);
});
test('no folder or no exec gives nulls', async () => {
  const { m } = mk(); const f = await m.workspace('a'); assert.equal(f.folder, null); assert.equal(f.dirty, null);
  const m2 = createSessionMeta({ clock: mkClock() }); assert.equal((await m2.startSession('b', { folder: '/x' })).branch, null);
});
test('workspace is cached until refresh is asked', async () => {
  let dirty = ' M a\n'; const ex = fakeExec((k) => (k === 'status --porcelain' ? dirty : GIT[k]));
  const { m } = mk({ exec: ex }); await m.startSession('a', { folder: '/w/proj' });
  dirty = ' M a\n M b\n M c\n'; const n = ex.calls.length;
  assert.equal((await m.workspace('a')).dirty, 1); assert.equal(ex.calls.length, n);
  assert.equal((await m.workspace('a', { refresh: true })).dirty, 3);
});
test('branch change shows after refresh and start commit stays', async () => {
  let br = 'main\n'; const ex = fakeExec((k) => (k === 'rev-parse --abbrev-ref HEAD' ? br : k === 'rev-parse HEAD' ? 'abc\n' : GIT[k]));
  const { m } = mk({ exec: ex }); await m.startSession('a', { folder: '/w/proj' });
  br = 'other\n'; const f = await m.workspace('a', { refresh: true });
  assert.equal(f.branch, 'other'); assert.equal(f.startCommit, 'abc');
});
test('clean tree counts zero dirty', async () => {
  const { m } = mk({ exec: fakeExec({ ...GIT, 'status --porcelain': '' }) });
  assert.equal((await m.startSession('a', { folder: '/w/proj' })).dirty, 0);
});
test('detached or unborn HEAD with failing branch call keeps other facts', async () => {
  const { m } = mk({ exec: fakeExec({ ...GIT, 'rev-parse --abbrev-ref HEAD': undefined }) });
  const f = await m.startSession('a', { folder: '/w/proj' }); assert.equal(f.branch, null); assert.equal(f.worktree, '/w/proj');
});

// ---------- 5 changed files
const DIFFMAP = { ...GIT, 'diff --numstat abc123': '10\t2\ta.js\n-\t-\timg.png\n3\t0\tdir/c.js\n', 'status --porcelain': ' M a.js\n?? b.js\n D dir/c.js\n M img.png\n' };
test('changed files merge numstat against start commit and status', async () => {
  const { m } = mk({ exec: fakeExec(DIFFMAP) }); await m.startSession('a', { folder: '/w/proj' });
  const f = await m.changedFiles('a');
  assert.deepEqual(f.map((x) => x.path), ['a.js', 'b.js', 'dir/c.js', 'img.png']);
  const by = Object.fromEntries(f.map((x) => [x.path, x]));
  assert.deepEqual([by['a.js'].added, by['a.js'].removed, by['a.js'].status], [10, 2, 'modified']);
  assert.equal(by['b.js'].status, 'untracked'); assert.equal(by['dir/c.js'].status, 'deleted'); assert.equal(by['dir/c.js'].added, 3);
});
test('binary files count zero lines', async () => {
  const { m } = mk({ exec: fakeExec(DIFFMAP) }); await m.startSession('a', { folder: '/w/proj' });
  const img = (await m.changedFiles('a')).find((x) => x.path === 'img.png'); assert.deepEqual([img.added, img.removed], [0, 0]);
});
test('changed files uses the start commit recorded at session start', async () => {
  const ex = fakeExec(DIFFMAP); const { m } = mk({ exec: ex }); await m.startSession('a', { folder: '/w/proj' });
  await m.changedFiles('a'); assert.ok(ex.calls.some((c) => c.args.join(' ') === 'diff --numstat abc123'));
});
test('changed files empty for non-git folder', async () => {
  const { m } = mk({ exec: fakeExec({}) }); await m.startSession('a', { folder: '/x' }); assert.deepEqual(await m.changedFiles('a'), []);
});
test('changed files empty for unknown session', async () => {
  const { m } = mk({ exec: fakeExec(GIT) }); assert.deepEqual(await m.changedFiles('zzz'), []);
});
test('rename in porcelain uses the new path', async () => {
  const { m } = mk({ exec: fakeExec({ ...GIT, 'status --porcelain': 'R  old.js -> new.js\n' }) }); await m.startSession('a', { folder: '/w/proj' });
  assert.deepEqual((await m.changedFiles('a')).map((x) => x.path), ['new.js']);
});
test('no changes gives an empty list', async () => {
  const { m } = mk({ exec: fakeExec({ ...GIT, 'status --porcelain': '' }) }); await m.startSession('a', { folder: '/w/proj' });
  assert.deepEqual(await m.changedFiles('a'), []);
});

// ---------- 6 fork point
const ITEMS = [
  { role: 'user', text: 'make a parser' }, { role: 'assistant', text: 'done, see parse.js' }, { role: 'tool', text: 'ls' },
  { role: 'user', text: 'now add tests' }, { role: 'assistant', text: 'added' },
];
const SESS = { program: 'claude', folder: '/w/proj', model: 'm-a' };
test('fork record carries program, folder, model', () => {
  const r = m0().forkPoint(SESS, ITEMS, 1); assert.deepEqual([r.program, r.folder, r.model], ['claude', '/w/proj', 'm-a']);
});
function m0() { return mk().m; }
test('fork prompt summarises messages up to and including the index', () => {
  const r = m0().forkPoint(SESS, ITEMS, 3);
  assert.match(r.prompt, /User: make a parser/); assert.match(r.prompt, /Assistant: done, see parse.js/); assert.match(r.prompt, /User: now add tests/);
  assert.doesNotMatch(r.prompt, /added/); assert.equal(r.messageCount, 3); assert.equal(r.fromIndex, 3);
});
test('fork skips tool items and empty text', () => {
  const r = m0().forkPoint(SESS, [...ITEMS.slice(0, 3), { role: 'user', text: '  ' }, ITEMS[3]], 4);
  assert.doesNotMatch(r.prompt, /\bls\b/); assert.equal(r.messageCount, 3);
});
test('fork at index 0', () => assert.equal(m0().forkPoint(SESS, ITEMS, 0).messageCount, 1));
test('fork rejects out-of-range index', () => {
  for (const i of [-1, 5, 1.5, NaN, '1']) assert.throws(() => m0().forkPoint(SESS, ITEMS, i), RangeError);
});
test('fork rejects bad inputs', () => { assert.throws(() => m0().forkPoint(null, ITEMS, 0), TypeError); assert.throws(() => m0().forkPoint(SESS, 'x', 0), TypeError); });
test('fork does not mutate items and returns plain data', () => {
  const copy = structuredClone(ITEMS); const r = m0().forkPoint(SESS, ITEMS, 4);
  assert.deepEqual(ITEMS, copy); assert.doesNotThrow(() => JSON.stringify(r));
});
test('fork missing session fields become null', () => assert.equal(m0().forkPoint({}, ITEMS, 0).model, null));

// ---------- 7 organisation
test('pin, rename, archive defaults and info', () => {
  const { m } = mk(); assert.deepEqual(m.info('a'), { pinned: false, name: null, archived: false });
  m.pin('a'); m.rename('a', '  My run '); m.archive('a');
  assert.deepEqual(m.info('a'), { pinned: true, name: 'My run', archived: true });
  m.pin('a', false); m.archive('a', false); assert.equal(m.info('a').pinned, false); assert.equal(m.info('a').archived, false);
});
test('rename validates and null clears', () => {
  const { m } = mk(); assert.throws(() => m.rename('a', '   '), TypeError); assert.throws(() => m.rename('a', 5), TypeError);
  m.rename('a', 'x'); m.rename('a', null); assert.equal(m.info('a').name, null);
});
test('rename truncates very long names', () => { const { m } = mk(); assert.equal(m.rename('a', 'x'.repeat(500)).name.length, 120); });
test('group by project, pinned first, archived hidden', () => {
  const { m } = mk(); m.pin('s2'); m.archive('s3'); m.rename('s1', 'Renamed');
  const g = m.groupByProject([{ id: 's1', folder: '/w/b' }, { id: 's2', folder: '/w/b' }, { id: 's3', folder: '/w/a' }, { id: 's4', folder: '/w/a/' }, { id: 's5' }]);
  assert.deepEqual(g.map((x) => x.project), ['a', 'b', 'No folder']);
  const b = g.find((x) => x.project === 'b'); assert.deepEqual(b.sessions.map((s) => s.id), ['s2', 's1']); assert.equal(b.sessions[1].title, 'Renamed');
  assert.equal(g.find((x) => x.project === 'a').sessions.length, 1);
});
test('group can include archived', () => {
  const { m } = mk(); m.archive('s1'); assert.equal(m.groupByProject([{ id: 's1', folder: '/w/a' }], { includeArchived: true })[0].sessions.length, 1);
});
test('persisted to one JSON file and reloaded', () => {
  const dir = tmp(), file = path.join(dir, 'sub', 'meta.json');
  const a = createSessionMeta({ clock: mkClock(), file }); a.pin('x'); a.rename('x', 'Name'); a.saveTemplate({ name: 't', program: 'claude' });
  const b = createSessionMeta({ clock: mkClock(), file });
  assert.deepEqual(b.info('x'), { pinned: true, name: 'Name', archived: false }); assert.equal(b.listTemplates().length, 1);
});
test('atomic write leaves no temp file behind', () => {
  const dir = tmp(), file = path.join(dir, 'meta.json'); const m = createSessionMeta({ clock: mkClock(), file }); m.pin('x');
  assert.deepEqual(fs.readdirSync(dir), ['meta.json']);
});
test('save writes a temp file then renames it', () => {
  const dir = tmp(), file = path.join(dir, 'meta.json'); const log = [];
  const f = { ...fs, writeFileSync: (p, ...r) => { log.push(['write', p]); return fs.writeFileSync(p, ...r); }, renameSync: (a, b) => { log.push(['rename', a, b]); return fs.renameSync(a, b); } };
  createSessionMeta({ clock: mkClock(), file, fsImpl: f }).pin('x');
  assert.notEqual(log[0][1], file); assert.equal(log[0][0], 'write'); assert.deepEqual(log[1], ['rename', log[0][1], file]);
});
test('failed write keeps the old file intact', () => {
  const dir = tmp(), file = path.join(dir, 'meta.json'); createSessionMeta({ clock: mkClock(), file }).pin('x');
  const f = { ...fs, renameSync: () => { throw new Error('disk'); } };
  assert.throws(() => createSessionMeta({ clock: mkClock(), file, fsImpl: f }).pin('y'));
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).sessions.x.pinned, true);
});
test('corrupt file loads as empty without throwing', () => {
  const dir = tmp(), file = path.join(dir, 'meta.json'); fs.writeFileSync(file, '{not json');
  const m = createSessionMeta({ clock: mkClock(), file }); assert.equal(m.info('x').pinned, false); m.pin('x');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).sessions.x.pinned, true);
});
test('wrong-shaped JSON loads as empty', () => {
  const dir = tmp(), file = path.join(dir, 'meta.json');
  for (const body of ['null', '[]', '{"sessions":[1],"templates":"x"}', '42']) {
    fs.writeFileSync(file, body); const m = createSessionMeta({ clock: mkClock(), file });
    assert.equal(m.info('x').pinned, false); assert.deepEqual(m.listTemplates(), []);
  }
});
test('missing file loads as empty', () => assert.equal(createSessionMeta({ clock: mkClock(), file: path.join(tmp(), 'none.json') }).info('a').pinned, false));
test('forget removes a session record', () => { const { m } = mk(); m.pin('a'); m.forget('a'); assert.equal(m.info('a').pinned, false); });
test('reload picks up an external edit', () => {
  const dir = tmp(), file = path.join(dir, 'm.json'); const m = createSessionMeta({ clock: mkClock(), file });
  fs.writeFileSync(file, JSON.stringify({ sessions: { z: { pinned: true } } })); m.reload(); assert.equal(m.info('z').pinned, true);
});

// ---------- 8 templates
const T = { name: 'Review', program: 'claude', model: 'm-a', folder: '/w/proj', mode: 'plan' };
test('save and get template', () => { const { m } = mk(); m.saveTemplate(T); assert.deepEqual(m.getTemplate('Review'), T); });
test('template defaults: mode normal, model and folder null', () => {
  const { m } = mk(); assert.deepEqual(m.saveTemplate({ name: 'x', program: 'codex' }), { name: 'x', program: 'codex', model: null, folder: null, mode: 'normal' });
});
test('template validation errors', () => {
  const { m } = mk();
  for (const bad of [null, {}, { name: '', program: 'claude' }, { name: 'a', program: 'vim' }, { name: 'a', program: 'claude', mode: 'yolo' }, { name: 'a', program: 'claude', folder: 'rel/path' }, { name: 'a', program: 'claude', model: '' }]) {
    assert.equal(m.validateTemplate(bad).ok, false); assert.throws(() => m.saveTemplate(bad), TypeError);
  }
  assert.equal(m.listTemplates().length, 0);
});
test('validation lists every problem', () => assert.equal(mk().m.validateTemplate({ name: '', program: 'x', mode: 'y' }).errors.length, 3));
test('list sorted by name, remove returns whether it existed', () => {
  const { m } = mk(); m.saveTemplate({ name: 'b', program: 'claude' }); m.saveTemplate({ name: 'a', program: 'codex' });
  assert.deepEqual(m.listTemplates().map((t) => t.name), ['a', 'b']);
  assert.equal(m.removeTemplate('a'), true); assert.equal(m.removeTemplate('a'), false); assert.equal(m.getTemplate('a'), null);
});
test('saving a template with the same name replaces it', () => {
  const { m } = mk(); m.saveTemplate(T); m.saveTemplate({ ...T, mode: 'auto' }); assert.equal(m.listTemplates().length, 1); assert.equal(m.getTemplate('Review').mode, 'auto');
});
test('getTemplate returns a copy', () => { const { m } = mk(); m.saveTemplate(T); m.getTemplate('Review').mode = 'zzz'; assert.equal(m.getTemplate('Review').mode, 'plan'); });
test('custom programs and modes are injectable', () => {
  const { m } = mk({ programs: ['aider'], modes: ['fast'] });
  assert.equal(m.validateTemplate({ name: 'a', program: 'aider', mode: 'fast' }).ok, true); assert.equal(m.validateTemplate({ name: 'a', program: 'claude' }).ok, false);
});
test('template name is trimmed', () => { const { m } = mk(); assert.equal(m.saveTemplate({ name: ' x ', program: 'claude' }).name, 'x'); });
