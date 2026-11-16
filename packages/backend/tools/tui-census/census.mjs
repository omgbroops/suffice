// Census of every distinct record shape in real Claude Code transcripts, and how many the chat mapper handles.
// Usage: nice -n 19 node census.mjs scan   -> SIGNATURES.json (structure only, cached)
//        node census.mjs emit               -> fixtures, index.json, COVERAGE.txt from the cache (no rescan)
// PRIVACY: only structure leaves this script: record types, key names, value types, tool names, short enum values of
// allowlisted fields, verdicts and counts. Message text, inputs, outputs, paths and file names are never stored or printed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createClaudeMapper } from '../../src/tui/claude.mjs';
import { itemProblem } from '../../src/tui/model.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIG_FILE = path.join(HERE, 'SIGNATURES.json');
const FIX_DIR = path.join(HERE, '../../test/fixtures/tui-census');
const ENUM_FIELDS = new Set(['type', 'subtype', 'role', 'stop_reason', 'level', 'isSidechain', 'status', 'is_error']);
const MAX_LINE = 20e6;

const enumVal = (v) => (typeof v === 'string' ? (v.length < 40 && !/[\s/\\]/.test(v) ? v : '<str>') : String(v));
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,39}$/;
const keyName = (k) => (KEY_RE.test(k) && !/\d{3,}/.test(k) && !/^[0-9a-f_-]{8,}$/i.test(k) ? k : '<key>');
const toolName = (n) => (typeof n !== 'string' ? '<tool>' : n.startsWith('mcp__') ? 'mcp__<server>__<tool>' : KEY_RE.test(n) ? n : '<tool>');
const tyOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function walk(dir, out = []) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p); }
  return out;
}

// key paths to depth 3; message.content and toolUseResult are described separately; map-like objects collapse to {map}
function keyPaths(o, prefix, depth, acc) {
  const ks = Object.keys(o);
  if (ks.length > 25) { acc.add(`${prefix}{map}`); return; }
  for (const k of ks) {
    const p = `${prefix}${keyName(k)}`;
    if (p === 'message.content' || p === 'toolUseResult') { acc.add(p); continue; }
    acc.add(p);
    if (depth < 2 && isObj(o[k])) keyPaths(o[k], `${p}.`, depth + 1, acc);
  }
}

function blocks(obj) {
  const c = obj.message?.content;
  if (typeof c === 'string') return [{ id: 'str', b: null }];
  if (!Array.isArray(c)) return [];
  const seen = new Map();
  for (const b of c) {
    if (!isObj(b)) { seen.set('nonobject', { b }); continue; }
    const t = enumVal(b.type);
    const id = t === 'tool_use' ? `tool_use:${toolName(b.name)}` : t === 'tool_result' ? `tool_result:${b.is_error === true ? 'err' : 'ok'}:${typeof b.content === 'string' ? 'str' : Array.isArray(b.content) ? 'arr' : tyOf(b.content)}` : t;
    if (!seen.has(id)) seen.set(id, { b });
  }
  return [...seen].map(([id, v]) => ({ id, b: v.b }));
}

function turDesc(t) {
  if (t === undefined) return ['tur=none'];
  if (!isObj(t)) return [`tur=${tyOf(t)}`];
  const ks = Object.keys(t);
  if (ks.length > 40) return ['tur=map'];
  return [...new Set(ks.map((k) => `turkey=${keyName(k)}:${tyOf(t[k])}`))].sort();
}

function signature(obj) {
  const bl = blocks(obj).map((x) => x.id).sort();
  const parts = [`type=${enumVal(obj.type)}`];
  if ('subtype' in obj) parts.push(`subtype=${enumVal(obj.subtype)}`);
  if (isObj(obj.attachment)) parts.push(`att=${enumVal(obj.attachment.type)}`);
  if (obj.isSidechain === true) parts.push('sidechain');
  if (obj.message?.role !== undefined) parts.push(`role=${enumVal(obj.message.role)}`);
  if (obj.message?.stop_reason !== undefined) parts.push(`stop=${enumVal(obj.message.stop_reason)}`);
  if (obj.level !== undefined) parts.push(`level=${enumVal(obj.level)}`);
  if (bl.length) for (const b of bl) parts.push(`block=${b}`);
  if (bl.some((x) => x.startsWith('tool_result'))) parts.push(...turDesc(obj.toolUseResult));
  return parts;
}

