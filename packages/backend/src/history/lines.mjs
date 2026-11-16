// Shared streaming + adapter plumbing for JSONL transcript sources. Nothing here reads a whole file.
import path from 'node:path';
import { readHead } from '../sessions/adapters.mjs';

export const MAX_LINE = 1 << 20; // a longer line is dropped, never buffered whole
const CHUNK = 65536;

/** Sync generator of parsed JSON objects, one per line; malformed or oversize lines are skipped. */
export function* jsonLines(fs, file, max = MAX_LINE) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(CHUNK);
    let parts = [], len = 0, skip = false;
    const flush = function* () {
      if (!skip && len) { try { yield JSON.parse(Buffer.concat(parts, len).toString('utf8')); } catch { /* malformed */ } }
      parts = []; len = 0; skip = false;
    };
    for (;;) {
      const n = fs.readSync(fd, buf, 0, CHUNK, null);
      if (n === 0) break;
      let start = 0;
      for (let i = 0; i < n; i++) {
        if (buf[i] !== 10) continue;
        if (!skip) { len += i - start; parts.push(Buffer.from(buf.subarray(start, i))); if (len > max) skip = true; }
        yield* flush();
        start = i + 1;
      }
      if (start < n && !skip) { parts.push(Buffer.from(buf.subarray(start, n))); len += n - start; if (len > max) { skip = true; parts = []; } }
    }
    yield* flush();
  } finally { fs.closeSync(fd); }
}

const safeDir = (fs, d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
export function walk(fs, dir, match, depth = 6) {
  return safeDir(fs, dir).flatMap((d) => d.isDirectory() ? (depth ? walk(fs, path.join(dir, d.name), match, depth - 1) : [])
    : match(d.name) ? [path.join(dir, d.name)] : []);
}

const ts = (s) => { const n = Date.parse(s); return Number.isNaN(n) ? 0 : n; };
export const oneLine = (s, n = 80) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Build an adapter for a tree of JSONL files. `agent` is a sessions/adapters.mjs entry (parseLine); `meta(recs)` reads the head. */
export function jsonlSource({ id, label, root, match, agent, meta }) {
  const dir = (home) => path.join(home, ...root);
  return {
    id, label,
    detect: ({ home, fs }) => { try { return fs.statSync(dir(home)).isDirectory(); } catch { return false; } },
    async *list({ home, fs, known }) {
      for (const p of walk(fs, dir(home), match)) {
        let st; try { st = fs.statSync(p); } catch { continue; }
        const sig = `${st.mtimeMs}:${st.size}`;
        const k = known?.(p);
        if (k && k.sig === sig) { yield k; continue; }
        try {
          const recs = []; // only the head of the file: enough for title, cwd and start time
          for (const l of readHead(fs, p, 65536).split('\n')) { try { if (l) recs.push(JSON.parse(l)); } catch { /* skip */ } }
          const m = meta(recs, p);
          const first = recs.flatMap((r) => agent.parseLine(r)).find((x) => x.role === 'user' && x.text && !x.text.startsWith('<'));
          const firstUser = oneLine(first?.text, 300);
          yield { source: id, sessionId: m.sessionId, path: p, cwd: m.cwd ?? null, startedAt: m.startedAt || st.birthtimeMs, updatedAt: st.mtimeMs,
            title: firstUser.slice(0, 80) || '(untitled)', firstUser, sig };
        } catch { /* unreadable file: skip */ }
      }
    },
    read(p, { fs }) {
      const out = [];
      for (const o of jsonLines(fs, p)) out.push(...agent.parseLine(o));
      return out;
    },
  };
}
export { ts };
