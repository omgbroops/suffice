// History import at scale: memory, speed, incremental rescan, progress/abort, search, robustness.
// Synthetic corpora are generated into temp dirs; the old implementation is frozen in fixtures/history-old for equivalence checks.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHistory } from '../src/history/index.mjs';
import { createHistory as createOld } from './fixtures/history-old/index.mjs';
import { genCorpus } from './fixtures/history-gen.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '../src/history');
const CHILD = path.join(here, 'fixtures/history-child.mjs');
const clock = { now: () => 1_700_000_000_000 };
const mkHome = (tag) => nodeFs.mkdtempSync(path.join(os.tmpdir(), `hist-scale-${tag}-`));
const hist = (home, extra = {}) => createHistory({ home, clock, ...extra });
const all = (h) => h.list({ limit: 1e9, kinds: null });
const timed = async (fn) => { const t = performance.now(); const r = await fn(); return [r, performance.now() - t]; };
const claudePath = (home, n) => path.join(home, '.claude/projects', `-proj-${n % 200}`, `s${n}.jsonl`);

const dirs = [];
let big, mid, small;
before(() => {
  big = mkHome('big'); mid = mkHome('mid'); small = mkHome('small'); dirs.push(big, mid, small);
  genCorpus(big, 40_000, { bigEvery: 1000 });
  genCorpus(mid, 3000, { headKB: 40, headless: true });
  genCorpus(small, 500, { bigEvery: 100 });
});
after(() => { for (const d of dirs) nodeFs.rmSync(d, { recursive: true, force: true }); });

// A fresh copy of a corpus so a test may mutate files.
const copyOf = (src, tag) => { const d = mkHome(tag); dirs.push(d); nodeFs.cpSync(src, d, { recursive: true, preserveTimestamps: true }); nodeFs.rmSync(path.join(d, '.suffice'), { recursive: true, force: true }); return d; };

