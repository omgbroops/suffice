// Runs the agent through the user's own Claude Code CLI (their Claude subscription).
// One child process per run: `claude -p --input-format stream-json --output-format stream-json`.
// Wire format follows the Agent SDK's types (sdk.d.ts): SDKUserMessage in; SDKMessage
// (system init, SDKPartialAssistantMessage `stream_event`, assistant / user messages with
// tool_use / tool_result blocks, SDKResultSuccess / SDKResultError) out; SDKControlRequest
// `can_use_tool` (SDKControlPermissionRequest) answered with an SDKControlResponse carrying a
// PermissionResult, and `interrupt` (SDKControlInterruptRequest) sent to stop a turn.
// Credentials are never read here: the CLI finds its own login. Only `claude auth status` is called.

import { spawn as nodeSpawn, execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const INSTALL_HINT = 'Claude Code is not installed. Install it, then run `claude` once in a terminal to sign in.'
export const LOGIN_HINT = 'Run `claude` once in a terminal to sign in with your Claude account, then come back.'
const GRACE_MS = 3000

/** app approval setting -> claude --permission-mode ('ask' and 'every' both prompt the host via can_use_tool) */
export const PERMISSION_MODE = { ask: 'manual', every: 'manual', never: 'bypassPermissions' }

// Prices are USD per million tokens. OWNER TO VERIFY every number and id below.
export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', name: 'Opus 5.5', cost: { input: 5, output: 25 } },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', cost: { input: 3, output: 15 } },
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5', cost: { input: 1, output: 5 } },
  { id: 'claude-fable-5-2', name: 'Fable 5.2', cost: { input: 15, output: 75 } },
]
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

/** The user's env minus anything that would make the CLI bill an API key instead of the subscription. */
export function childEnv(base = process.env) {
  const env = { ...base }
  for (const k of Object.keys(env)) {
    if (/API_KEY/i.test(k) || /^(ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_USE_(BEDROCK|VERTEX|FOUNDRY))$/.test(k)) delete env[k]
  }
  return env
}

export function findClaude(override, env = process.env) {
  const dirs = [...(env.PATH ?? '').split(delimiter), join(homedir(), '.local', 'bin')].filter(Boolean)
  const candidates = override ? [override] : dirs.map(d => join(d, 'claude'))
  for (const c of candidates) {
    try {
      accessSync(c, constants.X_OK)
      return c
    } catch {}
  }
  return null
}

/** `claude auth status` -> what the UI may show. Never touches the credentials themselves. */
export function authStatus(path, env = childEnv()) {
  return new Promise(resolve => {
    if (!path) return resolve({ loggedIn: false, missing: true })
    execFile(path, ['auth', 'status'], { env, timeout: 15_000 }, (err, out) => {
      try {
        const s = JSON.parse(out)
        resolve({ loggedIn: !!s.loggedIn, subscriptionType: s.subscriptionType, email: s.email, authMethod: s.authMethod })
      } catch {
        resolve({ loggedIn: false })
      }
    })
  })
}

const blockText = c => (typeof c === 'string' ? c : Array.isArray(c) ? c.map(b => (b?.type === 'text' ? b.text : '')).join('') : '')

/**
 * @param {{ push: (threadId: string, event: any) => void, spawn?: typeof nodeSpawn }} deps
 * `push` gets the UI thread events (text, thinking, tool, tool_result).
 */
