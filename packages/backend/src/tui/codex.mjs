// Codex TUI mapper: rollout JSONL lines -> chat items, screen text -> Prompt, controls -> key bytes.
// Verified against openai/codex tag rust-v0.159.0 (installed codex-cli 0.159.0) and real rollout key/type
// counts. Items are keyed by stable ids so a later result re-emits the SAME id (consumers replace by id).
// Rollout formats handled: "item mode" (event_msg/item_completed ThreadItems, what 0.159 writes),
// legacy *_begin/*_end events (protocol source only, not seen in real files), and a response_item
// fallback for sessions that carry neither.
import { itemProblem, parseDuration } from './model.mjs';
import { claudeNonPrompt } from './screens.mjs';

const text = (v) => (typeof v === 'string' ? v : '');
const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const blocksText = (c) => (Array.isArray(c) ? c.map((b) => text(b?.text)).filter(Boolean).join('\n') : text(c));
const injected = (t) => /^\s*</.test(t) || t.includes('# AGENTS.md instructions');
const stripShell = (c) => text(c).replace(/^\S*\b(?:ba|z)?sh -lc (['"])([\s\S]*)\1$/, '$2');
const cmdStr = (c) => (Array.isArray(c) ? stripShell(c.length === 3 && /sh$/.test(c[0]) ? c[2] : c.join(' ')) : stripShell(c));
const durMs = (d) => (d && typeof d === 'object' ? (d.secs ?? 0) * 1000 + Math.round((d.nanos ?? 0) / 1e6) : 0);
const STEP = { pending: 'pending', in_progress: 'active', completed: 'done' };
const CAP = 60000;

// Parse an apply_patch envelope into per-file entries (grammar: *** Add/Delete/Update File:, *** Move to:).
export function parsePatch(src) {
  const out = [];
  let cur = null;
  for (const line of text(src).split('\n')) {
    let m;
    if ((m = /^\*\*\* (Add|Delete|Update) File: (.+)$/.exec(line))) {
      cur = { path: m[2].trim(), op: m[1].toLowerCase(), lines: [] };
      out.push(cur);
    } else if ((m = /^\*\*\* Move to: (.+)$/.exec(line)) && cur) {
      cur.moveTo = m[1].trim();
      cur.op = 'move';
    } else if (/^\*\*\* (Begin|End) Patch/.test(line)) cur = cur && /End/.test(line) ? null : cur;
    else if (cur) cur.lines.push(line);
  }
  return out.map(({ lines, ...d }) => {
    const body = lines.join('\n').replace(/\n+$/, '');
    const e = { ...d, patch: body };
    if (d.op === 'add') e.newText = lines.filter((l) => l.startsWith('+')).map((l) => l.slice(1)).join('\n');
    return e;
  });
}

// ThreadItem.changes is { path: {type:'add'|'delete'|'update', content|unified_diff, move_path?} }.
function diffFromChanges(ch) {
  if (!ch || typeof ch !== 'object') return [];
  return Object.entries(ch).map(([path, c]) => {
    const t = c?.type;
    if (t === 'add') return { path, op: 'add', newText: text(c.content), patch: text(c.content) };
    if (t === 'delete') return { path, op: 'delete', oldText: text(c.content), patch: text(c.content) };
    const e = { path, op: c?.move_path ? 'move' : 'update', patch: text(c?.unified_diff) };
    if (c?.move_path) e.moveTo = text(c.move_path);
    return e;
  });
}

function out(text0) {
  const t = text(text0);
  return t.length > CAP ? { text: t.slice(0, CAP), truncated: true } : { text: t, truncated: false };
}

function mcpText(r) {
  return Array.isArray(r?.content) ? r.content.map((b) => text(b?.text) || (b?.type ? `[${b.type}]` : '')).join('\n') : '';
}

export function createCodexMapper() {
  const S = (s) => {
    s.codex ??= { itemMode: false, turn: '0', calls: {}, ordinal: 0 };
    return s.codex;
  };
  const note = (c, ts, level, code, t) => ({ id: `codex:notice:${code}:${c.ordinal++}`, ts, kind: 'notice', level, code, text: t });

  // approval_policy is a string or an object like {granular:{...}} in real rollouts: reduce to its first key.
  const approvalOf = (a) => (typeof a === 'string' ? a : a && typeof a === 'object' ? Object.keys(a)[0] ?? '' : '');
  function applySettings(c, ts, v) {
    const items = [];
    const approval = approvalOf(v.approval_policy ?? v.approval);
    const sandbox = text(v.sandbox_policy?.type ?? v.sandbox);
    const collab = text(v.collaboration_mode?.mode);
    const mode = [approval, sandbox].filter(Boolean).join('/');
    const full = [mode, collab].filter(Boolean).join(' ');
    // Compare only the parts this line carries: a thread_settings line has no sandbox_policy, a turn_context does.
    const changed = (k, val) => val && c[k] && c[k] !== val;
    if (changed('model', v.model)) items.push(note(c, ts, 'info', 'model_changed', `Model changed to ${v.model}`));
    if (changed('approval', approval) || changed('sandbox', sandbox) || changed('collab', collab)) items.push(note(c, ts, 'info', 'mode_changed', `Mode changed to ${full}`));
    if (v.model) c.model = v.model;
    if (approval) c.approval = approval;
    if (sandbox) c.sandbox = sandbox;
    if (collab) c.collab = collab;
    if (full) c.mode = full;
    if (v.cwd) c.cwd = v.cwd;
    if (v.effort ?? v.reasoning_effort) c.effort = v.effort ?? v.reasoning_effort;
    return items;
  }

  function tool(c, ts, key, f) {
    return { id: `codex:tool:${key}`, ts: c.calls[key]?.ts ?? ts, kind: 'tool', callId: key, ...f };
  }
  function remember(c, key, ts) {
    c.calls[key] ??= { ts };
  }

  function threadItem(c, ts, it) {
    const id = text(it.id) || `i${c.ordinal++}`;
    switch (it.type) {
      case 'UserMessage': {
        const t = blocksText(it.content);
        const attachments = (Array.isArray(it.content) ? it.content : [])
          .filter((b) => b?.type && b.type !== 'text')
          .map((b, i) => ({ type: 'image', name: text(b.path) || text(b.url) || `image-${i + 1}`, ...(b.path ? { path: b.path } : {}) }));
        if (injected(t) || (!t.trim() && !attachments.length)) return [];
        return [{ id: `codex:user:${id}`, ts, kind: 'user', text: t.trim() || '[attachment]', ...(attachments.length ? { attachments } : {}) }];
      }
      case 'AgentMessage': {
        const t = blocksText(it.content);
        return t.trim() ? [{ id: `codex:assistant:${id}`, ts, kind: 'assistant', text: t }] : [];
      }
      case 'Reasoning': {
        const t = (Array.isArray(it.summary_text) ? it.summary_text.join('\n') : text(it.summary_text)) || (Array.isArray(it.raw_content) ? it.raw_content.join('\n') : text(it.raw_content));
        return t.trim() ? [{ id: `codex:thinking:${id}`, ts, kind: 'thinking', text: t }] : [];
      }
      case 'CommandExecution': {
        const title = cmdStr(it.command);
        const o = out(it.aggregated_output ?? it.formatted_output ?? it.stdout);
        const ok = it.status !== 'failed' && (it.exit_code ?? 0) === 0;
        return [tool(c, ts, id, { name: 'exec', category: 'shell', title: title || 'command', input: { command: title, cwd: it.cwd }, status: ok ? 'ok' : 'error', output: { ...o, exitCode: it.exit_code ?? null, durationMs: durMs(it.duration) } })];
      }
      case 'FileChange': {
        const diff = diffFromChanges(it.changes);
        const ok = it.status !== 'failed' && it.status !== 'declined';
        const title = diff.length ? diff.map((d) => d.path).join(', ') : 'apply_patch';
        return [tool(c, ts, id, { name: 'apply_patch', category: 'edit', title, input: { paths: diff.map((d) => d.path) }, status: it.status === 'declined' ? 'denied' : ok ? 'ok' : 'error', output: { ...out(it.stdout ?? it.stderr), diff } })];
      }
      case 'McpToolCall': {
        const bad = it.status === 'failed' || it.result?.isError;
        const running = it.status === 'inProgress' || it.status === 'in_progress';
        return [tool(c, ts, id, { name: `${text(it.server)}.${text(it.tool)}`, category: 'mcp', title: `${text(it.server)}.${text(it.tool)}`, input: it.arguments ?? {}, status: running ? 'running' : bad ? 'error' : 'ok', output: out(mcpText(it.result)) })];
      }
      case 'Extension': {
        if (it.kind === 'web.search') {
          const a = it.action ?? {};
          const title = text(a.query) || text(it.query) || text(a.url) || (a.pattern ? `find ${a.pattern}` : 'web search');
          return [tool(c, ts, id, { name: 'web_search', category: 'web', title, input: a, status: 'ok', output: out(Array.isArray(it.results) ? JSON.stringify(it.results).slice(0, CAP) : '') })];
        }
        return [tool(c, ts, id, { name: text(it.kind) || 'extension', category: 'other', title: text(it.kind) || 'extension', input: it.action ?? {}, status: 'ok' })];
      }
      case 'ImageView':
        return [tool(c, ts, id, { name: 'view_image', category: 'read', title: text(it.path) || 'image', input: { path: it.path }, status: 'ok' })];
      case 'SubAgentActivity':
      case 'CollabAgentToolCall': {
        const failed = it.status === 'failed';
        const running = it.status === 'inProgress' || it.status === 'in_progress';
        return [{ id: `codex:subagent:${id}`, ts, kind: 'subagent', callId: id, name: text(it.tool) || text(it.kind) || text(it.agent_path) || 'agent', prompt: '', status: failed ? 'error' : running ? 'running' : 'ok', ...(it.agent_thread_id ? { childSessionId: it.agent_thread_id } : {}) }];
      }
      case 'ContextCompaction':
        return [note(c, ts, 'info', 'compacted', 'Context compacted')];
      case 'WebSearch': {
        const a = it.action ?? {};
        return [tool(c, ts, id, { name: 'web_search', category: 'web', title: text(it.query) || text(a.query) || text(a.url) || 'web search', input: a, status: 'ok' })];
      }
      case 'Plan':
        return text(it.text).trim() ? [{ id: `codex:plan:${id}`, ts, kind: 'assistant', text: it.text }] : [];
      default:
        return [];
    }
  }

  function legacy(c, ts, p) {
    const k = text(p.call_id);
    switch (p.type) {
      case 'user_message': {
        const t = text(p.message);
        return t.trim() && !injected(t) ? [{ id: `codex:user:${c.ordinal++}`, ts, kind: 'user', text: t }] : [];
      }
      case 'agent_message': return text(p.message).trim() ? [{ id: `codex:assistant:${c.ordinal++}`, ts, kind: 'assistant', text: p.message }] : [];
      case 'agent_reasoning': return text(p.text).trim() ? [{ id: `codex:thinking:${c.ordinal++}`, ts, kind: 'thinking', text: p.text }] : [];
      case 'exec_command_begin': {
        remember(c, k, ts);
        const title = cmdStr(p.command);
        return [tool(c, ts, k, { name: 'exec', category: 'shell', title: title || 'command', input: { command: title, cwd: p.cwd }, status: 'running' })];
      }
      case 'exec_command_end': {
        const title = cmdStr(p.command);
        const code = p.exit_code ?? null;
        return [tool(c, ts, k, { name: 'exec', category: 'shell', title: title || c.calls[k]?.title || 'command', input: { command: title, cwd: p.cwd }, status: code === 0 || p.status === 'completed' ? 'ok' : 'error', output: { ...out(p.aggregated_output ?? p.stdout), exitCode: code, durationMs: durMs(p.duration) } })];
      }
      case 'patch_apply_begin':
      case 'patch_apply_end': {
        remember(c, k, ts);
        const diff = diffFromChanges(p.changes);
        const end = p.type === 'patch_apply_end';
        return [tool(c, ts, k, { name: 'apply_patch', category: 'edit', title: diff.map((d) => d.path).join(', ') || 'apply_patch', input: { paths: diff.map((d) => d.path) }, status: !end ? 'running' : p.success === false || p.status === 'failed' ? 'error' : p.status === 'declined' ? 'denied' : 'ok', output: { ...out(end ? p.stdout || p.stderr : ''), diff } })];
      }
      case 'mcp_tool_call_begin':
      case 'mcp_tool_call_end': {
        remember(c, k, ts);
        const inv = p.invocation ?? {};
        const end = p.type === 'mcp_tool_call_end';
        const res = p.result?.Ok ?? p.result;
        const bad = end && (p.result?.Err !== undefined || res?.isError);
        const name = `${text(inv.server)}.${text(inv.tool)}`;
        return [tool(c, ts, k, { name, category: 'mcp', title: name, input: inv.arguments ?? {}, status: !end ? 'running' : bad ? 'error' : 'ok', output: out(end ? mcpText(res) : '') })];
      }
      case 'web_search_end':
        return [tool(c, ts, k || `ws${c.ordinal++}`, { name: 'web_search', category: 'web', title: text(p.query) || 'web search', input: p.action ?? {}, status: 'ok' })];
      case 'plan_update': return planItem(c, ts, p);
      case 'context_compacted': return [note(c, ts, 'info', 'compacted', 'Context compacted')];
      case 'stream_error': case 'error': return [note(c, ts, 'error', 'error', text(p.message) || 'Error')];
      default: return [];
    }
  }

  function planItem(c, ts, p) {
    const plan = Array.isArray(p.plan) ? p.plan : [];
    const items = plan.filter((s) => text(s.step).trim()).map((s) => ({ text: s.step, status: STEP[s.status] ?? 'pending' }));
    return items.length ? [{ id: `codex:todo:${c.turn}`, ts, kind: 'todo', items }] : [];
  }

  // response_item fallback, only for rollouts with no item_completed events.
  function responseItem(c, ts, p) {
    if (p.type === 'function_call' && p.name === 'update_plan') {
      try { return planItem(c, ts, JSON.parse(p.arguments)); } catch { return []; }
    }
    if (c.itemMode) return [];
    const k = text(p.call_id);
    switch (p.type) {
      case 'message': {
        const t = blocksText(p.content);
        if (!t.trim() || (p.role === 'user' && injected(t))) return [];
        if (p.role === 'user') return [{ id: `codex:user:${c.ordinal++}`, ts, kind: 'user', text: t }];
        if (p.role === 'assistant') return [{ id: `codex:assistant:${c.ordinal++}`, ts, kind: 'assistant', text: t }];
        return [];
      }
      case 'reasoning': {
        const t = (Array.isArray(p.summary) ? p.summary : []).map((s) => text(s?.text)).join('\n');
        return t.trim() ? [{ id: `codex:thinking:${c.ordinal++}`, ts, kind: 'thinking', text: t }] : [];
      }
      case 'function_call': case 'custom_tool_call': {
        const raw = p.type === 'function_call' ? p.arguments : p.input;
        let args = {};
        try { args = p.type === 'function_call' ? JSON.parse(raw) : {}; } catch { /* keep {} */ }
        remember(c, k, ts);
        if (p.name === 'apply_patch') {
          const diff = parsePatch(raw);
          c.calls[k].patch = true;
          return [tool(c, ts, k, { name: 'apply_patch', category: 'edit', title: diff.map((d) => d.path).join(', ') || 'apply_patch', input: { paths: diff.map((d) => d.path) }, status: 'running', output: { diff } })];
        }
        const isShell = p.name === 'exec_command' || p.name === 'shell';
        const title = isShell ? cmdStr(args.cmd ?? args.command) : text(p.name);
        c.calls[k].title = title;
        return [tool(c, ts, k, { name: text(p.name) || 'tool', category: isShell ? 'shell' : 'other', title: title || 'tool', input: args, status: 'running' })];
      }
      case 'function_call_output': case 'custom_tool_call_output': {
        const prev = c.calls[k];
        if (!prev) return [];
        const o = Array.isArray(p.output) ? blocksText(p.output) : text(p.output);
        const m = /exit code[: ]+(-?\d+)/i.exec(o) ?? /Process exited with code (-?\d+)/.exec(o);
        const code = m ? Number(m[1]) : null;
        const base = { name: prev.name, category: prev.category, title: prev.title, input: prev.input };
        return [tool(c, ts, k, { ...base, ...prev.last, status: code ? 'error' : 'ok', output: { ...(prev.last?.output ?? {}), ...out(o), exitCode: code } })];
      }
      case 'web_search_call': {
        const a = p.action ?? {};
        return [tool(c, ts, p.id || `ws${c.ordinal++}`, { name: 'web_search', category: 'web', title: text(a.query) || text(a.url) || 'web search', input: a, status: 'ok' })];
      }
      default: return [];
    }
  }

  function mapLine(obj, state = {}) {
    try {
      const c = S(state);
      const p = obj?.payload ?? {};
      const parsed = Date.parse(obj?.timestamp);
      const ts = Number.isFinite(parsed) ? parsed : (c.lastTs ?? 0);
      c.lastTs = ts;
      let items = [];
      switch (obj?.type) {
        case 'session_meta':
          if (p.cwd) c.cwd = p.cwd;
          if (p.git?.branch) c.branch = p.git.branch;
          if (p.id) c.sessionId = p.id;
          break;
        case 'turn_context':
          if (p.root_turn_id || p.permission_profile) c.itemMode = true;
          if (p.turn_id) c.turn = p.turn_id;
          items = applySettings(c, ts, p);
          break;
        case 'compacted':
          items = [note(c, ts, 'info', 'compacted', 'Context compacted')];
          break;
        case 'response_item': items = responseItem(c, ts, p); break;
        case 'token_usage_record': {
          const t = p.thread_token_usage ?? p.turn_token_usage ?? p.usage;
          const last = p.usage?.total_tokens;
          if (last && c.window) c.ctxPct = Math.min(100, Math.round((last / c.window) * 100));
          if (t) items.push({ id: `codex:usage:${text(p.turn_id) || c.turn}`, ts, kind: 'usage', inputTokens: n0(t.input_tokens), outputTokens: n0(t.output_tokens), cacheReadTokens: n0(t.cached_input_tokens), cacheWriteTokens: n0(t.cache_write_input_tokens), ...(c.model ? { model: c.model } : {}) });
          break;
        }
        case 'event_msg':
          switch (p.type) {
            case 'task_started':
              if (p.root_turn_id) c.itemMode = true;
              if (p.turn_id) c.turn = p.turn_id;
              if (p.model_context_window) c.window = p.model_context_window;
              break;
            case 'item_completed': {
              c.itemMode = true;
              items = p.item ? threadItem(c, ts, p.item) : [];
              if (!items.length) { const k = text(p.item?.type) || 'unknown'; (state.dropped ??= {})[k] = (state.dropped[k] ?? 0) + 1; }
              break;
            }
            case 'thread_settings_applied': items = applySettings(c, ts, p.thread_settings ?? {}); break;
            case 'token_count': {
              const t = p.info?.total_token_usage;
              if (p.info?.model_context_window) c.window = p.info.model_context_window;
              const last = p.info?.last_token_usage?.total_tokens;
              if (last && c.window) c.ctxPct = Math.min(100, Math.round((last / c.window) * 100));
              if (t) items.push({ id: `codex:usage:${c.turn}`, ts, kind: 'usage', inputTokens: n0(t.input_tokens), outputTokens: n0(t.output_tokens), cacheReadTokens: n0(t.cached_input_tokens), cacheWriteTokens: n0(t.cache_write_input_tokens), ...(c.model ? { model: c.model } : {}) });
              if (p.rate_limits?.rate_limit_reached_type) items.push(note(c, ts, 'warn', 'rate_limit', `Rate limit reached: ${p.rate_limits.rate_limit_reached_type}`));
              break;
            }
            case 'turn_aborted': items = [note(c, ts, 'warn', 'interrupted', `Turn ${text(p.reason) || 'interrupted'}`)]; break;
            case 'task_complete':
              if (p.error) items = [note(c, ts, 'error', 'error', typeof p.error === 'string' ? p.error : text(p.error.message) || 'Turn failed')];
              break;
            case 'thread_goal_updated': items = [note(c, ts, 'info', 'other', 'Goal updated')]; break;
            default: items = c.itemMode && /_(begin|end)$|^(user|agent)_/.test(text(p.type)) ? [] : legacy(c, ts, p);
          }
          break;
        default: break;
      }
      // Remember tool fields so a later output line can re-emit the same id with the call's title.
      for (const it of items) if (it.kind === 'tool' && c.calls[it.callId]) Object.assign(c.calls[it.callId], { name: it.name, category: it.category, title: it.title, input: it.input, last: it });
      return items;
    } catch (e) {
      const er = (state.errors ??= { count: 0, lastClass: null });
      er.count++;
      er.lastClass = e?.constructor?.name ?? 'Error';
      return [];
    }
  }

  function meta(state = {}) {
    const c = S(state);
    const m = { agent: 'codex' };
    if (c.model) m.model = c.model;
    if (c.mode) m.mode = c.mode;
    if (c.cwd) m.cwd = c.cwd;
    if (c.effort) m.effort = c.effort;
    if (c.branch) m.branch = c.branch;
    if (c.ctxPct != null) m.contextUsedPct = c.ctxPct;
    if (c.sessionId) m.sessionId = c.sessionId;
    return m;
  }

  return { mapLine, meta, parsePrompt, parseStatus, controls, coverage, itemProblem };
}

export function mapperHealth(state = {}) {
  const errors = state.errors?.count ?? 0;
  return { ok: errors === 0, errors, lastClass: state.errors?.lastClass ?? null, dropped: { ...state.dropped } };
}

// ---- prompts -------------------------------------------------------------------------------
// Titles: tui/src/bottom_pane/approval_overlay.rs lines 258-294 (title strings), option labels 842-1106.
// Row format "› N. label": tui/src/bottom_pane/request_user_input/mod.rs:424,985.
const TITLES = [
  // approval_overlay.rs:265 exec, :258/:260 write_stdin
  [/Would you like to (run the following command|send input to)\??/, 'permission'],
  // approval_overlay.rs:290 apply_patch
  [/Would you like to make the following edits\?/, 'permission'],
  // approval_overlay.rs:286 additional permissions
  [/Would you like to grant these permissions\?/, 'permission'],
  // approval_overlay.rs:294 MCP elicitation
  [/^\s*(.+) needs your approval\.\s*$/m, 'permission'],
  // not verified in 0.159 source (onboarding module not downloaded); wording from memory
  [/Do you trust the contents of this directory\?/, 'trust'],
];
const ROW = /^\s*([›>])?\s*(\d+)\.\s+(.*?)\s*$/;

export function parsePrompt(screen) {
  if (claudeNonPrompt(screen)) return null;
  const lines = text(screen).split('\n');
  let type = null;
  let title = '';
  for (const [re, t] of TITLES) {
    const m = re.exec(screen);
    if (m) { type = t; title = m[0].trim(); break; }
  }
  const options = [];
  let selected = 0;
  for (const l of lines) {
    const m = ROW.exec(l);
    if (!m) continue;
    // display_shortcut is padded after the label by 2+ spaces (approval_overlay.rs:310)
    const [label, key] = m[3].split(/\s{2,}/);
    options.push({ index: Number(m[2]), label: label.trim(), ...(key && key.length <= 12 ? { hotkey: key.trim() } : {}) });
    if (m[1]) selected = options.length - 1;
  }
  if (!options.length) return null;
  if (!type) {
    // request_user_input / pickers: a numbered list under a question, driven as a choice
    if (!/Esc|enter|select|answer/i.test(screen)) return null;
    type = 'choice';
    title = lines.find((l) => l.trim() && !ROW.test(l))?.trim() ?? 'Choose';
  }
  const first = lines.findIndex((l) => l.includes(title));
  const body = lines.slice(first + 1).filter((l) => l.trim() && !ROW.test(l) && !/to confirm|to cancel/.test(l)).join('\n').trim();
  return { promptId: `codex:${type}:${title}`.slice(0, 120), type, title, ...(body ? { body } : {}), options, selected };
}

// ---- status --------------------------------------------------------------------------------
// tui/src/status_indicator_widget.rs:255-269 + motion.rs: "[• |◦ |◌ ]<header> (<elapsed> • <key> to interrupt)[ · message]",
// elapsed from fmt_elapsed_compact (:79): "59s", "1m 05s", "1h 02m 03s". Header defaults to "Working". Without the hint the row is "(<elapsed>)",
// which is only trusted when it starts with the activity glyph.
const WORKING = /^\s*([•◦◌])?\s*([A-Z][\w' -]{0,40}?)\s+\((\d+h \d+m \d+s|\d+m \d+s|\d+s)(?: • (.+?) to interrupt)?\)(?: · .*)?\s*$/;
export function parseStatus(screen) {
  const lines = text(screen).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').split('\n').filter((l) => l.trim()).slice(-12);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = WORKING.exec(lines[i]);
    if (!m || (!m[4] && !m[1])) continue;
    return { verb: m[2], elapsedSec: parseDuration(m[3]), ...(m[4] && { hint: `${m[4]} to interrupt` }) };
  }
  return null;
}

// ---- controls ------------------------------------------------------------------------------
// Default keys: tui/src/keymap.rs:1664 (interrupt Esc), :1935-1939 (approval y/a/p/d, Esc|n decline),
// :2468 (shift+tab cycles collaboration mode), :1681 (Tab queues). Slash names: tui/src/slash_command.rs.
export const controls = {
  interrupt: () => '\x1b',
  // Assumed (not read in the list view source): a digit selects the numbered row. Hotkeys y/a/p/d also work for approvals.
  answerPrompt: (index) => String(index),
  setMode: (mode) => (mode === 'plan' || mode === 'default' ? '\x1b[Z' : '/permissions\r'),
  setModel: (name) => (name ? `/model ${name}\r` : '/model\r'),
  slash: (cmd, args = '') => `/${String(cmd).replace(/^\//, '')}${args ? ` ${args}` : ''}\r`,
  compact: () => '/compact\r',
  clear: () => '/clear\r',
};

// ---- selectable permission options (approval prompts, /permissions presets) -----------------
// Pure helpers over a parsePrompt() result. Not in `controls`: that key set is pinned to model CONTROLS.
// Hotkeys y/a/p/d and Esc: tui/src/keymap.rs:1935-1939. Digits select the numbered row (assumed, see answerPrompt).
const ASK_AGAIN = /don't ask again|for this session|for the rest of/i;
const DECISION = {
  allow: (o) => /^Yes/i.test(o.label) && !ASK_AGAIN.test(o.label),
  always: (o) => /^Yes/i.test(o.label) && ASK_AGAIN.test(o.label),
  deny: (o) => /^(No|Cancel)\b/i.test(o.label),
};
export const approvals = {
  options: (prompt) => (prompt?.options ?? []).map((o, i) => ({ ...o, selected: i === prompt.selected })),
  current: (prompt) => prompt?.options?.[prompt.selected]?.label ?? null,
  // select by label (e.g. a sandbox preset) -> digit to type
  select(prompt, re) {
    const o = prompt?.options?.find((x) => re.test(x.label));
    if (!o) throw new RangeError(`no option matching ${re}`);
    return String(o.index);
  },
  // allow | always | deny -> hotkey when the row shows one, Esc for "(esc)", else the digit
  decide(prompt, kind) {
    if (prompt?.type !== 'permission') throw new RangeError('not a permission prompt');
    if (!DECISION[kind]) throw new RangeError(`unknown decision ${kind}`);
    const o = prompt.options.find(DECISION[kind]);
    if (!o) throw new RangeError(`no ${kind} option`);
    const hk = o.hotkey?.replace(/^\(|\)$/g, '').toLowerCase();
    if (hk === 'esc') return '\x1b';
    return hk && /^[a-z]$/.test(hk) ? hk : String(o.index);
  },
};

// ---- coverage ------------------------------------------------------------------------------
const C = (element, shown, driven, how) => ({ element, shown, driven, how });
export const coverage = [
  C('user message', 'chat', 'yes', 'item_completed UserMessage -> user item; typed text + Enter'),
  C('image attachment', 'chat', 'no', 'non-text UserMessage blocks -> attachments; attach by launch -i or ctrl+v paste, no control'),
  C('assistant message', 'chat', 'n/a', 'item_completed AgentMessage -> assistant item'),
  C('reasoning summary', 'chat', 'n/a', 'item_completed Reasoning -> thinking item'),
  C('shell command', 'chat', 'n/a', 'CommandExecution -> tool shell, exit code -> ok/error'),
  C('apply_patch edit', 'chat', 'n/a', 'FileChange -> tool edit with output.diff per file'),
  C('plan update', 'chat', 'n/a', 'update_plan function_call / plan_update -> todo'),
  C('MCP tool call', 'chat', 'n/a', 'McpToolCall -> tool mcp'),
  C('web search', 'chat', 'n/a', 'Extension web.search -> tool web'),
  C('image view / image gen / sleep', 'chat', 'n/a', 'ImageView -> tool read; Extension others -> tool other'),
  C('sub-agent activity', 'chat', 'n/a', 'SubAgentActivity / CollabAgentToolCall -> subagent'),
  C('token usage', 'chat', 'n/a', 'token_count -> usage; context % in meta'),
  C('context compaction', 'chat', 'yes', 'ContextCompaction / compacted -> notice; /compact via controls.compact'),
  C('turn interrupted', 'chat', 'yes', 'turn_aborted -> notice; Esc via controls.interrupt'),
  C('turn error', 'chat', 'n/a', 'task_complete.error -> notice error'),
  C('rate limit', 'chat', 'n/a', 'token_count.rate_limits.rate_limit_reached_type -> notice'),
  C('model change', 'chat', 'yes', 'turn_context/thread_settings_applied diff -> notice; /model <name>'),
  C('mode change (approval, sandbox, plan)', 'chat', 'yes', 'settings diff -> notice; shift+tab cycles plan/default, /permissions opens presets'),
  C('exec approval dialog', 'chat', 'yes', 'parsePrompt permission; answerPrompt digit or y/a/p/d/Esc'),
  C('patch approval dialog', 'chat', 'yes', 'parsePrompt permission; same keys'),
  C('permissions approval dialog', 'chat', 'yes', 'parsePrompt permission; approvals.decide allow/always/deny, approvals.select(label); r = strict auto review'),
  C('MCP elicitation dialog', 'chat', 'yes', 'parsePrompt permission; Esc cancels'),
  C('request_user_input question', 'chat', 'yes', 'parsePrompt choice; digit selects'),
  C('trust-directory dialog', 'chat', 'no', 'parsePrompt trust text unverified in source; answer in terminal'),
  C('/model picker popup', 'terminal-only', 'yes', 'controls.setModel(name) skips the popup'),
  C('/permissions presets popup', 'terminal-only', 'yes', 'controls.setMode then answerPrompt'),
  C('/resume, /fork pickers', 'terminal-only', 'no', 'full-screen session lists; use sessions API'),
  C('/theme, /keymap, /vim, /tui, /statusline, /title, /pets', 'terminal-only', 'no', 'local TUI appearance settings, no chat content'),
  C('/diff, /copy, /export, /raw, /mention', 'terminal-only', 'no', 'pager or clipboard overlays'),
  C('working line', 'chat', 'n/a', 'parseStatus reads "Working (12s • esc to interrupt)" from the screen'),
  C('/status, /usage, /ps, /debug-config', 'terminal-only', 'no', 'status panels rendered only in the terminal'),
  C('/mcp, /apps, /plugins, /skills, /hooks, /ide', 'terminal-only', 'no', 'management panels'),
  C('/logout, /feedback, /setup-default-sandbox, /experimental', 'terminal-only', 'no', 'account and setup flows'),
  C('transcript overlay (ctrl+t), message queue (Tab)', 'terminal-only', 'no', 'viewer and composer-local state'),
  C('onboarding and login screens', 'terminal-only', 'no', 'run before a session exists'),
];
