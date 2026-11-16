// Import chats other coding agents already keep on disk into one searchable list.
// Search covers title + first user message + cwd from the index only; full-text over message bodies is out of scope.
import nodeFs from 'node:fs';
import path from 'node:path';
import { assertShape } from '../contract.mjs';
import claudeCode from './sources/claude-code.mjs';
import codex from './sources/codex.mjs';
import opencode from './sources/opencode.mjs';
import claudeDesktop from './sources/claude-desktop.mjs';
import cursor from './sources/cursor.mjs';

const entryDef = { type: 'object' };
export const defaultSources = [claudeCode, codex, opencode, claudeDesktop, cursor];
const pub = ({ sig, firstUser, ...e }) => e;

export function createHistory({ fs = nodeFs, home, clock, slots, sources = defaultSources, indexPath } = {}) {
  if (typeof home !== 'string' || !home) throw new TypeError('history: home is required');
  assertShape('clock', clock, ['now']);
  for (const s of sources) assertShape(`source ${s?.id}`, s, ['detect', 'list', 'read']);
  const file = indexPath ?? path.join(home, '.suffice', 'history-index.json');
  let index = null; // path -> entry (with sig)
  let detected = {};
  const load = () => {
    if (index) return index;
    try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); index = j?.v === 1 && j.entries ? j.entries : {}; } catch { index = {}; }
    return index;
  };
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ v: 1, savedAt: clock.now(), entries: index }));
    fs.renameSync(`${file}.tmp`, file);
  };

  const listSlot = slots?.define({ id: 'history:list', title: 'Chat history', schema: { type: 'array', items: entryDef } }, []);
  const srcSlot = slots?.define({ id: 'history:sources', title: 'History sources', schema: { type: 'array', items: entryDef } }, []);
  const sourceInfo = () => sources.map((s) => ({ id: s.id, label: s.label ?? s.id, detected: !!detected[s.id], count: Object.values(load()).filter((e) => e.source === s.id).length }));
  const publish = () => { listSlot?.set(list({ limit: 500 })); srcSlot?.set(sourceInfo()); };

  async function scan({ sources: only, since } = {}) {
    const idx = load();
    const stat = { added: 0, updated: 0, unchanged: 0, removed: 0 };
    for (const s of sources) {
      detected[s.id] = !!(await s.detect({ home, fs }));
      if (only && !only.includes(s.id)) continue;
      if (!detected[s.id]) continue;
      const seen = new Set();
      for await (const e of s.list({ home, fs, known: (p) => idx[p] })) {
        seen.add(e.path);
        const old = idx[e.path];
        if (old === e) { stat.unchanged++; continue; }
        if (since && e.updatedAt < since && old) continue;
        idx[e.path] = e;
        stat[old ? 'updated' : 'added']++;
      }
      if (!since) for (const [p, e] of Object.entries(idx)) if (e.source === s.id && !seen.has(p)) { delete idx[p]; stat.removed++; }
    }
    save();
    publish();
    return stat;
  }

  function list({ query, source, cwd, limit = 100, offset = 0 } = {}) {
    const q = query?.toLowerCase();
    return Object.values(load())
      .filter((e) => (!source || e.source === source) && (!cwd || e.cwd === cwd)
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
