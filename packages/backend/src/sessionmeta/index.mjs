// Session metadata: attention queue, token totals + cost, budget link, workspace facts,
// changed files, fork points, organisation (pin/rename/archive/group) and templates. No spawning.
import fs from 'node:fs';
import path from 'node:path';
import { assertShape } from '../contract.mjs';

const WAITING = new Set(['waiting_input', 'needs_permission']);
const PROGRAMS = ['claude', 'codex'];
const MODES = ['normal', 'plan', 'auto'];
const num = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
const sid = (id) => { if (typeof id !== 'string' || !id) throw new TypeError('sessionId must be a non-empty string'); return id; };
const blank = () => ({ input: 0, output: 0, cost: 0 });

export function createSessionMeta({ clock, exec, budget, prices = {}, file, debounceMs = 2000, programs = PROGRAMS, modes = MODES, fsImpl = fs } = {}) {
  assertShape('clock', clock, ['now']);
  if (exec !== undefined && typeof exec !== 'function') throw new TypeError('exec: expected a function');
  if (budget !== undefined) assertShape('budget', budget, ['check']);
  const listeners = new Set();
  const emit = (e) => { for (const l of listeners) { try { l(e); } catch { /* listener errors never break state */ } } };
  const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // ---- 1. attention queue
  const states = new Map();   // id -> state
  const focused = new Set();
  const pending = new Map();  // id -> {at, state}  waiting for debounce
  const queue = new Map();    // id -> notification (promoted)
  let nseq = 0;
  const drop = (id) => { pending.delete(id); queue.delete(id); };
  function noteState(id, state, opts = {}) {
    sid(id);
    const prev = states.get(id);
    states.set(id, state);
    if (opts.focused !== undefined) setFocused(id, opts.focused);
    if (!WAITING.has(state)) { drop(id); return; }
    if (prev === state || (WAITING.has(prev) && (pending.has(id) || queue.has(id)))) return; // same waiting spell
    queue.delete(id);
    pending.set(id, { at: clock.now(), state });
  }
  function setFocused(id, on_ = true) { sid(id); if (on_) { focused.add(id); drop(id); } else focused.delete(id); }
  const answer = (id) => drop(sid(id));
  function tick() {
    const fresh = [];
    const now = clock.now();
    for (const [id, p] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
      if (now - p.at < debounceMs) continue;
      pending.delete(id);
      if (focused.has(id) || !WAITING.has(states.get(id))) continue;
      const n = { id: ++nseq, sessionId: id, state: p.state, at: p.at, reason: p.state === 'needs_permission' ? 'needs your permission' : 'needs your input' };
      queue.set(id, n); fresh.push(n); emit({ type: 'attention', ...n });
    }
    return fresh;
  }
  const attention = () => { tick(); return [...queue.values()].sort((a, b) => a.at - b.at || a.id - b.id); };

  // ---- 2 + 3. totals and budget link
  const usage = new Map(); // id -> {program, input, output, cost, byModel}
  const priceOf = (model) => prices[model] || null;
  const costOf = (model, i, o) => { const p = priceOf(model); return p ? (i * num(p.input) + o * num(p.output)) / 1e6 : 0; };
  let overBudget = false;
  function recordUsage(id, { program = 'unknown', model = 'unknown', inputTokens = 0, outputTokens = 0 } = {}) {
    sid(id);
    const i = num(inputTokens), o = num(outputTokens);
    const u = usage.get(id) || { program, ...blank(), byModel: {} };
    u.program = program || u.program;
    u.input += i; u.output += o; u.cost += costOf(model, i, o);
    const m = u.byModel[model] || blank();
    m.input += i; m.output += o; m.cost += costOf(model, i, o);
    u.byModel[model] = m;
    usage.set(id, u);
    checkBudget(id);
  }
  function checkBudget(id) {
    if (!budget) return;
    let d;
    try { d = budget.check(0, { sessionId: id }); } catch { return; }
    if (d && d.allow === false) {
      if (overBudget) return;
      overBudget = true;
      emit({ type: 'budget', sessionId: id, reason: d.reason || 'The token budget is used up.', remaining: d.remaining ?? 0, totalTokens: totals().input + totals().output });
    } else overBudget = false;
  }
  const totalsOf = (id) => {
    const u = usage.get(id);
    return u ? { input: u.input, output: u.output, cost: u.cost, program: u.program, byModel: structuredClone(u.byModel) } : { input: 0, output: 0, cost: 0, program: null, byModel: {} };
  };
  function totals(id) {
    if (id !== undefined) return totalsOf(sid(id));
    const all = { ...blank(), byProgram: {}, byModel: {}, bySession: {} };
    for (const [k, u] of usage) {
      all.input += u.input; all.output += u.output; all.cost += u.cost;
      const p = all.byProgram[u.program] || blank();
      p.input += u.input; p.output += u.output; p.cost += u.cost; all.byProgram[u.program] = p;
      for (const [m, v] of Object.entries(u.byModel)) {
        const t = all.byModel[m] || blank();
        t.input += v.input; t.output += v.output; t.cost += v.cost; all.byModel[m] = t;
      }
      all.bySession[k] = { input: u.input, output: u.output, cost: u.cost };
    }
    return all;
  }

  // ---- 4 + 5. workspace + changed files
  const folders = new Map(); // id -> folder
  const ws = new Map();      // id -> facts
  const run = async (args, cwd) => {
    try { const r = await exec('git', args, { cwd, timeoutMs: 5000 }); return r && r.code === 0 ? String(r.stdout ?? '') : null; } catch { return null; }
  };
  const nulls = (folder) => ({ folder: folder ?? null, branch: null, worktree: null, dirty: null, startCommit: null, isGit: false });
  async function refreshWorkspace(id) {
    sid(id);
    const folder = folders.get(id);
    if (!folder || !exec) { const f = nulls(folder); ws.set(id, { ...f, startCommit: ws.get(id)?.startCommit ?? null }); return ws.get(id); }
    const top = await run(['rev-parse', '--show-toplevel'], folder);
    if (top === null || !top.trim()) { ws.set(id, { ...nulls(folder), startCommit: ws.get(id)?.startCommit ?? null }); return ws.get(id); }
    const branch = (await run(['rev-parse', '--abbrev-ref', 'HEAD'], folder))?.trim() || null;
    const st = await run(['status', '--porcelain'], folder);
    const prev = ws.get(id);
    const startCommit = prev?.startCommit ?? ((await run(['rev-parse', 'HEAD'], folder))?.trim() || null);
    const facts = { folder, branch, worktree: top.trim(), dirty: st === null ? null : st.split('\n').filter(Boolean).length, startCommit, isGit: true };
    ws.set(id, facts);
    return facts;
  }
  async function startSession(id, { folder } = {}) {
    sid(id);
    if (typeof folder === 'string') folders.set(id, folder);
    ws.delete(id);
    return refreshWorkspace(id);
  }
  const workspace = async (id, { refresh = false } = {}) => (refresh || !ws.has(sid(id)) ? refreshWorkspace(id) : ws.get(id));
  async function changedFiles(id) {
    const facts = await workspace(id, { refresh: true });
    if (!facts.isGit) return [];
    const files = new Map();
    const numstat = await run(['diff', '--numstat', ...(facts.startCommit ? [facts.startCommit] : [])], facts.folder);
    for (const line of (numstat ?? '').split('\n').filter(Boolean)) {
      const [a, r, ...rest] = line.split('\t');
      const p = rest.join('\t');
      files.set(p, { path: p, added: a === '-' ? 0 : Number(a) || 0, removed: r === '-' ? 0 : Number(r) || 0, status: 'modified' });
    }
    for (const line of ((await run(['status', '--porcelain'], facts.folder)) ?? '').split('\n').filter(Boolean)) {
      const code = line.slice(0, 2), p = line.slice(3).replace(/^.* -> /, '').replace(/^"(.*)"$/, '$1');
      const status = code === '??' ? 'untracked' : code.includes('D') ? 'deleted' : code.includes('A') ? 'added' : 'modified';
      const cur = files.get(p);
      if (cur) cur.status = status; else files.set(p, { path: p, added: 0, removed: 0, status });
    }
    return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  // ---- 6. fork point (pure data)
  function forkPoint(session, items, index) {
    if (!session || typeof session !== 'object') throw new TypeError('session required');
    if (!Array.isArray(items)) throw new TypeError('items must be an array');
    if (!Number.isInteger(index) || index < 0 || index >= items.length) throw new RangeError(`message index ${index} is out of range 0..${items.length - 1}`);
    const prior = items.slice(0, index + 1).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim());
    const body = prior.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text.trim()}`).join('\n\n');
    return {
      program: session.program ?? null, folder: session.folder ?? null, model: session.model ?? null,
      fromIndex: index, messageCount: prior.length,
      prompt: `This session continues an earlier one from a chosen point. Earlier conversation:\n\n${body}\n\nContinue from here.`,
    };
  }

  // ---- 7 + 8. organisation and templates, one JSON file
  let org = {}; // id -> {pinned, name, archived}
  let templates = {};
  function load() {
    if (!file) return;
    try {
      const j = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
      org = j && typeof j.sessions === 'object' && j.sessions && !Array.isArray(j.sessions) ? j.sessions : {};
      templates = j && typeof j.templates === 'object' && j.templates && !Array.isArray(j.templates) ? j.templates : {};
    } catch { org = {}; templates = {}; }
  }
  function save() {
    if (!file) return;
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fsImpl.writeFileSync(tmp, JSON.stringify({ version: 1, sessions: org, templates }, null, 2));
    fsImpl.renameSync(tmp, file);
  }
  load();
  const patch = (id, p) => { org[sid(id)] = { ...(org[id] || {}), ...p }; save(); return info(id); };
  const info = (id) => ({ pinned: false, name: null, archived: false, ...(org[id] || {}) });
  const pin = (id, v = true) => patch(id, { pinned: !!v });
  const archive = (id, v = true) => patch(id, { archived: !!v });
  function rename(id, name) {
    if (name !== null && (typeof name !== 'string' || !name.trim())) throw new TypeError('name must be a non-empty string or null');
    return patch(id, { name: name === null ? null : name.trim().slice(0, 120) });
  }
  const forget = (id) => { delete org[sid(id)]; save(); };
  // sessions: [{id, folder, title?}] -> [{project, folder, sessions}] pinned first, archived hidden unless asked
  function groupByProject(sessions, { includeArchived = false } = {}) {
    const groups = new Map();
    for (const s of sessions) {
      const o = info(s.id);
      if (o.archived && !includeArchived) continue;
      const folder = s.folder || '';
      const g = groups.get(folder) || { project: folder ? path.basename(folder.replace(/\/+$/, '')) || folder : 'No folder', folder: folder || null, sessions: [] };
      g.sessions.push({ ...s, ...o, title: o.name ?? s.title ?? s.id });
      groups.set(folder, g);
    }
    const out = [...groups.values()];
    for (const g of out) g.sessions.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return out.sort((a, b) => a.project.localeCompare(b.project));
  }

  function validateTemplate(t) {
    const errors = [];
    if (!t || typeof t !== 'object') return { ok: false, errors: ['template must be an object'] };
    if (typeof t.name !== 'string' || !t.name.trim()) errors.push('name is required');
    if (!programs.includes(t.program)) errors.push(`program must be one of ${programs.join(', ')}`);
    if (t.model !== undefined && t.model !== null && (typeof t.model !== 'string' || !t.model)) errors.push('model must be a non-empty string');
    if (t.folder !== undefined && t.folder !== null && (typeof t.folder !== 'string' || !path.isAbsolute(t.folder))) errors.push('folder must be an absolute path');
    if (t.mode !== undefined && !modes.includes(t.mode)) errors.push(`mode must be one of ${modes.join(', ')}`);
    return { ok: errors.length === 0, errors };
  }
  function saveTemplate(t) {
    const v = validateTemplate(t);
    if (!v.ok) throw new TypeError(v.errors.join('; '));
    const name = t.name.trim();
    templates[name] = { name, program: t.program, model: t.model ?? null, folder: t.folder ?? null, mode: t.mode ?? 'normal' };
    save();
    return { ...templates[name] };
  }
  const getTemplate = (name) => (templates[name] ? { ...templates[name] } : null);
  const listTemplates = () => Object.values(templates).map((t) => ({ ...t })).sort((a, b) => a.name.localeCompare(b.name));
  const removeTemplate = (name) => { const had = name in templates; delete templates[name]; if (had) save(); return had; };

  return {
    on, noteState, setFocused, answer, tick, attention,
    recordUsage, totals,
    startSession, workspace, changedFiles,
    forkPoint,
    pin, rename, archive, forget, info, groupByProject, reload: load,
    validateTemplate, saveTemplate, getTemplate, listTemplates, removeTemplate,
  };
}
