// opencode TUI mapper: store rows (session/message/part from opencode.db) -> model items; permission/question dialogs -> Prompt; controls -> bytes.
// Sources: opencode v1.19.5 packages/schema/src/v1/session.ts (parts), tui routes/session/{permission,question}.tsx, tui config/keybind.ts, core v1/permission.ts.
import { createHash } from 'node:crypto';

const s = (v) => (typeof v === 'string' ? v : '');
const stripAnsi = (t) => t.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const CATEGORY = { bash: 'shell', read: 'read', glob: 'search', grep: 'search', list: 'search', todowrite: 'todo', todoread: 'todo', webfetch: 'web', websearch: 'web', write: 'write', edit: 'edit', apply_patch: 'edit', patch: 'edit', task: 'subagent' };
const OTHER = new Set(['question', 'skill', 'lsp', 'plan', 'invalid', 'code-mode']);
const category = (name) => CATEGORY[name] ?? (OTHER.has(name) || !name.includes('_') ? 'other' : 'mcp'); // MCP tools are `<server>_<tool>`
// core/src/v1/permission.ts:9,17,25 and question/index.ts:29
const DENIED = /^(The user rejected permission|The user has specified a rule which prevents|The user dismissed this question)/;
const TODO_STATUS = { completed: 'done', in_progress: 'active' };

const fresh = () => ({ ready: true, roles: {}, models: {}, meta: {}, lastTs: 0 });
const ensure = (st) => { if (!st.ready) Object.assign(st, fresh()); return st; };

function noticeFor(err, ts, id) {
  const msg = s(err?.data?.message) || s(err?.name) || 'error';
  if (err?.name === 'MessageAbortedError') return { id, ts, kind: 'notice', level: 'info', code: 'interrupted', text: msg };
  const rate = err?.data?.statusCode === 429 || /rate.?limit/i.test(msg);
  return { id, ts, kind: 'notice', level: 'error', code: rate ? 'rate_limit' : 'error', text: msg };
}

function toolItems(row, d, st, ts) {
  const state = d.state ?? {};
  const name = s(d.tool);
  const input = state.input ?? {};
  const md = state.metadata ?? {};
  const denied = state.status === 'error' && DENIED.test(s(state.error));
  const status = state.status === 'completed' ? 'ok' : state.status === 'error' ? (denied ? 'denied' : 'error') : 'running';
  const cat = category(name);
  const text = state.status === 'completed' ? s(state.output) : state.status === 'error' ? s(state.error) : '';
  const out = [];
  const item = { id: row.id, ts, kind: 'tool', callId: s(d.callID) || row.id, name, title: s(state.title) || s(input.command) || s(input.filePath) || name, category: cat, status, input };
  if (text || isNum(md.exit)) {
    item.output = { text, ...(isNum(md.exit) ? { exitCode: md.exit } : {}), ...(md.truncated ? { truncated: true } : {}) };
    const fd = md.filediff;
    if (fd && s(fd.file)) item.output.diff = [{ path: fd.file, ...(s(input.oldString) ? { oldText: input.oldString } : {}), ...(s(input.newString) ? { newText: input.newString } : {}), ...(s(fd.patch) ? { patch: fd.patch } : {}) }];
    else if (name === 'write' && s(input.filePath)) item.output.diff = [{ path: input.filePath, newText: s(input.content) }];
    else if (name === 'apply_patch' && Array.isArray(md.files)) {
      const diff = md.files.map((f) => ({ path: s(f?.filePath) || s(f?.relativePath) || s(f?.path), ...(s(f?.patch) ? { patch: f.patch } : {}) })).filter((x) => x.path);
      if (diff.length) item.output.diff = diff;
    }
  }
  out.push(item);
  if (name === 'todowrite' && Array.isArray(md.todos)) out.push({ id: `${row.id}:todo`, ts, kind: 'todo', items: md.todos.map((t) => ({ text: s(t?.content), status: TODO_STATUS[t?.status] ?? 'pending' })) });
  if (name === 'task') out.push({ id: `${row.id}:sub`, ts, kind: 'subagent', callId: item.callId, name: s(input.subagent_type) || 'task', status: status === 'ok' ? 'ok' : status === 'running' ? 'running' : 'error', prompt: s(input.prompt), ...(s(md.sessionId) ? { childSessionId: md.sessionId } : {}) });
  if (state.status === 'error' && /^Tool execution aborted/.test(s(state.error))) out.push({ id: `${row.id}:int`, ts, kind: 'notice', level: 'info', code: 'interrupted', text: 'Tool execution aborted' });
  return out;
}

