import test from 'node:test';
import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHistory } from '../src/history/index.mjs';
import { createSlots } from '../src/slots/index.mjs';
import { createViewRegistry } from '../src/views/index.mjs';

const clock = { now: () => 1_700_000_000_000 };
const T = (n) => new Date(1_700_000_000_000 + n * 1000).toISOString();
const jl = (...o) => o.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n') + '\n';
const mk = () => nodeFs.mkdtempSync(path.join(os.tmpdir(), 'hist-'));
function put(file, text, mtimeSec) {
  nodeFs.mkdirSync(path.dirname(file), { recursive: true });
  nodeFs.writeFileSync(file, text);
  nodeFs.utimesSync(file, mtimeSec, mtimeSec);
}
const claudeFile = (home, proj, id, cwd, userText, mtime) => put(path.join(home, '.claude/projects', proj, `${id}.jsonl`), jl(
  { type: 'summary', note: 'x' },
  { type: 'user', uuid: 'u1', timestamp: T(1), cwd, message: { content: userText } },
  { type: 'assistant', uuid: 'a1', timestamp: T(2), message: { content: [{ type: 'text', text: 'reply one' }, { type: 'tool_use', name: 'Bash', input: { c: 'ls' } }] } },
), mtime);
const codexFile = (home, id, cwd, userText, mtime) => put(path.join(home, '.codex/sessions/2026/11/01', `rollout-2026-11-01T00-00-00-${id}.jsonl`), jl(
  { type: 'session_meta', payload: { id, cwd, timestamp: T(5) } },
  { type: 'response_item', timestamp: T(6), payload: { type: 'message', role: 'user', content: [{ text: '<env>ignored</env>' }] } },
  { type: 'response_item', timestamp: T(7), payload: { type: 'message', role: 'user', content: [{ text: userText }] } },
  'not json {{{',
  { type: 'response_item', timestamp: T(8), payload: { type: 'message', role: 'assistant', content: [{ text: 'codex reply' }] } },
), mtime);
function opencodeDb(home, rows) {
  const f = path.join(home, '.local/share/opencode/opencode.db');
  nodeFs.mkdirSync(path.dirname(f), { recursive: true });
  const db = new DatabaseSync(f);
  db.exec(`CREATE TABLE session (id text primary key, directory text, time_created integer, time_updated integer);
    CREATE TABLE message (id text primary key, session_id text, time_created integer, time_updated integer, data text);
    CREATE TABLE part (id text primary key, message_id text, session_id text, time_created integer, time_updated integer, data text);`);
  for (const r of rows) {
    db.prepare('INSERT INTO session VALUES (?,?,?,?)').run(r.id, r.cwd, r.created, r.updated);
    db.prepare('INSERT INTO message VALUES (?,?,?,?,?)').run(`${r.id}-m1`, r.id, r.created, r.created, JSON.stringify({ role: 'user' }));
    db.prepare('INSERT INTO part VALUES (?,?,?,?,?,?)').run(`${r.id}-p1`, `${r.id}-m1`, r.id, r.created, r.created, JSON.stringify({ type: 'text', text: r.text }));
    db.prepare('INSERT INTO message VALUES (?,?,?,?,?)').run(`${r.id}-m2`, r.id, r.created + 1, r.created + 1, JSON.stringify({ role: 'assistant' }));
    db.prepare('INSERT INTO part VALUES (?,?,?,?,?,?)').run(`${r.id}-p2`, `${r.id}-m2`, r.id, r.created + 1, r.created + 1, JSON.stringify({ type: 'text', text: 'oc reply' }));
    db.prepare('INSERT INTO part VALUES (?,?,?,?,?,?)').run(`${r.id}-p3`, `${r.id}-m2`, r.id, r.created + 1, r.created + 1, JSON.stringify({ type: 'tool', tool: 'bash', state: { input: { c: 'ls' }, output: 'ok' } }));
  }
  db.close();
}
function seed() {
  const home = mk();
  claudeFile(home, '-proj-a', 'aaaaaaaa-0000-0000-0000-000000000001', '/proj/a', '  Fix the\n  login   bug  ', 1_700_000_100);
  claudeFile(home, '-proj-b', 'aaaaaaaa-0000-0000-0000-000000000002', '/proj/b', 'Write docs for parser', 1_700_000_200);
  codexFile(home, 'bbbbbbbb-0000-0000-0000-000000000003', '/proj/c', 'Refactor the scheduler', 1_700_000_300);
  opencodeDb(home, [{ id: 'ses_1', cwd: '/proj/d', created: 1_700_000_000_000, updated: 1_700_000_400_000, text: 'Add retry logic' }]);
  return home;
}

