import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, chmod, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClaudeEngine, childEnv, findClaude, INSTALL_HINT, LOGIN_HINT } from '../electron/host/claude-engine.mjs'
import { createHost } from '../electron/host/host.mjs'

// A fake `claude`: speaks the stream-json wire format, scripted by FAKE_SCENARIO, logs argv/env to FAKE_LOG.
const FAKE = `#!/usr/bin/env node
const fs = require('fs')
const argv = process.argv.slice(2)
const log = o => process.env.FAKE_LOG && fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(o) + '\\n')
if (argv[0] === 'auth') {
  console.log(JSON.stringify({ loggedIn: process.env.FAKE_LOGGED_OUT !== '1', authMethod: 'claude.ai', subscriptionType: 'max', email: 'a@b.c' }))
  process.exit(0)
}
log({ argv, env: Object.keys(process.env).filter(k => /API_KEY|AUTH_TOKEN/.test(k)) })
const out = o => process.stdout.write(JSON.stringify(o) + '\\n')
const delta = t => out({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } } })
const result = (extra = {}) => out({ type: 'result', subtype: 'success', is_error: false, result: 'ok', num_turns: 2, duration_ms: 5, total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 }, ...extra })
const scenario = process.env.FAKE_SCENARIO
let users = 0
let buf = ''
process.stdin.on('data', c => {
  buf += c
  let i
  while ((i = buf.indexOf('\\n')) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1)
    if (m.type === 'user') { users++; onUser(m) }
    else if (m.type === 'control_response') onResponse(m.response)
    else if (m.type === 'control_request' && m.request.subtype === 'interrupt') process.exit(0)
  }
})
function onUser(m) {
  if (scenario === 'text') { delta('Hel'); delta('lo'); result() }
  else if (scenario === 'tool') {
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/p/README.md' } }] } })
    out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: 'file body' }] }] } })
    result()
  }
  else if (scenario === 'perm') out({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: '/p/x' } } })
  else if (scenario === 'hang') delta('working')
  else if (scenario === 'guide') { if (users === 1) delta('ready'); else { delta('got:' + m.message.content + ':' + m.priority); result() } }
  else if (scenario === 'error') result({ subtype: 'error_during_execution', is_error: true, result: 'boom' })
  else if (scenario === 'env') result()
}
function onResponse(r) {
  const p = r.response
  delta(p.behavior + (p.message ? ':' + p.message : ''))
  result()
}
`

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-claude-'))
  const bin = join(dir, 'claude')
  await writeFile(bin, FAKE)
  await chmod(bin, 0o755)
  return { dir, bin, log: join(dir, 'log.jsonl') }
}
const argvLog = async f => (await readFile(f, 'utf8')).trim().split('\n').map(l => JSON.parse(l))

async function runFake(scenario, extra = {}, env = {}) {
  const s = await setup()
  const saved = { FAKE_SCENARIO: process.env.FAKE_SCENARIO, FAKE_LOG: process.env.FAKE_LOG }
  process.env.FAKE_SCENARIO = scenario
  process.env.FAKE_LOG = s.log
  Object.assign(process.env, env)
  const events = []
  const engine = createClaudeEngine({ push: (_t, e) => events.push(e) })
  const args = { threadId: 't', claudePath: s.bin, project: s.dir, prompt: 'hi', model: 'claude-haiku-5-5', effort: 'low', approval: 'ask', sessionId: 'sid-1', resume: false, onApproval: async () => true, ...extra }
  const cleanup = async () => {
    for (const k of Object.keys(env)) delete process.env[k]
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v)
    await engine.dispose()
    await rm(s.dir, { recursive: true, force: true })
  }
  return { s, events, engine, args, cleanup }
}

