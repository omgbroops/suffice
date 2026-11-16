// Folds mapper `usage` items, `compacted` notices and session meta into running totals.
// Claude usage items are per call and add up; Codex items (id `codex:usage:<turn>`) carry cumulative totals,
// so each one contributes only its growth over the previous Codex item. Re-adding an id replaces it (last wins).
// Prices are never built in: pass pricing = { [model]: { inputPerM, outputPerM, cacheReadPerM?, cacheWritePerM? } }.

const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
const isCumulative = (id) => String(id).startsWith('codex:usage:');
const FIELDS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'];

export function createUsageMeter({ pricing } = {}) {
  const items = new Map(); // id -> usage item, insertion order = first appearance
  const seenNotices = new Set();
  let meta = {};
  let ctxPct; // undefined after a compaction until meta reports a new value

  function rows() {
    const out = [];
    let prev = null; // previous cumulative item
    for (const it of items.values()) {
      const cur = Object.fromEntries(FIELDS.map((f) => [f, num(it[f])]));
      let row = cur;
      if (isCumulative(it.id)) {
        row = Object.fromEntries(FIELDS.map((f) => [f, prev ? (cur[f] >= prev[f] ? cur[f] - prev[f] : cur[f]) : cur[f]]));
        prev = cur;
      }
      const r = { id: it.id, ts: it.ts, model: it.model ?? meta.model, ...row };
      const p = pricing && pricing[r.model];
      if (p) r.costUsd = (r.inputTokens * num(p.inputPerM) + r.outputTokens * num(p.outputPerM) + r.cacheReadTokens * num(p.cacheReadPerM) + r.cacheWriteTokens * num(p.cacheWritePerM)) / 1e6;
      out.push(r);
    }
    return out;
  }

  return {
    add(item) {
      if (!item || typeof item !== 'object') return;
      if (item.kind === 'usage' && item.id != null) items.set(item.id, item);
      else if (item.kind === 'notice' && item.code === 'compacted' && !seenNotices.has(item.id)) {
        seenNotices.add(item.id);
        ctxPct = undefined;
      }
    },
    setMeta(m = {}) {
      meta = { ...meta, ...m };
      if (Number.isFinite(m.contextUsedPct)) ctxPct = m.contextUsedPct;
    },
    turns: rows,
    snapshot() {
      const r = rows();
      const s = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, turns: r.length };
      for (const x of r) for (const f of FIELDS) s[f] += x[f];
      if (ctxPct !== undefined) s.contextUsedPct = ctxPct;
      const model = meta.model ?? [...items.values()].reverse().find((i) => i.model)?.model;
      if (model) s.model = model;
      // cost is a number only when every turn has a price; a partial sum would read as a real total
      if (pricing && r.every((x) => x.costUsd !== undefined)) s.costUsd = r.reduce((a, x) => a + x.costUsd, 0);
      return s;
    },
  };
}

const tok = (n) => (n < 1000 ? String(n) : n < 1e6 ? `${(n / 1e3).toFixed(1)}k` : `${(n / 1e6).toFixed(1)}M`);

// Accepts a meter or a snapshot. Returns display strings, e.g. ['12.4k in · 3.1k out', 'ctx 27%'].
export function format(meter) {
  const s = typeof meter?.snapshot === 'function' ? meter.snapshot() : meter;
  const out = [`${tok(s.inputTokens)} in · ${tok(s.outputTokens)} out`];
  if (Number.isFinite(s.contextUsedPct)) out.push(`ctx ${Math.round(s.contextUsedPct)}%`);
  if (Number.isFinite(s.costUsd)) out.push(`$${s.costUsd.toFixed(s.costUsd > 0 && s.costUsd < 0.01 ? 4 : 2)}`);
  return out;
}