test('each source lists and reads a synthetic home', async () => {
  const home = seed();
  const h = createHistory({ home, clock });
  assert.deepEqual(await h.scan(), { added: 4, updated: 0, unchanged: 0, removed: 0 });
  const all = h.list({});
  assert.deepEqual(all.map((e) => e.source), ['opencode', 'codex', 'claude-code', 'claude-code']);
  const by = (s) => all.find((e) => e.source === s);
  assert.equal(by('codex').title, 'Refactor the scheduler'); // injected '<env>' message skipped
  assert.equal(by('codex').cwd, '/proj/c');
  assert.equal(by('opencode').title, 'Add retry logic');
  assert.equal(by('opencode').cwd, '/proj/d');
  assert.equal(by('opencode').messageCount, 2);
  const cc = all.find((e) => e.cwd === '/proj/a');
  assert.equal(cc.title, 'Fix the login bug');
  assert.equal(cc.sessionId, 'aaaaaaaa-0000-0000-0000-000000000001');
  const m = await h.read(cc);
  assert.deepEqual(m.map((x) => [x.role, x.text]), [['user', '  Fix the\n  login   bug  '], ['assistant', 'reply one'], ['tool', '']]);
  assert.equal(m[2].tool.name, 'Bash');
  assert.deepEqual((await h.read(by('codex'))).map((x) => [x.role, x.text]), [['user', 'Refactor the scheduler'], ['assistant', 'codex reply']]); // bad line skipped
  const oc = await h.read(by('opencode'));
  assert.deepEqual(oc.map((x) => [x.role, x.text]), [['user', 'Add retry logic'], ['assistant', 'oc reply'], ['tool', '']]);
  assert.equal(oc[2].tool.output, 'ok');
});

test('title is capped at 80 chars; stubs are not detected', async () => {
  const home = mk();
  claudeFile(home, '-p', 'aaaaaaaa-0000-0000-0000-000000000009', '/p', 'x'.repeat(200), 1_700_000_100);
  const h = createHistory({ home, clock });
  await h.scan();
  assert.equal(h.list({})[0].title.length, 80);
  const info = await h.sources();
  assert.deepEqual(info.map((s) => [s.id, s.detected, s.count]), [['claude-code', true, 1], ['codex', false, 0], ['opencode', false, 0], ['claude-desktop', false, 0], ['cursor', false, 0]]);
});

function spyFs(home) {
  const opened = [], reads = [];
  const fds = new Map();
  const fs = {
    ...nodeFs,
    openSync: (p, ...a) => { const fd = nodeFs.openSync(p, ...a); fds.set(fd, p); opened.push(p); return fd; },
    readSync: (fd, buf, off, len, pos) => { const n = nodeFs.readSync(fd, buf, off, len, pos); reads.push({ p: fds.get(fd), len, n }); return n; },
    readFileSync: (p, ...a) => { if (String(p).endsWith('.jsonl')) throw new Error('whole-file read of a transcript'); return nodeFs.readFileSync(p, ...a); },
  };
  return { fs, opened, reads };
}

test('incremental scan skips unchanged files and picks up appended ones', async () => {
  const home = seed();
  const { fs, opened } = spyFs(home);
  const h = createHistory({ fs, home, clock });
  await h.scan();
  const first = opened.filter((p) => p.endsWith('.jsonl')).length;
  assert.equal(first, 3);
  opened.length = 0;
  assert.deepEqual(await h.scan(), { added: 0, updated: 0, unchanged: 4, removed: 0 });
  assert.equal(opened.filter((p) => p.endsWith('.jsonl')).length, 0);
  // a fresh instance reuses the on-disk index
  const h2 = createHistory({ fs, home, clock });
  assert.deepEqual(await h2.scan(), { added: 0, updated: 0, unchanged: 4, removed: 0 });
  assert.equal(opened.filter((p) => p.endsWith('.jsonl')).length, 0);
  // append to one file + add a new one + delete one
  const f = path.join(home, '.claude/projects/-proj-a/aaaaaaaa-0000-0000-0000-000000000001.jsonl');
  nodeFs.appendFileSync(f, jl({ type: 'user', uuid: 'u2', timestamp: T(9), message: { content: 'more' } }));
  nodeFs.utimesSync(f, 1_700_000_900, 1_700_000_900);
  claudeFile(home, '-proj-e', 'aaaaaaaa-0000-0000-0000-000000000005', '/proj/e', 'new one', 1_700_000_050);
  nodeFs.rmSync(path.join(home, '.claude/projects/-proj-b/aaaaaaaa-0000-0000-0000-000000000002.jsonl'));
  assert.deepEqual(await h2.scan(), { added: 1, updated: 1, unchanged: 2, removed: 1 });
  assert.equal(opened.filter((p) => p.endsWith('.jsonl')).length, 2);
  assert.equal(h2.list({})[0].updatedAt, 1_700_000_900_000); // the appended file is newest
  assert.equal(h2.list({ source: 'claude-code' })[0].cwd, '/proj/a');
});