function run(row, st, out) {
  const d = typeof row.data === 'string' ? JSON.parse(row.data) : row.data ?? {};
  if (row.table === 'session') { st.meta = { ...st.meta, sessionId: row.id, ...(s(row.directory) ? { cwd: row.directory } : {}) }; return; }
  if (row.table === 'message') {
    st.roles[row.id] = d.role;
    const ts = isNum(row.time_created) ? row.time_created : d.time?.created ?? st.lastTs;
    st.lastTs = ts;
    const sid = row.session_id;
    if (sid) st.meta.sessionId = sid;
    const m = d.role === 'assistant' ? (d.providerID ? `${d.providerID}/${d.modelID}` : s(d.modelID)) : d.model ? `${d.model.providerID}/${d.model.modelID}` : '';
    if (m) { st.models[row.id] = m; st.meta.model = m; }
    if (s(d.agent) || s(d.mode)) st.meta.mode = s(d.agent) || d.mode; // opencode's agent (build/plan) is the model's mode
    if (s(d.path?.cwd)) st.meta.cwd = d.path.cwd;
    if (d.role === 'assistant' && d.error) out.push(noticeFor(d.error, d.time?.completed ?? ts, `${row.id}:err`));
    return;
  }
  const ts = isNum(row.time_created) ? row.time_created : d.time?.start ?? d.time?.created ?? st.lastTs ?? 0;
  st.lastTs = ts;
  const role = st.roles[row.message_id];
  switch (d.type) {
    case 'text': if (!d.ignored && s(d.text)) out.push({ id: row.id, ts, kind: role === 'user' ? 'user' : 'assistant', text: d.text }); break;
    case 'reasoning': if (s(d.text)) out.push({ id: row.id, ts, kind: 'thinking', text: d.text }); break;
    case 'tool': out.push(...toolItems(row, d, st, ts)); break;
    case 'step-finish': {
      const t = d.tokens ?? {};
      const model = st.models[row.message_id];
      out.push({ id: row.id, ts, kind: 'usage', inputTokens: t.input ?? 0, outputTokens: t.output ?? 0, cacheReadTokens: t.cache?.read ?? 0, cacheWriteTokens: t.cache?.write ?? 0, ...(isNum(d.cost) ? { costUsd: d.cost } : {}), ...(model ? { model } : {}) });
      break;
    }
    case 'compaction': out.push({ id: row.id, ts, kind: 'notice', level: 'info', code: 'compacted', text: d.auto ? 'Context compacted automatically' : 'Context compacted' }); break;
    case 'retry': out.push({ ...noticeFor(d.error, ts, row.id), level: 'warn' }); break;
    case 'file': out.push(role === 'user' ? { id: row.id, ts, kind: 'user', text: `[attachment] ${s(d.filename) || s(d.mime)}` } : { id: row.id, ts, kind: 'notice', level: 'info', code: 'other', text: `attachment ${s(d.filename) || s(d.mime)}` }); break;
    case 'agent': out.push({ id: row.id, ts, kind: 'notice', level: 'info', code: 'other', text: `agent ${s(d.name)}` }); break;
    case 'subtask': out.push({ id: row.id, ts, kind: 'subagent', callId: row.id, name: s(d.agent) || 'subtask', status: 'running', prompt: s(d.prompt) }); break;
    default: break; // step-start, snapshot, patch: bookkeeping, no item
  }
}