test('claude engine: text deltas stream and totals map from the result', async () => {
  const t = await runFake('text')
  try {
    const totals = await t.engine.run(t.args)
    assert.deepEqual(t.events, [{ type: 'text', delta: 'Hel' }, { type: 'text', delta: 'lo' }])
    assert.deepEqual(totals, { modelCalls: 2, inputTokens: 10, outputTokens: 20, cacheReadTokens: 3, cacheWriteTokens: 4, costUsd: 0.01, durationMs: 5 })
    const [{ argv }] = await argvLog(t.s.log)
    assert.deepEqual(argv.slice(argv.indexOf('--model'), argv.indexOf('--model') + 2), ['--model', 'claude-haiku-5-5'])
    assert.deepEqual(argv.slice(argv.indexOf('--effort'), argv.indexOf('--effort') + 2), ['--effort', 'low'])
    assert.deepEqual(argv.slice(argv.indexOf('--permission-mode'), argv.indexOf('--permission-mode') + 2), ['--permission-mode', 'manual'])
    assert.ok(!argv.includes('--bare'))
    assert.deepEqual(argv.slice(argv.indexOf('--permission-prompt-tool'), argv.indexOf('--permission-prompt-tool') + 2), ['--permission-prompt-tool', 'stdio']) // without it the CLI denies writes itself
  } finally { await t.cleanup() }
})

test('claude engine: tool call and result map to UI events with lower-case name and path', async () => {
  const t = await runFake('tool')
  try {
    await t.engine.run(t.args)
    assert.deepEqual(t.events, [
      { type: 'tool', id: 'tu1', parent: undefined, name: 'read', input: { file_path: '/p/README.md', path: '/p/README.md' } },
      { type: 'tool_result', id: 'tu1', isError: false, output: 'file body' },
    ])
  } finally { await t.cleanup() }
})

test('claude engine: can_use_tool allow and deny reach the CLI as PermissionResult', async () => {
  for (const [allow, expected] of [[true, 'allow'], [false, 'deny:The user denied this action.']]) {
    const asked = []
    const t = await runFake('perm', { onApproval: async (name, input) => (asked.push([name, input]), allow) })
    try {
      await t.engine.run(t.args)
      assert.deepEqual(asked, [['write', { file_path: '/p/x' }]])
      assert.deepEqual(t.events, [{ type: 'text', delta: expected }])
    } finally { await t.cleanup() }
  }
})

test('claude engine: abort sends interrupt and rejects as cancelled; guide reaches a running turn', async () => {
  const t = await runFake('hang')
  try {
    const p = t.engine.run(t.args)
    p.catch(() => {})
    await new Promise(r => setTimeout(r, 400))
    assert.equal(t.engine.abort('t'), true)
    await assert.rejects(p, /cancelled/)
    assert.equal(t.engine.abort('t'), false)
  } finally { await t.cleanup() }
  const g = await runFake('guide')
  try {
    const p = g.engine.run(g.args)
    await new Promise(r => setTimeout(r, 400))
    assert.equal(g.engine.guide('t', 'turn left'), true)
    await p
    assert.deepEqual(g.events.map(e => e.delta), ['ready', 'got:turn left:next'])
    assert.equal(g.engine.guide('t', 'late'), false)
  } finally { await g.cleanup() }
})

test('claude engine: first run sets --session-id, a resumed run reuses it with --resume', async () => {
  const t = await runFake('text')
  try {
    await t.engine.run(t.args)
    await t.engine.run({ ...t.args, resume: true })
    const [first, second] = (await argvLog(t.s.log)).map(l => l.argv)
    assert.deepEqual(first.slice(-2), ['--session-id', 'sid-1'])
    assert.deepEqual(second.slice(-2), ['--resume', 'sid-1'])
    assert.ok(!second.includes('--session-id'))
  } finally { await t.cleanup() }
})

test('claude engine: an error result rejects with the CLI message', async () => {
  const t = await runFake('error')
  try {
    await assert.rejects(t.engine.run(t.args), /boom/)
  } finally { await t.cleanup() }
})

test('claude engine: a missing CLI rejects with the install hint', async () => {
  const engine = createClaudeEngine({ push: () => {} })
  await assert.rejects(engine.run({ threadId: 't', claudePath: '/nonexistent/claude', project: tmpdir(), prompt: 'x', model: 'm', approval: 'ask', sessionId: 's', onApproval: async () => true }), e => e.message === INSTALL_HINT)
  assert.equal(findClaude('/nonexistent/claude'), null)
})