// structure-only stand-in of the same shape
const ENUM_OK = (k, v) => ENUM_FIELDS.has(k) && typeof v === 'string' && v.length < 40 && !/[\s/\\]/.test(v);
function ph(v, k) {
  if (typeof v === 'string') return ENUM_OK(k, v) ? v : /time/i.test(k) ? '2026-01-01T00:00:00.000Z' : /uuid|id$/i.test(k) ? '<id>' : '<text>';
  if (typeof v === 'number') return 1;
  if (typeof v === 'boolean' || v === null) return v;
  return null;
}
function synth(v, k, depth) {
  if (!isObj(v) && !Array.isArray(v)) return ph(v, k);
  if (Array.isArray(v)) return v.length && depth < 3 ? [synth(v[0], k, depth + 1)] : [];
  if (depth >= 3) return {};
  const o = {}; for (const [kk, vv] of Object.entries(v)) { if (Object.keys(v).length <= 40 && /^[A-Za-z_]\w{0,39}$/.test(kk)) o[kk] = synth(vv, kk, depth + 1); } return o;
}
function synthBlock(b) {
  if (!isObj(b)) return '<text>';
  const t = enumVal(b.type), o = { type: t };
  if (t === 'text') o.text = '<text>';
  else if (t === 'thinking') { o.thinking = '<text>'; o.signature = '<text>'; }
  else if (t === 'tool_use') { o.id = '<id>'; o.name = toolName(b.name); o.input = {}; }
  else if (t === 'tool_result') { o.tool_use_id = '<id>'; o.content = typeof b.content === 'string' ? '<text>' : Array.isArray(b.content) ? [{ type: 'text', text: '<text>' }] : null; if (b.is_error === true) o.is_error = true; }
  else for (const k of Object.keys(b)) if (/^[A-Za-z_]\w{0,39}$/.test(k) && k !== 'type') o[k] = ph(b[k], k);
  return o;
}
function synthRecord(obj) {
  const s = synth({ ...obj, message: undefined, toolUseResult: undefined }, '', 0);
  if (obj.message !== undefined) {
    const m = isObj(obj.message) ? synth({ ...obj.message, content: undefined }, 'message', 1) : '<text>';
    if (isObj(obj.message)) {
      const c = obj.message.content;
      if (typeof c === 'string') m.content = '<text>';
      else if (Array.isArray(c)) m.content = blocks(obj).map((x) => synthBlock(x.b));
    }
    s.message = m;
  }
  const t = obj.toolUseResult;
  if (t !== undefined) s.toolUseResult = isObj(t) ? Object.fromEntries(Object.keys(t).slice(0, 40).filter((k) => /^[A-Za-z_]\w{0,39}$/.test(k)).map((k) => [k, ph(t[k], k) ?? (Array.isArray(t[k]) ? [] : isObj(t[k]) ? {} : null)])) : ph(t, 'toolUseResult') ?? [];
  for (const k of Object.keys(s)) if (s[k] === undefined) delete s[k];
  return s;
}

const fp = (s) => JSON.stringify([s.title, s.agentName, s.costUsd, s.uiMode, s.fileHistory, s.results.size, s.calls.size, s.emitted.size, s.queue.length, s.pendingAtt.length, JSON.stringify(s.tasks), JSON.stringify(s.agentNames), s.model, s.mode, s.cwd, s.branch, s.sessionId, s.ctxTokens]);
const ssum = (s) => Object.values(s.skipped ?? {}).reduce((a, b) => a + b, 0);
const dsum = (s) => Object.values(s.dropped).reduce((a, b) => a + b, 0);

