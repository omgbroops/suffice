import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { createCodexEngine, findCodex, codexStatus, INSTALL_HINT, CODEX_MODELS, CODEX_EFFORTS } from '../electron/host/codex-engine.mjs'
import { PRELUDE, runFake, after, BAD_ENV } from './cli-fake-helper.mjs'

// Fake `codex`: JSONL shapes from https://learn.chatgpt.com/docs/non-interactive-mode (thread.started, item.*, turn.completed).
const FAKE = PRELUDE + `
if (argv[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0) } // real output, checked locally
process.stdin.on('data', c => (stdin += c))
process.stdin.on('end', () => { log(); go() })
function go() {
  out({ type: 'thread.started', thread_id: 'thr-9' })
  out({ type: 'turn.started' })
  if (scenario === 'text') out({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'Hello' } })
  if (scenario === 'tool') {
    out({ type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'ls', status: 'in_progress' } })
    out({ type: 'item.completed', item: { id: 'item_1', type: 'command_execution', command: 'ls', aggregated_output: 'a.txt', exit_code: 1, status: 'failed' } })
    out({ type: 'item.completed', item: { id: 'item_2', type: 'file_change', changes: [{ path: '/p/x', kind: 'add' }], status: 'completed' } })
  }
  if (scenario === 'hang') return setInterval(() => {}, 1000)
  if (scenario === 'error') { out({ type: 'error', message: 'boom' }); out({ type: 'turn.failed', error: { message: 'boom' } }); process.exit(1) }
  out({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 3, output_tokens: 20, reasoning_output_tokens: 5 } })
}
`
const go = (...a) => runFake(FAKE, 'codex', createCodexEngine, 'codexPath', ...a)

test('codex: text, totals and session id', async () => {
  const t = await go('text')
  try {
    const totals = await t.engine.run(t.args)
    assert.deepEqual(t.events, [{ type: 'text', delta: 'Hello' }])
    assert.equal(totals.inputTokens, 10); assert.equal(totals.outputTokens, 20); assert.equal(totals.cacheReadTokens, 3)
    assert.equal(totals.sessionId, 'thr-9')
    const [{ argv, stdin }] = await t.calls()
    assert.equal(stdin, 'hi') // prompt on stdin via `-`
    assert.deepEqual([argv[0], argv.at(-1), after(argv, '-m'), after(argv, '-s')], ['exec', '-', 'm', 'read-only'])
    assert.ok(argv.includes('--json'))
  } finally { await t.cleanup() }
})

test('codex: command and file change become tool + tool_result', async () => {
  const t = await go('tool')
  try {
    await t.engine.run(t.args)
    assert.deepEqual(t.events, [
      { type: 'tool', id: 'item_1', name: 'bash', input: { command: 'ls' } },
      { type: 'tool_result', id: 'item_1', isError: true, output: 'a.txt' },
      { type: 'tool', id: 'item_2', name: 'edit', input: { path: '/p/x', changes: [{ path: '/p/x', kind: 'add' }] } },
      { type: 'tool_result', id: 'item_2', isError: false, output: 'add /p/x' },
    ])
  } finally { await t.cleanup() }
})

test('codex: approval maps to a sandbox, never to full access', async () => {
  const seen = {}
  for (const a of ['ask', 'every', 'never']) {
    const t = await go('text', { approval: a })
    try { await t.engine.run(t.args); seen[a] = after((await t.calls())[0].argv, '-s') } finally { await t.cleanup() }
  }
  assert.deepEqual(seen, { ask: 'read-only', every: 'read-only', never: 'workspace-write' })
})

test('codex: error exit rejects with the message; guide is unsupported', async () => {
  const t = await go('error')
  try {
    await assert.rejects(t.engine.run(t.args), /boom/)
    assert.equal(t.engine.guide('t', 'x'), false)
  } finally { await t.cleanup() }
})

test('codex: abort rejects as cancelled', async () => {
  const t = await go('hang')
  try {
    const p = t.engine.run(t.args)
    p.catch(() => {})
    await new Promise(r => setTimeout(r, 400))
    assert.equal(t.engine.abort('t'), true)
    await assert.rejects(p, /cancelled/)
    assert.equal(t.engine.abort('t'), false)
  } finally { await t.cleanup() }
})

test('codex: resume reuses the thread id via `exec resume`', async () => {
  const t = await go('text', { resume: true, sessionId: 'thr-9', approval: 'never' })
  try {
    await t.engine.run(t.args)
    const [{ argv }] = await t.calls()
    assert.deepEqual(argv.slice(0, 2), ['exec', 'resume'])
    assert.deepEqual(argv.slice(-2), ['thr-9', '-'])
    assert.ok(argv.includes('sandbox_mode="workspace-write"'))
  } finally { await t.cleanup() }
})

test('codex: API keys and tokens never reach the child', async () => {
  const t = await go('text', {}, BAD_ENV)
  try {
    await t.engine.run(t.args)
    assert.deepEqual((await t.calls())[0].env, [])
  } finally { await t.cleanup() }
})

test('codex: missing CLI rejects with the install hint; status and exports', async () => {
  const engine = createCodexEngine({ push: () => {} })
  await assert.rejects(engine.run({ threadId: 't', codexPath: '/nonexistent/codex', project: tmpdir(), prompt: 'x', approval: 'ask' }), e => e.message === INSTALL_HINT)
  assert.equal(findCodex('/nonexistent/codex'), null)
  assert.deepEqual(await codexStatus(null), { loggedIn: false, missing: true })
  const t = await go('text')
  try { assert.equal((await codexStatus(t.bin)).loggedIn, true) } finally { await t.cleanup() }
  assert.ok(CODEX_MODELS.length && CODEX_EFFORTS.includes('high'))
})

