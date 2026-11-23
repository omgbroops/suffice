// Runs the agent through the user's own Codex CLI (their ChatGPT sign-in): `codex exec --json`.
// Sources:
//  - `codex exec --help` / `codex exec resume --help` (codex-cli 0.159.0, run locally): flags --json, -m, -s/--sandbox
//    {read-only,workspace-write,danger-full-access}, -c key=value, --skip-git-repo-check, `resume [SESSION_ID] [PROMPT]`
//    where PROMPT `-` reads stdin. `resume` has no -s or -C, so sandbox goes through `-c sandbox_mode=` there and cwd is the spawn cwd.
//  - https://learn.chatgpt.com/docs/non-interactive-mode (was developers.openai.com/codex/noninteractive): JSONL events
//    thread.started{thread_id}, turn.started, item.started/item.completed{item:{id,type,...}} with types agent_message{text},
//    command_execution{command,status}, file_change, reasoning, mcp_tool_call, web_search; turn.completed{usage:{input_tokens,
//    cached_input_tokens,output_tokens,reasoning_output_tokens}}, turn.failed, error. Read-only sandbox is the default.
//  - ASSUMED (not in the docs fetched): command_execution has aggregated_output + exit_code, file_change has changes:[{path,kind}],
//    error is {type:'error',message} and turn.failed is {type:'turn.failed',error:{message}}.
// Approval: exec never prompts. 'ask'/'every' -> read-only sandbox (edits and commands that write are refused by the sandbox,
// the host cannot be asked); 'never' -> workspace-write (the documented replacement for the removed --full-auto), not full access.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { cliStatus, createCliEngine, findOnPath } from './cli-engine.mjs'

export const INSTALL_HINT = 'Codex is not installed. Install it, then run `codex login` once in a terminal.'
export const LOGIN_HINT = 'Run `codex login` once in a terminal to sign in with ChatGPT, then come back.'
export const SANDBOX = { ask: 'read-only', every: 'read-only', never: 'workspace-write' }
// Fallback only: the list shown is the CLI's own catalog (codexModels below). These are the "list" models in
// ~/.codex/models_cache.json on codex-cli 0.159.0 (read 2026-11-23).
export const CODEX_MODELS = [
  { id: 'gpt-6-luna', name: 'GPT-6-Luna' },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6-Terra' },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6-Luna' },
]
/** The models the Codex CLI itself lists for a ChatGPT sign-in (its models_cache.json), or the fallback above. */
export function codexModels(env = process.env) {
  try {
    const raw = JSON.parse(readFileSync(join(env.CODEX_HOME || join(homedir(), '.codex'), 'models_cache.json'), 'utf8'))
    const list = (Array.isArray(raw) ? raw : raw?.models ?? [])
      .filter(m => m && typeof m.slug === 'string' && m.visibility === 'list')
      .map(m => ({ id: m.slug, name: String(m.display_name || m.slug) }))
    return list.length ? list : CODEX_MODELS
  } catch { return CODEX_MODELS }
}
export const CODEX_EFFORTS = ['low', 'medium', 'high', 'xhigh'] // -c model_reasoning_effort

export const findCodex = (override, env) => findOnPath('codex', override, env)

/** `codex login status` prints "Logged in using ChatGPT" and exits 0 (checked locally). */
export const codexStatus = (path, env) =>
  cliStatus(path, ['login', 'status'], (out, code) => ({ loggedIn: code === 0 && /logged in/i.test(out), detail: out.trim().split('\n')[0] }), env)

function build({ prompt, model, effort, approval, sessionId, resume, instructions }) {
  const sandbox = SANDBOX[approval] ?? 'read-only'
  // Suffice runs on the ChatGPT sign-in whatever provider the user's config.toml names (a custom provider would bill
  // its own API), without the user's MCP servers; the app's instructions ride as developer instructions (TOML string).
  const common = ['--json', '--skip-git-repo-check', ...(model ? ['-m', model] : []),
    ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []), '-c', 'approval_policy="never"',
    '-c', 'model_provider="openai"', '-c', 'mcp_servers={}',
    ...(instructions ? ['-c', `developer_instructions=${JSON.stringify(instructions)}`] : [])]
  const args = resume && sessionId
    ? ['exec', 'resume', ...common, '-c', `sandbox_mode="${sandbox}"`, sessionId, '-']
    : ['exec', ...common, '-s', sandbox, '-']
  return { args, stdin: prompt }
}

function parser() {
  let sessionId, error
  const usage = { modelCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
  let completed = false
  const t0 = Date.now()
  return {
    line(m, h) {
      if (m.type === 'thread.started') sessionId = m.thread_id
      else if (m.type === 'error') error = m.message
      else if (m.type === 'turn.failed') error = m.error?.message ?? 'Codex turn failed.'
      else if (m.type === 'turn.completed') {
        completed = true
        const u = m.usage ?? {}
        usage.modelCalls++
        usage.inputTokens += u.input_tokens ?? 0
        usage.outputTokens += u.output_tokens ?? 0
        usage.cacheReadTokens += u.cached_input_tokens ?? 0
      } else if (m.type?.startsWith('item.')) {
        const it = m.item ?? {}
        const done = m.type === 'item.completed'
        if (it.type === 'agent_message' && done && it.text) h.push({ type: 'text', delta: it.text }) // whole message, no deltas in exec
        else if (it.type === 'reasoning' && done && it.text) h.push({ type: 'thinking', delta: it.text })
        else if (it.type === 'command_execution') {
          if (!done) h.push({ type: 'tool', id: it.id, name: 'bash', input: { command: it.command } })
          else h.push({ type: 'tool_result', id: it.id, isError: it.status === 'failed' || (it.exit_code ?? 0) !== 0, output: it.aggregated_output ?? '' })
        } else if (it.type === 'file_change' && done) {
          const path = it.changes?.[0]?.path
          h.push({ type: 'tool', id: it.id, name: 'edit', input: { path, changes: it.changes } })
          h.push({ type: 'tool_result', id: it.id, isError: it.status === 'failed', output: (it.changes ?? []).map(c => `${c.kind} ${c.path}`).join('\n') })
        }
      }
    },
    outcome: () => ({ error, sessionId, totals: completed ? { ...usage, durationMs: Date.now() - t0 } : undefined }),
  }
}

export const createCodexEngine = ({ push, spawn }) =>
  createCliEngine({ push, spawn, label: 'Codex', installHint: INSTALL_HINT, pathKey: 'codexPath', build, parser })
