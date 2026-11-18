// Token reducer for agent runs: (1) deferred tool schemas, (2) tool-result compaction with the full text kept on disk, (3) settings.
// Token counts are chars/4 everywhere here: a stable proxy for before/after ratios, not a billing number.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Type } from 'typebox';

export const estimateTokens = (x) => Math.ceil((typeof x === 'string' ? x : JSON.stringify(x ?? '')).length / 4);

export const LIMITS = ['1,000 tokens', '2,000 tokens', '4,000 tokens', '8,000 tokens'];
// desktop setting ids; both toggles default on
export function readSettings(s = {}) {
  const n = parseInt(String(s['compact-limit'] ?? '').replace(/,/g, ''), 10);
  return { defer: s['defer-mcp-schemas'] !== false, compact: s['compact-tool-results'] !== false, limit: n >= 200 ? n : 2000 };
}

// ---- (1) deferred schemas -------------------------------------------------------------------------------------
const oneLine = (d = '') => { const s = String(d).replace(/\s+/g, ' ').trim(); const i = s.search(/[.!?](\s|$)/); const t = i > 0 ? s.slice(0, i + 1) : s; return t.length > 100 ? t.slice(0, 97) + '...' : t; };

// tools: [{name, description, parameters}]. declared() is what a request carries: the stub index inside load_tool, plus full schemas of tools already used.
export function createDeferredTools(tools, { enabled = true } = {}) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const loaded = new Set();
  const loader = () => ({
    name: 'load_tool',
    description: 'Load full schemas of deferred tools before calling them. Deferred tools:\n' + tools.filter((t) => !loaded.has(t.name)).map((t) => `${t.name}: ${oneLine(t.description)}`).join('\n'),
    parameters: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } }, required: ['names'] },
  });
  const use = (name) => { // first use loads the schema; unknown names throw
    const t = byName.get(name);
    if (!t) throw new Error(`unknown tool: ${name}`);
    const first = !loaded.has(name);
    loaded.add(name);
    return { tool: t, first };
  };
  return {
    declared: () => (enabled ? [loader(), ...tools.filter((t) => loaded.has(t.name))] : tools),
    use: (name) => (enabled ? use(name) : { tool: byName.get(name), first: false }),
    load: (names) => names.map((n) => use(n).tool),
    loaded: () => [...loaded],
    tokens() { return estimateTokens(this.declared()); },
  };
}

// ---- (2) compaction -------------------------------------------------------------------------------------------
const SIGNAL = /\b(error|errors|fail(ed|ure|ing)?|fatal|exception|panic|traceback|assert(ion)?|denied|timeout|timed out|warn(ing)?)\b|^\s*(FAIL|E |✗|✕|×|●)|\b(expected|received):/i;
// long lines (minified JSON) are cut to a window around the first match, so a hit is never lost to truncation
const win = (l, re) => { if (l.length <= 300) return l; const m = re.exec(l)?.index ?? 0, a = Math.max(0, m - 100); return (a ? '...' : '') + l.slice(a, a + 300) + '...'; };
const ID = /^out_[0-9a-f]{12}$/;

export function createCompactor({ dir, limitTokens = 2000 } = {}) {
  if (typeof dir !== 'string' || !dir) throw new TypeError('createCompactor: dir must be a non-empty string');
  const maxChars = limitTokens * 4;
  // shortcut: stored outputs are never pruned, add an age sweep when the dir grows large
  const file = (id) => path.join(dir, id + '.txt');
  return {
    async compact(text) {
      if (typeof text !== 'string' || estimateTokens(text) <= limitTokens) return { text, compacted: false };
      const id = 'out_' + createHash('sha256').update(text).digest('hex').slice(0, 12);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      await fs.writeFile(file(id), text, { mode: 0o600 });
      const lines = text.split('\n');
      const mark = (omitted, chars) => `[... ${omitted} lines, ${chars} chars omitted. Full output saved as ${id}: call retrieve_output with {"id":"${id}"} (optional "offset", or "grep" to match lines)]`;
      let out;
      if (lines.length < 6) { // minified JSON or one long line: character window
        const head = Math.floor(maxChars * 0.7), tail = Math.floor(maxChars * 0.2);
        out = text.slice(0, head) + '\n' + mark(lines.length, text.length - head - tail) + '\n' + text.slice(text.length - tail);
      } else {
        const take = (arr, budget) => { const o = []; let n = 0; for (const l of arr) { const c = l.length > 200 ? l.slice(0, 200) + '...' : l; if (n + c.length + 1 > budget) break; o.push(c); n += c.length + 1; } return o; };
        const head = take(lines, maxChars * 0.4), tail = take([...lines].reverse(), maxChars * 0.2).reverse();
        const mid = lines.slice(head.length, lines.length - tail.length);
        const signal = take(mid.filter((l) => SIGNAL.test(l)), maxChars * 0.3);
        out = [...head, mark(mid.length, mid.join('\n').length), ...(signal.length ? ['[matching error/warning lines from the omitted part:]', ...signal] : []), ...tail].join('\n');
      }
      return { text: out, compacted: true, id, before: estimateTokens(text), after: estimateTokens(out) };
    },
    async retrieve(id, { offset = 0, grep } = {}) {
      if (!ID.test(String(id))) throw new Error('invalid output id');
      let full;
      try { full = await fs.readFile(file(id), 'utf8'); } catch { throw new Error(`no stored output: ${id}`); }
      if (grep) { // bounded: a pattern that matches everything still returns at most one window
        const re = new RegExp(grep, 'i');
        const hit = full.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l)).map(([i, l]) => `${i}: ${win(l, re)}`).join('\n');
        return { text: hit.slice(0, maxChars) || '(no matching lines)', total: full.length };
      }
      const text = full.slice(offset, offset + maxChars);
      return { text, total: full.length, next: offset + text.length < full.length ? offset + text.length : null };
    },
  };
}

// ---- Pi extension (desktop agent runs): compacts every tool result, registers retrieve_output --------------------
export function createReducerExtension({ dir, settings = {}, onCompact = () => {} } = {}) {
  const cfg = readSettings(settings);
  return (pi) => {
    if (!cfg.compact) return;
    const c = createCompactor({ dir, limitTokens: cfg.limit });
    pi.registerTool({
      name: 'retrieve_output', label: 'Retrieve output',
      description: 'Read the full text of a tool result that was shortened. Pass the id from the "Full output saved as" note; use offset to page or grep to find lines.',
      parameters: Type.Object({ id: Type.String(), offset: Type.Optional(Type.Integer({ minimum: 0 })), grep: Type.Optional(Type.String({ maxLength: 200 })) }),
      async execute(_callId, p) {
        const r = await c.retrieve(p.id, p);
        return { content: [{ type: 'text', text: r.text + (r.next != null ? `\n[more: offset ${r.next} of ${r.total}]` : '') }], details: { id: p.id, total: r.total } };
      },
    });
    pi.on('tool_result', async (e) => {
      if (e.toolName === 'retrieve_output' || !Array.isArray(e.content)) return;
      let changed = false;
      const content = [];
      for (const part of e.content) {
        const r = part?.type === 'text' ? await c.compact(part.text) : { compacted: false };
        if (r.compacted) { changed = true; onCompact({ tool: e.toolName, ...r }); content.push({ ...part, text: r.text }); } else content.push(part);
      }
      return changed ? { content } : undefined;
    });
  };
}