// ---- 1. memory + 2. speed, measured in a child process ----
let cold;
const runChild = (src, home) => {
  nodeFs.rmSync(path.join(home, '.suffice'), { recursive: true, force: true });
  const r = spawnSync(process.execPath, ['--no-warnings', CHILD, src, home], { encoding: 'utf8', maxBuffer: 1 << 24 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop());
};
test('child scan of 40,000 files finishes', () => { cold = runChild(SRC, big); assert.equal(cold.total, 40_000); });
test('peak RSS stays under 150 MB on 40,000 files (cold scan + rescan)', () => assert.ok(cold.maxRSS_MB < 150, `${cold.maxRSS_MB} MB`));
test('cold scan adds every file', () => assert.equal(cold.stat.added, 40_000));
test('rescan in the same child adds nothing and skips every file', () => { assert.equal(cold.again.added, 0); assert.equal(cold.again.unchanged, 40_000); });
test('cold scan under 10 s on 40,000 files', () => assert.ok(cold.ms < 10_000, `${cold.ms} ms`));
test('rescan under 10 s and faster than the cold scan', () => assert.ok(cold.ms2 < 10_000 && cold.ms2 < cold.ms, `${cold.ms2} vs ${cold.ms}`));
test('a second child over the existing index stays under 150 MB', () => {
  const r = spawnSync(process.execPath, ['--no-warnings', CHILD, SRC, big], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.ok(j.maxRSS_MB < 150 && j.stat.added === 0 && j.stat.unchanged === 40_000, JSON.stringify(j));
});

// ---- 2b. equality with the old implementation on a 500-file sample ----
let oldList, newList;
test('500-file sample: old and new scan the same number of chats', async () => {
  const a = createOld({ home: small, clock, indexPath: path.join(small, 'old-index.json') });
  const b = hist(small, { indexPath: path.join(small, 'new-index.json') });
  await a.scan(); await b.scan();
  const key = (e) => e.path;
  oldList = all(a).sort((x, y) => (key(x) < key(y) ? -1 : 1)); newList = all(b).sort((x, y) => (key(x) < key(y) ? -1 : 1));
  assert.equal(newList.length, 500); assert.equal(oldList.length, 500);
});
test('500-file sample: same ids', () => assert.deepEqual(newList.map((e) => e.sessionId), oldList.map((e) => e.sessionId)));
test('500-file sample: same titles', () => assert.deepEqual(newList.map((e) => e.title), oldList.map((e) => e.title)));
test('500-file sample: same counts', () => assert.deepEqual(newList.map((e) => e.typedMessages), oldList.map((e) => e.typedMessages)));
test('500-file sample: same kinds, with every kind present', () => {
  assert.deepEqual(newList.map((e) => e.kind), oldList.map((e) => e.kind));
  assert.deepEqual([...new Set(newList.map((e) => e.kind))].sort(), ['headless', 'interactive', 'subagent']);
});
test('500-file sample: every public field is identical', () => assert.deepEqual(newList, oldList));
test('500-file sample: same list() order and same search hits as old', () => {
  const a = createOld({ home: small, clock, indexPath: path.join(small, 'old-index.json') }), b = hist(small, { indexPath: path.join(small, 'new-index.json') });
  assert.deepEqual(b.list({ limit: 50 }).map((e) => e.path), a.list({ limit: 50 }).map((e) => e.path));
  assert.deepEqual(new Set(b.search('alpha', { limit: 1000 }).map((e) => e.path)), new Set(a.list({ query: 'alpha', limit: 1000 }).map((e) => e.path)));
});

// ---- 3. incremental rescan ----
test('rescan of unchanged files skips all of them', async () => {
  const home = copyOf(mid, 'inc'); const h = hist(home);
  assert.equal((await h.scan()).added, 3000);
  const s = await h.scan();
  assert.deepEqual([s.added, s.updated, s.unchanged, s.removed], [0, 0, 3000, 0]);
});
test('rescan is at least 5x faster than the cold scan', async () => {
  const home = copyOf(mid, 'speed'); const h = hist(home);
  const [, cold1] = await timed(() => h.scan());
  const warm = [];
  for (let i = 0; i < 3; i++) warm.push((await timed(() => h.scan()))[1]);
  assert.ok(cold1 / Math.min(...warm) >= 5, `cold ${cold1.toFixed(0)} ms, best warm ${Math.min(...warm).toFixed(0)} ms`);
});
test('rescan never opens an unchanged chat file', async () => {
  const home = copyOf(mid, 'noopen'); await hist(home).scan();
  const opened = []; const fs = { ...nodeFs, openSync: (p, ...r) => { if (String(p).endsWith('.jsonl') && !String(p).includes('history-index')) opened.push(p); return nodeFs.openSync(p, ...r); } };
  const h = hist(home, { fs }); await h.scan();
  assert.equal(opened.length, 0);
});
test('the index is a file on disk, a few hundred bytes per chat at most', async () => {
  const home = copyOf(mid, 'ondisk'); await hist(home).scan();
  const f = path.join(home, '.suffice/history-index.json'); const st = nodeFs.statSync(f);
  assert.ok(st.size > 0 && st.size / 3000 < 1500, `${st.size} bytes`);
  assert.equal(JSON.parse(nodeFs.readFileSync(f, 'utf8').split('\n')[0]).v, 2);
});
test('a new History instance reuses the persisted index', async () => {
  const home = copyOf(mid, 'persist'); await hist(home).scan();
  const s = await hist(home).scan();
  assert.equal(s.unchanged, 3000); assert.equal(s.added, 0);
});
test('a touched file is re-read, the rest are skipped', async () => {
  const home = copyOf(mid, 'touch'); const h = hist(home); await h.scan();
  nodeFs.utimesSync(claudePath(home, 1), 1_800_000_000, 1_800_000_000);
  const s = await h.scan(); assert.deepEqual([s.updated, s.unchanged], [1, 2999]);
});
test('a grown file is re-read', async () => {
  const home = copyOf(mid, 'grow'); const h = hist(home); await h.scan();
  const p = claudePath(home, 2); const m = nodeFs.statSync(p).mtimeMs / 1000;
  nodeFs.appendFileSync(p, '{"type":"assistant"}\n'); nodeFs.utimesSync(p, m, m);
  assert.equal((await h.scan()).updated, 1);
});
test('a new file is added and a deleted file is removed', async () => {
  const home = copyOf(mid, 'addrm'); const h = hist(home); await h.scan();
  nodeFs.unlinkSync(claudePath(home, 1));
  nodeFs.mkdirSync(path.dirname(claudePath(home, 99_999)), { recursive: true }); nodeFs.copyFileSync(claudePath(home, 2), claudePath(home, 99_999));
  const s = await h.scan(); assert.deepEqual([s.added, s.removed, s.unchanged], [1, 1, 2999]);
  assert.equal(all(h).length, 3000);
});

// ---- 4. progress and abort ----
test('progress events carry done and total, done never goes backwards', async () => {
  const home = copyOf(mid, 'prog'); const ev = [];
  await hist(home).scan({ onProgress: (e) => ev.push(e) });
  assert.ok(ev.length >= 3, `${ev.length} events`);
  assert.ok(ev.every((e) => Number.isInteger(e.done) && Number.isInteger(e.total) && e.done <= e.total));
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].done >= ev[i - 1].done);
});
test('the last progress event is done === total === file count', async () => {
  const home = copyOf(mid, 'progend'); const ev = [];
  await hist(home).scan({ onProgress: (e) => ev.push(e) });
  assert.deepEqual([ev.at(-1).done, ev.at(-1).total], [3000, 3000]);
});
test('progress is also reported on an incremental rescan', async () => {
  const home = copyOf(mid, 'progre'); const h = hist(home); await h.scan();
  const ev = []; await h.scan({ onProgress: (e) => ev.push(e) });
  assert.equal(ev.at(-1).done, 3000);
});
test('a throwing progress callback does not break the scan', async () => {
  const home = copyOf(small, 'progthrow');
  const s = await hist(home).scan({ onProgress: () => { throw new Error('boom'); } });
  assert.equal(s.added, 500);
});
test('abort stops the scan early and does not throw', async () => {
  const home = copyOf(mid, 'abort'); const ac = new AbortController();
  const s = await hist(home).scan({ signal: ac.signal, onProgress: (e) => { if (e.done >= 500) ac.abort(); } });
  assert.equal(s.aborted, true); assert.ok(s.added >= 500 && s.added < 1500, `${s.added}`);
});
test('an aborted scan leaves a valid partial index on disk', async () => {
  const home = copyOf(mid, 'abortidx'); const ac = new AbortController();
  await hist(home).scan({ signal: ac.signal, onProgress: (e) => { if (e.done >= 500) ac.abort(); } });
  const n = all(hist(home)).length;
  assert.ok(n >= 500 && n < 3000, `${n}`);
  for (const l of nodeFs.readFileSync(path.join(home, '.suffice/history-index.json'), 'utf8').trim().split('\n')) JSON.parse(l);
  assert.ok(!nodeFs.existsSync(path.join(home, '.suffice/history-index.json.tmp')));
});
test('after an abort the next scan resumes and completes', async () => {
  const home = copyOf(mid, 'resume'); const ac = new AbortController();
  const a = await hist(home).scan({ signal: ac.signal, onProgress: (e) => { if (e.done >= 500) ac.abort(); } });
  const h = hist(home); const s = await h.scan();
  assert.equal(s.unchanged, a.added); assert.equal(all(h).length, 3000); assert.equal(s.aborted, undefined);
});
test('a signal aborted before the scan scans nothing', async () => {
  const home = copyOf(small, 'preabort');
  const s = await hist(home).scan({ signal: AbortSignal.abort() });
  assert.equal(s.aborted, true); assert.equal(s.added, 0);
});
test('an aborted rescan never deletes entries of a complete earlier index', async () => {
  const home = copyOf(mid, 'abortkeep'); const h = hist(home); await h.scan();
  const ac = new AbortController();
  const s = await h.scan({ signal: ac.signal, onProgress: (e) => { if (e.done >= 100) ac.abort(); } });
  assert.equal(s.removed, 0); assert.equal(all(hist(home)).length, 3000);
});

