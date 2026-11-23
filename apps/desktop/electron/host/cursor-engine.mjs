// Runs the agent through the user's own Cursor CLI (their Cursor sign-in): `cursor-agent -p --output-format stream-json`.
// Sources (cursor-agent is not installed here, so nothing is confirmed from --help):
//  - https://cursor.com/docs/cli/reference/output-format : NDJSON events system/init{session_id,model,permissionMode},
//    user, assistant{message.content[{type:'text',text}]}, tool_call started|completed{call_id, tool_call:{readToolCall:{args,
//    result:{success|error}}}}, result{subtype:'success',is_error,duration_ms,result}. --stream-partial-output adds token deltas:
//    those carry timestamp_ms and no model_call_id; buffered flushes (with model_call_id, or at turn end) repeat text and are skipped.
//  - https://cursor.com/docs/cli/reference/parameters : --resume [chatId], --model, --mode plan|ask, --force/--yolo,
//    --sandbox enabled|disabled, --workspace, `status` (alias whoami).
//  - https://cursor.com/docs/cli/headless : print mode "can't stop to ask"; without --force workspace edits and allowlisted
//    commands RUN, so the default is not read-only.
// Approval: 'ask'/'every' -> `--mode ask` (read-only exploration) + `--sandbox enabled`, never --force; 'never' -> `--force`.
// ASSUMED: model ids below, the `-p <prompt>` positional form, and that the result event carries no token usage (totals = duration only).

import { cliStatus, createCliEngine, findOnPath } from './cli-engine.mjs'

export const INSTALL_HINT = 'Cursor CLI is not installed. Install it (cursor.com/cli), then run `cursor-agent login` once in a terminal.'
export const LOGIN_HINT = 'Run `cursor-agent login` once in a terminal to sign in, then come back.'
export const CURSOR_MODELS = [
  { id: 'auto', name: 'Auto' },
  { id: 'sonnet-4.5', name: 'Claude Sonnet 4.5' },
  { id: 'gpt-5', name: 'GPT-5' },
]
export const CURSOR_EFFORTS = [] // the CLI has no effort flag

export const findCursor = (override, env) => findOnPath('cursor-agent', override, env)

export const cursorStatus = (path, env) =>
  cliStatus(path, ['status'], (out, code) => ({ loggedIn: code === 0 && !/not (logged|signed)|log in|login required/i.test(out), detail: out.trim().split('\n')[0] }), env)

function build({ prompt, project, model, approval, sessionId, resume }) {
  const readOnly = approval !== 'never'
  const args = ['-p', '--output-format', 'stream-json', '--stream-partial-output', '--workspace', project,
    ...(model ? ['--model', model] : []),
    ...(readOnly ? ['--mode', 'ask', '--sandbox', 'enabled'] : ['--force']),
    ...(resume && sessionId ? ['--resume', sessionId] : []), prompt]
  return { args }
}

const toolName = k => k.replace(/ToolCall$/, '').toLowerCase()

function parser() {
  let sessionId, result
  const t0 = Date.now()
  const names = new Map()
  return {
    line(m, h) {
      if (m.session_id) sessionId ??= m.session_id
      if (m.type === 'assistant') {
        if (m.timestamp_ms !== undefined && !m.model_call_id) for (const b of m.message?.content ?? []) if (b.type === 'text' && b.text) h.push({ type: 'text', delta: b.text })
      } else if (m.type === 'tool_call') {
        const [key, body = {}] = Object.entries(m.tool_call ?? {})[0] ?? []
        if (!key) return
        if (m.subtype === 'started') h.push({ type: 'tool', id: m.call_id, name: toolName(key), input: body.args ?? {} })
        else if (m.subtype === 'completed') {
          const r = body.result ?? {}
          h.push({ type: 'tool_result', id: m.call_id, isError: !!r.error, output: JSON.stringify(r.success ?? r.error ?? r) })
        }
      } else if (m.type === 'result') result = m
    },
    outcome() {
      if (!result) return { sessionId }
      if (result.is_error || result.subtype !== 'success') return { sessionId, error: result.result || `Cursor stopped: ${result.subtype}.` }
      return { sessionId, totals: { modelCalls: 1, durationMs: result.duration_ms ?? Date.now() - t0 } }
    },
  }
}

export const createCursorEngine = ({ push, spawn }) =>
  createCliEngine({ push, spawn, label: 'Cursor', installHint: INSTALL_HINT, pathKey: 'cursorPath', build, parser })
