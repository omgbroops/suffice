// Import chats other coding agents already keep on disk into one searchable list.
// Search covers title + first user message + cwd from the index only; full-text over message bodies is out of scope.
import nodeFs from 'node:fs';
import path from 'node:path';
import { assertShape } from '../contract.mjs';
import { jsonLines } from './lines.mjs';
import claudeCode from './sources/claude-code.mjs';
import codex from './sources/codex.mjs';
import opencode from './sources/opencode.mjs';
import claudeDesktop from './sources/claude-desktop.mjs';
import cursor from './sources/cursor.mjs';

const entryDef = { type: 'object' };
export const defaultSources = [claudeCode, codex, opencode, claudeDesktop, cursor];
const pub = ({ sig, firstUser, ...e }) => e;
export const KINDS = ['interactive', 'headless', 'subagent', 'unknown'];
export const DEFAULT_KINDS = ['interactive', 'unknown'];

export function createHistory({ fs = nodeFs, home, clock, slots, sources = defaultSources, indexPath } = {}) {
  if (typeof home !== 'string' || !home) throw new TypeError('history: home is required');
  assertShape('clock', clock, ['now']);
  for (const s of sources) assertShape(`source ${s?.id}`, s, ['detect', 'list', 'read']);
  const file = indexPath ?? path.join(home, '.suffice', 'history-index.json');
  let index = null; // path -> entry (with sig)
  let detected = {};
  // Index file v2 = JSONL: a header line, then one entry per line, so neither save nor load holds the whole file as one string.
  const load = () => {
    if (index) return index;
    index = {};
    try {
      let v2 = false;
      for (const o of jsonLines(fs, file)) {
        if (o?.v === 2) { v2 = true; continue; }
        if (v2 && typeof o?.path === 'string') index[o.path] = o;
      }
      if (!v2) { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (j?.v === 1 && j.entries) index = j.entries; } // legacy single-JSON index
    } catch { index = {}; }
    return index;
  };
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(`${file}.tmp`, 'w');
    try {
      fs.writeSync(fd, `${JSON.stringify({ v: 2, savedAt: clock.now() })}\n`);
      let buf = [];
      for (const p in index) { buf.push(JSON.stringify(index[p])); if (buf.length >= 500) { fs.writeSync(fd, `${buf.join('\n')}\n`); buf = []; } }
      if (buf.length) fs.writeSync(fd, `${buf.join('\n')}\n`);
    } finally { fs.closeSync(fd); }
    fs.renameSync(`${file}.tmp`, file);
  };

  const listSlot = slots?.define({ id: 'history:list', title: 'Chat history', schema: { type: 'array', items: entryDef } }, []);
  const srcSlot = slots?.define({ id: 'history:sources', title: 'History sources', schema: { type: 'array', items: entryDef } }, []);
  const sourceInfo = () => {
    const per = {}; // source -> { count, kinds }
    for (const e of Object.values(load())) { const c = (per[e.source] ??= { count: 0, kinds: {} }); c.count++; const k = e.kind ?? 'unknown'; c.kinds[k] = (c.kinds[k] ?? 0) + 1; }
    return sources.map((s) => ({ id: s.id, label: s.label ?? s.id, detected: !!detected[s.id], count: per[s.id]?.count ?? 0, kinds: per[s.id]?.kinds ?? {} }));
  };
  const publish = () => { listSlot?.set(list({ limit: 500 })); srcSlot?.set(sourceInfo()); };

  async function scan({ sources: only, since } = {}) {
    const idx = load();
    const stat = { added: 0, updated: 0, unchanged: 0, removed: 0 };
    let n = 0;
    for (const s of sources) {
      detected[s.id] = !!(await s.detect({ home, fs }));
      if (only && !only.includes(s.id)) continue;
      if (!detected[s.id]) continue;
      const seen = new Set();
      for await (const e of s.list({ home, fs, known: (p) => idx[p] })) {
        seen.add(e.path);
        if (++n % 256 === 0) await new Promise((r) => setImmediate(r)); // keep the event loop responsive during a big scan
        const old = idx[e.path];
        if (old === e) { stat.unchanged++; continue; }
        if (since && e.updatedAt < since && old) continue;
        idx[e.path] = e;
        stat[old ? 'updated' : 'added']++;
      }
      if (!since) for (const p in idx) if (idx[p].source === s.id && !seen.has(p)) { delete idx[p]; stat.removed++; }
    }
    save();
    publish();
    return stat;
  }

  function list({ query, source, cwd, kinds = DEFAULT_KINDS, limit = 100, offset = 0 } = {}) {
    const q = query?.toLowerCase();
    return Object.values(load())
      .filter((e) => (!source || e.source === source) && (!kinds || kinds.includes(e.kind ?? 'unknown')) && (!cwd || e.cwd === cwd)
        && (!q || [e.title, e.firstUser, e.cwd].some((f) => f?.toLowerCase().includes(q))))
      .sort((a, b) => b.updatedAt - a.updatedAt || (a.path < b.path ? -1 : 1))
      .slice(offset, offset + limit).map(pub);
  }

  async function read(entry) {
    const s = sources.find((x) => x.id === entry?.source);
    if (!s) throw new TypeError(`history.read: unknown source '${entry?.source}'`);
    return s.read(entry.path, { home, fs });
  }

  return {
    scan, list, read,
    search: (query, opts = {}) => list({ ...opts, query }),
    sources: async () => { for (const s of sources) detected[s.id] = !!(await s.detect({ home, fs })); return sourceInfo(); },
    viewSpec: () => ({
      format: 'suffice.view', v: 1, type: 'list', title: 'Chat history', slot: 'history:list',
      fields: {
        title: { label: 'Title', role: 'title' }, source: { label: 'Source', role: 'source' },
        cwd: { label: 'Folder', role: 'group' }, updatedAt: { label: 'Updated', role: 'date', format: 'datetime' },
      },
    }),
  };
}
