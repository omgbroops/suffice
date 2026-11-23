// Runs the agent through the user's own OpenCode CLI: `opencode run --format json`.
// Sources: opencode.ai/docs/cli and /docs/permissions were fetched, but they document NEITHER the run flags NOR the JSON event
// format (only `opencode run "<prompt>"` for non-interactive use, and that permission effect `ask` makes non-interactive
// clients decide). Everything below is therefore ASSUMED from OpenCode's run command as the author knows it, unverified here
// (opencode is not installed): flags --format json, --model provider/model, --session <id>, --variant <effort>, --dir;
// events {type:'step_start'|'text'|'reasoning'|'tool_use'|'step_finish'|'error', sessionID, part:{...}} where text.part.text is
// a whole message, tool_use.part = {callID, tool, state:{status:'completed'|'error', input, output|error}}, step_finish.part =
// {cost, tokens:{input,output,reasoning,cache:{read,write}}}, error.error = {name, data:{message}}.
// Approval: permissions come from OPENCODE_PERMISSION (assumed env, JSON of edit/bash/webfetch -> allow|deny|ask). Headless
// cannot answer `ask`, so 'ask'/'every' -> edit, bash and webfetch DENY (read-only); 'never' -> allow all.

import { cliStatus, createCliEngine, findOnPath } from './cli-engine.mjs'

export const INSTALL_HINT = 'OpenCode is not installed. Install it (opencode.ai), then run `opencode auth login` once in a terminal.'
export const LOGIN_HINT = 'Run `opencode auth login` once in a terminal to connect a provider, then come back.'
export const PERMISSIONS = {
  ask: { edit: 'deny', bash: 'deny', webfetch: 'deny' },
  every: { edit: 'deny', bash: 'deny', webfetch: 'deny' },
  never: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
}
// ASSUMED: ids are provider/model as the CLI's --model takes them.
export const OPENCODE_MODELS = [
  { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
  { id: 'openai/gpt-5', name: 'GPT-5' },
]
export const OPENCODE_EFFORTS = ['low', 'medium', 'high'] // --variant

export const findOpencode = (override, env) => findOnPath('opencode', override, env)

/** ASSUMED: `opencode auth list` exits 0 and lists a credential per line when a provider is connected. */
export const opencodeStatus = (path, env) =>
  cliStatus(path, ['auth', 'list'], (out, code) => ({ loggedIn: code === 0 && /\S/.test(out) && !/0 credentials/i.test(out), detail: out.trim().split('\n')[0] }), env)

function build({ prompt, project, model, effort, approval, sessionId, resume }) {
  const args = ['run', '--format', 'json', '--dir', project, ...(model ? ['--model', model] : []),
    ...(effort ? ['--variant', effort] : []), ...(resume && sessionId ? ['--session', sessionId] : []), prompt]
  return { args, env: { OPENCODE_PERMISSION: JSON.stringify(PERMISSIONS[approval] ?? PERMISSIONS.ask) } }
}

function parser() {
  let sessionId, error, steps = 0
  const u = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 }
  const t0 = Date.now()
  return {
    line(m, h) {
      if (m.sessionID) sessionId ??= m.sessionID
      const p = m.part ?? {}
      if (m.type === 'text' && p.text) h.push({ type: 'text', delta: p.text })
      else if (m.type === 'reasoning' && p.text) h.push({ type: 'thinking', delta: p.text })
      else if (m.type === 'tool_use') {
        const s = p.state ?? {}
        const input = s.input ?? {}
        h.push({ type: 'tool', id: p.callID, name: String(p.tool).toLowerCase(), input: input.filePath && !input.path ? { ...input, path: input.filePath } : input })
        if (s.status === 'completed' || s.status === 'error') h.push({ type: 'tool_result', id: p.callID, isError: s.status === 'error', output: String(s.output ?? s.error ?? '') })
      } else if (m.type === 'step_finish') {
        steps++
        u.inputTokens += p.tokens?.input ?? 0
        u.outputTokens += p.tokens?.output ?? 0
        u.cacheReadTokens += p.tokens?.cache?.read ?? 0
        u.cacheWriteTokens += p.tokens?.cache?.write ?? 0
        u.costUsd += p.cost ?? 0
      } else if (m.type === 'error') error = m.error?.data?.message ?? m.error?.name ?? 'OpenCode failed.'
    },
    outcome: () => ({ error, sessionId, totals: steps ? { modelCalls: steps, ...u, durationMs: Date.now() - t0 } : undefined }),
  }
}

export const createOpencodeEngine = ({ push, spawn }) =>
  createCliEngine({ push, spawn, label: 'OpenCode', installHint: INSTALL_HINT, pathKey: 'opencodePath', build, parser })
