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
