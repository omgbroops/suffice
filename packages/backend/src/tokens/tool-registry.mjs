// Deferred tool discovery. Every tool registers {name, one-line description, schema}. With deferral on the model sees the
// pinned core tools, one tool_search(query) meta-tool whose description lists the other names + one-liners, and the full
// schema of any tool it searched for. Loaded tools are appended in load order and never removed, so the declared list only
// ever grows at its end and the provider prompt-cache prefix stays valid. Token counts are chars/4, a proxy for ratios.
// Idea source: Anthropic MCP tool search / Bifrost code mode / PointFive (arXiv 2607.12161); BM25 is the standard Okapi form, written here.
import { createHash } from 'node:crypto';
import { estimateTokens } from './index.mjs';

export const PINNED = ['read', 'edit', 'bash', 'search'];
export const SEARCH_TOOL = 'tool_search';
export const TOP_K = 5;
export const DEFER_RATIO = 0.1;

export const oneLine = (d = '') => { const s = String(d).replace(/\s+/g, ' ').trim(); const i = s.search(/[.!?](\s|$)/); const t = i > 0 ? s.slice(0, i + 1) : s; return t.length > 100 ? t.slice(0, 97) + '...' : t; };
const words = (s) => String(s).toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^a-z0-9]+/).filter(Boolean);

// override: 'on' | 'off' | anything else = auto (defer when all tool schemas exceed 10% of the context window)
export function shouldDefer({ schemaTokens, contextWindow, override = 'auto' }) {
  const o = String(override).toLowerCase();
  if (o === 'on' || o === 'off') return o === 'on';
  return contextWindow > 0 && schemaTokens > contextWindow * DEFER_RATIO;
}

// Okapi BM25 (k1 1.2, b 0.75) over name x3 + description. Ties keep registration order.
export function bm25(docs, query, k = TOP_K) {
  const terms = [...new Set(words(query))];
  const toks = docs.map((d) => [...words(d.name), ...words(d.name), ...words(d.name), ...words(d.description)]);
  const avg = toks.reduce((n, t) => n + t.length, 0) / (toks.length || 1) || 1;
  const df = (term) => toks.reduce((n, t) => n + (t.includes(term) ? 1 : 0), 0);
  return docs.map((d, i) => {
    let score = 0;
    for (const term of terms) {
      const f = toks[i].filter((w) => w === term).length;
      if (!f) continue;
      const idf = Math.log(1 + (docs.length - df(term) + 0.5) / (df(term) + 0.5));
      score += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * toks[i].length / avg));
    }
    return { d, score, i };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, k).map((x) => x.d);
}

export function createToolRegistry({ pinned: pins = PINNED, deferred = true } = {}) {
  const pinned = [...pins];
  const tools = new Map();
  const loaded = []; // load order = declared order
  let enabled = deferred;
  const isPinned = (n) => pinned.includes(n);
  const full = (t) => ({ name: t.name, description: t.description, parameters: t.parameters });
  const searchable = () => [...tools.values()].filter((t) => !isPinned(t.name) && !loaded.includes(t.name));
  const reg = {
    register(t) { tools.set(t.name, { name: t.name, description: String(t.description ?? ''), line: oneLine(t.description), parameters: t.parameters ?? { type: 'object', properties: {} } }); return reg; },
    pin(n) { if (!pinned.includes(n)) pinned.push(n); },
    setEnabled(on) { enabled = !!on; },
    get enabled() { return enabled; },
    size: () => tools.size,
    names: () => [...tools.keys()],
    has: (n) => tools.has(n),
    isLoaded: (n) => !enabled || isPinned(n) || loaded.includes(n),
    loaded: () => [...loaded],
    // what a request carries; when off, every tool in full
    declared() {
      if (!enabled) return [...tools.values()].map(full);
      return [
        ...[...tools.values()].filter((t) => isPinned(t.name)).map(full),
        { name: SEARCH_TOOL, description: `Find tools by keyword; the best ${TOP_K} matches are loaded for the rest of this thread. Available:\n${reg.catalogText()}`, parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        ...loaded.map((n) => full(tools.get(n))),
      ];
    },
    // Fixed once tools are registered (loaded names stay listed) so a system prompt carrying it never changes mid-thread.
    catalogText: () => [...tools.values()].filter((t) => !isPinned(t.name)).map((t) => `${t.name}: ${t.line}`).join('\n'),
    // Search never reorders what is already loaded: new matches are appended.
    search(query) {
      const hits = bm25(searchable().map((t) => ({ name: t.name, description: t.description })), query).map((h) => tools.get(h.name));
      for (const t of hits) if (enabled) loaded.push(t.name);
      return hits.map(full);
    },
    // null when callable, else the error the model gets
    guard(name) {
      if (!tools.has(name) || reg.isLoaded(name)) return null;
      return `Tool "${name}" is deferred and not loaded. Call ${SEARCH_TOOL} with a query describing it, then call it again.`;
    },
    prefixHash: (n = Infinity) => createHash('sha256').update(JSON.stringify(reg.declared().slice(0, n))).digest('hex').slice(0, 16),
    // tokens a request would carry with everything loaded vs what it carries now
    stats() {
      const all = [...tools.values()].map(full), now = reg.declared();
      const schemaTokens = estimateTokens(all), declaredTokens = estimateTokens(now);
      const deferredCount = enabled ? searchable().length : 0;
      return { enabled, total: tools.size, loaded: tools.size - deferredCount, deferred: deferredCount, schemaTokens, declaredTokens, savedPerCall: enabled ? Math.max(0, schemaTokens - declaredTokens) : 0 };
    },
  };
  return reg;
}

// One ledger line per model call so the cost gate is visible: schema tokens carried, cache reads, hit rate.
export function ledgerLine(turn, stats, usage = {}) {
  const read = usage.cacheRead ?? 0, input = usage.input ?? 0, denom = read + input + (usage.cacheWrite ?? 0);
  return { type: 'tool_ledger', turn, deferred: stats.enabled, schemaTokensLoaded: stats.declaredTokens, schemaTokensAll: stats.schemaTokens, cacheRead: read, cacheHitRate: denom ? +(read / denom).toFixed(3) : null };
}