// ---- 5. search ----
let sh; // 40,000-chat history, built once in-process
const searchHome = () => big;
test('search setup: 40,000 chats indexed', async () => { sh = hist(searchHome()); await sh.scan(); assert.equal(all(sh).length, 40_000); });
const ms = (fn, n = 5) => { const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); fn(); t.push(performance.now() - s); } return Math.min(...t); };
test('search over 40,000 chats returns in under 200 ms (single word)', () => { const t = ms(() => sh.search('alpha', { limit: 20 })); assert.ok(t < 200, `${t.toFixed(1)} ms`); });
test('search over 40,000 chats returns in under 200 ms (three words)', () => { const t = ms(() => sh.search('fix alpha handler', { limit: 20 })); assert.ok(t < 200, `${t.toFixed(1)} ms`); });
test('search over 40,000 chats returns in under 200 ms (empty query, no match, kind filter)', () => {
  for (const [q, o] of [['', {}], ['zzzzqqqq', {}], ['alpha', { kind: 'headless' }]]) { const t = ms(() => sh.search(q, { limit: 20, ...o })); assert.ok(t < 200, `${q}: ${t.toFixed(1)} ms`); }
});
test('search honours limit', () => { assert.equal(sh.search('alpha', { limit: 7 }).length, 7); assert.equal(sh.search('alpha', { limit: 1 }).length, 1); });
test('search is case-insensitive', () => {
  const a = sh.search('alpha', { limit: 50 }).map((e) => e.path);
  assert.ok(a.length > 0); assert.deepEqual(sh.search('ALPHA', { limit: 50 }).map((e) => e.path), a); assert.deepEqual(sh.search('aLpHa', { limit: 50 }).map((e) => e.path), a);
});
test('every hit contains the query in the title or first message', () => {
  for (const e of sh.search('bravo', { limit: 100 })) assert.ok(`${e.title} ${e.firstUser}`.toLowerCase().includes('bravo'));
});
test('multi-word queries are AND, in any order', () => {
  const a = sh.search('alpha handler', { limit: 100 }), b = sh.search('handler alpha', { limit: 100 });
  assert.ok(a.length > 0); assert.deepEqual(a.map((e) => e.path), b.map((e) => e.path));
  for (const e of a) { const t = `${e.title} ${e.firstUser}`.toLowerCase(); assert.ok(t.includes('alpha') && t.includes('handler')); }
});
test('multi-word AND excludes chats missing one word', () => { assert.deepEqual(sh.search('alpha qqqqnomatch'), []); });
test('extra whitespace in the query is ignored', () => assert.deepEqual(sh.search('  alpha   handler ', { limit: 5 }).map((e) => e.path), sh.search('alpha handler', { limit: 5 }).map((e) => e.path)));
test('empty query returns the most recent chats first', () => {
  const r = sh.search('', { limit: 10 }); assert.equal(r.length, 10);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].updatedAt >= r[i].updatedAt);
  assert.equal(r[0].updatedAt, Math.max(...all(sh).filter((e) => e.kind !== 'subagent' && e.kind !== 'headless').map((e) => e.updatedAt)));
});
test('whitespace-only query behaves as empty', () => assert.deepEqual(sh.search('   ', { limit: 5 }).map((e) => e.path), sh.search('', { limit: 5 }).map((e) => e.path)));
test('kind filter: headless, subagent and interactive, as string or array', () => {
  for (const k of ['headless', 'subagent', 'interactive']) { const r = sh.search('', { kind: k, limit: 30 }); assert.ok(r.length > 0 && r.every((e) => e.kind === k), k); }
  const both = sh.search('', { kind: ['headless', 'subagent'], limit: 200 }); assert.ok(both.some((e) => e.kind === 'headless') && both.some((e) => e.kind === 'subagent') && both.every((e) => e.kind !== 'interactive'));
});
test('default search hides headless and subagent chats', () => assert.ok(sh.search('fix', { limit: 500 }).every((e) => e.kind !== 'headless' && e.kind !== 'subagent')));
test('search results do not leak index internals', () => { const e = sh.search('alpha', { limit: 1 })[0]; assert.ok(!('sig' in e) && !('firstUser' in e)); });
test('ranking: a title hit beats a hit only in the first message, even when older', async () => {
  const home = mkHome('rank'); dirs.push(home);
  const rec = (text, cwd) => `${JSON.stringify({ type: 'user', timestamp: new Date(1_700_000_000_000).toISOString(), cwd, entrypoint: 'cli', message: { content: text } })}\n`;
  const put = (name, text, mtime) => { const p = path.join(home, '.claude/projects/-p', `${name}.jsonl`); nodeFs.mkdirSync(path.dirname(p), { recursive: true }); nodeFs.writeFileSync(p, rec(text, '/w')); nodeFs.utimesSync(p, mtime, mtime); };
  put('late-hit', `${'filler '.repeat(20)}needle at the end`, 1_700_000_900);   // needle beyond the 80-char title
  put('title-hit', 'needle first, then other words', 1_700_000_100);
  const h = hist(home); await h.scan();
  assert.deepEqual(h.search('needle').map((e) => e.sessionId), ['title-hit', 'late-hit']);
});