// one record through a mapper with its file's state; returns the verdict (no content)
function judge(mapper, state, obj) {
  const e0 = state.errors.count, d0 = dsum(state), s0 = state.sidechainSkipped, f0 = fp(state), sk0 = ssum(state), dk0 = { ...state.dropped };
  const out = mapper.mapLine(obj, state);
  const threw = state.errors.count > e0;
  const invalid = out.some((it) => itemProblem(it) !== null);
  const kinds = new Set(out.map((it) => it.kind));
  if (dsum(state) > d0) for (const k of Object.keys(state.dropped)) if (state.dropped[k] !== dk0[k]) kinds.add(`skip:${enumVal(k)}`);
  if (state.sidechainSkipped > s0) kinds.add('skip:sidechain');
  if (ssum(state) > sk0) kinds.add('skip:redundant'); // state.skipped: repeat/replayed/empty record, counted by name
  const absorbed = fp(state) !== f0;
  if (absorbed && !kinds.size) kinds.add('state');
  const verdict = threw ? 'threw' : invalid ? 'invalid' : kinds.size ? 'handled' : 'dropped';
  return { verdict, kinds: [...kinds] };
}

// Key names are user data when an object is keyed by paths, commands or titles. A key name leaves the script only if it
// matches KEY_RE and was seen in at least COMMON_MIN records (fixed schema names); everything else becomes <key>.
const COMMON_MIN = 1000;
function cleanKeys(v, common) {
  if (Array.isArray(v)) return v.map((x) => cleanKeys(x, common));
  if (!isObj(v)) return v;
  const o = {};
  for (const [k, x] of Object.entries(v)) { const kk = common.has(k) ? k : '<key>'; if (!(kk in o)) o[kk] = cleanKeys(x, common); }
  return o;
}
function sanitize(sigs, segCount, totalFiles) {
  const common = new Set([...segCount].filter(([, c]) => c >= COMMON_MIN).map(([k]) => k));
  for (const k of ['<key>', '{map}']) common.add(k);
  const turW = new Map();
  for (const e of sigs.values()) for (const t of e.signature) if (t.startsWith('turkey=')) { const k = t.slice(7, t.lastIndexOf(':')); turW.set(k, (turW.get(k) || 0) + e.count); }
  for (const [k, c] of turW) if (c >= COMMON_MIN && KEY_RE.test(k)) common.add(k);
  const out = new Map();
  for (const e of sigs.values()) {
    const sigT = [...new Set(e.signature.map((t) => { if (!t.startsWith('turkey=')) return t; const i = t.lastIndexOf(':'), k = t.slice(7, i); return `turkey=${common.has(k) ? k : '<key>'}${t.slice(i)}`; }))];
    const id = sigT.join(' ');
    const ku = [...new Set([...e.keyUnion].map((p) => p.split('.').map((g) => (common.has(g) ? g : '<key>')).join('.')))].sort().map((p) => p.split('.'));
    const o = out.get(id);
    if (!o) { out.set(id, { ...e, lastFile: undefined, signature: sigT, keyUnion: new Map(ku.map((p) => [p.join('.'), p])), synthetic: cleanKeys(e.synthetic, common) }); continue; }
    o.count += e.count; o.files = Math.min(totalFiles, o.files + e.files);
    for (const [k, c] of Object.entries(e.verdicts)) o.verdicts[k] = (o.verdicts[k] || 0) + c;
    for (const [k, c] of Object.entries(e.kinds)) o.kinds[k] = (o.kinds[k] || 0) + c;
    for (const p of ku) o.keyUnion.set(p.join('.'), p);
  }
  return [...out.values()].map((e) => ({ ...e, keyUnion: [...e.keyUnion.values()] }));
}

