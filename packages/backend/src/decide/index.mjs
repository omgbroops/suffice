import { createHash } from 'node:crypto';
import { assertShape } from '../contract.mjs';
import { POINTS } from './points.mjs';
import { PRESETS } from './presets.mjs';
import { canon, lookup, compile } from './rules.mjs';
import { check } from './schema.mjs';

export const ORDER = ['builtin', 'org', 'user', 'project', 'workflow', 'step'];
const SCOPE_KEYS = ['workflow', 'stepPath', 'tool', 'app', 'domain', 'actionType'];
const KINDS = ['constant', 'rule', 'table', 'script', 'model', 'cache', 'human', 'chain', 'vote', 'shadow'];
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const PLUGIN_NAME = /^[a-z][a-z0-9-]*:[a-z][A-Za-z0-9.-]*$/;
const MAX_DEPTH = 6, MAX_INPUT = 1e5, MAX_ROWS = 10000;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const globs = new Map();
// shortcut: wildcard patterns are capped at 128 chars and 4 stars by validateConfig, not by this function
const glob = (p) => {
  let re = globs.get(p);
  if (!re) { re = new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`); globs.set(p, re); }
  return re;
};

const BUILTIN_SCRIPTS = {
  'builtin:first': ({ candidates }) => ({ tool: candidates?.[0] ?? '' }),
  'builtin:fit': ({ candidates, budget }) => {
    let left = budget; const keep = [];
    for (const c of candidates) if (c.size <= left) { keep.push(c.id); left -= c.size; }
    return { keep };
  },
  'builtin:compact': ({ size, limit }) => ({ compact: size >= 0.8 * limit, keepLast: 10 }),
  'builtin:changed': ({ before, after }) => ({ ok: before !== after, reason: before !== after ? 'changed' : 'unchanged' }),
};

export function createDecider({ runners, ask, scripts: seed, clock, journal, bus, timer, store, strictInputs = process.env.NODE_ENV === 'test', shadowTimeoutMs = 30000 } = {}) {
  assertShape('runners', runners, ['get']);
  assertShape('clock', clock, ['now']);
  if (typeof ask !== 'function') throw new TypeError('ask: expected a function');
  if (journal !== undefined) assertShape('journal', journal, ['append']);
  if (bus !== undefined) assertShape('bus', bus, ['emit']);
  const tm = timer ?? { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h) };

  const points = new Map(Object.entries(POINTS).map(([k, v]) => [k, structuredClone(v)]));
  const scripts = new Map(Object.entries(BUILTIN_SCRIPTS));
  for (const [id, fn] of Object.entries(seed ?? {})) scripts.set(id, fn);
  let layers = {};
  const stats = new Map(), rows = new Map();
  const caches = new WeakMap(), compiled = new WeakMap();
  let seq = 0;

  function definePoint(name, def) {
    if (typeof name !== 'string' || !PLUGIN_NAME.test(name)) throw new TypeError('point name must look like <plugin>:<point>');
    if (points.has(name)) throw new Error(`point "${name}" already defined`);
    if (!isObj(def) || !isObj(def.input) || !isObj(def.output)) throw new TypeError('definePoint: input and output schemas required');
    for (const [k, v] of [['default', def.default], ['closed', def.closed]]) {
      if (k === 'closed' && v === undefined) continue;
      const e = check(def.output, v);
      if (e.length) throw new TypeError(`${k} does not match the output schema: ${e[0]}`);
    }
    points.set(name, structuredClone({ ...def, failClosed: !!def.failClosed }));
  }

  function registerScript(id, fn) {
    if (typeof id !== 'string' || !id || BAD.has(id)) throw new TypeError('script id: expected a non-empty string');
    if (typeof fn !== 'function') throw new TypeError('script: expected a function');
    scripts.set(id, fn);
  }

  function validateConfig(cfg) {
    const errs = [];
    const E = (p, m) => errs.push(`${p}: ${m}`);
    if (!isObj(cfg)) { E('layers', 'must be an object'); return { ok: false, errors: errs }; }
    let nodes = 0, over = false;
    const scan = (v, d, p) => {
      if (over || !v || typeof v !== 'object') return;
      if (++nodes > 20000 || d > 24) { over = true; E(p, 'config too large or too deep'); return; }
      for (const k of Object.keys(v)) { if (BAD.has(k)) E(`${p}.${k}`, 'forbidden key'); scan(v[k], d + 1, `${p}.${k}`); }
    };
    scan(cfg, 0, 'layers');
    const pat = (s, p) => {
      if (typeof s !== 'string' || !s) E(p, 'must be a non-empty string');
      else if (s.length > 128 || (s.match(/\*/g) ?? []).length > 4) E(p, 'pattern too long or too many wildcards');
    };
    const num = (v, p, lo, hi) => { if (v !== undefined && !(Number.isFinite(v) && v >= lo && v <= hi)) E(p, `must be a number from ${lo} to ${hi}`); };
    const str = (v, p, max) => { if (v !== undefined && (typeof v !== 'string' || v.length > max)) E(p, `must be a string of at most ${max} chars`); };
    const list = (v, p, max) => { if (!Array.isArray(v) || !v.length || v.length > max) { E(p, `must be a list of 1 to ${max}`); return false; } return true; };

    function spec(s, p, def, d) {
      if (d > MAX_DEPTH) return E(p, 'nested too deep');
      if (!isObj(s)) return E(p, 'must be an object');
      if (!KINDS.includes(s.kind)) return E(`${p}.kind`, `unknown kind, expected one of ${KINDS.join(', ')}`);
      num(s.timeoutMs, `${p}.timeoutMs`, 1, 3.6e6);
      num(s.confidence, `${p}.confidence`, 0, 1);
      const out = (v, q) => { if (def) for (const m of check(def.output, v)) E(q, `output ${m}`); };
      switch (s.kind) {
        case 'constant':
          if (s.output === undefined) E(`${p}.output`, 'required'); else out(s.output, `${p}.output`);
          break;
        case 'rule':
          if (list(s.rules, `${p}.rules`, 100)) s.rules.forEach((r, i) => {
            const q = `${p}.rules[${i}]`;
            if (!isObj(r)) return E(q, 'must be an object');
            try { compile(r.when); } catch (e) { E(`${q}.when`, e.message); }
            out(r.then, `${q}.then`);
          });
          if (s.default !== undefined) out(s.default, `${p}.default`);
          break;
        case 'table':
          if (!Array.isArray(s.keys) || !s.keys.length || s.keys.length > 8 || s.keys.some((k) => typeof k !== 'string' || BAD.has(k))) E(`${p}.keys`, 'must be 1 to 8 field names');
          if (list(s.rows, `${p}.rows`, 200)) s.rows.forEach((r, i) => {
            if (!isObj(r) || !isObj(r.when)) return E(`${p}.rows[${i}]`, 'needs {when: object, then}');
            out(r.then, `${p}.rows[${i}].then`);
          });
          if (s.default !== undefined) out(s.default, `${p}.default`);
          break;
        case 'script':
          if (typeof s.id !== 'string' || !scripts.has(s.id)) E(`${p}.id`, `unknown script "${s.id}"`);
          break;
        case 'model':
          str(s.runner, `${p}.runner`, 64); str(s.model, `${p}.model`, 64); str(s.prompt, `${p}.prompt`, 8000);
          break;
        case 'cache':
          num(s.ttlMs, `${p}.ttlMs`, 1, 864e5); num(s.max, `${p}.max`, 1, 10000);
          spec(s.inner, `${p}.inner`, def, d + 1);
          break;
        case 'chain': case 'vote':
          if (s.kind === 'vote' && s.mode !== undefined && s.mode !== 'majority' && s.mode !== 'unanimous') E(`${p}.mode`, 'must be majority or unanimous');
          if (s.kind === 'chain') num(s.threshold, `${p}.threshold`, 0, 1);
          if (list(s.deciders, `${p}.deciders`, 10)) s.deciders.forEach((x, i) => spec(x, `${p}.deciders[${i}]`, def, d + 1));
          break;
        case 'shadow':
          spec(s.primary, `${p}.primary`, def, d + 1); spec(s.candidate, `${p}.candidate`, def, d + 1);
          break;
      }
    }

    function pts(o, p) {
      if (!isObj(o)) return E(p, 'must be an object');
      for (const key of Object.keys(o)) {
        const q = `${p}.${key}`;
        pat(key, q);
        const names = [...points.keys()];
        if (key.includes('*') ? !names.some((n) => glob(key).test(n)) : !points.has(key)) { E(q, 'matches no point'); continue; }
        spec(o[key], q, key.includes('*') ? null : points.get(key), 0);
      }
    }

    for (const name of Object.keys(cfg)) {
      const p = `layers.${name}`, L = cfg[name];
      if (!ORDER.includes(name)) { E(p, `unknown layer, expected one of ${ORDER.join(', ')}`); continue; }
      if (!isObj(L)) { E(p, 'must be an object'); continue; }
      for (const k of Object.keys(L)) if (!['router', 'points', 'scopes', 'locks'].includes(k)) E(`${p}.${k}`, 'unknown key');
      if (L.router !== undefined && (typeof L.router !== 'string' || !Object.hasOwn(PRESETS, L.router))) E(`${p}.router`, `unknown preset, expected one of ${Object.keys(PRESETS).join(', ')}`);
      if (L.points !== undefined) pts(L.points, `${p}.points`);
      if (L.scopes !== undefined && list(L.scopes, `${p}.scopes`, 50)) L.scopes.forEach((s, i) => {
        const q = `${p}.scopes[${i}]`;
        if (!isObj(s) || !isObj(s.match)) return E(q, 'needs {match: object, points: object}');
        for (const k of Object.keys(s.match)) { if (!SCOPE_KEYS.includes(k)) E(`${q}.match.${k}`, `unknown scope key, expected one of ${SCOPE_KEYS.join(', ')}`); else pat(s.match[k], `${q}.match.${k}`); }
        pts(s.points, `${q}.points`);
      });
      if (L.locks !== undefined) { if (!Array.isArray(L.locks)) E(`${p}.locks`, 'must be a list'); else L.locks.forEach((l, i) => pat(l, `${p}.locks[${i}]`)); }
    }
    return { ok: !errs.length, errors: errs };
  }

  function loadLayers(cfg) {
    const v = validateConfig(cfg);
    if (!v.ok) throw new Error(`invalid decide config: ${v.errors.join('; ')}`);
    layers = structuredClone(cfg);
  }

  const exportConfig = () => structuredClone(layers);
  const layerOf = (name) => (Object.hasOwn(layers, name) ? layers[name] : name === 'builtin' ? { router: 'balanced' } : null);

  // exact key first, else the longest matching wildcard key
  function entry(pts, point) {
    if (!pts) return null;
    if (Object.hasOwn(pts, point)) return pts[point];
    const k = Object.keys(pts).filter((g) => g.includes('*') && glob(g).test(point)).sort((a, b) => b.length - a.length)[0];
    return k === undefined ? null : pts[k];
  }

  function resolve(point, ctx) {
    const cands = [];
    for (let j = ORDER.length - 1; j >= 0; j--) {
      const layer = ORDER[j], L = layerOf(layer);
      if (!L) continue;
      const add = (via, spec) => { if (spec) cands.push({ layer, j, via, spec }); };
      const hits = (L.scopes ?? []).filter((s) => Object.entries(s.match).every(([k, v]) => typeof ctx[k] === 'string' && glob(v).test(ctx[k])));
      hits.sort((a, b) => Object.keys(b.match).length - Object.keys(a.match).length);
      for (const s of hits) add('scope', entry(s.points, point));
      add('point', entry(L.points, point));
      if (typeof L.router === 'string' && Object.hasOwn(PRESETS, L.router) && Object.hasOwn(PRESETS[L.router], point)) add(`router:${L.router}`, PRESETS[L.router][point]);
    }
    const lockedBy = (j) => ORDER.slice(0, j).find((n) => layerOf(n)?.locks?.some((p) => glob(p).test(point)));
    let winner = null; const shadowed = [], blocked = [];
    for (const c of cands) {
      const by = lockedBy(c.j);
      if (by) blocked.push({ layer: c.layer, kind: c.spec.kind, lockedBy: by });
      else if (!winner) winner = c;
      else shadowed.push({ layer: c.layer, kind: c.spec.kind, via: c.via });
    }
    return { winner, shadowed, blocked };
  }

  function explain(point, ctx = {}) {
    if (!points.has(point)) throw new Error(`unknown decision point "${point}"`);
    const { winner, shadowed, blocked } = resolve(point, ctx);
    return { point, winner: winner ? { layer: winner.layer, kind: winner.spec.kind, via: winner.via } : { layer: 'builtin', kind: 'constant', via: 'default' }, shadowed, blocked };
  }

  const fin = (c, spec, output) => {
    if (output === null || output === undefined) return null;
    const e = check(c.def.output, output);
    if (e.length) throw new Error(`output invalid: ${e[0]}`);
    return { output, confidence: typeof output.confidence === 'number' ? output.confidence : spec.confidence ?? 1 };
  };
  const fill = (tpl, input) => tpl.replace(/\{\{([^}]{1,64})\}\}/g, (_, n) => {
    const v = n === '$input' ? canon(input).slice(0, 20000) : lookup(input, n);
    return typeof v === 'string' ? v : JSON.stringify(v) ?? '';
  });

  async function runSpec(s, input, c) {
    const sub = (x) => runSpec(x, input, c);
    switch (s.kind) {
      case 'constant': return fin(c, s, s.output);
      case 'rule': {
        let rs = compiled.get(s);
        if (!rs) { rs = s.rules.map((r) => ({ test: compile(r.when), then: r.then })); compiled.set(s, rs); }
        return fin(c, s, rs.find((r) => r.test(input))?.then ?? s.default);
      }
      case 'table': {
        const have = s.keys.map((k) => canon(lookup(input, k)));
        const row = s.rows.find((r) => s.keys.every((k, i) => canon(lookup(r.when, k)) === have[i]));
        return fin(c, s, row ? row.then : s.default);
      }
      case 'script': {
        const fn = scripts.get(s.id);
        if (!fn) throw new Error(`unknown script "${s.id}"`);
        return fin(c, s, await fn(structuredClone(input), { ...c.ctx, point: c.point }));
      }
      case 'model': {
        let runner;
        try { runner = runners.get(s.runner ?? 'default'); } catch (e) { throw new Error(`runner unavailable: ${e.message}`); }
        if (!runner) throw new Error(`unknown runner "${s.runner ?? 'default'}"`);
        const base = fill(s.prompt ?? `Decide "${c.point}". Reply with JSON that matches the schema.\n{{$input}}`, input);
        let last;
        for (let attempt = 0; attempt < 2; attempt++) {
          const res = await runner.run({ prompt: attempt ? `${base}\nYour previous answer did not match the schema.` : base, model: s.model, label: `decide:${c.point}`, schema: c.def.output, signal: c.signal });
          if (!res.ok) throw new Error(res.error || 'model failed');
          let v = res.value;
          if (v === undefined && typeof res.text === 'string') { try { v = JSON.parse(res.text); } catch { /* invalid, retried below */ } }
          const e = v === undefined ? ['no value'] : check(c.def.output, v);
          if (!e.length) return fin(c, s, v);
          last = e[0];
        }
        throw new Error(`model output invalid: ${last}`);
      }
      case 'cache': {
        let m = caches.get(s);
        if (!m) { m = new Map(); caches.set(s, m); }
        const key = canon(input), now = clock.now(), hit = m.get(key);
        if (hit && now - hit.at <= (s.ttlMs ?? 60000)) { c.rt.cacheHit = true; return hit.r; }
        const r = await sub(s.inner);
        if (r) {
          if (!m.has(key) && m.size >= (s.max ?? 100)) m.delete(m.keys().next().value);
          m.set(key, { r, at: clock.now() });
        }
        return r;
      }
      case 'human': {
        const a = await ask({ point: c.point, input, schema: c.def.output, ctx: c.ctx, signal: c.signal });
        return fin(c, s, a);
      }
      case 'chain': {
        for (const m of s.deciders) {
          let r; try { r = await sub(m); } catch { continue; }
          if (r && r.confidence >= (s.threshold ?? 0.5)) return r;
        }
        return null;
      }
      case 'vote': {
        const got = (await Promise.allSettled(s.deciders.map(sub))).filter((x) => x.status === 'fulfilled' && x.value).map((x) => x.value);
        const need = s.mode === 'unanimous' ? s.deciders.length : Math.floor(s.deciders.length / 2) + 1;
        const tally = new Map();
        for (const r of got) { const k = canon(r.output); const e = tally.get(k) ?? { r, n: 0 }; e.n++; tally.set(k, e); }
        return [...tally.values()].find((e) => e.n >= need)?.r ?? null;
      }
      case 'shadow': {
        // candidate runs detached on its own timer; the caller gets the primary at once and agreement lands when it settles
        const a = await sub(s.primary);
        const ms = s.candidate.timeoutMs ?? shadowTimeoutMs;
        let h;
        const cand = Promise.race([sub(s.candidate), new Promise((_, rej) => { h = tm.setTimeout(() => rej(Object.assign(new Error('candidate timeout'), { timeout: true })), ms); })]);
        c.rt.late = cand.then((b) => !!b && !!a && canon(a.output) === canon(b.output), (e) => { c.rt.shadowErr = true; if (e?.timeout) c.rt.shadowTimeout = true; return false; })
          .finally(() => tm.clearTimeout(h));
        return a;
      }
    }
    throw new Error(`unknown kind "${s.kind}"`);
  }

  async function decide(point, input, ctx = {}) {
    const def = points.get(point);
    if (!def) throw new Error(`unknown decision point "${point}"`);
    const t0 = clock.now();
    const { winner } = resolve(point, ctx);
    const spec = winner?.spec ?? { kind: 'constant', output: def.default };
    const rt = { cacheHit: false };
    let output, ok = false, error, inp = input, badInput = false;
    const s = stats.get(point) ?? { n: 0, ms: 0, hits: 0, fb: 0, sh: 0, ag: 0, se: 0, inf: 0, to: 0, dis: 0 };
    stats.set(point, s);
    try {
      inp = structuredClone(input);
      const e = check(def.input, inp);
      if (e.length) { badInput = true; throw new Error(`input invalid: ${e[0]}`); }
      if (canon(inp).length > MAX_INPUT) throw new Error('input too large');
      const ac = new AbortController();
      const ms = spec.timeoutMs ?? (spec.kind === 'human' ? 300000 : 10000);
      let h;
      const tp = new Promise((_, rej) => { h = tm.setTimeout(() => { ac.abort(); rej(new Error(`timeout after ${ms}ms`)); }, ms); });
      let r;
      try { r = await Promise.race([runSpec(spec, inp, { def, point, ctx, signal: ac.signal, rt }), tp]); } finally { tm.clearTimeout(h); }
      if (!r) throw new Error('abstained');
      output = r.output; ok = true;
    } catch (e) {
      error = e.message;
      if (badInput) { s.inf++; if (strictInputs) throw e; } // a wrong-shape caller is a bug: loud when strict, safe default otherwise
      output = def.failClosed ? def.closed ?? def.default : def.default;
    }
    output = structuredClone(output);
    const ms = clock.now() - t0, id = `dec-${++seq}`;
    let inputHash = '';
    try { inputHash = createHash('sha1').update(canon(inp) ?? '').digest('hex'); } catch { inputHash = createHash('sha1').update('').digest('hex'); }
    s.n++; s.ms += ms; s.hits += rt.cacheHit ? 1 : 0; s.fb += ok ? 0 : 1;
    let landed = false;
    rt.late?.then((agree) => { landed = true; s.sh++; s.ag += agree ? 1 : 0; if (rt.shadowErr) s.se++; if (rt.shadowTimeout) s.to++; else if (!agree && !rt.shadowErr) s.dis++; });
    for (let i = 0; rt.late && !landed && i < 20; i++) await null; // a fast candidate lands before we return; a slow one never blocks
    if (rows.size >= MAX_ROWS) rows.delete(rows.keys().next().value);
    rows.set(id, { id, point, inputHash, output: structuredClone(output), ok });
    try { store?.append({ id, point, inputHash, output, ok }); } catch { /* dataset loss never breaks a decision */ }
    const data = { decisionId: id, point, deciderKind: spec.kind, layer: winner?.layer ?? 'builtin', ms, cacheHit: rt.cacheHit, outputSummary: (JSON.stringify(output) ?? '').slice(0, 200), ok, runId: ctx.runId };
    if (error) data.error = error;
    try { bus?.emit('decision', data); } catch { /* a listener never breaks a decision */ }
    try { await journal?.append({ type: 'decision', data }); } catch { /* journal loss never breaks a decision */ }
    if (output && typeof output === 'object') Object.defineProperty(output, 'decisionId', { value: id });
    return output;
  }

  return {
    definePoint, registerScript, loadLayers, decide, explain, validateConfig, exportConfig,
    stats: () => Object.fromEntries([...stats].map(([p, s]) => [p, { count: s.n, meanMs: s.n ? s.ms / s.n : 0, cacheHitRate: s.n ? s.hits / s.n : 0, fallbacks: s.fb, agreement: s.sh ? s.ag / s.sh : null, shadowErrors: s.se, inputFailures: s.inf, timeouts: s.to, disagreements: s.dis }])),
    *dataset() { for (const r of rows.values()) yield { ...r }; },
    recordOutcome(id, outcome) { const r = rows.get(id); if (!r) return false; r.outcome = structuredClone(outcome); try { store?.append({ id, outcome: { ok: r.outcome?.ok } }); } catch { /* see above */ } return true; },
  };
}
