import test from 'node:test';
import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  db.exec(`CREATE TABLE session (id text primary key, directory text, time_created integer, time_updated integer, parent_id text);
    CREATE TABLE message (id text primary key, session_id text, time_created integer, time_updated integer, data text);
    CREATE TABLE part (id text primary key, message_id text, session_id text, time_created integer, time_updated integer, data text);`);
  for (const r of rows) {
    db.prepare('INSERT INTO session VALUES (?,?,?,?,?)').run(r.id, r.cwd, r.created, r.updated, r.parent ?? null);
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
  assert.deepEqual(s.find((x) => x.id === 'claude-code'), { id: 'claude-code', label: 'Claude Code', detected: true, count: 520, kinds: { unknown: 520 } });
  assert.equal(s.find((x) => x.id === 'codex').detected, false);
});

test('viewSpec validates and binds to history:list', () => {
  const spec = createHistory({ home: mk(), clock }).viewSpec();
  assert.equal(spec.slot, 'history:list');
  assert.deepEqual(createViewRegistry().validate(spec), { ok: true, errors: [] });
  assert.equal(createViewRegistry().validate({ ...spec, fields: {} }).ok, false);
});

// ---- kinds ----
const rec = (o) => ({ type: 'user', uuid: 'u', timestamp: T(1), cwd: '/k', message: { content: 'hi' }, ...o });
const kindOf = async (rel, text, ...extra) => {
  const home = mk();
  put(path.join(home, '.claude/projects', rel), jl(...extra, rec({}), text ?? ''), 1_700_000_100);
  const h = createHistory({ home, clock });
  await h.scan();
  return h.list({ kinds: null })[0];
};
test('claude-code kind: entrypoint, human markers and sidechains', async () => {
  const f = 'p/aaaaaaaa-0000-0000-0000-00000000000k.jsonl';
  assert.equal((await kindOf(f, '', rec({ entrypoint: 'cli' }))).kind, 'interactive');
  assert.equal((await kindOf(f, '', rec({ entrypoint: 'sdk-cli', promptSource: 'sdk', turnOrigin: 'sdk' }))).kind, 'headless');
  assert.equal((await kindOf(f, '', rec({ entrypoint: 'sdk-cli', promptSource: 'sdk', origin: { kind: 'human' } }))).kind, 'interactive');
  assert.equal((await kindOf(f, '', rec({ entrypoint: 'claude-desktop', promptSource: 'sdk' }))).kind, 'unknown');
  assert.equal((await kindOf(f, '', rec({ entrypoint: 'claude-desktop', promptSource: 'typed' }))).kind, 'interactive');
  assert.equal((await kindOf(f, '', rec({ entrypoint: 'cli', isSidechain: true }))).kind, 'subagent');
  assert.equal((await kindOf('p/s/subagents/agent-1.jsonl', '', rec({ entrypoint: 'cli' }))).kind, 'subagent');
  assert.equal((await kindOf(f, '')).kind, 'unknown');
  const e = await kindOf(f, '', rec({ entrypoint: 'cli', isMeta: true, message: { content: 'meta' } }), rec({ message: { content: [{ type: 'tool_result', content: 'x' }] } }));
  assert.equal(e.typedMessages, 1); // meta and tool_result records are not typed messages
});

test('codex and opencode kinds; list/search/sources honour the kinds filter', async () => {
  const home = mk();
  const cx = (id, source, originator) => put(path.join(home, '.codex/sessions/2026/11/01', `rollout-x-${id}.jsonl`), jl(
    { type: 'session_meta', payload: { id, cwd: `/c/${id.slice(0, 4)}`, originator, source, timestamp: T(5) } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ text: `q ${id}` }] } }), 1_700_000_100);
  const U = (n) => `bbbbbbbb-0000-0000-0000-00000000000${n}`;
  cx(U(1), 'cli', 'codex_cli'); cx(U(2), 'exec', 'codex_exec'); cx(U(3), { subagent: { x: 1 } }, 'Codex Desktop'); cx(U(4), undefined, 'other');
  opencodeDb(home, [{ id: 'ses_a', cwd: '/o/a', created: 1, updated: 2, text: 'main' }, { id: 'ses_b', cwd: '/o/b', created: 1, updated: 2, text: 'child', parent: 'ses_a' }]);
  const h = createHistory({ home, clock });
  await h.scan();
  const all = h.list({ kinds: null });
  const k = (c) => all.find((e) => e.cwd === c).kind;
  assert.deepEqual([k('/c/bbbb'), all.filter((e) => e.source === 'codex').map((e) => e.kind).sort()], ['interactive', ['headless', 'interactive', 'subagent', 'unknown']]);
  assert.equal(k('/o/a'), 'unknown');
  assert.equal(k('/o/b'), 'subagent');
  assert.equal(all.find((e) => e.cwd === '/o/a').typedMessages, 1);
  assert.deepEqual(h.list({}).map((e) => e.kind).sort(), ['interactive', 'unknown', 'unknown']); // default hides headless + subagent
  assert.deepEqual(h.search('child').length, 0);
  assert.deepEqual(h.search('child', { kinds: ['subagent'] }).length, 1);
  assert.deepEqual(h.list({ kinds: ['headless'] }).map((e) => e.source), ['codex']);
  const info = await h.sources();
  assert.deepEqual(info.find((s) => s.id === 'codex').kinds, { interactive: 1, headless: 1, subagent: 1, unknown: 1 });
  assert.deepEqual(info.find((s) => s.id === 'opencode').kinds, { unknown: 1, subagent: 1 });
});

