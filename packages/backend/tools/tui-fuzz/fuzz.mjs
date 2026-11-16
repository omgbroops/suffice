// Seeded fuzzer for the TUI transcript mappers. Usage: node fuzz.mjs --mapper claude|codex|opencode --seed 1 --sessions 1000
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClaudeMapper } from '../../src/tui/claude.mjs';
import { createCodexMapper } from '../../src/tui/codex.mjs';
import { createOpencodeMapper } from '../../src/tui/opencode.mjs';
import { itemProblem } from '../../src/tui/model.mjs';

const FX = new URL('../../test/fixtures/', import.meta.url);
const jl = (f) => fs.readFileSync(new URL(f, FX), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const POOLS = {
  claude: () => jl('tui-claude/transcript.jsonl'),
  codex: () => [...jl('tui-codex/item-mode.jsonl'), ...jl('tui-codex/legacy.jsonl')],
  opencode: () => JSON.parse(fs.readFileSync(new URL('tui-opencode/rows.json', FX), 'utf8')),
};
const MAPPERS = {
  claude: () => { const m = createClaudeMapper(); return { newState: m.newState, map: (r, s) => m.mapLine(r, s) }; },
  codex: () => { const m = createCodexMapper(); return { newState: () => ({}), map: (r, s) => m.mapLine(r, s) }; },
  opencode: () => { const m = createOpencodeMapper(); return { newState: m.newState, map: (r, s) => m.mapRow(r, s) }; },
};

export function prng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const WEIRD = ['', '\u0000', '\ud800', '��\xff\xfe', 'é'.repeat(3).normalize('NFD'), '‮ rtl', '\n'.repeat(50), null, undefined, 0, -1, NaN, Infinity, true, false, [], {}, [null], { a: { b: null } }, 'x'.repeat(1 << 20), '9'.repeat(400)];
const KEYS = ['type', 'id', 'uuid', 'role', 'name', 'text', 'content', 'message', 'payload', 'input', 'output', 'state', 'status', 'parts', 'data', 'tool_use_id', 'call_id', 'callId', 'timestamp', 'time', 'usage', 'item', 'msg'];

// a chain, not a DAG: shared children make JSON.stringify exponential
function deep(rnd, n) { let o = rnd() < 0.5 ? 'leaf' : null; for (let i = 0; i < n; i++) o = rnd() < 0.5 ? { content: [o] } : [o]; return o; }

// Visit every object node, return list of [parent, key] slots.
function slots(o, out = [], d = 0) {
  if (d > 6 || !o || typeof o !== 'object') return out;
  for (const k of Object.keys(o)) { out.push([o, k]); slots(o[k], out, d + 1); }
  return out;
}

function mutate(rnd, rec) {
  const r = structuredClone(rec);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const s = slots(r);
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const op = Math.floor(rnd() * 9);
    if (op === 8 && !s.length) continue;
    if (op === 0 && s.length) { const [p, k] = pick(s); p[k] = pick(WEIRD); }
    else if (op === 1 && s.length) { const [p, k] = pick(s); delete p[k]; }
    else if (op === 2 && s.length) { const [p, k] = pick(s); p[k] = deep(rnd, 1 + Math.floor(rnd() * 200)); }
    else if (op === 3) r[pick(['type', 'role', 'kind', 'subtype'])] = pick(['zzz', '', 1, null, 'tool_use', 'tool_result', 'message', 'assistant', 'user']);
    else if (op === 4) r[pick(KEYS)] = pick(WEIRD);
    else if (op === 5 && s.length) { const [p, k] = pick(s); p[k] = typeof p[k] === 'string' ? p[k] + pick(WEIRD.filter((w) => typeof w === 'string')) : [p[k]]; }
    else if (op === 6 && s.length) { const [p, k] = pick(s); if (typeof p[k] === 'string' && /id/i.test(k)) p[k] = 'dup'; }
    else if (op === 7) for (const k of Object.keys(r)) if (rnd() < 0.3) delete r[k]; // truncated record
  }
  return r;
}