test('claude engine: API keys and auth tokens never reach the child', async () => {
  const bad = { ANTHROPIC_API_KEY: 'k', ANTHROPIC_AUTH_TOKEN: 't', OPENAI_API_KEY: 'o', SOME_API_KEY: 's' }
  const t = await runFake('env', {}, { ...bad, KEEP_ME: '1' })
  try {
    await t.engine.run(t.args)
    const [{ env }] = await argvLog(t.s.log)
    assert.deepEqual(env, [])
  } finally { await t.cleanup() }
  const e = childEnv({ ...bad, KEEP_ME: '1', PATH: '/x' })
  // every key in `bad` is gone; USER is added on purpose (the CLI needs it to find its login)
  assert.deepEqual(Object.keys(e).sort(), ['KEEP_ME', 'PATH', 'USER'])
})

test('host on the claude engine: models, modes, mode refusal, login hint and a full run', async () => {
  const t = await runFake('perm')
  const home = await mkdtemp(join(tmpdir(), 'suffice-desktop-'))
  try {
    const events = []
    let done
    const finished = new Promise(r => (done = r))
    const host = await createHost({
      home, claudePath: t.s.bin, openExternal: () => {}, chooseDirectory: async () => home,
      emit: (c, p) => {
        events.push([c, p])
        if (c === 'thread:event' && p.event.type === 'approval') host.answerApproval(p.event.id, false)
        if (c === 'threads:changed') done()
      },
    })
    const m = host.models()
    assert.deepEqual(m.map(x => x.id), ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'])
    assert.deepEqual(m[0].efforts, ['low', 'medium', 'high', 'xhigh', 'max'])
    assert.ok(m.every(x => x.cost.input > 0 && x.modes.length === 1 && x.modes[0] === 'balanced'))
    const info = await host.init()
    assert.equal(info.signedIn, true)
    assert.equal(info.engine, 'claude')
    assert.deepEqual(info.modes, ['balanced'])
    assert.equal(info.claude.subscriptionType, 'max')
    assert.match((await host.login()).error, new RegExp(LOGIN_HINT.slice(0, 20)))
    await assert.rejects(host.run({ threadId: 'x', project: home, prompt: 'p', model: 'claude-haiku-5-5', effort: 'low', mode: 'fast' }), /OpenAI engine/)
    await host.run({ threadId: 't1', project: home, prompt: 'write it', model: 'claude-haiku-5-5', effort: 'low', mode: 'balanced' })
    await finished
    const types = events.filter(([c]) => c === 'thread:event').map(([, p]) => p.event.type)
    assert.deepEqual(types, ['user', 'agent_start', 'approval', 'approval_resolved', 'text', 'end'])
    assert.equal(events.find(([c, p]) => c === 'thread:event' && p.event.type === 'text')[1].event.delta, 'deny:The user denied this action.')
    const files = await readdir(join(home, 'desktop', 'transcripts')).catch(() => [])
    assert.ok(Array.isArray(files))
    await host.dispose()
  } finally {
    await t.cleanup()
    await rm(home, { recursive: true, force: true })
  }
})

test('the child env always carries USER, which the CLI needs to find its login', async () => {
  const { childEnv } = await import('../electron/host/claude-engine.mjs')
  const { userInfo } = await import('node:os')
  assert.equal(childEnv({ PATH: '/bin', HOME: '/h' }).USER, userInfo().username)
  assert.equal(childEnv({ USER: 'someone' }).USER, 'someone')
})

test('claude engine: appendPrompt reaches --append-system-prompt, and is absent when not given', async () => {
  const t = await runFake('text')
  try {
    await t.engine.run({ ...t.args, appendPrompt: 'be brief' })
    await t.engine.run(t.args)
    const [first, second] = (await argvLog(t.s.log)).map(l => l.argv)
    assert.deepEqual(first.slice(first.indexOf('--append-system-prompt'), first.indexOf('--append-system-prompt') + 2), ['--append-system-prompt', 'be brief'])
    assert.ok(!second.includes('--append-system-prompt'))
    // with user instructions too, still exactly one flag carrying both
    await t.engine.run({ ...t.args, appendPrompt: 'be brief', instructions: { callMe: 'Abhay' } })
    const third = (await argvLog(t.s.log))[2].argv
    assert.equal(third.filter(x => x === '--append-system-prompt').length, 1)
    assert.equal(third[third.indexOf('--append-system-prompt') + 1], 'Call the user Abhay.\n\nbe brief')
  } finally { await t.cleanup() }
})

const flag = (argv, f) => { const i = argv.indexOf(f); return i < 0 ? null : argv.slice(i + 1) }

test('settings args: isolation, instructions, folders, capabilities, mcp configs reach argv exactly', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'suffice-fa-'))
  try {
    const run = async extra => {
      const t = await runFake('text', extra)
      try { await t.engine.run(t.args); return (await argvLog(t.s.log))[0].argv } finally { await t.cleanup() }
    }
    const base = await run({})
    assert.equal(flag(base, '--setting-sources')[0], 'project,local') // default: isolated
    assert.ok(base.includes('--strict-mcp-config'))
    for (const f of ['--append-system-prompt', '--add-dir', '--disallowedTools', '--mcp-config']) assert.ok(!base.includes(f), f)
    const open = await run({ useClaudeConfig: true })
    assert.ok(!open.includes('--setting-sources') && !open.includes('--strict-mcp-config'))
    const full = await run({
      instructions: { callMe: 'Abhay', responseStyle: 'concise', customInstructions: 'Be blunt.' },
      folderAccess: [folder, '/nonexistent-xyz', '.', join(folder, 'nope')],
      capabilities: { web: false, mcp: false }, mcpConfigs: ['/a.json', '/b.json'], useClaudeConfig: true,
    })
    assert.equal(flag(full, '--append-system-prompt')[0], 'Call the user Abhay.\nKeep replies short and to the point.\nBe blunt.')
    assert.deepEqual(full.filter((a, i) => full[i - 1] === '--add-dir'), [folder])
    assert.deepEqual(flag(full, '--disallowedTools').slice(0, 2), ['WebFetch', 'WebSearch'])
    assert.ok(full.includes('--strict-mcp-config'))
    assert.deepEqual(full.filter((a, i) => full[i - 1] === '--mcp-config'), ['/a.json', '/b.json'])
    assert.ok(!(await run({ instructions: { responseStyle: 'normal', callMe: '  ' } })).includes('--append-system-prompt'))
  } finally { await rm(folder, { recursive: true, force: true }) }
})

