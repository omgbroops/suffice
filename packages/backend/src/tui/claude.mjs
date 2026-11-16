// Claude Code mapper: transcript lines (~/.claude/projects/<cwd>/<sessionId>.jsonl) -> items, screen text -> Prompt,
// controls -> key bytes. Shapes are in ./model.mjs. Docs base: https://code.claude.com/docs/en/<page>.md
// Confirmed = seen in a real transcript's key/type names or in a repo fixture. Assumed = from docs or a guess, not seen on screen.
//   CONFIRMED: trust dialog wording and options (test/fixtures/sessionstate/claude-trust.txt), permission dialog
//     wording "Do you want to ..." with "1. Yes / 2. Yes, and don't ask again ... / 3. No" (claude-permission.txt),
//     transcript line/block/attachment/system types (sampled), "[Request interrupted by user" text.
//   ASSUMED: the ❯ marker on numbered rows, plan-approval wording (permission-modes.md "Plan approval options"),
//     AskUserQuestion screen wording, whether a digit key selects AND submits, "Exit code N" prefix on Bash errors,
//     the denial wording regex, the 200000 context window.
import { createHash } from 'node:crypto';
import { parseDuration } from './model.mjs';

const CAP = 100000;
const str = (v) => (typeof v === 'string' ? v : '');
const cap = (s) => (s.length > CAP ? s.slice(0, CAP) : s);
const firstLine = (s, n = 120) => str(s).split('\n')[0].slice(0, n);
const base = (p) => String(p).split('/').pop();
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
const RATE = /rate.?limit|usage limit|\b429\b|limit reached/i;
const DENIED = /doesn't want to (take this action|proceed)|tool use was rejected|permission.{0,20}denied/i; // assumed wording

const CAT = { Bash: 'shell', PowerShell: 'shell', Monitor: 'shell', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit', Write: 'write', Read: 'read',
  Glob: 'search', Grep: 'search', LSP: 'search', WebFetch: 'web', WebSearch: 'web',
  TaskCreate: 'todo', TaskGet: 'todo', TaskList: 'todo', TaskUpdate: 'todo', TaskOutput: 'todo', Agent: 'subagent', Task: 'subagent' };
const INTERNAL = new Set(['ToolSearch', 'EnterWorktree', 'ExitWorktree']); // housekeeping tools: category other + internal:true; only ToolSearch is seen in recordings
const TODO_STATUS = { pending: 'pending', in_progress: 'active', completed: 'done' };

const fresh = () => ({ emitted: new Map(), calls: new Map(), results: new Map(), queue: [], lastTs: 0, lastUser: null, model: null, mode: null,
  cwd: null, branch: null, sessionId: null, ctxTokens: 0, sidechainSkipped: 0,
  dropped: {}, fileHistory: 0, errors: { count: 0, lastClass: null }, title: null, agentName: null, costUsd: null, uiMode: null, tasks: {}, pendingAtt: [] });
const drop = (state, k) => { state.dropped[k] = (state.dropped[k] || 0) + 1; };