export function createClaudeEngine({ push, spawn = nodeSpawn }) {
  /** threadId -> running child */
  const runs = new Map()

  /**
   * Runs one prompt to its result. Resolves with totals; rejects with the error text
   * ('cancelled' when stopped). `sessionId` is reused with --resume once the thread has one.
   */
  function run({ threadId, claudePath, project, prompt, model, effort, approval, sessionId, resume, onApproval }) {
    return new Promise((resolve, reject) => {
      const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
        '--model', model, '--permission-mode', PERMISSION_MODE[approval] ?? 'manual', '--permission-prompts', 'host',
        ...(approval === 'never' ? ['--allow-dangerously-skip-permissions'] : []),
        ...(effort ? ['--effort', effort] : []),
        ...(resume ? ['--resume', sessionId] : ['--session-id', sessionId])]
      const child = spawn(claudePath, args, { cwd: project, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
      const state = { child, aborted: false, result: null, killTimer: null }
      runs.set(threadId, state)
      let buffer = ''
      let stderr = ''
      let settled = false
      const send = obj => { if (child.stdin.writable) child.stdin.write(JSON.stringify(obj) + '\n') }
      state.send = send
      state.interrupt = () => {
        state.aborted = true
        send({ type: 'control_request', request_id: randomUUID(), request: { subtype: 'interrupt' } })
        state.killTimer ??= setTimeout(() => child.kill('SIGTERM'), GRACE_MS)
      }
      const finish = (fn, v) => {
        if (settled) return
        settled = true
        clearTimeout(state.killTimer)
        if (runs.get(threadId) === state) runs.delete(threadId)
        fn(v)
      }

      const handle = async m => {
        if (m.type === 'stream_event' && !m.parent_tool_use_id) {
          const d = m.event?.type === 'content_block_delta' ? m.event.delta : null
          if (d?.type === 'text_delta' && d.text) push(threadId, { type: 'text', delta: d.text })
          else if (d?.type === 'thinking_delta' && d.thinking) push(threadId, { type: 'thinking', delta: d.thinking })
        } else if (m.type === 'assistant') {
          for (const b of m.message?.content ?? []) {
            if (b.type !== 'tool_use') continue
            // the UI's tool vocabulary is lower-case with `path`
            const input = b.input ?? {}
            push(threadId, { type: 'tool', id: b.id, parent: m.parent_tool_use_id ?? undefined, name: b.name.toLowerCase(), input: input.file_path && !input.path ? { ...input, path: input.file_path } : input })
          }
        } else if (m.type === 'user') {
          for (const b of Array.isArray(m.message?.content) ? m.message.content : []) {
            if (b.type === 'tool_result') push(threadId, { type: 'tool_result', id: b.tool_use_id, isError: !!b.is_error, output: blockText(b.content) })
          }
        } else if (m.type === 'control_request' && m.request?.subtype === 'can_use_tool') {
          const { tool_name, input } = m.request
          const allow = await onApproval(tool_name.toLowerCase(), input ?? {}).catch(() => false)
          send({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: allow ? { behavior: 'allow', updatedInput: input ?? {} } : { behavior: 'deny', message: 'The user denied this action.' } } })
        } else if (m.type === 'result') {
          state.result = m
          child.stdin.end() // one prompt per process: closing stdin lets the CLI exit
          state.killTimer ??= setTimeout(() => child.kill('SIGTERM'), GRACE_MS)
        }
      }

      child.stdout.on('data', chunk => {
        buffer += chunk
        let i
        while ((i = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, i).trim()
          buffer = buffer.slice(i + 1)
          if (!line) continue
          try {
            void handle(JSON.parse(line))
          } catch {} // a non-JSON line is not ours to act on
        }
      })
      child.stderr.on('data', c => (stderr = (stderr + c).slice(-2000)))
      child.stdin.on('error', () => {})
      child.on('error', e => finish(reject, new Error(e.code === 'ENOENT' ? INSTALL_HINT : e.message)))
      child.on('close', code => {
        const r = state.result
        if (state.aborted) return finish(reject, new Error('Task stopped: cancelled'))
        if (!r) return finish(reject, new Error(stderr.trim().split('\n').pop() || `Claude Code exited with code ${code}.`))
        if (r.is_error || r.subtype !== 'success') return finish(reject, new Error(blockText(r.result) || r.errors?.join('; ') || `Claude Code stopped: ${r.subtype}.`))
        const u = r.usage ?? {}
        finish(resolve, { modelCalls: r.num_turns, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens, cacheWriteTokens: u.cache_creation_input_tokens, costUsd: r.total_cost_usd, durationMs: r.duration_ms })
      })

      send({ type: 'user', message: { role: 'user', content: prompt }, parent_tool_use_id: null })
    })
  }

  return {
    run,
    /** mid-run message: another SDKUserMessage on stdin, delivered before the next step */
    guide(threadId, text) {
      const r = runs.get(threadId)
      if (!r) return false
      r.send({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, priority: 'next' })
      return true
    },
    abort(threadId) {
      const r = runs.get(threadId)
      if (!r) return false
      r.interrupt()
      return true
    },
    dispose() {
      for (const r of runs.values()) { r.aborted = true; r.child.kill('SIGTERM') }
    },
  }
}
