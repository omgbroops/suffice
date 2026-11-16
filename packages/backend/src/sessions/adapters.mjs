// Agent adapters: where each vendor CLI keeps its transcript and how to normalize its lines.
// Compliance: the vendor binary is run unmodified with the user's own login; this module never reads,
// stores or forwards vendor credentials or tokens, and never sets auth env vars for the vendor CLI.
import nodeFs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const ts = (s) => { const n = Date.parse(s); return Number.isNaN(n) ? 0 : n; };
const str = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''));
const blocksText = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('') : '');
const msg = (o, i, role, text, tool) => ({ id: `${o.uuid ?? o.ordinal ?? o.timestamp ?? 'x'}:${i}`, role, text, ...(tool ? { tool } : {}), ts: ts(o.timestamp) });

/** Read at most `max` bytes from the start of a file; drops a trailing partial line. */
export function readHead(fs, file, max = 262144) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(max);
    const n = fs.readSync(fd, buf, 0, max, 0);
    const s = buf.toString('utf8', 0, n);
    return n === max ? s.slice(0, s.lastIndexOf('\n') + 1) : s;
  } finally { fs.closeSync(fd); }
}

function lines(text) {
  const out = [];
  for (const l of text.split('\n')) { if (!l) continue; try { out.push(JSON.parse(l)); } catch { /* skip */ } }
  return out;
}

const claude = {
  bin: 'claude',
  newSessionId: () => randomUUID(),
  startArgs: ({ sessionId }) => ['--session-id', sessionId],
  resumeArgs: ({ sessionId }) => ['--resume', sessionId],
  // Project folder = cwd with every non-alphanumeric char replaced by '-'.
  locateTranscript: ({ home, cwd, sessionId }) => path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`),
  watchRoot: ({ home }) => path.join(home, '.claude', 'projects'),
  parseLine(o) {
    const c = o?.message?.content;
    if (o?.type === 'user') {
      if (typeof c === 'string') return [msg(o, 0, 'user', c)];
      return (Array.isArray(c) ? c : []).flatMap((b, i) => b?.type === 'tool_result' ? [msg(o, i, 'tool', '', { name: '', output: str(b.content) })]
        : b?.type === 'text' ? [msg(o, i, 'user', b.text)] : []);
    }
    if (o?.type === 'assistant' && Array.isArray(c)) {
      return c.flatMap((b, i) => b?.type === 'text' ? [msg(o, i, 'assistant', b.text)]
        : b?.type === 'tool_use' ? [msg(o, i, 'tool', '', { name: b.name, input: b.input })] : []);
    }
    return [];
  },
  listHistory({ home, fs = nodeFs }) {
    const root = path.join(home, '.claude', 'projects');
    const out = [];
    for (const d of safeDir(fs, root)) for (const f of safeDir(fs, path.join(root, d))) {
      if (!f.endsWith('.jsonl')) continue;
      const p = path.join(root, d, f);
      try {
        const recs = lines(readHead(fs, p, 65536));
        const first = recs.find((r) => typeof r.timestamp === 'string');
        const user = recs.flatMap((r) => (r.type === 'user' ? claude.parseLine(r) : [])).find((m) => m.role === 'user' && m.text && !m.text.startsWith('<'));
        out.push({ agent: 'claude', sessionId: f.slice(0, -6), path: p, cwd: recs.find((r) => typeof r.cwd === 'string')?.cwd ?? null,
          startedAt: first ? ts(first.timestamp) : fs.statSync(p).birthtimeMs, title: (user?.text ?? '').slice(0, 80) });
      } catch { /* unreadable file: skip */ }
    }
    return out;
  },
};

function safeDir(fs, d) { try { return fs.readdirSync(d); } catch { return []; } }

function codexFiles(fs, home, dates) {
  const root = path.join(home, '.codex', 'sessions');
  const dirs = dates ? dates.map((d) => path.join(root, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')))
    : safeDir(fs, root).flatMap((y) => safeDir(fs, path.join(root, y)).flatMap((m) => safeDir(fs, path.join(root, y, m)).map((d) => path.join(root, y, m, d))));
  return dirs.flatMap((d) => safeDir(fs, d).filter((f) => f.startsWith('rollout-') && f.endsWith('.jsonl')).map((f) => path.join(d, f)));
}
const codexMeta = (fs, p) => { const r = lines(readHead(fs, p).split('\n')[0] ?? '')[0]; return r?.type === 'session_meta' ? r.payload : null; };

const codex = {
  bin: 'codex',
  newSessionId: () => null, // codex cannot fix the id at start; the rollout file is located afterwards
  startArgs: () => [],
  resumeArgs: ({ sessionId }) => ['resume', sessionId],
  locateTranscript({ home, cwd, sessionId, startedAt, fs = nodeFs, claimed = new Set() }) {
    if (sessionId) return codexFiles(fs, home).find((p) => p.includes(sessionId)) ?? null;
    const t = startedAt ?? 0;
    // earliest unclaimed file born at or after this session's start; claimed ones belong to another live session
    const files = codexFiles(fs, home, [new Date(t), new Date(t + 864e5)]).filter((p) => !claimed.has(p)).map((p) => ({ p, m: fs.statSync(p).birthtimeMs }))
      .filter((f) => f.m >= t).sort((a, b) => a.m - b.m);
    return files.find((f) => { try { return codexMeta(fs, f.p)?.cwd === cwd; } catch { return false; } })?.p ?? null;
  },
  watchRoot: ({ home }) => path.join(home, '.codex', 'sessions'),
  parseLine(o) {
    const p = o?.payload;
    if (o?.type !== 'response_item' || !p) return [];
    if (p.type === 'message') {
      const text = blocksText(p.content);
      if ((p.role !== 'user' && p.role !== 'assistant') || !text || (p.role === 'user' && text.startsWith('<'))) return []; // '<' = injected context
      return [msg(o, 0, p.role, text)];
    }
    if (p.type === 'function_call' || p.type === 'custom_tool_call') return [msg(o, 0, 'tool', '', { name: p.name, input: p.arguments ?? p.input })];
    if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') return [msg(o, 0, 'tool', '', { name: '', output: typeof p.output === 'string' ? p.output : blocksText(p.output) })];
    return [];
  },
  listHistory({ home, fs = nodeFs }) {
    const out = [];
    for (const p of codexFiles(fs, home)) {
      try {
        const recs = lines(readHead(fs, p));
        const meta = recs.find((r) => r.type === 'session_meta')?.payload;
        const user = recs.flatMap((r) => codex.parseLine(r)).find((m) => m.role === 'user');
        out.push({ agent: 'codex', sessionId: p.match(UUID)?.[0] ?? meta?.id ?? null, path: p, cwd: meta?.cwd ?? null,
          startedAt: ts(meta?.timestamp) || fs.statSync(p).birthtimeMs, title: (user?.text ?? '').slice(0, 80) });
      } catch { /* skip */ }
    }
    return out;
  },
};

export const builtinAgents = { claude, codex };
