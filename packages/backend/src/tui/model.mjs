// Shared model for showing ANY agent TUI (Claude Code, Codex, opencode, ...) as desktop UI.
// Every per-agent mapper in this folder emits exactly these shapes, and the app draws only these,
// so a new CLI needs a mapper and nothing else. The live terminal view always shows 100% of a TUI;
// this model is how much of it the chat view can show and drive without the terminal.
//
// Item: one thing in the conversation, in order. All items carry { id, ts } (id stable across re-reads).
//   { kind: 'user',      text, attachments?: [{ type: 'image'|'file', name, path? }] }
//   { kind: 'assistant', text }
//   { kind: 'thinking',  text }
//   { kind: 'tool', callId, name, category, title, input, status, output? }
//       category: 'shell'|'edit'|'write'|'read'|'search'|'web'|'todo'|'subagent'|'mcp'|'other'
//       status:   'running'|'ok'|'error'|'denied'
//       input:    the tool's own arguments (plain JSON)
//       output:   { text?, exitCode?, truncated?, diff?: [{ path, oldText?, newText?, patch? }] }
//   { kind: 'todo',     items: [{ text, status: 'pending'|'active'|'done' }] }
//   { kind: 'subagent', callId, name, prompt, status: 'running'|'ok'|'error', childSessionId? }
//   { kind: 'notice',   level: 'info'|'warn'|'error', code, text }
//       code: 'compacted'|'interrupted'|'model_changed'|'mode_changed'|'rate_limit'|'error'|'other'
//   { kind: 'usage',    inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?, costUsd?, model? }
//
// Prompt: the TUI is blocked waiting for the user (never auto-answered).
//   { promptId, type: 'permission'|'trust'|'choice'|'text', title, body?, options: [{ index, label, hotkey? }], selected }
//
// Meta: what a TUI shows in its status area.
//   { agent, model?, mode?, cwd?, branch?, contextUsedPct?, sessionId? }
//
// Status: the live "working" line a TUI draws only on its screen (spinner row), or null when idle. Mappers expose parseStatus(screen).
//   { verb, elapsedSec, tokens?, tokenDirection?: 'down'|'up', thoughtSec?, hint? }
//
// Control: what the desktop UI can ask a session to do. A mapper declares which it supports.
//   'interrupt' | 'answerPrompt' {index} | 'setMode' {mode} | 'setModel' {model} | 'slash' {command}
//   | 'compact' | 'clear' | 'attach' {path}
export const ITEM_KINDS = ['user', 'assistant', 'thinking', 'tool', 'todo', 'subagent', 'notice', 'usage'];
export const TOOL_CATEGORIES = ['shell', 'edit', 'write', 'read', 'search', 'web', 'todo', 'subagent', 'mcp', 'other'];
export const TOOL_STATUS = ['running', 'ok', 'error', 'denied'];
export const NOTICE_CODES = ['compacted', 'interrupted', 'model_changed', 'mode_changed', 'rate_limit', 'error', 'other'];
export const PROMPT_TYPES = ['permission', 'trust', 'choice', 'text'];
export const CONTROLS = ['interrupt', 'answerPrompt', 'setMode', 'setModel', 'slash', 'compact', 'clear', 'attach'];

const str = (v) => typeof v === 'string';
const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Returns null when the item is valid, else a plain-words reason. Mappers' tests run every emitted item through this. */
export function itemProblem(it) {
  if (!it || typeof it !== 'object') return 'not an object';
  if (!str(it.id) || !it.id) return 'id missing';
  if (!num(it.ts)) return 'ts missing';
  if (!ITEM_KINDS.includes(it.kind)) return `unknown kind ${it.kind}`;
  switch (it.kind) {
    case 'user': case 'assistant': case 'thinking': return str(it.text) ? null : 'text missing';
    case 'tool':
      if (!str(it.callId) || !str(it.name) || !str(it.title)) return 'tool callId/name/title missing';
      if (!TOOL_CATEGORIES.includes(it.category)) return `bad category ${it.category}`;
      if (!TOOL_STATUS.includes(it.status)) return `bad status ${it.status}`;
      if (it.output?.diff && !it.output.diff.every((d) => str(d.path))) return 'diff entry without path';
      return null;
    case 'todo': return Array.isArray(it.items) && it.items.every((t) => str(t.text) && ['pending', 'active', 'done'].includes(t.status)) ? null : 'bad todo items';
    case 'subagent': return str(it.callId) && str(it.name) && ['running', 'ok', 'error'].includes(it.status) ? null : 'bad subagent';
    case 'notice': return ['info', 'warn', 'error'].includes(it.level) && NOTICE_CODES.includes(it.code) && str(it.text) ? null : 'bad notice';
    case 'usage': return num(it.inputTokens) && num(it.outputTokens) ? null : 'bad usage';
  }
  return null;
}

/** Seconds from "6s", "1m 6s", "1h 2m 03s"; null when the text is not a duration. */
export function parseDuration(t) {
  const m = /^(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?$/.exec(String(t).trim());
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

export function statusProblem(s) {
  if (!s || typeof s !== 'object') return 'not an object';
  if (!str(s.verb) || !s.verb) return 'verb missing';
  if (!num(s.elapsedSec) || s.elapsedSec < 0) return 'elapsedSec missing';
  if (s.tokens !== undefined && (!num(s.tokens) || s.tokens < 0)) return 'bad tokens';
  if (s.tokenDirection !== undefined && !['down', 'up'].includes(s.tokenDirection)) return 'bad tokenDirection';
  if (s.thoughtSec !== undefined && !num(s.thoughtSec)) return 'bad thoughtSec';
  if (s.hint !== undefined && !str(s.hint)) return 'bad hint';
  return null;
}

export function promptProblem(p) {
  if (!p || typeof p !== 'object') return 'not an object';
  if (!str(p.promptId) || !PROMPT_TYPES.includes(p.type) || !str(p.title)) return 'promptId/type/title missing';
  if (!Array.isArray(p.options) || !p.options.every((o) => Number.isInteger(o.index) && str(o.label))) return 'bad options';
  if (p.options.length && !Number.isInteger(p.selected)) return 'selected missing';
  return null;
}