test('codex: runs on the ChatGPT sign-in without the user\'s MCP servers; app instructions go in as a TOML string', async () => {
  const instructions = 'Line one.\nSay "hi" \\ bye.'
  const t = await go('text', { instructions })
  try {
    await t.engine.run(t.args)
    const [{ argv }] = await t.calls()
    const cs = argv.filter((a, i) => argv[i - 1] === '-c')
    assert.ok(cs.includes('model_provider="openai"'))
    assert.ok(cs.includes('mcp_servers={}'))
    const di = cs.find(c => c.startsWith('developer_instructions='))
    // a JSON string literal is a valid TOML basic string: it must parse back to the exact text
    assert.equal(JSON.parse(di.slice('developer_instructions='.length)), instructions)
  } finally { await t.cleanup() }
})

test('codex: the model list comes from the CLI\'s own catalog (visibility "list"), with a fallback', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { codexModels } = await import('../electron/host/codex-engine.mjs')
  const dir = await mkdtemp(join(tmpdir(), 'codex-home-'))
  try {
    await writeFile(join(dir, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'a-1', display_name: 'A 1', visibility: 'list' }, { slug: 'hidden', visibility: 'hide' }] }))
    assert.deepEqual(codexModels({ CODEX_HOME: dir }), [{ id: 'a-1', name: 'A 1' }])
    assert.deepEqual(codexModels({ CODEX_HOME: join(dir, 'none') }), CODEX_MODELS)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('host: picking a Codex model runs the thread through Codex and keeps its session for the next turn', async () => {
  const { mkdtemp, rm, readdir, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { createHost } = await import('../electron/host/host.mjs')
  const t = await go('text')
  const home = await mkdtemp(join(tmpdir(), 'suffice-codex-host-'))
  const savedHome = process.env.CODEX_HOME
  process.env.CODEX_HOME = join(home, 'no-codex-home') // fallback model list, never the real ~/.codex
  try {
    const events = []
    let done
    const finished = new Promise(r => (done = r))
    const host = await createHost({
      home, claudePath: '/nonexistent/claude', codexPath: t.bin, openExternal: () => {}, chooseDirectory: async () => home,
      emit: (c, p) => { events.push([c, p]); if (c === 'threads:changed') done() },
    })
    const codex = host.models().filter(m => m.engine === 'codex')
    assert.deepEqual(codex.map(m => m.id), CODEX_MODELS.map(m => m.id))
    assert.deepEqual(codex[0].efforts, CODEX_EFFORTS)
    await host.run({ threadId: 'c1', project: home, prompt: 'hi', model: CODEX_MODELS[0].id, effort: 'low', mode: 'balanced' })
    await finished
    const types = events.filter(([c]) => c === 'thread:event').map(([, p]) => p.event.type)
    assert.deepEqual(types, ['user', 'agent_start', 'text', 'end'])
    assert.equal(events.find(([c, p]) => c === 'thread:event' && p.event.type === 'end')[1].event.ok, true)
    const dir = join(home, 'sessions'), [sub] = await readdir(dir), [file] = (await readdir(join(dir, sub))).filter(f => f.endsWith('.claude.json'))
    const meta = JSON.parse(await readFile(join(dir, sub, file), 'utf8'))
    assert.equal(meta.engine, 'codex'); assert.equal(meta.codexSession, 'thr-9')
    const [{ argv }] = (await t.calls()).filter(c => c.argv[0] === 'exec')
    assert.ok(argv.includes('model_provider="openai"') && argv.some(a => a.startsWith('developer_instructions=')))
    await host.dispose()
  } finally {
    savedHome === undefined ? delete process.env.CODEX_HOME : (process.env.CODEX_HOME = savedHome)
    await t.cleanup(); await rm(home, { recursive: true, force: true })
  }
})

test('host: a failed Codex turn still keeps its session, so the next message resumes it', async () => {
  const { mkdtemp, rm, readdir, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { createHost } = await import('../electron/host/host.mjs')
  const t = await go('error')
  const home = await mkdtemp(join(tmpdir(), 'suffice-codex-fail-'))
  const savedHome = process.env.CODEX_HOME
  process.env.CODEX_HOME = join(home, 'no-codex-home')
  try {
    const events = []
    let done
    const finished = new Promise(r => (done = r))
    const host = await createHost({
      home, claudePath: '/nonexistent/claude', codexPath: t.bin, openExternal: () => {}, chooseDirectory: async () => home,
      emit: (c, p) => { events.push([c, p]); if (c === 'threads:changed') done() },
    })
    await host.run({ threadId: 'c2', project: home, prompt: 'hi', model: CODEX_MODELS[0].id, effort: 'low', mode: 'balanced' })
    await finished
    const end = events.find(([c, p]) => c === 'thread:event' && p.event.type === 'end')[1].event
    assert.deepEqual([end.ok, end.error], [false, 'boom'])
    const dir = join(home, 'sessions'), [sub] = await readdir(dir), [file] = (await readdir(join(dir, sub))).filter(f => f.endsWith('.claude.json'))
    assert.equal(JSON.parse(await readFile(join(dir, sub, file), 'utf8')).codexSession, 'thr-9')
    await host.dispose()
  } finally {
    savedHome === undefined ? delete process.env.CODEX_HOME : (process.env.CODEX_HOME = savedHome)
    await t.cleanup(); await rm(home, { recursive: true, force: true })
  }
})