function emit(state, out, it) {
  const sig = JSON.stringify(it);
  if (state.emitted.get(it.id) === sig) return; // same id + same content = duplicate line; changed content replaces by id
  state.emitted.set(it.id, sig);
  out.push(it);
}
const fmtDur = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };
// An api_error system line and its synthetic assistant line describe one event: same class within 5 s gives one notice.
const notice = (state, out, id, ts, level, code, text) => {
  if (level === 'error') {
    const l = state.lastErr;
    if (l && l.code === code && Math.abs(ts - l.ts) <= 5000 && l.id !== id) return;
    state.lastErr = { id, code, ts };
  }
  emit(state, out, { id, ts, kind: 'notice', level, code, text });
};
const MODES = { default: 'Manual', plan: 'Plan', auto: 'Auto', acceptEdits: 'Accept edits', bypassPermissions: 'Bypass', dontAsk: "Don't ask" };
const modeName = (m) => MODES[m] || m;
const modelName = (m) => { const x = /(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/i.exec(m); return x ? `${x[1][0].toUpperCase()}${x[1].slice(1).toLowerCase()} ${x[2]}${x[3] && x[3].length < 3 ? '.' + x[3] : ''}` : m; };

function resultText(c) {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.map((b) => (b?.type === 'text' ? str(b.text) : b?.type === 'image' ? '[image]' : '')).filter(Boolean).join('\n');
}

function classify(name, input) {
  if (name.startsWith('mcp__')) { const [, server, ...rest] = name.split('__'); return { category: 'mcp', title: `${server}: ${rest.join('__')}` }; }
  const i = input && typeof input === 'object' ? input : {};
  const t = firstLine(i.command ?? i.file_path ?? i.notebook_path ?? i.pattern ?? i.url ?? i.query ?? i.description ?? i.skill);
  return { category: CAT[name] ?? 'other', title: t || name };
}

function output(c, r, category, status) {
  const tur = r.tur && typeof r.tur === 'object' && !Array.isArray(r.tur) ? r.tur : {};
  let text = r.text;
  if (category === 'shell' && (str(tur.stdout) || str(tur.stderr))) text = str(tur.stdout) + str(tur.stderr);
  else if (category === 'read' && str(tur.file?.content)) text = tur.file.content; // images: file.base64 is never copied
  const o = { text: cap(text) };
  if (text.length > CAP || /\btruncated\b/i.test(r.text.slice(-200))) o.truncated = true;
  if (category === 'shell') {
    const m = /^Exit code (\d+)/.exec(r.text);
    if (m) o.exitCode = Number(m[1]); else if (status === 'ok') o.exitCode = 0;
  }
  const path = tur.filePath ?? c.input?.file_path ?? c.input?.notebook_path;
  if ((category === 'edit' || category === 'write') && str(path)) {
    const patch = Array.isArray(tur.structuredPatch) ? tur.structuredPatch.map((h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n${(h.lines ?? []).join('\n')}`).join('\n') : undefined;
    // shortcut: MultiEdit's edits[] are not expanded into old/new text, upgrade when a real MultiEdit transcript shows up
    o.diff = [{ path, oldText: tur.oldString ?? tur.originalFile ?? c.input?.old_string ?? undefined, newText: tur.newString ?? tur.content ?? c.input?.new_string ?? c.input?.content ?? undefined, patch }];
  }
  return o;
}

function emitCall(state, out, callId) {
  const c = state.calls.get(callId);
  if (!c) return; // result arrived first; it is kept in state.results until the call shows up
  const r = state.results.get(callId);
  const input = c.input && typeof c.input === 'object' ? c.input : {};
  if (c.name === 'TodoWrite') {
    const items = (Array.isArray(input.todos) ? input.todos : []).map((t) => ({ text: str(t?.content), status: TODO_STATUS[t?.status] ?? 'pending' }));
    return emit(state, out, { id: `todo:${callId}`, ts: c.ts, kind: 'todo', items });
  }
  if (CAT[c.name] === 'subagent') {
    const it = { id: `sub:${callId}`, ts: c.ts, kind: 'subagent', callId, name: str(input.subagent_type) || c.name, prompt: str(input.prompt), status: !r ? 'running' : r.isError ? 'error' : 'ok' };
    if (str(r?.tur?.agentId)) it.childSessionId = r.tur.agentId; // child lines: <project>/<session>/subagents/agent-<id>.jsonl
    if (str(input.description)) it.description = input.description;
    if (str(r?.tur?.agentId)) it.agentId = r.tur.agentId;
    for (const k of ['totalToolUseCount', 'totalTokens', 'totalDurationMs']) if (typeof r?.tur?.[k] === 'number') it[k] = r.tur[k];
    return emit(state, out, it);
  }
  const { category, title } = classify(c.name, input);
  const status = !r ? 'running' : r.denied ? 'denied' : r.isError ? 'error' : 'ok';
  const it = { id: `tool:${callId}`, ts: c.ts, kind: 'tool', callId, name: c.name, category, title, input, status };
  if (INTERNAL.has(c.name)) { it.category = 'other'; it.internal = true; }
  if (c.name === 'ExitPlanMode') it.title = 'Plan';
  if (c.name === 'AskUserQuestion') it.title = firstLine(input.questions?.[0]?.question) || c.name;
  if (r) {
    it.output = output(c, r, it.category, status);
    if (c.name === 'ExitPlanMode') { it.output.plan = str(r.tur?.plan) || str(input.plan); it.output.decision = r.denied || r.isError ? 'rejected' : 'approved'; }
    if (c.name === 'AskUserQuestion' && !r.isError && !r.denied) {
      const a = r.tur?.answers && typeof r.tur.answers === 'object' ? r.tur.answers : null;
      if (a) { const v = Object.values(a).map(str); it.output.answer = v.length === 1 ? v[0] : a; }
    }
  }
  emit(state, out, it);
}

function setMode(state, out, mode, ts) {
  if (!str(mode)) return;
  if (state.mode && state.mode !== mode) notice(state, out, `mode:${ts}:${mode}`, ts, 'info', 'mode_changed', `Mode  ${modeName(state.mode)} → ${modeName(mode)}`);
  state.mode = mode;
}

function userText(state, out, text, id, ts, images) {
  const tag = (n) => new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(text)?.[1];
  if (text.includes('<local-command-caveat>')) return drop(state, 'user.caveat');
  const cmd = tag('command-name');
  if (cmd) {
    const name = cmd.trim().replace(/^\//, '');
    const it = { id, ts, kind: 'user', text: `/${name} ${str(tag('command-args')).trim()}`.trim() };
    state.lastUser = it;
    return emit(state, out, it);
  }
  const so = tag('local-command-stdout');
  if (so !== undefined) {
    if (!so.trim()) return;
    const code = /Set model to/.test(so) ? 'model_changed' : /Compacted/.test(so) ? 'compacted' : 'other';
    return notice(state, out, id, ts, 'info', code, so.trim());
  }
  if (text.startsWith('[Request interrupted by user')) return notice(state, out, id, ts, 'info', 'interrupted', text.trim());
  if (text.includes('<task-notification>')) { // assumed tags: task-id, status, summary
    const tid = str(tag('task-id')).trim() || id;
    state.tasks[tid] = { id: tid, label: str(tag('summary')).trim() || tid, status: str(tag('status')).trim() || 'unknown' };
    return;
  }
  const bash = tag('bash-input');
  if (bash !== undefined) { // shortcut: <bash-stdout>/<bash-stderr> lines of a "!cmd" are dropped, upgrade when the chat should show them
    const it = { id, ts, kind: 'user', text: `!${bash.trim()}` };
    state.lastUser = it;
    return emit(state, out, it);
  }
  if (/^<bash-(stdout|stderr)>/.test(text)) return drop(state, 'user.bash-output');
  const it = { id, ts, kind: 'user', text };
  const att = [...images, ...state.pendingAtt.splice(0)];
  if (att.length) it.attachments = att;
  state.lastUser = it;
  emit(state, out, it);
}

function run(obj, state, out, opts) {
  if (!obj || typeof obj !== 'object') throw Object.assign(new Error('line is not an object'), { name: 'NotAnObject' });
  if (obj.isSidechain === true && !opts.includeSidechain) { state.sidechainSkipped++; return; }
  const parsed = Date.parse(obj.timestamp);
  const ts = Number.isFinite(parsed) ? parsed : state.lastTs;
  state.lastTs = ts;
  if (str(obj.cwd)) state.cwd = obj.cwd;
  if (str(obj.gitBranch)) state.branch = obj.gitBranch;
  if (str(obj.sessionId)) state.sessionId = obj.sessionId;
  const uuid = str(obj.uuid) || `t${ts}`;
  const c = obj.message?.content;

  switch (obj.type) {
    case 'permission-mode': return setMode(state, out, obj.permissionMode, ts);
    case 'mode': if (str(obj.mode)) state.uiMode = obj.mode; return; // always 'normal' in recordings, a different axis than permission-mode: not fed to meta.mode
    case 'ai-title': if (str(obj.aiTitle)) state.title = obj.aiTitle; return;
    case 'agent-name': if (str(obj.agentName)) state.agentName = obj.agentName; return;
    case 'cost-state': if (Number.isFinite(obj.totalCostUSD)) state.costUsd = obj.totalCostUSD; return;
    case 'file-history-delta': state.fileHistory++; return;
    case 'queue-operation':
      if (obj.operation === 'enqueue') state.queue.push(str(obj.content));
      else state.queue.shift(); // dequeue/remove; queued messages are terminal-only (see coverage)
      return;
    case 'user': {
      if (obj.isMeta || obj.isCompactSummary || obj.isVisibleInTranscriptOnly) return drop(state, 'user.meta');
      setMode(state, out, obj.permissionMode, ts);
      if (typeof c === 'string') return userText(state, out, c, `${uuid}:0`, ts, []);
      if (!Array.isArray(c)) return;
      const images = c.filter((b) => b?.type === 'image').map(() => ({ type: 'image', name: 'image' }));
      c.forEach((b, i) => {
        if (b?.type === 'tool_result' && str(b.tool_use_id)) {
          const text = resultText(b.content);
          state.results.set(b.tool_use_id, { isError: b.is_error === true, text, tur: obj.toolUseResult,
            denied: obj.permissionDecision?.decision === 'reject' || (b.is_error === true && DENIED.test(text)) });
          emitCall(state, out, b.tool_use_id);
        } else if (b?.type === 'text') userText(state, out, str(b.text), `${uuid}:${i}`, ts, images);
        else if (b?.type === 'image' && !c.some((x) => x?.type === 'text')) userText(state, out, '', `${uuid}:${i}`, ts, images);
      });
      return;
    }
    case 'assistant': {
      const blocks = Array.isArray(c) ? c : [];
      if (obj.isApiErrorMessage) {
        const text = resultText(blocks) || 'API error';
        return notice(state, out, `err:${uuid}`, ts, 'error', RATE.test(text) ? 'rate_limit' : 'error', text);
      }
      const model = str(obj.message?.model);
      if (model && !model.startsWith('<')) {
        if (state.model && state.model !== model) notice(state, out, `model:${uuid}`, ts, 'info', 'model_changed', `Model  ${modelName(state.model)} → ${modelName(model)}`);
        state.model = model;
      }
      state.lastUser = null; // later file attachments belong to the next user item
      // A block whose id is already taken by different content (same uuid on two lines, or no uuid and equal ts) gets a content-hash suffix: deterministic, so a replayed line still de-dups.
      const put = (kind, text, i) => {
        let id = `${uuid}:${i}`;
        const it = { id, ts, kind, text };
        if (state.emitted.has(id) && state.emitted.get(id) !== JSON.stringify(it)) it.id = `${id}~${createHash('sha1').update(text).digest('hex').slice(0, 8)}`;
        emit(state, out, it);
      };
      blocks.forEach((b, i) => {
        if (b?.type === 'text' && str(b.text)) put('assistant', b.text, i);
        else if (b?.type === 'thinking' && str(b.thinking).trim()) put('thinking', b.thinking, i); // redacted/signature-only thinking has empty text: skipped
        else if (b?.type === 'tool_use' && str(b.id)) { state.calls.set(b.id, { name: str(b.name), input: b.input, ts }); emitCall(state, out, b.id); }
      });
      const u = obj.message?.usage;
      if (u && str(obj.message?.id)) {
        const n = (v) => (Number.isFinite(v) ? v : 0);
        state.ctxTokens = n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens);
        const it = { id: `usage:${obj.message.id}`, ts, kind: 'usage', inputTokens: n(u.input_tokens), outputTokens: n(u.output_tokens),
          cacheReadTokens: n(u.cache_read_input_tokens), cacheWriteTokens: n(u.cache_creation_input_tokens) };
        if (model) it.model = model; // no costUsd: transcripts only carry a cumulative cost-state line
        emit(state, out, it);
      }
      return;
    }
    case 'system': {
      const id = `sys:${uuid}`;
      if (obj.subtype === 'compact_boundary') {
        const m = obj.compactMetadata ?? {};
        if (Number.isFinite(m.postTokens)) state.ctxTokens = m.postTokens;
        return notice(state, out, id, ts, 'info', 'compacted', Number.isFinite(m.preTokens) ? `Compacted: ${m.preTokens} -> ${m.postTokens} tokens` : 'Compacted');
      }
      if (obj.subtype === 'api_error') {
        const text = str(obj.error?.message) || str(obj.error?.formatted) || str(obj.content) || 'API error';
        return notice(state, out, id, ts, 'error', RATE.test(text) ? 'rate_limit' : 'error', text);
      }
      if (obj.subtype === 'stop_hook_summary' && (obj.hookErrors?.length || obj.preventedContinuation)) return notice(state, out, id, ts, 'warn', 'other', `Stop hook: ${str(obj.stopReason) || 'error'}`);
      if ((obj.subtype === 'informational' || obj.subtype === 'away_summary') && str(obj.content)) return notice(state, out, id, ts, 'info', 'other', obj.content);
      // the one timing notice per turn: text "<n>s" or "<m>m <n>s" (code 'other': model.mjs has no timing code)
      if (obj.subtype === 'turn_duration' && Number.isFinite(obj.durationMs)) return emit(state, out, { id, ts, kind: 'notice', level: 'info', code: 'other', text: fmtDur(obj.durationMs), durationMs: obj.durationMs });
      return drop(state, `system.${str(obj.subtype) || 'unknown'}`);
    }
    // Attachment subtype -> handling. task_status: meta.backgroundTasks. file / image: the user item's attachments (re-emit the
    // last user item, or held in pendingAtt for the next one). hook_success exit!=0 and hook_cancelled: warn/info notice (failure
    // signals). Everything else (hook_success ok, reminders, listings, plan_mode, environment, ...): dropped, state.dropped['attachment.<subtype>'].
    case 'attachment': {
      const a = obj.attachment ?? {};
      const id = `att:${uuid}`;
      if (a.type === 'hook_success' && a.exitCode !== 0) return notice(state, out, id, ts, 'warn', 'other', `Hook ${str(a.hookEvent)} exited ${a.exitCode}`);
      if (a.type === 'hook_cancelled') return notice(state, out, id, ts, 'info', 'other', `Hook ${str(a.hookEvent)} cancelled`);
      if (a.type === 'task_status') {
        const tid = str(a.taskId) || id;
        state.tasks[tid] = { id: tid, label: str(a.description) || tid, status: str(a.status) };
        return;
      }
      if ((a.type === 'file' && str(a.filename)) || a.type === 'image') {
        const f = a.type === 'file' ? { type: 'file', name: base(a.filename), path: a.filename } : { type: 'image', name: str(a.filename) ? base(a.filename) : 'image' };
        const dup = (x) => x.type === f.type && x.name === f.name && x.path === f.path;
        if (state.lastUser) {
          const att = [...(state.lastUser.attachments ?? [])];
          if (!att.some(dup)) att.push(f);
          state.lastUser = { ...state.lastUser, attachments: att };
          emit(state, out, state.lastUser);
        } else if (!state.pendingAtt.some(dup)) state.pendingAtt.push(f);
        return;
      }
      return drop(state, `attachment.${str(a.type) || 'unknown'}`);
    }
    default: return drop(state, str(obj.type) || 'unknown'); // last-prompt, tools-used, api-request*, file-history-snapshot, ... counted, not shown
  }
}

// ---- screen -> Prompt ----
function parsePrompt(screen) {
  const lines = stripAnsi(str(screen)).split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).slice(-25);
  const text = lines.join('\n');
  let rows = [];
  let group = [];
  lines.forEach((l, i) => { // numbered rows; a "1." starts a new group so a numbered plan above the options is ignored
    const m = /^\s*(❯)?\s*(\d+)\.\s+(\S.*)$/.exec(l);
    if (!m) return;
    if (Number(m[2]) === 1) group = [];
    group.push({ i, n: Number(m[2]), label: m[3].trim(), marked: !!m[1] });
  });
  const cue = /Do you want|Would you like|Allow\b|Esc to cancel|trust|proceed/i.test(text);
  if (group.length >= 2 && group.every((r, k) => r.n === k + 1) && (cue || group.some((r) => r.marked))) rows = group.map((r) => ({ ...r, hotkey: String(r.n) }));
  const footer = lines.findLastIndex((l) => /Enter to (confirm|select)|Esc to cancel/.test(l));
  if (!rows.length && footer > 0) { // unnumbered list (trust dialog): ❯ row plus rows indented 3+ spaces, directly above the footer
    const up = [];
    for (let i = footer - 1; i >= 0 && (/^\s*❯\s*\S/.test(lines[i]) || /^\s{3,}\S/.test(lines[i])); i--) up.unshift({ i, label: lines[i].replace(/^\s*❯?\s*/, '').trim(), marked: /^\s*❯/.test(lines[i]) });
    // shortcut: a screen with a multi-line option label is not handled, upgrade when one shows up
    if (up.length >= 2 && up.some((r) => r.marked)) rows = up;
  }
  if (rows.length < 2) return null;
  const options = rows.map((r, k) => ({ index: k, label: r.label, ...(r.hotkey ? { hotkey: r.hotkey } : {}) }));
  const selected = Math.max(0, rows.findIndex((r) => r.marked));
  const trust = /trust this folder|Quick safety check/.test(text);
  const type = trust ? 'trust' : /Would you like to proceed|keep planning/.test(text) ? 'choice' : /Do you want to|Allow\b/.test(text) ? 'permission' : 'choice';
  let ti = -1;
  for (let j = rows[0].i - 1; j >= 0; j--) if (lines[j].includes('?')) { ti = j; break; }
  if (ti < 0) ti = Math.max(0, rows[0].i - 1);
  const title = trust ? 'Is this a project you created or one you trust?' : lines[ti].trim();
  let above = lines.slice(Math.max(0, ti - 6), ti).filter((l) => !SPIN.test(l));
  const rl = above.map((l, k) => (/^[\s╌─━╍-]{3,}$/.test(l) ? k : -1)).filter((k) => k >= 0); // diff/preview panel sits between rules: not dialog text
  if (rl.length) above = [...above.slice(0, rl[0]), ...above.slice(rl.length > 1 ? rl.at(-1) + 1 : rl[0] + 1).filter(() => rl.length > 1)];
  const body = above.map((l) => l.trim()).join('\n');
  const promptId = createHash('sha1').update(`${title}\n${options.map((o) => o.label).join('\n')}`).digest('hex').slice(0, 12);
  return { promptId, type, title, ...(body ? { body } : {}), options, selected };
}

// ---- screen -> Status ----
// Spinner row: "<glyph> <Verb>… (6s · ↓ 388 tokens · thought for 4s)"; older builds: "(esc to interrupt)" / "ctrl+c to interrupt".
// Glyph cycle seen in Claude Code: · ✢ ✳ ✶ ✻ ✽ (and * on terminals without them). Parts after the verb vary, so each is matched on its own.
const SPIN = /^\s*[·✢✳✶✻✽*●]\s+(\p{L}[\p{L}'-]*(?: \p{L}[\p{L}'-]*)?)…\s*\((.*)\)\s*$/u;
const toks = (n, k) => Math.round(parseFloat(n.replace(/,/g, '')) * ({ k: 1e3, m: 1e6 }[k?.toLowerCase()] || 1));
export function parseStatus(screen) {
  const lines = stripAnsi(str(screen)).split('\n').filter((l) => l.trim()).slice(-12);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = SPIN.exec(lines[i]);
    if (!m) continue;
    const out = { verb: m[1], elapsedSec: 0 };
    let known = false;
    for (const raw of m[2].split('·')) {
      const part = raw.trim();
      let t;
      if (/interrupt/i.test(part)) { out.hint = part; known = true; }
      else if ((t = parseDuration(part)) !== null) { out.elapsedSec = t; known = true; }
      else if ((t = /^([↓↑])?\s*([\d.,]+)\s*([km])?\s*tokens?$/i.exec(part))) { out.tokens = toks(t[2], t[3]); if (t[1]) out.tokenDirection = t[1] === '↓' ? 'down' : 'up'; known = true; }
      else if ((t = /^thought for (.+)$/i.exec(part)) && (t = parseDuration(t[1])) !== null) { out.thoughtSec = t; known = true; }
    }
    if (known) return out; // a row with parentheses but no recognised part is ordinary text
  }
  return null;
}

// ---- controls -> bytes ----
const enc = (s) => ({ bytes: new TextEncoder().encode(s) });
const clean = (s) => { if (/[\x00-\x1f\x7f]/.test(s)) throw new RangeError('control characters not allowed'); return s; };
const CYCLE = (o) => ['default', 'acceptEdits', 'plan', ...(o.bypass ? ['bypassPermissions'] : []), ...(o.auto ? ['auto'] : [])]; // permission-modes.md:172-184; dontAsk is never in the cycle

const controls = {
  interrupt: () => ({ bytes: new Uint8Array([0x1b]) }), // Esc interrupts: interactive-mode.md:36
  // Arrows + Enter: keybindings.md Confirm table (confirm:previous Up, confirm:next Down, confirm:yes Enter).
  // Digit hotkey on numbered dialogs: ASSUMED to select and submit (only the fixture wording shows digits).
  answerPrompt(prompt, index) {
    const o = prompt.options.find((x) => x.index === index);
    if (!o) throw new RangeError(`no option ${index}`);
    if (o.hotkey) return enc(o.hotkey);
    const d = index - prompt.selected;
    return enc((d > 0 ? '\x1b[B' : '\x1b[A').repeat(Math.abs(d)) + '\r');
  },
  // Shift+Tab cycles modes: interactive-mode.md:39, permission-modes.md:172-184. In the plan-approval dialog Shift+Tab approves the plan (permission-modes.md ~307): leave the dialog first.
  setMode(current, target, opts = {}) {
    const cyc = CYCLE(opts);
    const a = cyc.indexOf(current), b = cyc.indexOf(target);
    if (a < 0 || b < 0) throw new RangeError(`mode not in cycle: ${a < 0 ? current : target}`);
    return enc('\x1b[Z'.repeat((b - a + cyc.length) % cyc.length));
  },
  setModel: (model) => enc(`/model ${clean(model)}\r`), // commands.md /model
  slash: (command) => enc(`${clean(command).startsWith('/') ? '' : '/'}${command}\r`),
  compact: (instructions = '') => enc(`/compact${instructions ? ` ${clean(instructions)}` : ''}\r`), // commands.md /compact
  clear: () => enc('/clear\r'), // commands.md /clear
  // shortcut: path with spaces is not quoted, upgrade once the real @-mention quoting rule is confirmed
  attach: (path) => enc(`@${clean(path)} `),
};

// ---- coverage: every element of the Claude Code TUI. maps = model entries the row produces or drives. ----
const r = (element, shown, driven, how, maps = '') => ({ element, shown, driven, how, maps });
const coverage = [
  r('User message', 'chat', 'n/a', 'user item', 'item:user'),
  r('Assistant text', 'chat', 'n/a', 'assistant item', 'item:assistant'),
  r('Thinking block', 'chat', 'n/a', 'thinking item; redacted (empty) thinking is skipped', 'item:thinking'),
  r('Bash / PowerShell / Monitor tool', 'chat', 'n/a', 'tool item, text + exit code', 'item:tool tool:shell'),
  r('Edit / Write / NotebookEdit tool', 'chat', 'n/a', 'tool item with diff from structuredPatch', 'tool:edit tool:write'),
  r('Read tool', 'chat', 'n/a', 'tool item; image bytes never copied', 'tool:read'),
  r('Glob / Grep / LSP / ToolSearch tool', 'chat', 'n/a', 'tool item', 'tool:search'),
  r('WebFetch / WebSearch tool', 'chat', 'n/a', 'tool item', 'tool:web'),
  r('TodoWrite checklist', 'chat', 'n/a', 'todo item', 'item:todo'),
  r('Task* tools (TaskCreate, TaskUpdate, ...)', 'chat', 'n/a', 'tool item, category todo', 'tool:todo'),
  r('Agent subagent', 'chat', 'n/a', 'subagent item; childSessionId links the child transcript', 'item:subagent tool:subagent'),
  r('Subagent own transcript lines (isSidechain)', 'chat', 'n/a', 'skipped here, counted in state.sidechainSkipped; the child file is its own session'),
  r('MCP tool', 'chat', 'n/a', 'tool item titled "server: tool"', 'tool:mcp'),
  r('Skill / ExitPlanMode / AskUserQuestion / SendMessage tools', 'chat', 'n/a', 'tool item, category other', 'tool:other'),
  r('Tool denied by the user', 'chat', 'n/a', 'tool item status denied'),
  r('Tool error', 'chat', 'n/a', 'tool item status error'),
  r('Token usage', 'chat', 'n/a', 'usage item per assistant message id (replaced as the count grows)', 'item:usage'),
  r('Context window used', 'chat', 'n/a', 'meta.contextUsedPct from the last usage line'),
  r('Interrupt message', 'chat', 'n/a', 'notice interrupted', 'notice:interrupted'),
  r('Compaction', 'chat', 'n/a', 'notice compacted from compact_boundary or /compact output', 'notice:compacted item:notice'),
  r('Model change', 'chat', 'n/a', 'notice model_changed', 'notice:model_changed'),
  r('Permission mode change', 'chat', 'n/a', 'notice mode_changed', 'notice:mode_changed'),
  r('API error', 'chat', 'n/a', 'notice error', 'notice:error'),
  r('Rate / usage limit', 'chat', 'n/a', 'notice rate_limit', 'notice:rate_limit'),
  r('Hook failure / cancel, background task status, away summary', 'chat', 'n/a', 'notice other', 'notice:other'),
  r('Pasted images', 'chat', 'n/a', 'user item attachments, name only'),
  r('@file mentions', 'chat', 'n/a', 'file attachment re-emits the user item with the file listed'),
  r('Slash command echo and local output', 'chat', 'n/a', 'user "/cmd args" item; local stdout becomes a notice'),
  r('Permission dialog', 'chat', 'yes', 'parsePrompt + answerPrompt', 'prompt:permission control:answerPrompt'),
  r('Trust dialog', 'chat', 'yes', 'parsePrompt + answerPrompt (arrows + Enter)', 'prompt:trust'),
  r('Plan approval and AskUserQuestion dialogs', 'chat', 'yes', 'parsePrompt + answerPrompt', 'prompt:choice'),
  r('Interrupt (Esc)', 'chat', 'yes', 'controls.interrupt', 'control:interrupt'),
  r('Permission mode (Shift+Tab)', 'chat', 'yes', 'controls.setMode counts presses over the cycle', 'control:setMode'),
  r('Model switch', 'chat', 'yes', 'controls.setModel types /model <name>', 'control:setModel'),
  r('Slash commands', 'chat', 'yes', 'controls.slash types the command', 'control:slash'),
  r('Compact', 'chat', 'yes', 'controls.compact', 'control:compact'),
  r('Clear', 'chat', 'yes', 'controls.clear', 'control:clear'),
  r('Attach file (@path)', 'chat', 'yes', 'controls.attach', 'control:attach'),
  r('Queued messages (typed while Claude works)', 'terminal-only', 'no', 'tracked in state.queue, no item; shown only in the terminal'),
  r('Rewind menu (double Esc)', 'terminal-only', 'no', 'interactive picker'),
  r('Transcript view (Ctrl+O)', 'terminal-only', 'no', 'full-screen viewer'),
  r('Background task manager (Ctrl+B, /tasks)', 'terminal-only', 'no', 'interactive manager'),
  r('Resume picker (/resume)', 'terminal-only', 'no', 'interactive picker'),
  r('Cost and usage dashboards (/cost, /usage, /context)', 'terminal-only', 'no', 'rendered only on screen'),
  r('Settings and manager menus (/config, /mcp, /agents, /permissions, /hooks, /help)', 'terminal-only', 'no', 'interactive menus'),
  r('Spinner and status line', 'chat', 'n/a', 'parseStatus reads the spinner row from the screen; meta carries model, mode, context'),
  r('Prompt editing: vim mode, history search (Ctrl+R), editor handoff (Ctrl+G), image paste', 'terminal-only', 'no', 'input-line features'),
  r('Thinking and fast-mode toggles (Option+T, Option+O)', 'terminal-only', 'no', 'key toggles with no transcript record'),
  r('Login and auth flows', 'terminal-only', 'no', 'never driven: compliance rule'),
];

function meta(state) {
  const m = { agent: 'claude' };
  if (state.model) m.model = state.model;
  if (state.mode) m.mode = state.mode;
  if (state.cwd) m.cwd = state.cwd;
  if (state.branch) m.branch = state.branch;
  if (state.sessionId) m.sessionId = state.sessionId;
  if (state.title) m.title = state.title;
  if (state.agentName) m.agentName = state.agentName;
  if (state.costUsd !== null) m.costUsd = state.costUsd;
  if (state.uiMode) m.uiMode = state.uiMode;
  const bg = Object.values(state.tasks);
  if (bg.length) m.backgroundTasks = bg;
  if (state.ctxTokens) m.contextUsedPct = Math.min(100, Math.round((state.ctxTokens / state.contextWindow) * 100));
  return m;
}

/** { ok, errors, lastClass, dropped }: lines the mapper threw on (class name only) and counts of lines it deliberately did not show. */
export function mapperHealth(state) {
  const e = state?.errors ?? { count: 0, lastClass: null };
  return { ok: e.count === 0, errors: e.count, lastClass: e.lastClass, dropped: { ...(state?.dropped ?? {}) } };
}

/** Turn-end footer on screen, "✻ Sautéed for 2s · done 12:13 AM" (any verb) -> { verb, seconds } or null. */
export function parseTurnFooter(screen) {
  const lines = stripAnsi(str(screen)).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^\s*\S?\s*(\p{L}[\p{L}'-]*) for ((?:\d+h )?(?:\d+m )?\d+s)\s*·\s*done\b/u.exec(lines[i]);
    const seconds = m ? parseDuration(m[2]) : null;
    if (seconds !== null) return { verb: m[1], seconds };
  }
  return null;
}

/** contextWindow default 200000 is an assumption: the transcript has no window size. */
export function createClaudeMapper({ contextWindow = 200000, includeSidechain = false } = {}) {
  const newState = () => ({ ...fresh(), contextWindow });
  const ensure = (s) => { // fill keys an older persisted state lacks
    if (!s.emitted) return Object.assign(s, newState());
    for (const [k, v] of Object.entries(newState())) if (!(k in s)) s[k] = v;
    return s;
  };
  return {
    newState,
    mapLine(obj, state) {
      const out = [];
      const start = out.length;
      try { run(obj, ensure(state), out, { includeSidechain }); } catch (e) { // never throws; the class name (no line content) is kept for mapperHealth
        if (state && typeof state === 'object') { const er = (state.errors ??= { count: 0, lastClass: null }); er.count++; er.lastClass = String(e?.name || 'Error'); }
      }
      if (includeSidechain && obj?.isSidechain === true) for (const it of out.slice(start)) it.sidechain = true;
      return out;
    },
    meta: (state) => meta(ensure(state)),
    parsePrompt,
    parseStatus,
    controls,
    coverage,
  };
}