test('a 5 MB file is scanned and read in bounded chunks, never whole', async () => {
  const home = mk();
  const big = path.join(home, '.claude/projects/-big/aaaaaaaa-0000-0000-0000-00000000000b.jsonl');
  const line = jl({ type: 'user', uuid: 'u', timestamp: T(1), cwd: '/big', message: { content: 'hello ' + 'y'.repeat(900) } });
  const body = [jl({ type: 'user', uuid: 'u0', timestamp: T(0), cwd: '/big', message: { content: 'head question' } }), line.repeat(Math.ceil(5_000_000 / line.length))];
  body.push('{"type":"user","message":{"content":"' + 'z'.repeat(2_000_000) + '"}}\n'); // oversize line: dropped
  body.push(jl({ type: 'assistant', uuid: 'last', timestamp: T(3), message: { content: [{ type: 'text', text: 'tail' }] } }));
  put(big, body.join(''), 1_700_000_100);
  const size = nodeFs.statSync(big).size;
  assert.ok(size > 5_000_000);
  const { fs, reads } = spyFs(home);
  const h = createHistory({ fs, home, clock });
  await h.scan();
  const scanned = reads.filter((r) => r.p === big);
  assert.ok(scanned.reduce((a, r) => a + r.n, 0) <= 262144, 'scan read only the head');
  assert.equal(h.list({})[0].title, 'head question');
  reads.length = 0;
  const msgs = await h.read(h.list({})[0]);
  assert.ok(reads.every((r) => r.len <= 65536), 'every read is one small chunk');
  assert.ok(reads.reduce((a, r) => a + r.n, 0) >= size - 1);
  assert.equal(msgs.at(-1).text, 'tail');
  assert.ok(!msgs.some((m) => m.text.startsWith('zzzz')), 'oversize line skipped');
  assert.ok(msgs.length > 4000);
});

test('list, search and paging', async () => {
  const home = seed();
  const h = createHistory({ home, clock });
  await h.scan();
  assert.deepEqual(h.search('LOGIN').map((e) => e.cwd), ['/proj/a']);
  assert.deepEqual(h.search('/proj/c').map((e) => e.source), ['codex']);
  assert.deepEqual(h.search('zzz-nothing'), []);
  assert.deepEqual(h.list({ limit: 2 }).map((e) => e.cwd), ['/proj/d', '/proj/c']);
  assert.deepEqual(h.list({ limit: 2, offset: 2 }).map((e) => e.cwd), ['/proj/b', '/proj/a']);
  assert.deepEqual(h.list({ cwd: '/proj/b' }).length, 1);
  assert.deepEqual(h.list({ source: 'codex', query: 'sched' }).length, 1);
  assert.deepEqual(h.list({ source: 'codex', query: 'login' }).length, 0);
  assert.equal(h.list({})[0].sig, undefined);
  assert.deepEqual((await h.scan({ sources: ['codex'] })).unchanged, 1);
});

test('slots: history:list capped at 500 and history:sources', async () => {
  const home = mk();
  for (let i = 0; i < 520; i++) claudeFile(home, '-many', `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, '0')}`, '/m', `q${i}`, 1_700_000_000 + i);
  const slots = createSlots({ clock });
  const h = createHistory({ home, clock, slots });
  assert.deepEqual(slots.read('history:list').value, []);
  await h.scan();
  const v = slots.read('history:list').value;
  assert.equal(v.length, 500);
  assert.equal(v[0].title, 'q519');
  const s = slots.read('history:sources').value;
  assert.deepEqual(s.find((x) => x.id === 'claude-code'), { id: 'claude-code', label: 'Claude Code', detected: true, count: 520 });
  assert.equal(s.find((x) => x.id === 'codex').detected, false);
});

test('viewSpec validates and binds to history:list', () => {
  const spec = createHistory({ home: mk(), clock }).viewSpec();
  assert.equal(spec.slot, 'history:list');
  assert.deepEqual(createViewRegistry().validate(spec), { ok: true, errors: [] });
  assert.equal(createViewRegistry().validate({ ...spec, fields: {} }).ok, false);
});
