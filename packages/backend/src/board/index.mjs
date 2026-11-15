// Shared working state for agents: board (tasks + log), memory (one fact per file), handoff + compact.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertShape } from '../contract.mjs';

const ID = /^[a-z0-9][a-z0-9-]*$/;
const RUN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const TYPES = ['user', 'feedback', 'project', 'reference'];
const str = (v, what) => { if (typeof v !== 'string' || !v.trim()) throw new TypeError(`${what}: expected a non-empty string`); return v; };
const id = (v, what, re = ID) => { if (typeof v !== 'string' || !re.test(v)) throw new TypeError(`${what}: invalid id`); return v; };
const strs = (v, what) => { if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new TypeError(`${what}: expected an array of strings`); return v; };
const dep = (o) => { if (!o || typeof o.dir !== 'string') throw new TypeError('dir: expected a string'); assertShape('clock', o.clock, ['now']); };

// tmp + rename so a reader never sees a half-written file
async function writeAtomic(file, text) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, text);
  await fs.rename(tmp, file);
}
const readJson = async (file) => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return undefined; throw e; }
};

export function createBoard({ dir, clock, ttlMs = 600000 } = {}) {
  dep({ dir, clock });
  const tasks = path.join(dir, 'tasks'), locks = path.join(dir, 'locks'), log = path.join(dir, 'log');
  const mkdirs = () => Promise.all([tasks, locks, log].map((d) => fs.mkdir(d, { recursive: true })));
  const tfile = (tid) => path.join(tasks, `${id(tid, 'taskId')}.json`);
  const lfile = (tid) => path.join(locks, `${tid}.lock`);
  const must = async (tid) => { const t = await readJson(tfile(tid)); if (!t) throw new TypeError(`unknown task: ${tid}`); return t; };
  const save = (t) => writeAtomic(tfile(t.id), JSON.stringify(t));

  async function post(msg) {
    if (!msg || typeof msg !== 'object') throw new TypeError('message: expected an object');
    str(msg.text, 'message.text');
    await mkdirs();
    const tmp = path.join(log, `.${randomUUID()}.tmp`);
    try {
      for (;;) {
        const names = (await fs.readdir(log)).filter((n) => n.endsWith('.json'));
        const seq = names.length ? Math.max(...names.map((n) => parseInt(n, 10))) + 1 : 1;
        const m = { ...msg, seq, ts: clock.now() };
        await fs.writeFile(tmp, JSON.stringify(m));
        // link fails with EEXIST if another writer took this seq, and the file appears whole
        try { await fs.link(tmp, path.join(log, `${String(seq).padStart(10, '0')}.json`)); return m; } catch (e) { if (e.code !== 'EEXIST') throw e; }
      }
    } finally { await fs.rm(tmp, { force: true }); }
  }

  async function since(seq = 0) {
    await mkdirs();
    const names = (await fs.readdir(log)).filter((n) => n.endsWith('.json')).sort();
    const out = [];
    for (const n of names) if (parseInt(n, 10) > seq) { const m = await readJson(path.join(log, n)); if (m) out.push(m); }
    return out;
  }

  async function claim(tid, agentId) {
    str(agentId, 'agentId');
    await mkdirs();
    const t = await must(tid);
    if (t.state === 'done' || t.state === 'blocked') return { ok: false, reason: `task is ${t.state}` };
    for (const d of t.deps) if ((await readJson(tfile(d)))?.state !== 'done') return { ok: false, reason: `deps not done: ${d}` };
    const lock = JSON.stringify({ agentId, ts: clock.now() });
    let from;
    // write the whole lock to a temp file, then link it into place: the lock never exists half-written
    const tmp = `${lfile(tid)}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, lock);
    try {
      await fs.link(tmp, lfile(tid));
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const raw = await fs.readFile(lfile(tid), 'utf8').catch((x) => { if (x.code === 'ENOENT') return ''; throw x; });
      let held; try { held = JSON.parse(raw); } catch { /* empty or torn lock */ }
      if (held && typeof held.ts === 'number') {
        if (clock.now() - held.ts <= ttlMs) return { ok: false, reason: `held by ${held.agentId ?? 'another agent'}` };
      } else {
        // no readable ts: age by file mtime (real time, the injected clock may be fake)
        const st = await fs.stat(lfile(tid)).catch(() => undefined);
        if (!st || Date.now() - st.mtimeMs <= ttlMs) return { ok: false, reason: 'held by another agent' };
      }
      // one taker at a time; shortcut: a guard left by a crashed taker blocks takeover, delete it by hand
      const guard = `${lfile(tid)}.takeover`;
      try { await (await fs.open(guard, 'wx')).close(); } catch (g) { if (g.code === 'EEXIST') return { ok: false, reason: 'takeover in progress' }; throw g; }
      try {
        const again = await fs.readFile(lfile(tid), 'utf8').catch(() => undefined);
        if (again !== raw) return { ok: false, reason: 'lost takeover race' };
        await writeAtomic(lfile(tid), lock);
        from = held?.agentId ?? 'unknown (stale empty lock)';
      } finally { await fs.rm(guard, { force: true }); }
    } finally { await fs.rm(tmp, { force: true }); }
    t.state = 'claimed';
    t.owner = agentId;
    if (from) {
      t.notes.push(`takeover: ${agentId} took over from ${from} at ${clock.now()}`);
      await post({ from: agentId, text: `takeover: ${agentId} took ${tid} from ${from}` });
    }
    await save(t);
    return from ? { ok: true, takeover: true, from } : { ok: true };
  }

  const finish = async (tid, state, fn) => { const t = await must(tid); fn?.(t); t.state = state; await save(t); return t; };

  return {
    post, since, claim,
    async addTask({ id: tid, title, deps = [], notes = [] } = {}) {
      str(title, 'title'); strs(deps, 'deps'); strs(notes, 'notes');
      deps.forEach((d) => id(d, 'dep'));
      await mkdirs();
      const t = { id: id(tid, 'taskId'), title, state: 'open', owner: null, deps, notes };
      try { await fs.writeFile(tfile(tid), JSON.stringify(t), { flag: 'wx' }); } catch (e) { if (e.code === 'EEXIST') throw new TypeError(`task exists: ${tid}`); throw e; }
      return t;
    },
    async get(tid) { return readJson(tfile(tid)); },
    async list() { await mkdirs(); return Promise.all((await fs.readdir(tasks)).filter((n) => n.endsWith('.json')).sort().map((n) => readJson(path.join(tasks, n)))); },
    async complete(tid, agentId) {
      return finish(tid, 'done', (t) => { if (t.owner !== agentId) throw new TypeError(`task ${tid} is not owned by ${agentId}`); });
    },
    async release(tid) { await fs.rm(lfile(tid), { force: true }); return finish(tid, 'open', (t) => { t.owner = null; }); },
    async block(tid, note) { await fs.rm(lfile(tid), { force: true }); return finish(tid, 'blocked', (t) => { t.owner = null; if (note) t.notes.push(`blocked: ${note}`); }); },
  };
}

const LINK = /\[\[([a-z0-9-]+)\]\]/g;
const words = (s) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

export function createMemory({ dir, clock } = {}) {
  dep({ dir, clock });
  const file = (name) => path.join(dir, `${id(name, 'name')}.md`);

  function parse(text) {
    const end = text.indexOf('\n---\n', 4);
    const fm = {};
    for (const line of text.slice(4, end).split('\n')) { const i = line.indexOf(': '); fm[line.slice(0, i)] = line.slice(i + 2); }
    const body = text.slice(end + 5);
    const m = { name: fm.name, description: fm.description, type: fm.type, body, modified: Number(fm.modified), links: [...body.matchAll(LINK)].map((x) => x[1]) };
    if (fm.previousModified) m.previousModified = Number(fm.previousModified);
    return m;
  }
  async function get(name) {
    try { return parse(await fs.readFile(file(name), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return undefined; throw e; }
  }
  async function list() {
    let names;
    try { names = await fs.readdir(dir); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    const out = [];
    for (const n of names.sort()) if (n.endsWith('.md') && n !== 'MEMORY.md') out.push(await get(n.slice(0, -3)));
    return out;
  }

  return {
    get, list,
    async save({ name, description, type, body } = {}) {
      id(name, 'name');
      if (typeof description !== 'string' || !description.trim() || /[\r\n]/.test(description)) throw new TypeError('description: expected a one-line non-empty string');
      if (!TYPES.includes(type)) throw new TypeError(`type: expected one of ${TYPES.join(', ')}`);
      if (typeof body !== 'string') throw new TypeError('body: expected a string');
      const prev = await get(name);
      const m = { name, description, type, body, modified: clock.now() };
      if (prev) m.previousModified = prev.modified;
      await fs.mkdir(dir, { recursive: true });
      const head = ['name', 'description', 'type', 'modified', 'previousModified'].filter((k) => m[k] !== undefined).map((k) => `${k}: ${m[k]}`);
      await writeAtomic(file(name), `---\n${head.join('\n')}\n---\n${body}`);
      return m;
    },
    async remove(name) {
      try { await fs.unlink(file(name)); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
    },
    async index() {
      const text = (await list()).map((m) => `- [${m.name}](${m.name}.md) — ${m.description}`).join('\n') + '\n';
      await fs.mkdir(dir, { recursive: true });
      await writeAtomic(path.join(dir, 'MEMORY.md'), text);
      return text;
    },
    // term overlap, name > description > body; no model
    async recall(query, { limit = 5 } = {}) {
      str(query, 'query');
      const q = [...new Set(words(query))];
      const scored = [];
      for (const m of await list()) {
        const [n, d, b] = [m.name, m.description, m.body].map((s) => new Set(words(s)));
        const score = q.reduce((s, w) => s + (n.has(w) ? 3 : 0) + (d.has(w) ? 2 : 0) + (b.has(w) ? 1 : 0), 0);
        if (score) scored.push({ m, score });
      }
      return scored.sort((a, b) => b.score - a.score || b.m.modified - a.m.modified || (a.m.name < b.m.name ? -1 : 1)).slice(0, limit).map((x) => x.m);
    },
    async backlinks(name) { id(name, 'name'); return (await list()).filter((m) => m.links.includes(name)); },
  };
}

export function createHandoff({ dir, clock } = {}) {
  dep({ dir, clock });
  const file = (runId) => path.join(dir, `${id(runId, 'runId', RUN)}.json`);
  return {
    async writeHandoff({ runId, done, open, next, pointers = [] } = {}) {
      file(runId); strs(done, 'done'); strs(open, 'open'); strs(pointers, 'pointers'); str(next, 'next');
      if (!open.length && !done.length) throw new TypeError('handoff: needs open items or done items');
      const h = { runId, done, open, next, pointers, ts: clock.now() };
      await fs.mkdir(dir, { recursive: true });
      await writeAtomic(file(runId), JSON.stringify(h));
      return h;
    },
    readHandoff: (runId) => readJson(file(runId)),
  };
}

// Deterministic: first, last `keep`, pinned stay; each gap becomes one counted placeholder; if still over maxChars, drop the oldest unpinned tail message.
export function compact(messages, { maxChars, keep } = {}) {
  if (!Array.isArray(messages) || messages.some((m) => !m || typeof m.content !== 'string')) throw new TypeError('messages: expected an array of {content: string}');
  if (!Number.isInteger(maxChars) || maxChars < 0 || !Number.isInteger(keep) || keep < 0) throw new TypeError('maxChars and keep: expected non-negative integers');
  const n = messages.length;
  const kept = new Set(messages.map((m, i) => (i === 0 || i >= n - keep || m.pinned ? i : -1)).filter((i) => i >= 0));
  const build = () => {
    const out = [];
    let gap = 0;
    const flush = () => { if (gap) out.push({ role: 'system', content: `[${gap} messages omitted]` }); gap = 0; };
    messages.forEach((m, i) => { if (kept.has(i)) { flush(); out.push(m); } else gap++; });
    flush();
    return out;
  };
  const size = (o) => o.reduce((s, m) => s + m.content.length, 0);
  let out = build();
  while (size(out) > maxChars) {
    const drop = [...kept].find((i) => i > 0 && !messages[i].pinned);
    if (drop === undefined) break;
    kept.delete(drop);
    out = build();
  }
  return out;
}
