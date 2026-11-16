// Replays real Claude Code + Codex chat history through the TUI mappers and reports what they drop or get wrong.
// PRIVACY: chat files are read locally only. The report holds key names, enum-like type values, counts and lengths, nothing else.
// Every string that reaches the report passes san() and the whole report passes leakCheck() before anything is written.
// Throws inside mapLine are swallowed by both mappers (try/catch) and cannot be observed from outside: reported as a finding.
// Usage: node replay.mjs [--home DIR] [--minutes 15] [--max-sub 400] [--max-headless 400] [--out DIR]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHistory } from '../../src/history/index.mjs';
import claudeCode from '../../src/history/sources/claude-code.mjs';
import codexSrc from '../../src/history/sources/codex.mjs';
import { createClaudeMapper } from '../../src/tui/claude.mjs';
import { createCodexMapper } from '../../src/tui/codex.mjs';
import { itemProblem } from '../../src/tui/model.mjs';

const MAX_LINE = 5 * 1024 * 1024;
export const CHILD_PATTERN = '<project>/<session>/subagents/agent-<id>.jsonl';
// Fixed labels of mine that may contain spaces or path separators; everything else must be printable ASCII with none.
export const FIXED = new Set([CHILD_PATTERN, 'throws are swallowed by mapLine try/catch and not observable']);

// ---- privacy guards ----
/** Keeps format-like values (type names, enums, model ids); anything else collapses to a label. */
export const san = (s) => (typeof s === 'string' ? (/^[A-Za-z0-9_.:+\-]{1,60}$/.test(s) ? s : '(other)') : '(none)');
export function leakCheck(report) {
  const bad = (why, len) => { throw new Error(`leak check failed: ${why} (length ${len})`); };
  const str = (s) => {
    if (FIXED.has(s)) return;
    if (s.length > 80) bad('string over 80 chars', s.length);
    if (!/^[\x21-\x7e]*$/.test(s)) bad('space, non-ASCII or control char', s.length);
    if (/[\\/]/.test(s)) bad('path separator', s.length);
  };
  const walk = (v) => {
    if (typeof v === 'string') return str(v);
    if (typeof v === 'number') return Number.isFinite(v) || bad('non-finite number', 0);
    if (v === null || typeof v === 'boolean') return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === 'object') { for (const k of Object.keys(v)) { str(k); walk(v[k]); } return; }
    bad(`type ${typeof v}`, 0);
  };
  walk(report);
}

// ---- small helpers ----
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const map0 = () => Object.create(null);
const cov = (o, k) => (o[k] ??= { seen: 0, produced: 0, none: 0 });
const idn = (it) => {
  const s = it.kind === 'tool' || it.kind === 'subagent' ? `${it.callId}|${it.name}` : it.kind === 'usage' ? it.model ?? '' : `${it.text ?? ''}|${it.code ?? ''}`;
  return createHash('md5').update(s).digest('base64').slice(0, 10);
};
class Dist {
  constructor(cap = 50000) { this.n = 0; this.max = 0; this.a = []; this.cap = cap; this.seed = 12345; }
  add(v) {
    this.n++; if (v > this.max) this.max = v;
    if (this.a.length < this.cap) this.a.push(v);
    else { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; const j = this.seed % this.n; if (j < this.cap) this.a[j] = v; }
  }
  sum() {
    const a = [...this.a].sort((x, y) => x - y);
    const p = (q) => (a.length ? Math.round(a[Math.min(a.length - 1, Math.floor(q * a.length))] * 100) / 100 : 0);
    return { n: this.n, p50: p(0.5), p90: p(0.9), p99: p(0.99), max: Math.round(this.max * 100) / 100 };
  }
}
const toolKey = (name, category) => (category === 'mcp' || String(name).startsWith('mcp__') ? 'mcp__*' : san(name));