// ---- 6. robustness ----
test('corrupt index file: scan does not throw and rebuilds everything', async () => {
  const home = copyOf(small, 'corrupt'); nodeFs.mkdirSync(path.join(home, '.suffice'), { recursive: true });
  nodeFs.writeFileSync(path.join(home, '.suffice/history-index.json'), Buffer.from([0, 255, 254, 1, 2, 3, 123, 34, 0, 200]));
  const s = await hist(home).scan(); assert.equal(s.added, 500);
});
test('truncated index file: scan does not throw and completes', async () => {
  const home = copyOf(small, 'trunc'); await hist(home).scan();
  const f = path.join(home, '.suffice/history-index.json'); const b = nodeFs.readFileSync(f); nodeFs.writeFileSync(f, b.subarray(0, Math.floor(b.length / 2)));
  const h = hist(home); await h.scan(); assert.equal(all(h).length, 500);
});
test('empty and whitespace index files: no throw', async () => {
  for (const content of ['', '\n\n', '{"v":2}', 'null', '[]']) {
    const home = copyOf(small, 'empty'); nodeFs.mkdirSync(path.join(home, '.suffice'), { recursive: true }); nodeFs.writeFileSync(path.join(home, '.suffice/history-index.json'), content);
    const h = hist(home); await h.scan(); assert.equal(all(h).length, 500, JSON.stringify(content));
  }
});
test('index lines of the wrong shape are ignored', async () => {
  const home = copyOf(small, 'shape'); nodeFs.mkdirSync(path.join(home, '.suffice'), { recursive: true });
  nodeFs.writeFileSync(path.join(home, '.suffice/history-index.json'), '{"v":2}\n123\n"x"\n[1]\nnull\n{"path":5}\n');
  const h = hist(home); await h.scan(); assert.equal(all(h).length, 500);
});
test('legacy single-JSON index (v1) still loads', async () => {
  const home = copyOf(small, 'v1'); const h0 = hist(home); await h0.scan();
  const entries = {}; for (const e of nodeFs.readFileSync(path.join(home, '.suffice/history-index.json'), 'utf8').trim().split('\n').slice(1)) { const o = JSON.parse(e); entries[o.path] = o; }
  nodeFs.writeFileSync(path.join(home, '.suffice/history-index.json'), JSON.stringify({ v: 1, entries }));
  const s = await hist(home).scan(); assert.equal(s.unchanged, 500);
});
test('unreadable chat file: skipped without throwing', async (t) => {
  if (process.getuid?.() === 0) return t.skip('root reads everything');
  const home = copyOf(small, 'unread'); const p = claudePath(home, 1); nodeFs.chmodSync(p, 0);
  try { const h = hist(home); await h.scan(); assert.equal(all(h).length, 499); assert.ok(!all(h).some((e) => e.path === p)); }
  finally { nodeFs.chmodSync(p, 0o644); }
});
test('unreadable directory: skipped without throwing', async (t) => {
  if (process.getuid?.() === 0) return t.skip('root reads everything');
  const home = copyOf(small, 'undir'); const d = path.join(home, '.claude/projects/-proj-6'); nodeFs.chmodSync(d, 0);
  try { const h = hist(home); await h.scan(); assert.ok(all(h).length < 500 && all(h).length > 400); }
  finally { nodeFs.chmodSync(d, 0o755); }
});
test('file deleted between stat and read: scan does not throw', async () => {
  const home = copyOf(small, 'vanish'); const victim = claudePath(home, 1);
  const fs = { ...nodeFs, statSync: (p, ...r) => { const s = nodeFs.statSync(p, ...r); if (p === victim) nodeFs.unlinkSync(p); return s; } };
  const h = hist(home, { fs }); const s = await h.scan(); assert.equal(s.added, 499);
});
test('file deleted while the scan walks: scan does not throw and the index stays valid', async () => {
  const home = copyOf(small, 'vanish2'); let n = 0;
  const fs = { ...nodeFs, openSync: (p, ...r) => { if (String(p).endsWith('.jsonl') && ++n === 50) for (const f of nodeFs.readdirSync(path.dirname(p))) nodeFs.rmSync(path.join(path.dirname(p), f), { force: true }); return nodeFs.openSync(p, ...r); } };
  await hist(home, { fs }).scan(); assert.ok(all(hist(home)).length > 0);
});
test('empty, binary and giant-single-line chat files: no throw', async () => {
  const home = copyOf(small, 'weird'); const d = path.join(home, '.claude/projects/-weird'); nodeFs.mkdirSync(d, { recursive: true });
  nodeFs.writeFileSync(path.join(d, 'empty.jsonl'), '');
  nodeFs.writeFileSync(path.join(d, 'bin.jsonl'), Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 37) & 255)));
  nodeFs.writeFileSync(path.join(d, 'oneline.jsonl'), `{"type":"user","message":{"content":"${'z'.repeat(3_000_000)}"}}`);
  nodeFs.writeFileSync(path.join(d, 'nonl.jsonl'), '{"type":"user","cwd":"/a","message":{"content":"no trailing newline"}}');
  const h = hist(home); await h.scan(); assert.equal(all(h).length, 504);
  assert.equal(h.search('no trailing', { kind: null }).length >= 0, true);
});
test('a failing source does not stop the others or erase its old entries', async () => {
  const home = copyOf(small, 'badsrc'); const h0 = hist(home); await h0.scan();
  const bad = { id: 'claude-code', detect: () => true, async *list() { throw new Error('db locked'); }, read() {} };
  const h = createHistory({ home, clock, sources: [bad] });
  const s = await h.scan(); assert.equal(s.removed, 0);
  assert.ok(all(h).length > 0);
});

// ---- head-only reads ----
test('each chat file is read for at most 64 KB per scan, even 5 MB ones', async () => {
  const home = copyOf(small, 'headonly'); const bytes = new Map(); const fds = new Map();
  const fs = { ...nodeFs,
    openSync: (p, ...r) => { const fd = nodeFs.openSync(p, ...r); fds.set(fd, p); return fd; },
    readSync: (fd, ...r) => { const n = nodeFs.readSync(fd, ...r); const p = fds.get(fd); if (p?.endsWith('.jsonl')) bytes.set(p, (bytes.get(p) ?? 0) + n); return n; } };
  await hist(home, { fs }).scan();
  assert.ok(bytes.size >= 500); assert.ok(Math.max(...bytes.values()) <= 65536, `${Math.max(...bytes.values())}`);
});
test('the big files in the sample really are 5 MB', () => assert.ok(nodeFs.statSync(claudePath(small, 100)).size > 5_000_000));