// ---- dialogs (permission.tsx, question.tsx) ----
const TITLE = /^[△\s]*(Permission required|Edit |Read |Glob |Grep |List |Shell command|\S+ Task\b|WebFetch |Access external directory|Continue after repeated failures|Call tool )/;
const id12 = (title, options) => createHash('sha1').update(`${title}\n${options.map((o) => o.label).join('\n')}`).digest('hex').slice(0, 12);
const mk = (type, title, body, labels, hotkeys) => {
  const options = labels.map((label, index) => ({ index, label, ...(hotkeys ? { hotkey: hotkeys[index] } : {}) }));
  return { promptId: id12(title, options), type, title, ...(body ? { body } : {}), options, ...(options.length ? { selected: 0 } : {}) }; // selection is colour only in the TUI: assumed 0
};

function parsePrompt(screen) {
  const lines = stripAnsi(s(screen)).split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).slice(-25);
  const text = lines.join('\n');
  const btn = lines.findLastIndex((l) => /Allow once\s+Allow always\s+Reject/.test(l));
  if (btn >= 0 && /enter confirm/.test(lines.slice(btn).join('\n'))) {
    let ti = lines.slice(0, btn).findLastIndex((l) => TITLE.test(l));
    const title = ti >= 0 ? lines[ti].replace(/^[△\s]+/, '').trim() : 'Permission required';
    if (ti < 0) ti = btn;
    return mk('permission', title, lines.slice(ti + 1, btn).map((l) => l.trim()).join('\n'), ['Allow once', 'Allow always', 'Reject']);
  }
  if (/Always allow/.test(text) && lines.some((l) => /Confirm\s+Cancel/.test(l))) return mk('permission', 'Always allow', lines.filter((l) => /This will allow/.test(l)).map((l) => l.trim()).join('\n'), ['Confirm', 'Cancel']);
  if (/Reject permission/.test(text) && /enter confirm|esc cancel/i.test(text)) return mk('text', 'Reject permission', '', []);
  if (/esc dismiss/.test(text)) { // question dialog: footer + numbered rows `1. label`
    let group = [];
    lines.forEach((l, i) => { const m = /^\s*(\d+)\.\s+(\S.*)$/.exec(l); if (!m) return; if (Number(m[1]) === 1) group = []; group.push({ i, n: Number(m[1]), label: m[2].replace(/\s+✓$/, '').trim() }); });
    if (group.length >= 2 && group.length <= 9 && group.every((r, k) => r.n === k + 1)) {
      const title = (lines[group[0].i - 1] ?? 'Question').trim();
      return mk('choice', title, '', group.map((r) => r.label), group.map((r) => String(r.n)));
    }
  }
  return null;
}

// ---- controls (keybind.ts: leader ctrl+x, interrupt needs two Esc within 5s per prompt/index.tsx:408-418) ----
const enc = (t) => ({ bytes: new TextEncoder().encode(t) });
const clean = (t) => { if (/[\x00-\x1f\x7f]/.test(t)) throw new RangeError('control characters not allowed'); return t; };
const controls = {
  interrupt: () => enc('\x1b\x1b'),
  answerPrompt(prompt, index) {
    const o = prompt.options.find((x) => x.index === index);
    if (!o) throw new RangeError(`no option ${index}`);
    if (o.hotkey) return enc(o.hotkey); // question dialog: digits 1-9
    const n = prompt.options.length; // permission buttons: right/l moves with wrap, Enter selects
    return enc('\x1b[C'.repeat((index - prompt.selected + n) % n) + '\r');
  },
  setModel: (model) => enc(`\x18m${clean(model)}\r`), // <leader>m opens the picker; typing filters, Enter picks the first match (filter behaviour not read from source)
  slash: (command) => enc(`${clean(command).startsWith('/') ? '' : '/'}${command}\r`),
  compact: () => enc('/compact\r'),
  clear: () => enc('/new\r'), // opencode has no /clear; /new starts a fresh session
  setMode(current, target, opts = {}) { // agent_cycle = Tab; order of primary agents is config-dependent, pass opts.cycle
    const cyc = opts.cycle ?? ['build', 'plan'];
    const a = cyc.indexOf(current), b = cyc.indexOf(target);
    if (a < 0 || b < 0) throw new RangeError(`agent not in cycle: ${a < 0 ? current : target}`);
    return enc('\t'.repeat((b - a + cyc.length) % cyc.length));
  },
};