// ---- streaming ----
/** Calls onLine(text) per line; lines over MAX_LINE are skipped and counted. onLine returning true stops the file. */
export async function eachLine(file, onLine, st) {
  const rs = fs.createReadStream(file, { highWaterMark: 1 << 20 });
  let carry = [], len = 0, skipping = false, stop = false;
  const fin = () => {
    if (skipping) st.skippedLong++;
    else if (len) { const b = carry.length === 1 ? carry[0] : Buffer.concat(carry); if (onLine(b.toString('utf8'))) stop = true; }
    carry = []; len = 0; skipping = false;
  };
  const add = (seg) => { if (skipping) return; len += seg.length; if (len > MAX_LINE) { skipping = true; carry = []; } else carry.push(seg); };
  try {
    for await (const chunk of rs) {
      st.bytes += chunk.length;
      let start = 0;
      for (;;) {
        const nl = chunk.indexOf(10, start);
        if (nl < 0) { add(chunk.subarray(start)); break; }
        add(chunk.subarray(start, nl)); fin(); start = nl + 1;
        if (stop) { rs.destroy(); return; }
      }
    }
    fin();
  } catch { st.unreadable++; }
}

// ---- aggregate ----
function newAgg() {
  return { chats: 0, lines: 0, parseFail: 0, lineCov: map0(), shapeCov: map0(), blockCov: map0(), lineKeys: map0(), invalid: map0(), tools: map0(),
    orphanResults: 0, noticeByCode: map0(), noticeByTrigger: map0(), noticeTotal: 0, userItems: 0, noticePerUser: new Dist(), chatsNoticeNoUser: 0,
    assistantLines: 0, assistantNoMsgId: 0, assistantNoUsage: 0, msgIds: 0, usageEmissions: 0, usageIds: 0, usageEventsNoInfo: 0,
    collisions: map0(), updates: map0(), outOfOrder: 0, tsZero: 0, firstSeen: 0,
    thinking: { blocksSeen: 0, nonEmpty: 0, empty: 0, emptyWithSignature: 0, redacted: 0, itemsEmitted: 0, blockKeys: map0(), chatsWithBlocks: 0, chatsWithItems: 0 },
    dist: { itemsPerChat: new Dist(), toolOutLen: new Dist(), diffPerEdit: new Dist(), assistantLen: new Dist(), thinkingLen: new Dist(), notices: new Dist() },
    kindChats: map0(), typesByFile: map0(), sidechainLines: map0(), itemKeys: map0(),
    sub: { calls: 0, noAgentId: 0, exact: 0, otherName: 0, notFound: 0, resultKeys: map0(), resultStatus: map0(), callInputKeys: map0(), childIdWithoutCall: 0 },
    meta: { chats: 0, model: 0, mode: 0, cwd: 0, branch: 0, contextUsedPct: 0, sessionId: 0, ctxAt100: 0, modes: map0(), models: map0() } };
}

function newCh(file, kind) { return { file, kind, fin: new Map(), idn: new Map(), maxTs: -Infinity, kinds: new Set(), calls: new Map(), results: new Set(), subCalls: new Map(), msgIds: new Set(), usageIds: new Set(), usersSeen: 0, notices: 0, thinkBlocks: 0, thinkItems: 0 }; }

/** Validates + records every emitted item. trigger = fixed-vocabulary name of the input that produced it. */
function items(agg, ch, out, trigger) {
  for (const it of out) {
    const prob = itemProblem(it);
    if (prob) inc(agg.invalid, san(String(prob).replace(/[\s/]+/g, '_')));
    const id = it?.id; if (typeof id !== 'string') continue;
    const k = san(it.kind), h = idn(it), prev = ch.idn.get(id);
    if (prev === undefined) {
      ch.idn.set(id, h); agg.firstSeen++;
      if (!(it.ts > 0)) agg.tsZero++;
      else { if (it.ts < ch.maxTs) agg.outOfOrder++; ch.maxTs = Math.max(ch.maxTs, it.ts); }
    } else inc(prev === h ? agg.updates : agg.collisions, k);
    ch.kinds.add(k);
    ch.fin.set(id, { kind: it.kind, category: it.category, name: it.name, status: it.status, outLen: typeof it.output?.text === 'string' ? it.output.text.length : -1,
      diffN: Array.isArray(it.output?.diff) ? it.output.diff.length : -1, textLen: typeof it.text === 'string' ? it.text.length : 0 });
    if (it.kind === 'notice') { agg.noticeTotal++; ch.notices++; inc(agg.noticeByCode, san(it.code)); inc(agg.noticeByTrigger, `${trigger}~${san(it.code)}`); }
    if (it.kind === 'usage') { agg.usageEmissions++; ch.usageIds.add(id); }
    if (it.kind === 'thinking') { agg.thinking.itemsEmitted++; ch.thinkItems++; }
  }
}