test('an index without kinds is rescanned once; a legacy v1 index file still loads', async () => {
  const home = seed();
  const idxPath = path.join(home, 'legacy.json');
  const h = createHistory({ home, clock, indexPath: idxPath });
  await h.scan();
  const lines = nodeFs.readFileSync(idxPath, 'utf8').trim().split('\n');
  assert.equal(JSON.parse(lines[0]).v, 2);
  const entries = Object.fromEntries(lines.slice(1).map((l) => { const e = JSON.parse(l); delete e.kind; delete e.typedMessages; return [e.path, e]; }));
  nodeFs.writeFileSync(idxPath, JSON.stringify({ v: 1, savedAt: 1, entries })); // old format, no kind fields
  const h2 = createHistory({ home, clock, indexPath: idxPath });
  assert.deepEqual(await h2.scan(), { added: 0, updated: 4, unchanged: 0, removed: 0 });
  assert.ok(h2.list({ kinds: null }).every((e) => e.kind && typeof e.typedMessages === 'number'));
});

// ---- memory ----
test('scanning 40,000 files stays under 150 MB of RSS growth (scan and rescan)', { timeout: 300_000 }, async () => {
  const home = mk();
  try {
    const pad = 'filler '.repeat(150); // ~1 KB of body per file; the scan must not hold or even read much more than the head
    for (let i = 0; i < 40_000; i++) {
      const dir = path.join(home, '.claude/projects', `-proj-${i % 300}`);
      if (i < 300) nodeFs.mkdirSync(dir, { recursive: true });
      nodeFs.writeFileSync(path.join(dir, `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000.jsonl`), jl(
        { type: 'user', uuid: 'u', timestamp: T(i), cwd: `/work/proj${i % 300}`, entrypoint: i % 3 ? 'sdk-cli' : 'cli', message: { content: `question ${i} about the thing` } },
        { type: 'assistant', message: { content: [{ type: 'text', text: pad }] } }));
    }
    // child process: its own high-water mark (process.resourceUsage().maxRSS, KB) measures the scan alone
    const mod = process.env.HISTORY_MODULE_FOR_TEST ?? new URL('../src/history/index.mjs', import.meta.url).href;
    const code = `import(${JSON.stringify(mod)}).then(async ({ createHistory }) => {
      const mb = () => process.resourceUsage().maxRSS / 1024, base = mb();
      const h = createHistory({ home: process.argv[1], clock: { now: Date.now }, indexPath: process.argv[2] });
      const a = await h.scan(), g1 = mb() - base, b = await h.scan();
      console.log(JSON.stringify({ a, b, g1, g2: mb() - base, kinds: (await h.sources())[0].kinds }));
    });`;
    const r = spawnSync(process.execPath, ['-e', code, home, path.join(home, 'idx.json')], { encoding: 'utf8', maxBuffer: 1 << 20 });
    assert.equal(r.status, 0, r.stderr);
    const o = JSON.parse(r.stdout);
    assert.equal(o.a.added, 40_000);
    assert.equal(o.b.unchanged, 40_000);
    assert.ok(o.g1 < 150, `scan grew RSS by ${o.g1.toFixed(0)} MB`);
    assert.ok(o.g2 < 150, `scan+rescan grew RSS by ${o.g2.toFixed(0)} MB`);
    assert.equal(o.kinds.interactive + (o.kinds.headless ?? 0), 40_000);
  } finally { nodeFs.rmSync(home, { recursive: true, force: true }); }
});

test('find: index hit and body-only hit carry snippets; non-matches stay out', async () => {
  const home = mk();
  claudeFile(home, 'p1', 's1', '/proj/a', 'fix the login redirect', 1_700_000_100);
  claudeFile(home, 'p2', 's2', '/proj/b', 'unrelated start', 1_700_000_200);
  const h = createHistory({ home, clock });
  await h.scan();
  const r = await h.find('login');
  assert.deepEqual(r.map((e) => e.cwd), ['/proj/a']);
  assert.match(r[0].snippet, /login redirect/);
  const body = await h.find('reply one'); // only in assistant bodies, not in the index
  assert.deepEqual(body.map((e) => e.cwd).sort(), ['/proj/a', '/proj/b']);
  assert.match(body[0].snippet, /reply one/);
  assert.deepEqual(await h.find('zzz-nothing'), []);
  assert.equal((await h.find('reply one', { deep: 1 })).length, 1);
});