test('model costs carry cache read 0.1x and 5-minute write 1.25x of input; settings keys validate', async () => {
  const { withCacheCost } = await import('../electron/host/claude-engine.mjs')
  const { cleanSettingsPatch } = await import('../electron/host/validate.mjs')
  assert.deepEqual(withCacheCost({ input: 4, output: 20 }), { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 })
  const ok = { useClaudeConfig: true, callMe: 'A', customInstructions: 'x', responseStyle: 'concise', verbosity: 'verbose', folderAccess: ['/a'], capabilities: { web: false } }
  assert.deepEqual(cleanSettingsPatch(ok), ok)
  assert.deepEqual(cleanSettingsPatch({ useClaudeConfig: 'y', responseStyle: 'loud', folderAccess: [1], capabilities: { evil: true } }), {})
})

test('claude engine: each mcp config becomes a --mcp-config flag', async () => {
  const t = await runFake('text', { mcpConfigs: ['/a/mcp.json', '/b/mcp.json'] })
  try {
    await t.engine.run(t.args)
    const [{ argv }] = await argvLog(t.s.log)
    assert.deepEqual(argv.filter((a, i) => argv[i - 1] === '--mcp-config'), ['/a/mcp.json', '/b/mcp.json'])
  } finally { await t.cleanup() }
})

test('claude engine: forkOf resumes the old session as a fork under the new id', async () => {
  const t = await runFake('text', { resume: true, forkOf: 'old-id' })
  try {
    await t.engine.run(t.args)
    const [{ argv }] = await argvLog(t.s.log)
    const i = argv.indexOf('--resume')
    assert.deepEqual(argv.slice(i, i + 2), ['--resume', 'old-id'])
    assert.ok(argv.includes('--fork-session'))
    assert.deepEqual(argv.slice(argv.indexOf('--session-id'), argv.indexOf('--session-id') + 2), ['--session-id', 'sid-1'])
  } finally { await t.cleanup() }
})