export function genSession(rnd, pool, size = 5 + Math.floor(rnd() * 60)) {
  const out = [];
  const pick = () => pool[Math.floor(rnd() * pool.length)];
  const mode = rnd();
  if (mode < 0.2) for (let i = 0; i < size && i < pool.length; i++) out.push(pool[i]); // in order
  while (out.length < size) {
    const x = rnd();
    if (x < 0.35) out.push(pick()); // valid, random order (calls without results, results without calls)
    else if (x < 0.4) { const p = pick(); out.push(p, p); } // duplicated ids
    else if (x < 0.5) out.push(pick()[0] ?? WEIRD[Math.floor(rnd() * WEIRD.length)]);
    else if (x < 0.55) out.push(WEIRD[Math.floor(rnd() * WEIRD.length)]); // non-object records
    else if (x < 0.6) out.push({ type: 'unknown_' + Math.floor(rnd() * 5), payload: { type: 'nope' }, content: 'x' });
    else out.push(mutate(rnd, pick()));
  }
  return out;
}

export function runSession(kind, records) {
  const mp = MAPPERS[kind]();
  const state = mp.newState();
  let throws = 0, invalid = 0, first = null;
  for (const rec of records) {
    let items;
    const before = state?.errors?.count ?? 0;
    try { items = mp.map(rec, state); } catch (e) { throws++; first ??= { throw: e, rec }; continue; }
    // mappers swallow throws into state.errors; a non-object record is a counted rejection by design, any other swallowed throw is a defect
    if ((state?.errors?.count ?? 0) > before && rec && typeof rec === 'object') { throws++; first ??= { throw: new Error(`swallowed ${state.errors.lastClass}`), rec }; }
    if (!Array.isArray(items)) { invalid++; first ??= { bad: 'not an array', rec }; continue; }
    for (const it of items) { const p = itemProblem(it); if (p) { invalid++; first ??= { bad: p, it, rec }; } }
  }
  return { throws, invalid, first };
}

export function fuzz(kind, seed, sessions, { size } = {}) {
  const pool = POOLS[kind](), rnd = prng(seed);
  const res = { sessions, records: 0, throws: 0, invalid: 0, slowestMs: 0, firsts: [] };
  for (let i = 0; i < sessions; i++) {
    const recs = genSession(rnd, pool, size);
    res.records += recs.length;
    const t = performance.now();
    const r = runSession(kind, recs);
    res.slowestMs = Math.max(res.slowestMs, performance.now() - t);
    res.throws += r.throws; res.invalid += r.invalid;
    if (r.first && res.firsts.length < 5) res.firsts.push(r.first);
  }
  return res;
}

/** 10,000 valid-ish records cycled from the fixture pool, ids made unique. */
export function bigSession(kind, n = 10000) {
  const pool = POOLS[kind]();
  return Array.from({ length: n }, (_, i) => JSON.parse(JSON.stringify(pool[i % pool.length]).replaceAll(/"(id|uuid|callId|call_id|tool_use_id)":"([^"]*)"/g, `"$1":"$2-${i}"`)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith('--') ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []));
  if (!MAPPERS[a.mapper]) { console.error('--mapper claude|codex|opencode'); process.exit(2); }
  const r = fuzz(a.mapper, Number(a.seed ?? 1), Number(a.sessions ?? 1000));
  console.log(`${a.mapper} seed=${a.seed ?? 1} sessions=${r.sessions} records=${r.records} throws=${r.throws} invalid=${r.invalid} slowest=${r.slowestMs.toFixed(1)}ms`);
  for (const f of r.firsts) console.log(' ', f.throw ? `THROW ${f.throw.stack.split('\n').slice(0, 3).join(' | ')}` : `INVALID ${f.bad}`, String(JSON.stringify(f.rec)).slice(0, 300));
}
