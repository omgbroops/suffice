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
import { classifyScreen, screenItems, SPIN } from './screens.mjs';

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
  dropped: {}, skipped: {}, agentNames: {}, fileHistory: 0, errors: { count: 0, lastClass: null }, title: null, agentName: null, costUsd: null, uiMode: null, tasks: {}, pendingAtt: [] });
const drop = (state, k) => { state.dropped[k] = (state.dropped[k] || 0) + 1; };
// skip = a record that carries nothing new (repeat value, replayed line, empty field): counted in state.skipped[<type>.<why>], never silent
const skip = (state, k) => { state.skipped[k] = (state.skipped[k] || 0) + 1; };

function emit(state, out, it) {
  const sig = JSON.stringify(it);
  if (state.emitted.get(it.id) === sig) return skip(state, `dup.${it.kind}`); // same id + same content = duplicate line; changed content replaces by id
  state.emitted.set(it.id, sig);
  out.push(it);
}
const fmtDur = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };
// An api_error system line and its synthetic assistant line describe one event: same class within 5 s gives one notice.
const notice = (state, out, id, ts, level, code, text) => {
  if (level === 'error') {
    const l = state.lastErr;
    if (l && l.code === code && Math.abs(ts - l.ts) <= 5000 && l.id !== id) return skip(state, 'notice.coalesced'); // api_error + its synthetic assistant line = one event
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
  if (text.length > CAP || /\btruncated\b/i.test(r.text.slice(-200))) { o.truncated = true; o.lines = text.split('\n').length; }
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
  const status = !r ? 'running' : r.denied ? 'denied' : r.isError && r.text.startsWith('[Request interrupted by user') ? 'interrupted' : r.isError ? 'error' : 'ok';
  const it = { id: `tool:${callId}`, ts: c.ts, kind: 'tool', callId, name: c.name, category, title, input, status };
  if (INTERNAL.has(c.name)) { it.category = 'other'; it.internal = true; }
  if (c.name === 'ExitPlanMode') it.title = 'Plan';
  if (c.name === 'AskUserQuestion') it.title = firstLine(input.questions?.[0]?.question) || c.name;
  if (r) {
    it.output = output(c, r, it.category, status);
    if (status === 'denied') { const fb = /the user said:\n([\s\S]*?)\n\nNote:/.exec(r.text); if (fb) it.output.feedback = fb[1].trim(); } // plain denials and deny-rule blocks carry no feedback
    if (c.name === 'ExitPlanMode') { it.output.plan = str(r.tur?.plan) || str(input.plan); it.output.decision = r.denied || r.isError ? 'rejected' : 'approved'; }
    if (c.name === 'AskUserQuestion' && !r.isError && !r.denied) {
      const a = r.tur?.answers && typeof r.tur.answers === 'object' ? r.tur.answers : null;
      if (a) { const v = Object.values(a).map(str); it.output.answer = v.length === 1 ? v[0] : a; }
    }
  }
  const bg = c.name === 'Bash' && r && status === 'ok' ? /^Command running in background with ID: (\w+)/.exec(r.text) : null;
  if (bg) { it.status = 'background'; it.output.taskId = bg[1]; (state.bg ??= new Map()).set(bg[1], it); } // the later task-output Read attaches below
  const task = c.name === 'Read' && r ? /\/tasks\/(\w+)\.output$/.exec(str(input.file_path)) : null;
  if (task && state.bg?.has(task[1])) { const b = state.bg.get(task[1]); b.output.later = cap(it.output.text); emit(state, out, b); }
  emit(state, out, it);
}

function setMode(state, out, mode, ts, why) { // why: skip counter name for a standalone record (user records pass none: they repeat the value by design)
  if (!str(mode)) return why && skip(state, `${why}.empty`);
  if (state.mode === mode) return why && skip(state, `${why}.unchanged`);
  if (state.mode) notice(state, out, `mode:${ts}:${mode}`, ts, 'info', 'mode_changed', `Mode  ${modeName(state.mode)} → ${modeName(mode)}`);
  state.mode = mode;
}
function setUiMode(state, out, mode, ts) { // the 'mode' record: a second axis next to permission-mode, shown to the mode picker via state.uiMode
  if (!str(mode)) return skip(state, 'mode.empty');
  if (state.uiMode === mode) return skip(state, 'mode.unchanged');
  // no notice: the view mode is a picker axis, and tui-claude 'item 1' requires zero notices for it
  state.uiMode = mode;
}

function userText(state, out, text, id, ts, images) {
  const tag = (n) => new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(text)?.[1];
  if (text.includes('<local-command-caveat>')) return drop(state, 'user.caveat');
  if (!text.trim() && !images.length) return skip(state, 'user.empty'); // empty text and no image: nothing to show
  const cmd = tag('command-name');
  if (cmd) {
    const name = cmd.trim().replace(/^\//, '');
    const it = { id, ts, kind: 'user', text: `/${name} ${str(tag('command-args')).trim()}`.trim() };
    state.lastUser = it;
    return emit(state, out, it);
  }
  const so = tag('local-command-stdout');
  if (so !== undefined) {
    if (!so.trim()) return skip(state, 'user.empty-stdout');
    const code = /Set model to/.test(so) ? 'model_changed' : /Compacted/.test(so) ? 'compacted' : 'other';
    return notice(state, out, id, ts, 'info', code, so.trim());
  }
  if (text.startsWith('[Request interrupted by user')) return notice(state, out, id, ts, 'info', 'interrupted', text.trim());
  if (text.includes('<task-notification>')) { // real tags: task-id, tool-use-id, output-file, status, summary, note, result, usage{subagent_tokens,tool_uses,duration_ms}
    const tid = str(tag('task-id')).trim() || id;
    const num = (n) => { const v = Number(str(tag(n)).trim()); return Number.isFinite(v) && str(tag(n)).trim() !== '' ? v : undefined; };
    const t = { id: tid, label: str(tag('summary')).trim() || tid, status: str(tag('status')).trim() || 'unknown', toolUseId: str(tag('tool-use-id')).trim(), ts,
      result: str(tag('result')).trim(), usage: { tokens: num('subagent_tokens'), toolUses: num('tool_uses'), durationMs: num('duration_ms') } };
    const same = (a, b) => JSON.stringify({ ...a, ts: 0 }) === JSON.stringify({ ...b, ts: 0 }); // a repeated notification (only ts differs) is not a change
    if (state.tasks[tid] && same(state.tasks[tid], t)) return skip(state, 'user.task-notification.unchanged');
    state.tasks[tid] = t;
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
    case 'permission-mode': return setMode(state, out, obj.permissionMode, ts, 'permission-mode');
    case 'mode': return setUiMode(state, out, obj.mode, ts);
    case 'ai-title': // latest wins, no chat item
      if (!str(obj.aiTitle) || obj.aiTitle === state.title) return skip(state, `ai-title.${str(obj.aiTitle) ? 'unchanged' : 'empty'}`);
      state.title = obj.aiTitle; return;
    case 'agent-name': { // names the agent the line belongs to (agentId when present, else the session's main agent); no chat item
      const who = str(obj.agentId);
      if (!str(obj.agentName) || (who ? state.agentNames[who] : state.agentName) === obj.agentName) return skip(state, `agent-name.${str(obj.agentName) ? 'unchanged' : 'empty'}`);
      if (who) state.agentNames[who] = obj.agentName; else state.agentName = obj.agentName;
      return;
    }
    case 'cost-state':
      if (!Number.isFinite(obj.totalCostUSD) || obj.totalCostUSD === state.costUsd) return skip(state, 'cost-state.unchanged');
      state.costUsd = obj.totalCostUSD; return;
    case 'file-history-delta': state.fileHistory++; return;
    case 'queue-operation':
      if (obj.operation === 'enqueue') state.queue.push(str(obj.content));
      else state.queue.shift(); // dequeue/remove; queued messages are terminal-only (see coverage)
      return;
    case 'user': {
      if (obj.isMeta || obj.isCompactSummary || obj.isVisibleInTranscriptOnly) return drop(state, 'user.meta');
      setMode(state, out, obj.permissionMode, ts);
      if (obj.origin?.kind === 'task-notification' && !(typeof c === 'string' && c.includes('<task-notification>'))) return drop(state, 'user.task-notification'); // saved transcripts may scrub the body: still never a chat message
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
        const t = { id: tid, label: str(a.description) || tid, status: str(a.status) };
        if (JSON.stringify(state.tasks[tid]) === JSON.stringify(t)) return skip(state, 'attachment.task_status.unchanged');
        state.tasks[tid] = t;
        return;
      }
      if (a.type === 'file' && !str(a.filename)) return skip(state, 'attachment.file.nameless'); // nothing to name it by
      if ((a.type === 'file' && str(a.filename)) || a.type === 'image') {
        const f = a.type === 'file' ? { type: 'file', name: base(a.filename), path: a.filename } : { type: 'image', name: str(a.filename) ? base(a.filename) : 'image' };
        const dup = (x) => x.type === f.type && x.name === f.name && x.path === f.path;
        if (state.lastUser) {
          const att = [...(state.lastUser.attachments ?? [])];
          if (att.some(dup)) return skip(state, `attachment.${f.type}.dup`);
          att.push(f);
          state.lastUser = { ...state.lastUser, attachments: att };
          emit(state, out, state.lastUser);
        } else if (state.pendingAtt.some(dup)) skip(state, `attachment.${f.type}.dup`);
        else state.pendingAtt.push(f);
        return;
      }
      return drop(state, `attachment.${str(a.type) || 'unknown'}`);
    }
    default: return drop(state, str(obj.type) || 'unknown'); // last-prompt, tools-used, api-request*, file-history-snapshot, ... counted, not shown
  }
}

// ---- screen -> Prompt ----
// A live dialog ends at its footer hint. Output at column 0 after the last option (a decline echo, a bare prompt) means the dialog was answered and is only left in the pane.
function staleDialog(screen) {
  const rows = stripAnsi(screen).split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  const last = rows.findLastIndex((l) => /^\s*(?:[❯›]\s*)?\d+\.\s/.test(l));
  return last >= 0 && rows.slice(last + 1).some((l) => /^\S/.test(l) && !/^[─━╌╍┄╭╰│▔-]/.test(l) && !/\b(?:esc|enter|tab|ctrl\+\w|shift\+tab|space)\b.{0,40}\bto\b/i.test(l));
}

function parsePrompt(screen) { // only a classified permission / question / plan / trust dialog yields options; every other screen is null
  const c = classifyScreen(str(screen));
  const p = c.prompt && ['permission', 'question', 'plan', 'trust'].includes(c.kind) ? c.prompt : null;
  if (p && staleDialog(str(screen))) return null;
  if (!p || !(p.type === 'permission' || /Would you like to proceed/.test(p.title))) return p;
  const full = stripAnsi(str(screen)).split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  return { ...p, ...promptTool(full, full.findLastIndex((l) => l.trim() === p.title), p.title, p.options) }; // tool, target, diff, alwaysAllow
}

// Tool, target and always-allow option of a tool permission dialog. The dialog block runs from the last solid rule to the title.
function promptTool(full, ti, title, options) {
  let st = -1;
  for (let j = Math.min(ti, full.length) - 1; j >= 0; j--) if (/^\s*─{20,}\s*$/.test(full[j])) { st = j; break; }
  const block = full.slice(st + 1, Math.max(ti, 0)).map((l) => l.trim());
  const head = block[0] ?? '';
  const blockText = block.join('\n');
  const out = {};
  if (/^Bash command$/.test(head)) out.tool = 'Bash';
  else if (/^Edit notebook$/.test(head)) out.tool = 'NotebookEdit';
  else if (/^Edit file$/.test(head)) out.tool = 'Edit';
  else if (/^Create file$|^Overwrite file$|to overwrite /.test(head + '\n' + title) || /^Do you want to create /.test(title)) out.tool = 'Write';
  else if (/search the web for/.test(blockText)) out.tool = 'WebSearch';
  else if (/fetch this content/.test(title)) out.tool = 'WebFetch';
  else if (/Would you like to proceed/.test(title)) out.tool = 'ExitPlanMode';
  if (!out.tool) return out;
  if (out.tool === 'Bash') {
    const body = block.slice(1).filter((l) => l && !/^[╌─\s]+$/.test(l) && !/^Tip:/.test(l) && !/requires? approval/.test(l));
    const cmd = body.filter((l) => l.startsWith('│')).map((l) => l.replace(/^│ ?/, ''));
    const other = body.filter((l) => !l.startsWith('│'));
    if (cmd.length) { out.command = cmd.join('\n'); if (other.length) out.description = other.join(' '); }
    else if (other.length > 1) { out.description = other[0]; out.command = other.slice(1).join('\n'); }
    else out.command = other[0] ?? '';
    out.target = out.command;
  } else if (out.tool === 'WebSearch') {
    out.target = /search the web for:\s*(.*)$/m.exec(blockText)?.[1]?.trim() ?? '';
  } else if (out.tool === 'WebFetch') {
    const url = full.slice(0, ti).findLast((l) => /⏺ Fetch\(/.test(l));
    out.target = url ? /Fetch\((?:url:\s*")?([^")\s]+)/.exec(url)?.[1] ?? '' : '';
  } else if (out.tool !== 'ExitPlanMode') {
    out.target = /(?:edit to|create|overwrite) (\S+?)\?$/.exec(title)?.[1] ?? '';
  }
  if (out.tool === 'Edit' || out.tool === 'Write' || out.tool === 'NotebookEdit') {
    let added = 0, removed = 0;
    for (const l of block) { const m = /^\d+\s+([+-])/.exec(l); if (m) m[1] === '+' ? added++ : removed++; }
    if (!added && !removed && out.tool === 'Write') added = block.filter((l) => /^\d+\s+\S/.test(l)).length; // created file: rows carry no +
    out.diff = { added, removed };
  }
  const aa = options.find((o) => /don.t ask again for:?\s*/i.test(o.label)) ?? options.find((o) => /switch to accept edits/i.test(o.label));
  if (aa) out.alwaysAllow = { index: aa.index, label: aa.label, scope: /don.t ask again for:?\s*(.*)$/i.exec(aa.label)?.[1] ?? /switch to (.*)$/i.exec(aa.label)?.[1] ?? '' };
  return out;
}

// ---- screen -> tool items ----
// Rows: "⏺ Update(path)" + "  ⎿  result" (+ 5-space continuation rows); collapsed groups ("Ran 1 shell command"); live "Running <desc> · 2s" / "⏺ Reading 1 file…"
// with a "⎿  $ cmd" row; "No result recorded for N call" + "⎿  Interrupted". Items come in order of appearance.
const ROW_NAME = { Update: 'Edit', Edit: 'Edit', Fetch: 'WebFetch', 'Web Search': 'WebSearch', Bash: 'Bash', Read: 'Read', Write: 'Write', Agent: 'Agent', Skill: 'Skill', Glob: 'Glob', Grep: 'Grep', NotebookEdit: 'NotebookEdit' };
const GROUP = { 'shell command': ['Bash', 'shell'], file: ['Read', 'read'], pattern: ['Grep', 'search'], directory: ['Glob', 'search'] };
const plural = (n) => (n == null ? undefined : Number(n));
function applyResult(it, text, more) {
  const o = (it.output ??= { text: '' });
  o.text = [text, ...more].join('\n').trim();
  let m;
  if ((m = /^Error: Exit code (\d+)/.exec(text))) { it.status = 'error'; o.exitCode = Number(m[1]); }
  else if (/^Error:/.test(text)) it.status = 'error';
  else if (/^User rejected|Not run · permission denied|doesn't want to proceed/.test(text)) it.status = 'denied';
  else if (/^Interrupted/.test(text)) it.status = 'interrupted';
  else if (/^\d+ PostToolUse hooks? ran/.test(text) || /^Tip:/.test(text)) { o.text = ''; return; }
  else if (it.status === 'running' || it.status === 'background') { if (it.status === 'running') it.status = 'ok'; }
  if (it.status === 'ok' && it.category === 'shell' && o.exitCode == null) o.exitCode = 0;
  if ((m = /^Added (\d+) lines?(?:, removed (\d+) lines?)?/.exec(text))) { o.added = Number(m[1]); o.removed = Number(m[2] ?? 0); }
  else if ((m = /^Removed (\d+) lines?/.exec(text))) { o.added = 0; o.removed = Number(m[1]); }
  else if ((m = /^Wrote (\d+) lines?/.exec(text))) { o.added = Number(m[1]); o.removed = 0; }
  if ((m = /^Read (\d+) lines?/.exec(text))) o.lines = Number(m[1]);
  if ((m = /^… \+(\d+) lines?/m.exec(o.text))) { o.truncated = true; o.hiddenLines = Number(m[1]); o.lines = more.filter((l) => !/^… \+/.test(l)).length + 1 + o.hiddenLines; }
  else if (/\btruncated\b/i.test(text)) o.truncated = true;
}
export function parseToolRows(screen) {
  const lines = stripAnsi(str(screen)).split('\n').map((l) => l.replace(/\s+$/, ''));
  const items = [];
  const mk = (name, arg, status = 'running') => { const it = { kind: 'tool', name, category: CAT[name] ?? 'other', title: arg, status }; items.push(it); return it; };
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if ((m = /^\s*⏺ (Update|Edit|Fetch|Web Search|Bash|Read|Write|Agent|Skill|Glob|Grep|NotebookEdit)\((.*?)\)?$/.exec(l))) { cur = mk(ROW_NAME[m[1]], m[1] === 'Web Search' ? m[2].replace(/^"|"$/g, '') : /^url: "/.test(m[2]) ? /^url: "([^"]+)"/.exec(m[2])[1] : m[2]); continue; }
    if ((m = /^\s*⏺ Reading (\d+) files?…$/.exec(l))) { cur = mk('Read', ''); cur.count = Number(m[1]); continue; }
    if ((m = /^\s*⏺ Background command "(.*)" completed \(exit code (\d+)\)/.exec(l))) {
      const it = items.findLast((x) => x.name === 'Bash' && x.status === 'background') ?? items.findLast((x) => x.name === 'Bash' && x.title === m[1]);
      if (it) { it.status = 'background'; (it.output ??= { text: '' }).exitCode = Number(m[2]); it.output.text = `completed (exit code ${m[2]})`; it.done = true; }
      else { cur = mk('Bash', m[1], 'background'); cur.output = { text: `completed (exit code ${m[2]})`, exitCode: Number(m[2]) }; cur.done = true; }
      continue;
    }
    if ((m = /^\s+Running (.+?)(?: · \d+\w*)?$/.exec(l)) && /^\s+⎿\s+\$ /.test(lines[i + 1] ?? '')) { cur = mk('Bash', m[1]); continue; }
    if ((m = /^\s+No result recorded for (\d+) calls?$/.exec(l))) { cur = mk('Bash', '', 'interrupted'); continue; }
    if ((m = /^\s{2}(?:Listed|Read|Searched for|Ran)\b.*\b(?:shell commands?|files?|patterns?|directory|directories)$/.exec(l))) {
      for (const g of l.trim().split(/, /)) {
        const gm = /^(?:Listed|Read|Searched for|Ran) (\d+) (shell command|file|pattern|director)/.exec(g);
        if (!gm) continue;
        const [name] = GROUP[gm[2] === 'director' ? 'directory' : gm[2]];
        for (let k = 0; k < Number(gm[1]); k++) { const it = mk(name, '', 'ok'); it.collapsed = true; }
      }
      cur = items.at(-1)?.collapsed ? items.at(-1) : null; // a following ⎿ row (Not run, Error) belongs to the last collapsed call
      continue;
    }
    if ((m = /^\s+⎿\s+(.*)$/.exec(l)) && cur) {
      const text = m[1];
      if (/^\$ /.test(text) && !cur.output) { cur.title = text.slice(2); if (cur.name === 'Bash') cur.category = 'shell'; continue; }
      if (cur.name === 'Read' && cur.status === 'running' && cur.count && !cur.output && !/^(Error|Read |Tip:|\d+ PostToolUse)/.test(text)) { cur.title = text; continue; }
      const more = [];
      while (i + 1 < lines.length && /^ {5,}\S|^\s+… \+\d+ lines?/.test(lines[i + 1])) more.push(lines[++i].trim());
      if (cur.done) continue;
      if (cur.status === 'interrupted' && cur.output) continue;
      if (cur.output && !/^(Interrupted|Error)/.test(text)) { if (/^\d+ PostToolUse/.test(text)) continue; }
      applyResult(cur, text, more);
      continue;
    }
    if (/^\s*⏺ /.test(l) || /^❯ /.test(l)) cur = null; // prose or a new prompt ends the current call
  }
  const pr = parsePrompt(screen); // a pending permission prompt is the live call
  if (pr?.tool && pr.target && !items.some((x) => x.name === pr.tool && x.status === 'running' && x.title === pr.target)) {
    const it = mk(pr.tool, pr.target);
    if (pr.diff) it.output = { text: '', added: pr.diff.added, removed: pr.diff.removed };
  }
  return items;
}

// ---- screen -> Status ----
// Spinner row: "<glyph> <Verb>… (6s · ↓ 388 tokens · thought for 4s)"; older builds: "(esc to interrupt)" / "ctrl+c to interrupt".
// Glyph cycle seen in Claude Code: · ✢ ✳ ✶ ✻ ✽ (and * on terminals without them). Parts after the verb vary, so each is matched on its own.
const toks = (n, k) => Math.round(parseFloat(n.replace(/,/g, '')) * ({ k: 1e3, m: 1e6 }[k?.toLowerCase()] || 1));
// Structure, not a verb list: glyph + verb + "…" + optional "(parts · in · any order)". Bare "✽ Sprouting…" has no parts; "*" and "●" rows need the parentheses (bullets end in "…" too).
const WORK = /^\s*([·✢✳✶✻✽*●])\s+(\p{L}[\p{L}'-]*(?: \p{L}[\p{L}'-]*)?)…(?:\s*\((.*)\))?\s*$/u;
/** Full shape, nulls when absent: { verb, elapsedSec, tokens, interruptible, thinking, ... }. */
export function parseWorking(screen) {
  const lines = stripAnsi(str(screen)).split('\n').filter((l) => l.trim()).slice(-12);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = WORK.exec(lines[i]);
    if (!m) continue;
    if (m[3] === undefined && /[*●]/.test(m[1])) continue;
    const out = { verb: m[2], elapsedSec: null, tokens: null, interruptible: null, thinking: false };
    let known = m[3] === undefined;
    for (const raw of (m[3] ?? '').split('·')) {
      const part = raw.trim();
      let t;
      if (/interrupt/i.test(part)) { out.hint = part; out.interruptible = true; known = true; }
      else if ((t = parseDuration(part)) !== null) { out.elapsedSec = t; known = true; }
      else if ((t = /^([↓↑])?\s*([\d.,]+)\s*([km])?\s*tokens?$/i.exec(part))) { out.tokens = toks(t[2], t[3]); if (t[1]) out.tokenDirection = t[1] === '↓' ? 'down' : 'up'; known = true; }
      else if ((t = /^thought for (.+)$/i.exec(part)) && (t = parseDuration(t[1])) !== null) { out.thoughtSec = t; known = true; }
      else if (/^thinking$/i.test(part)) { out.thinking = true; known = true; }
    }
    if (known) return out; // a row with parentheses but no recognised part is ordinary text
  }
  return null;
}
/** Legacy shape (model.mjs Status): elapsedSec 0 when unknown, absent keys omitted. */
export function parseStatus(screen) {
  const w = parseWorking(screen);
  if (!w) return null;
  const { elapsedSec, tokens, interruptible, thinking, ...rest } = w;
  return { ...rest, elapsedSec: elapsedSec ?? 0, ...(tokens !== null && { tokens }), ...(thinking && { thinking }) };
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
  // Multi-select: Space toggles the row under the cursor (recorded: variants/session ask--04..06), then Right moves to the Submit tab and Enter on "Submit answers".
  // ASSUMED (not recorded): the Right + Enter submit path of a single multi-select question; the "Type something" row is never toggled.
  answerMulti(prompt, indices) {
    if (!prompt.multiSelect) throw new RangeError('not a multi-select prompt');
    let at = prompt.selected, out = '';
    for (const o of prompt.options) if (!o.other && indices.includes(o.index) !== !!o.checked) { out += (o.index > at ? '\x1b[B' : '\x1b[A').repeat(Math.abs(o.index - at)) + ' '; at = o.index; }
    return enc(out + '\x1b[C\r');
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
  r('Multi-select question', 'chat', 'yes', 'controls.answerMulti: Space per changed box, Right, Enter', 'control:answerMulti'),
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
  if (Object.keys(state.agentNames).length) m.agentNames = { ...state.agentNames };
  const bg = Object.values(state.tasks);
  if (bg.length) m.backgroundTasks = bg;
  if (state.ctxTokens) m.contextUsedPct = Math.min(100, Math.round((state.ctxTokens / state.contextWindow) * 100));
  return m;
}

/** { ok, errors, lastClass, dropped }: lines the mapper threw on (class name only) and counts of lines it deliberately did not show. */
export function mapperHealth(state) {
  const e = state?.errors ?? { count: 0, lastClass: null };
  return { ok: e.count === 0, errors: e.count, lastClass: e.lastClass, dropped: { ...(state?.dropped ?? {}) }, skipped: { ...(state?.skipped ?? {}) } };
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
    classifyScreen,
    screenItems,
    parseToolRows,
    parseStatus,
    controls,
    coverage,
  };
}