function keysOf(table, group, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  const g = (table[group] ??= map0());
  for (const k of Object.keys(obj)) inc(g, san(k));
}

function finishChat(agg, ch, meta) {
  agg.chats++;
  const d = agg.dist, pend = { users: 0 };
  for (const f of ch.fin.values()) {
    if (f.kind === 'user') pend.users++;
    if (f.kind === 'tool' && f.outLen >= 0) d.toolOutLen.add(f.outLen);
    if (f.kind === 'tool' && (f.category === 'edit' || f.category === 'write') && f.diffN >= 0) d.diffPerEdit.add(f.diffN);
    if (f.kind === 'assistant') d.assistantLen.add(f.textLen);
    if (f.kind === 'thinking') d.thinkingLen.add(f.textLen);
  }
  d.itemsPerChat.add(ch.idn.size);
  agg.userItems += pend.users;
  if (pend.users) agg.noticePerUser.add(ch.notices / pend.users); else if (ch.notices) agg.chatsNoticeNoUser++;
  d.notices.add(ch.notices);
  for (const k of ch.kinds) inc(agg.kindChats, k);
  agg.msgIds += ch.msgIds.size; agg.usageIds += ch.usageIds.size;
  if (ch.thinkBlocks) agg.thinking.chatsWithBlocks++;
  if (ch.thinkItems) agg.thinking.chatsWithItems++;
  const m = agg.meta; m.chats++;
  for (const k of ['model', 'mode', 'cwd', 'branch', 'contextUsedPct', 'sessionId']) if (meta[k] !== undefined && meta[k] !== null && meta[k] !== '') m[k]++;
  if (meta.contextUsedPct >= 100) m.ctxAt100++;
  if (meta.mode) inc(m.modes, san(meta.mode.replace(/\s+/g, '_').replace(/\//g, '+')));
  if (meta.model) inc(m.models, san(meta.model));
}

// ---- Claude ----
function claudeLine(agg, ch, obj, state, out, opts) {
  const type = san(obj.type), sub = obj.type === 'attachment' ? obj.attachment?.type : obj.subtype;
  const key = sub ? `${type}.${san(sub)}` : type;
  for (const [t, kk] of [[agg.lineCov, key], [agg.lineCov, type]]) { if (kk === key || sub) { const c = cov(t, kk); c.seen++; out.length ? c.produced++ : c.none++; } if (!sub) break; }
  inc(agg.typesByFile[ch.kind] ??= map0(), key);
  if (obj.isSidechain === true) inc(agg.sidechainLines, ch.kind);
  keysOf(agg.lineKeys, type, obj);
  const c = obj.message?.content;
  let trigger = key;
  if (obj.type === 'user') {
    const arr = Array.isArray(c);
    const shape = obj.isMeta ? 'meta' : obj.isCompactSummary ? 'compactSummary' : obj.isVisibleInTranscriptOnly ? 'visibleOnly' : arr && c.some((b) => b?.type === 'tool_result') ? 'toolResult' : arr ? 'blocks' : typeof c === 'string' ? 'string' : 'other';
    const sc = cov(agg.shapeCov, `user.${shape}`); sc.seen++; out.length ? sc.produced++ : sc.none++;
    if (typeof c === 'string') {
      trigger = c.includes('<local-command-stdout>') ? 'user.localStdout' : c.startsWith('[Request interrupted') ? 'user.interruptText' : c.includes('<task-notification>') ? 'user.taskNotification' : 'user.string';
      const b = cov(agg.blockCov, 'user.string'); b.seen++; out.length ? b.produced++ : b.none++;
    }
    if (obj.permissionMode && out.some((i) => i.code === 'mode_changed')) trigger = 'user.permissionMode';
  } else if (obj.type === 'permission-mode') trigger = 'permission-mode';
  else if (obj.type === 'assistant') {
    agg.assistantLines++;
    if (typeof obj.message?.id !== 'string') agg.assistantNoMsgId++; else ch.msgIds.add(obj.message.id);
    if (!obj.message?.usage) agg.assistantNoUsage++;
    if (out.some((i) => i.code === 'model_changed')) trigger = 'assistant.modelChange';
  }
  if (Array.isArray(c)) c.forEach((b, i) => {
    const bt = san(b?.type), bk = `${type}.${bt}`;
    const uuid = typeof obj.uuid === 'string' ? obj.uuid : null;
    let made;
    if (b?.type === 'tool_use') {
      const id = typeof b.id === 'string' ? b.id : null;
      if (id) { ch.calls.set(id, toolKey(b.name)); if (b.name === 'Agent' || b.name === 'Task') { ch.subCalls.set(id, null); keysOf(agg.sub.callInputKeys, 'input', b.input); } }
      made = id && ['tool:', 'todo:', 'sub:'].some((p) => state.emitted.has(p + id));
    } else if (b?.type === 'tool_result') {
      const id = typeof b.tool_use_id === 'string' ? b.tool_use_id : null;
      if (id) { ch.results.add(id); if (ch.subCalls.has(id) || typeof obj.toolUseResult?.agentId === 'string') { keysOf(agg.sub.resultKeys, 'toolUseResult', obj.toolUseResult); inc(agg.sub.resultStatus, san(obj.toolUseResult?.status)); } if (typeof obj.toolUseResult?.agentId === 'string') { if (ch.subCalls.has(id)) ch.subCalls.set(id, obj.toolUseResult.agentId); else agg.sub.childIdWithoutCall++; } }
      made = id && ch.calls.has(id) && ['tool:', 'todo:', 'sub:'].some((p) => state.emitted.has(p + id));
    } else if (b?.type === 'thinking' || b?.type === 'redacted_thinking') {
      const t = agg.thinking; t.blocksSeen++; ch.thinkBlocks++;
      if (b.type === 'redacted_thinking') t.redacted++;
      else if (typeof b.thinking === 'string' && b.thinking.length) t.nonEmpty++;
      else { t.empty++; if (typeof b.signature === 'string' && b.signature.length) t.emptyWithSignature++; }
      keysOf(t, 'blockKeys', b);
      made = uuid && state.emitted.has(`${uuid}:${i}`);
    } else if (b?.type === 'image') made = out.some((it) => it.kind === 'user' && it.attachments?.length);
    else made = uuid && state.emitted.has(`${uuid}:${i}`);
    const cc = cov(agg.blockCov, bk); cc.seen++; made ? cc.produced++ : cc.none++;
  });
  items(agg, ch, out, trigger);
}

function claudeFinish(agg, ch, parentFile, kindOfFile) {
  const t = agg.tools;
  for (const [id, name] of ch.calls) {
    const r = (t[name] ??= { calls: 0, noResult: 0, mapperRunningAtEof: 0, error: 0, denied: 0, cats: map0() });
    r.calls++;
    if (!ch.results.has(id)) r.noResult++;
    const f = ch.fin.get(`tool:${id}`) ?? ch.fin.get(`sub:${id}`) ?? ch.fin.get(`todo:${id}`);
    inc(r.cats, f ? san(f.category ?? f.kind) : '(no_item)');
    if (f?.status === 'running') r.mapperRunningAtEof++;
    if (f?.status === 'error') r.error++;
    if (f?.status === 'denied') r.denied++;
  }
  for (const id of ch.results) if (!ch.calls.has(id)) agg.orphanResults++;
  if (kindOfFile !== 'subagent' && ch.subCalls.size) {
    const dir = parentFile.replace(/\.jsonl$/, '') + path.sep + 'subagents';
    let names = []; try { names = fs.readdirSync(dir); } catch { /* none */ }
    for (const [, agentId] of ch.subCalls) {
      agg.sub.calls++;
      if (!agentId) agg.sub.noAgentId++;
      else if (names.includes(`agent-${agentId}.jsonl`)) agg.sub.exact++;
      else if (names.some((n) => n.includes(agentId))) agg.sub.otherName++;
      else agg.sub.notFound++;
    }
  }
}

// ---- Codex ----
function codexLine(agg, ch, obj, state, out, itemModeBefore) {
  const type = san(obj?.type), p = obj?.payload;
  let key = type, trigger = type, shape = null;
  if (obj?.type === 'event_msg') { key = `event.${san(p?.type)}`; trigger = key; }
  else if (obj?.type === 'response_item') { key = `resp.${san(p?.type)}${itemModeBefore ? '+itemmode' : ''}`; trigger = key; }
  else if (obj?.type === 'session_meta' || obj?.type === 'turn_context') keysOf(agg.itemKeys, type, p);
  const c = cov(agg.lineCov, key); c.seen++; out.length ? c.produced++ : c.none++;
  if (obj?.type === 'event_msg' && p?.type === 'item_completed') {
    shape = `item.${san(p.item?.type)}`; trigger = shape;
    const s = cov(agg.shapeCov, shape); s.seen++; out.length ? s.produced++ : s.none++;
    keysOf(agg.itemKeys, san(p.item?.type), p.item);
    if (p.item?.type === 'Reasoning') {
      const t = agg.thinking; t.blocksSeen++; ch.thinkBlocks++;
      const txt = (Array.isArray(p.item.summary_text) ? p.item.summary_text.join('') : p.item.summary_text) || (Array.isArray(p.item.raw_content) ? p.item.raw_content.join('') : p.item.raw_content);
      typeof txt === 'string' && txt.trim() ? t.nonEmpty++ : t.empty++;
      keysOf(t, 'blockKeys', p.item);
    }
    const id = typeof p.item?.id === 'string' ? p.item.id : null; if (id) ch.calls.set(id, '');
  }
  if (obj?.type === 'response_item' && p) {
    if (p.type === 'reasoning' && !itemModeBefore) { const t = agg.thinking; t.blocksSeen++; ch.thinkBlocks++; (Array.isArray(p.summary) && p.summary.some((s) => typeof s?.text === 'string' && s.text.trim())) ? t.nonEmpty++ : (t.empty++, typeof p.encrypted_content === 'string' && p.encrypted_content && t.emptyWithSignature++); }
    if ((p.type === 'function_call' || p.type === 'custom_tool_call') && typeof p.call_id === 'string') ch.calls.set(p.call_id, '');
    if ((p.type === 'function_call_output' || p.type === 'custom_tool_call_output') && !ch.calls.has(p.call_id)) agg.orphanResults++;
    for (const b of Array.isArray(p.content) ? p.content : []) { const bc = cov(agg.blockCov, `resp.${san(b?.type)}`); bc.seen++; out.length ? bc.produced++ : bc.none++; }
  }
  if (obj?.type === 'event_msg' && p?.type === 'token_count') { if (!p.info) agg.usageEventsNoInfo++; agg.assistantLines++; }
  items(agg, ch, out, trigger);
}

function codexFinish(agg, ch, childIndex) {
  for (const [id, f] of ch.fin) {
    if (f.kind === 'tool') {
      const r = (agg.tools[toolKey(f.name, f.category)] ??= { calls: 0, mapperRunningAtEof: 0, error: 0, denied: 0, cats: map0() });
      r.calls++; inc(r.cats, san(f.category)); if (f.status === 'running') r.mapperRunningAtEof++; if (f.status === 'error') r.error++; if (f.status === 'denied') r.denied++;
    }
    if (f.kind === 'subagent') { agg.sub.calls++; ch.subIds ??= []; ch.subIds.push(id); }
  }
}

// ---- driver ----
const pick = (arr, n) => (arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.floor((i * arr.length) / n)]));

export async function discover({ home, maxSub, maxHeadless }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-replay-'));
  try {
    const h = createHistory({ home, clock: { now: () => Date.now() }, sources: [claudeCode, codexSrc], indexPath: path.join(tmp, 'index.jsonl') });
    await h.scan();
    const L = (source, kinds) => h.list({ source, kinds, limit: 1e9 });
    const all = {};
    for (const [s, label] of [['claude-code', 'claude'], ['codex', 'codex']]) for (const k of ['interactive', 'headless', 'subagent', 'unknown']) all[`${label}.${k}`] = L(s, [k]);
    const plan = { 'claude.interactive': all['claude.interactive'], 'claude.subagent': pick(all['claude.subagent'], maxSub), 'claude.headless': pick(all['claude.headless'], maxHeadless),
      'codex.all': [...all['codex.interactive'], ...all['codex.headless'], ...all['codex.subagent'], ...all['codex.unknown']] };
    const found = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length]));
    const codexIds = new Set(all['codex.interactive'].concat(all['codex.headless'], all['codex.subagent'], all['codex.unknown']).map((e) => e.sessionId).filter(Boolean));
    return { plan, found, codexIds };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export async function run({ home = os.homedir(), maxSub = 400, maxHeadless = 400, minutes = 15, concurrency = 4 } = {}) {
  const t0 = Date.now(), deadline = t0 + minutes * 60000;
  const { plan, found, codexIds } = await discover({ home, maxSub, maxHeadless });
  const agg = { claude: newAgg(), codex: newAgg() };
  const st = { bytes: 0, skippedLong: 0, unreadable: 0 };
  const done = {}, planned = {}, partial = {};
  // round-robin across groups so a timeout leaves every group covered
  const groups = Object.entries(plan).map(([g, es]) => (planned[g] = es.length, done[g] = 0, partial[g] = 0, es.map((e) => ({ g, e }))));
  const queue = []; for (let i = 0; groups.some((x) => i < x.length); i++) for (const x of groups) if (i < x.length) queue.push(x[i]);
  let next = 0, timedOut = false;
  const claudeInteractive = createClaudeMapper(), claudeSide = createClaudeMapper({ includeSidechain: true }), codexMapper = createCodexMapper();
  async function one({ g, e }) {
    const isCodex = g.startsWith('codex'), kind = isCodex ? 'codex' : g.split('.')[1];
    const a = isCodex ? agg.codex : agg.claude, ch = newCh(e.path, kind);
    const mapper = isCodex ? codexMapper : kind === 'subagent' ? claudeSide : claudeInteractive;
    const state = isCodex ? {} : mapper.newState();
    let n = 0, stopped = false;
    await eachLine(e.path, (text) => {
      if (++n % 5000 === 0 && Date.now() > deadline) { stopped = true; return true; }
      let obj; try { obj = JSON.parse(text); } catch { a.parseFail++; return false; }
      if (!obj || typeof obj !== 'object') { a.parseFail++; return false; }
      a.lines++;
      const before = isCodex ? !!state.codex?.itemMode : false;
      const out = mapper.mapLine(obj, state);
      if (isCodex) codexLine(a, ch, obj, state, out, before); else claudeLine(a, ch, obj, state, out);
      return false;
    }, st);
    if (stopped) { partial[g]++; timedOut = true; }
    isCodex ? codexFinish(a, ch, codexIds) : claudeFinish(a, ch, e.path, kind);
    if (isCodex) for (const id of ch.subIds ?? []) { /* child lookup below */ }
    finishChat(a, ch, mapper.meta(state));
    done[g]++;
  }
  async function worker() {
    while (next < queue.length && Date.now() < deadline) await one(queue[next++]);
    if (next < queue.length) timedOut = true;
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { agg, st, done, planned, partial, found, timedOut, wallSec: Math.round((Date.now() - t0) / 1000), codexIds };
}

// ---- report ----
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => (typeof b[1] === 'number' ? b[1] - a[1] : 0)));
const covOut = (t) => sortObj(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v])));
function aggOut(a) {
  const d = {}; for (const [k, v] of Object.entries(a.dist)) d[k] = v.sum();
  const types = {}; for (const [k, v] of Object.entries(a.typesByFile)) types[k] = v;
  const main = new Set(Object.entries(types).filter(([k]) => k !== 'subagent').flatMap(([, v]) => Object.keys(v)));
  const childOnly = Object.keys(types.subagent ?? {}).filter((k) => !main.has(k));
  const lineKeys = {}; for (const [t, ks] of Object.entries(a.lineKeys)) lineKeys[t] = ks;
  const runRef = {}; for (const [t, ks] of Object.entries(lineKeys)) for (const [k, n] of Object.entries(ks)) if (/agent|sidechain|parent|task|sub|child|spawn/i.test(k)) runRef[`${t}.${k}`] = n;
  return {
    chats: a.chats, lines: a.lines, parseFail: a.parseFail, sidechainLines: a.sidechainLines,
    throwsObserved: 0, throwsNote: 'throws are swallowed by mapLine try/catch and not observable',
    invalidItems: a.invalid, lineCoverage: covOut(a.lineCov), shapeCoverage: covOut(a.shapeCov), blockCoverage: covOut(a.blockCov), lineKeys, runReferenceKeys: runRef,
    tools: Object.fromEntries(Object.entries(a.tools).sort((x, y) => y[1].calls - x[1].calls)), orphanResults: a.orphanResults,
    notices: { total: a.noticeTotal, userItems: a.userItems, perUserOverall: a.userItems ? Math.round((a.noticeTotal / a.userItems) * 100) / 100 : 0, perUserPerChat: a.noticePerUser.sum(), chatsWithNoticesNoUser: a.chatsNoticeNoUser, byCode: sortObj(a.noticeByCode), byTrigger: sortObj(a.noticeByTrigger) },
    usage: { assistantLines: a.assistantLines, assistantNoMessageId: a.assistantNoMsgId, assistantNoUsage: a.assistantNoUsage, distinctMessageIds: a.msgIds, usageEmissions: a.usageEmissions, distinctUsageIds: a.usageIds, tokenCountNoInfo: a.usageEventsNoInfo },
    ids: { firstSeen: a.firstSeen, collisionsDifferentContent: a.collisions, sameIdUpdates: a.updates },
    order: { outOfTimestampOrder: a.outOfOrder, tsZeroOrMissing: a.tsZero },
    thinking: a.thinking, sizes: d, chatsContainingKind: a.kindChats, lineTypesOnlyInSubagentFiles: childOnly, subagents: a.sub, meta: a.meta,
  };
}
export function buildReport(r, home) {
  const fixedPlan = {}; for (const k of Object.keys(r.planned)) fixedPlan[k] = { planned: r.planned[k], done: r.done[k], stoppedMidFile: r.partial[k] };
  return { coverage: { found: r.found, groups: fixedPlan, timedOut: r.timedOut, wallSec: r.wallSec, bytesRead: r.st.bytes, linesSkippedOver5MB: r.st.skippedLong, unreadableFiles: r.st.unreadable, childPathPattern: CHILD_PATTERN },
    claude: aggOut(r.agg.claude), codex: aggOut(r.agg.codex) };
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const BY_DESIGN = new Set(['queue-operation']);
export function buildFindings(rep) {
  const F = [];
  const add = (score, agent, what, count, of, shape, fix) => F.push({ score, line: `${agent}: ${what} | ${count}${of ? ` of ${of} (${pct(count, of)}%)` : ''} | input: ${shape} | fix: ${fix}` });
  for (const agent of ['claude', 'codex']) {
    const a = rep[agent];
    add(a.lines, agent, 'mapLine swallows every throw in try/catch, so crashes cannot be counted', 0, 0, 'any line', 'return or record an error counter from mapLine instead of discarding it');
    F[F.length - 1].score = 1e4;
    for (const [t, label] of [[a.lineCoverage, 'line type'], [a.shapeCoverage, 'line shape'], [a.blockCoverage, 'content block']])
      for (const [k, c] of Object.entries(t)) if (c.none > 0) add(BY_DESIGN.has(k) ? 0 : c.none, agent, `${label} produced no item`, c.none, c.seen, k, 'add a handler, or confirm the drop is intended');
    for (const [k, n] of Object.entries(a.invalidItems)) add(n * 10, agent, 'invalid item by itemProblem', n, 0, k, 'fix the emitting branch in the mapper');
    const nt = a.notices;
    for (const [k, n] of Object.entries(nt.byTrigger).slice(0, 5)) add(n * 0.5, agent, `notice flood (${nt.perUserOverall} notices per user item overall)`, n, nt.total, k.replace('~', ' -> code '), 'drop, merge or hide low-value notices from this trigger (for example per-turn duration)');
    for (const [k, n] of Object.entries(a.ids.collisionsDifferentContent)) add(n * 10, agent, 'same item id for different content', n, a.ids.firstSeen, `kind ${k}`, 'derive the id from content or add a disambiguating suffix');
    if (a.order.outOfTimestampOrder) add(a.order.outOfTimestampOrder, agent, 'items first appear out of timestamp order', a.order.outOfTimestampOrder, a.ids.firstSeen, 'any item', 'sort by ts on the consumer or use the line timestamp for re-emitted items');
    if (a.order.tsZeroOrMissing) add(a.order.tsZeroOrMissing, agent, 'items with ts 0 or missing', a.order.tsZeroOrMissing, a.ids.firstSeen, 'line without parsable timestamp', 'carry the previous ts forward from the first line');
    const th = a.thinking;
    if (th.blocksSeen && th.itemsEmitted < th.nonEmpty) add((th.nonEmpty - th.itemsEmitted) * 10, agent, 'non-empty thinking blocks not emitted', th.nonEmpty - th.itemsEmitted, th.nonEmpty, 'thinking', 'emit the block text');
    if (th.empty + th.redacted) add(th.empty + th.redacted, agent, 'thinking blocks empty or redacted, no item possible', th.empty + th.redacted, th.blocksSeen, 'thinking', 'show a placeholder item so the turn is visible');
    for (const [name, t] of Object.entries(a.tools)) {
      if (t.noResult) add(t.noResult, agent, 'tool call never received a result', t.noResult, t.calls, `tool ${name}`, 'mark status unknown or interrupted at end of transcript');
      if (t.mapperRunningAtEof && t.mapperRunningAtEof !== t.noResult) add(t.mapperRunningAtEof, agent, 'tool item still running at end of file', t.mapperRunningAtEof, t.calls, `tool ${name}`, 'resolve running items when the chat ends');
      if (t.cats?.['(no_item)']) add(t.cats['(no_item)'] * 5, agent, 'tool call produced no item', t.cats['(no_item)'], t.calls, `tool ${name}`, 'handle the missing id or name');
    }
    if (a.orphanResults) add(a.orphanResults, agent, 'tool result without a matching call', a.orphanResults, 0, 'tool_result', 'keep it pending or emit a standalone item');
    const s = a.subagents;
    if (s.calls) {
      const bad = s.noAgentId + s.notFound + s.otherName;
      if (bad) add(bad, agent, 'subagent call whose child transcript cannot be located by id', bad, s.calls, `no id ${s.noAgentId}, other name ${s.otherName}, missing ${s.notFound}`, 'resolve the child path from the parent path pattern, record the real id key');
    }
    if (a.lineTypesOnlyInSubagentFiles.length) add(a.lineTypesOnlyInSubagentFiles.length * 100, agent, 'line types seen only in subagent files', a.lineTypesOnlyInSubagentFiles.length, 0, a.lineTypesOnlyInSubagentFiles.slice(0, 8).join(','), 'map or ignore them explicitly in child replay');
    const m = a.meta;
    for (const k of ['model', 'mode', 'cwd', 'branch', 'contextUsedPct']) if (m.chats && m[k] < m.chats) add(m.chats - m[k], agent, `meta without ${k}`, m.chats - m[k], m.chats, k, 'read the field from more line types');
    if (m.ctxAt100) add(m.ctxAt100 * 3, agent, 'contextUsedPct pinned at 100', m.ctxAt100, m.contextUsedPct, 'usage / token_count', 'use the real model window instead of the fixed default');
    if (a.usage.assistantNoUsage) add(a.usage.assistantNoUsage * 0.2, agent, 'assistant lines without usage', a.usage.assistantNoUsage, a.usage.assistantLines, 'assistant', 'none needed unless totals matter');
  }
  const c = rep.coverage;
  if (c.linesSkippedOver5MB) F.push({ score: c.linesSkippedOver5MB, line: `both: lines over 5 MB skipped by the replay | ${c.linesSkippedOver5MB} | input: any line | fix: the history reader caps at 1 MB, compare against it` });
  F.sort((x, y) => y.score - x.score);
  return F.map((f, i) => `${i + 1}. ${f.line}`);
}

export function writeOutputs(r, home, dir) {
  const report = buildReport(r, home);
  leakCheck(report); // fails loudly before anything is written
  const lines = buildFindings(report);
  for (const l of lines) if (l.length > 600 || !/^[\x20-\x7e]*$/.test(l)) throw new Error(`leak check failed: findings line shape (length ${l.length})`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'REPORT.json'), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(dir, 'FINDINGS.txt'), `${lines.join('\n')}\n`);
  return { report, lines };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
  const r = await run({ home: arg('home', os.homedir()), minutes: +arg('minutes', 15), maxSub: +arg('max-sub', 400), maxHeadless: +arg('max-headless', 400) });
  const dir = arg('out', path.dirname(fileURLToPath(import.meta.url)));
  const { report } = writeOutputs(r, arg('home', os.homedir()), dir);
  console.log(JSON.stringify({ coverage: report.coverage, claudeLines: report.claude.lines, codexLines: report.codex.lines }));
}