const r = (element, shown, driven, how) => ({ element, shown, driven, how });
const coverage = [
  r('user text', 'chat', 'n/a', 'text part by parent message role'),
  r('assistant text', 'chat', 'n/a', 'text part; ignored parts skipped, synthetic shown'),
  r('reasoning', 'chat', 'n/a', 'thinking item'),
  r('tool: bash', 'chat', 'n/a', 'shell; exit code and truncation from metadata'),
  r('tool: read/glob/grep/list', 'chat', 'n/a', 'read or search'),
  r('tool: edit/write/apply_patch', 'chat', 'n/a', 'diff from filediff, write input, or patch file list'),
  r('tool: webfetch/websearch', 'chat', 'n/a', 'web'),
  r('tool: todowrite', 'chat', 'n/a', 'tool item plus todo item'),
  r('tool: task', 'chat', 'n/a', 'tool item plus subagent item with child session id'),
  r('tool: MCP', 'chat', 'n/a', 'name <server>_<tool> -> mcp'),
  r('tool: question/skill/lsp/plan', 'chat', 'n/a', 'other'),
  r('tool states pending/running/completed/error', 'chat', 'n/a', 'running/ok/error, denied by rejection strings'),
  r('step-finish tokens and cost', 'chat', 'n/a', 'usage item'),
  r('compaction', 'chat', 'n/a', 'notice compacted'),
  r('retry', 'chat', 'n/a', 'notice, rate_limit on 429'),
  r('assistant error', 'chat', 'n/a', 'notice; MessageAbortedError -> interrupted'),
  r('file attachment', 'chat', 'n/a', 'user item or notice'),
  r('agent and subtask parts', 'chat', 'n/a', 'notice / subagent item'),
  r('step-start, snapshot, patch parts', 'terminal-only', 'n/a', 'bookkeeping, no item'),
  r('permission dialog (Allow once/always, Reject)', 'chat', 'yes', 'right/l x delta + Enter; selected assumed 0 (colour only)'),
  r('always-allow confirm', 'chat', 'yes', 'Confirm/Cancel buttons'),
  r('reject feedback input', 'chat', 'no', 'free text; selected-state unreadable, send text then Enter via slash/text'),
  r('question dialog', 'chat', 'yes', 'digit 1-9 hotkeys'),
  r('question multi-select and Review tab', 'terminal-only', 'no', 'Tab/Enter flow not mapped'),
  r('interrupt', 'chat', 'yes', 'Esc Esc (two presses within 5s)'),
  r('model picker', 'terminal-only', 'yes', '<leader>m + filter text; assumed, filter not read'),
  r('agent switch', 'chat', 'yes', 'Tab (agent_cycle)'),
  r('slash commands', 'chat', 'yes', '/cmd + Enter'),
  r('compact', 'chat', 'yes', '/compact'),
  r('clear', 'chat', 'yes', '/new (no /clear exists)'),
  r('variant cycle, command palette, session list, undo/redo, themes', 'terminal-only', 'no', 'keys known (ctrl+t, ctrl+p, leader l/u/r), not wired'),
  r('shell mode, sidebar, toasts, status bar', 'terminal-only', 'no', 'screen only'),
  r('live feed via opencode serve', 'chat', 'n/a', 'serve exposes SSE (message.part.updated, message.part.delta, session.updated, session.error, session.diff): cleaner and lower latency than polling the DB, and gives permission events; not run here'),
];

export function createOpencodeMapper() {
  const newState = fresh;
  const mapRow = (row, state) => {
    const out = [];
    try { run(row, ensure(state), out); } catch { /* shortcut: a malformed row is dropped, not reported; upgrade if lost rows matter */ }
    return out;
  };
  return { newState, mapRow, mapLine: mapRow, meta: (state) => ({ ...ensure(state).meta, agent: 'opencode' }), parsePrompt, controls, coverage };
}