async function scan() {
  const root = path.join(os.homedir(), '.claude', 'projects');
  const files = walk(root);
  const segCount = new Map(), sigs = new Map(), tools = {}, blockTypes = {}, sysSub = {}, attKinds = {}, recTypes = {}, hookKinds = {};
  const tot = { files: files.length, records: 0, parseFail: 0, longLines: 0, sidechainRecords: 0 };
  const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  for (let fi = 0; fi < files.length; fi++) {
    if (fi % 200 === 0) console.error(`file ${fi}/${files.length} sigs=${sigs.size} heapMB=${Math.round(process.memoryUsage().heapUsed / 1e6)}`);
    const sub = files[fi].includes(`${path.sep}subagents${path.sep}`);
    const mapper = createClaudeMapper({ includeSidechain: sub });
    const state = mapper.newState();
    const rl = readline.createInterface({ input: fs.createReadStream(files[fi], { encoding: 'utf8', highWaterMark: 1 << 20 }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      if (line.length > MAX_LINE) { tot.longLines++; continue; }
      let obj; try { obj = JSON.parse(line); } catch { tot.parseFail++; continue; }
      if (!isObj(obj)) { tot.parseFail++; continue; }
      tot.records++;
      const sigT = signature(obj), sig = sigT.join(' '); const kp = new Set(); keyPaths(obj, '', 1, kp);
      for (const p of kp) { const g = p.slice(p.lastIndexOf('.') + 1); const c = segCount.get(g); if (c !== undefined) segCount.set(g, c + 1); else if (segCount.size < 300000) segCount.set(g, 1); }
      let e = sigs.get(sig);
      if (!e) { e = { signature: sigT, count: 0, files: 0, lastFile: -1, verdicts: {}, kinds: {}, keyUnion: new Set(), synthetic: synthRecord(obj) }; sigs.set(sig, e); }
      for (const p of kp) e.keyUnion.add(p); e.count++; if (e.lastFile !== fi) { e.files++; e.lastFile = fi; }
      const j = judge(mapper, state, obj);
      // shortcut: bound per-file mapper state (keeps the newest 300 calls/results, drops dedupe memory); a tool pair split by that window is rare
      if (tot.records % 500 === 0) for (const m of [state.emitted, state.calls, state.results]) { let over = m.size - 300; for (const k of m.keys()) { if (over-- <= 0) break; m.delete(k); } }
      inc(e.verdicts, j.verdict); for (const k of j.kinds) inc(e.kinds, k);
      inc(recTypes, enumVal(obj.type));
      if (obj.isSidechain === true) tot.sidechainRecords++;
      if (obj.type === 'system') inc(sysSub, enumVal(obj.subtype));
      if (obj.type === 'attachment' && isObj(obj.attachment)) inc(attKinds, enumVal(obj.attachment.type));
      if (/hook|notif/i.test(String(obj.type)) || /hook|notif/i.test(String(obj.subtype)) || /hook|notif/i.test(String(obj.attachment?.type))) inc(hookKinds, `${enumVal(obj.type)}+${enumVal(obj.subtype ?? obj.attachment?.type ?? '-')}`);
      const c = obj.message?.content;
      if (typeof c === 'string') inc(blockTypes, 'string');
      else if (Array.isArray(c)) for (const b of c) { const t = isObj(b) ? enumVal(b.type) : 'nonobject'; inc(blockTypes, t); if (t === 'tool_use') inc(tools, toolName(b.name)); }
    }
  }
  const merged = sanitize(sigs, segCount, tot.files);
  const list = merged.sort((a, b) => b.count - a.count).map((e, i) => ({ n: i + 1, ...e }));
  fs.writeFileSync(SIG_FILE, JSON.stringify({ totals: tot, distinctSignatures: list.length, recordTypes: recTypes, tools, blockTypes, systemSubtypes: sysSub, attachmentKinds: attKinds, hookNotificationKinds: hookKinds, signatures: list }));
  console.log(`scanned files=${tot.files} records=${tot.records} signatures=${list.length}`);
}

// ---- emit: fixtures, test index, COVERAGE.txt ----
function probeTool(name) {
  const m = createClaudeMapper(), st = m.newState();
  const nm = name.startsWith('mcp__') ? 'mcp__srv__tool' : name;
  const items = m.mapLine({ type: 'assistant', uuid: 'u1', timestamp: '2026-01-01T00:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: nm, input: {} }] } }, st);
  const it = items[0]; return it ? `${it.kind}${it.category ? '/' + it.category : ''}` : 'no item';
}
function emitAll() {
  const D = JSON.parse(fs.readFileSync(SIG_FILE, 'utf8'));
  fs.rmSync(FIX_DIR, { recursive: true, force: true }); fs.mkdirSync(FIX_DIR, { recursive: true });
  const index = [];
  for (const s of D.signatures) {
    const m = createClaudeMapper({ includeSidechain: false }), st = m.newState();
    const syn = judge(m, st, structuredClone(s.synthetic));
    const real = Object.entries(s.verdicts).sort((a, b) => b[1] - a[1])[0][0]; // majority real-record verdict
    fs.writeFileSync(path.join(FIX_DIR, `${s.n}.json`), JSON.stringify(s.synthetic));
    const cls = s.signature.filter((p) => /^(type|subtype|att)=/.test(p));
    index.push({ n: s.n, cls, shape: s.signature, real, synthetic: syn.verdict, ok: s.verdicts.dropped === undefined && s.verdicts.invalid === undefined && s.verdicts.threw === undefined && syn.verdict !== 'threw' && syn.verdict !== 'invalid' });
  }
  fs.writeFileSync(path.join(FIX_DIR, 'index.json'), JSON.stringify(index));

  const T = D.totals, V = { handled: 0, dropped: 0, invalid: 0, threw: 0 }, SV = { handled: 0, dropped: 0, invalid: 0, threw: 0 };
  for (const s of D.signatures) { for (const [k, c] of Object.entries(s.verdicts)) V[k] += c; const w = ['threw', 'invalid', 'dropped'].find((k) => s.verdicts[k]); SV[w || 'handled']++; }
  const pct = (a, b) => `${((100 * a) / b).toFixed(2)}%`;
  const L = [];
  L.push('COVERAGE: Claude Code transcript record shapes vs src/tui/claude.mjs (structure only; no content)');
  L.push(`distinct signatures ${D.distinctSignatures} | records ${T.records} | files ${T.files} | tool names ${Object.keys(D.tools).length} | block types ${Object.keys(D.blockTypes).length} | sidechain records ${T.sidechainRecords} | unparsed lines ${T.parseFail} | oversize lines skipped ${T.longLines}`);
  L.push(`records: handled ${V.handled} (${pct(V.handled, T.records)}) | dropped ${V.dropped} (${pct(V.dropped, T.records)}) | invalid ${V.invalid} (${pct(V.invalid, T.records)}) | threw ${V.threw} (${pct(V.threw, T.records)})`);
  L.push(`signatures with every record handled: ${SV.handled} of ${D.distinctSignatures} (${pct(SV.handled, D.distinctSignatures)}); with some dropped ${SV.dropped}, invalid ${SV.invalid}, threw ${SV.threw}`);
  L.push('handled = valid item, a counted documented skip, or absorbed into mapper state (title, cost, results). dropped = nothing emitted, no skip counter, no state change.');
  L.push('', 'TOP 30 UNHANDLED SIGNATURES by unhandled record count');
  const un = D.signatures.map((s) => ({ s, u: (s.verdicts.dropped || 0) + (s.verdicts.invalid || 0) + (s.verdicts.threw || 0) })).filter((x) => x.u).sort((a, b) => b.u - a.u).slice(0, 30);
  for (const { s, u } of un) L.push(`#${s.n} unhandled ${u} of ${s.count} | ${JSON.stringify(s.verdicts)} | ${s.signature.join(' ')}`);
  L.push('', 'RECORD TYPES'); for (const [k, v] of Object.entries(D.recordTypes).sort((a, b) => b[1] - a[1])) L.push(`${k} ${v}`);
  L.push('', 'BLOCK TYPES'); for (const [k, v] of Object.entries(D.blockTypes).sort((a, b) => b[1] - a[1])) L.push(`${k} ${v}`);
  L.push('', 'SYSTEM SUBTYPES'); for (const [k, v] of Object.entries(D.systemSubtypes).sort((a, b) => b[1] - a[1])) L.push(`${k} ${v}`);
  L.push('', 'ATTACHMENT KINDS'); for (const [k, v] of Object.entries(D.attachmentKinds).sort((a, b) => b[1] - a[1])) L.push(`${k} ${v}`);
  L.push('', 'HOOK / NOTIFICATION KINDS'); for (const [k, v] of Object.entries(D.hookNotificationKinds).sort((a, b) => b[1] - a[1])) L.push(`${k} ${v}`);
  L.push('', 'TOOL NAMES (count | mapper rendering, probed by feeding a tool_use through the mapper)');
  for (const [k, v] of Object.entries(D.tools).sort((a, b) => b[1] - a[1])) { const r = probeTool(k); L.push(`${k} ${v} | ${r} | ${/\/other$/.test(r) || r === 'no item' ? 'generic' : 'specific'}`); }
  fs.writeFileSync(path.join(HERE, 'COVERAGE.txt'), L.join('\n') + '\n');
  console.log(`fixtures=${index.length} ok=${index.filter((i) => i.ok).length}`);
}

const cmd = process.argv[2];
if (cmd === 'scan') await scan(); else if (cmd === 'emit') emitAll(); else console.log('usage: census.mjs scan|emit');
