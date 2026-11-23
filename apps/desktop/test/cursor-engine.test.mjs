import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { createCursorEngine, findCursor, cursorStatus, INSTALL_HINT, CURSOR_MODELS, CURSOR_EFFORTS } from '../electron/host/cursor-engine.mjs'
import { PRELUDE, runFake, after, BAD_ENV } from './cli-fake-helper.mjs'

// Fake `cursor-agent`: NDJSON shapes from https://cursor.com/docs/cli/reference/output-format (system/init, assistant with
// timestamp_ms deltas vs model_call_id flush, tool_call started/completed keyed readToolCall, result/success).
const FAKE = PRELUDE + `
if (argv[0] === 'status') { console.log('Logged in as a@b.c'); process.exit(0) }
log()
const S = 'cs-7'
out({ type: 'system', subtype: 'init', session_id: S, model: 'm', permissionMode: 'default', cwd: '/p' })
out({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: argv.at(-1) }] }, session_id: S })
const delta = t => out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: t }] }, session_id: S, timestamp_ms: 1 })
if (scenario === 'text') { delta('Hel'); delta('lo'); out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] }, session_id: S }) }
if (scenario === 'tool') {
  out({ type: 'tool_call', subtype: 'started', call_id: 'c1', tool_call: { readToolCall: { args: { path: 'README.md' } } }, session_id: S })
  out({ type: 'tool_call', subtype: 'completed', call_id: 'c1', tool_call: { readToolCall: { args: { path: 'README.md' }, result: { success: { content: 'body', totalLines: 1 } } } }, session_id: S })
}
if (scenario === 'hang') setInterval(() => {}, 1000)
else if (scenario === 'error') { out({ type: 'result', subtype: 'error', is_error: true, result: 'boom', session_id: S }); process.exit(1) }
else out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 42, result: 'Hello', session_id: S })
`
const go = (...a) => runFake(FAKE, 'cursor-agent', createCursorEngine, 'cursorPath', ...a)

test('cursor: partial deltas stream, buffered duplicate skipped, totals and session id', async () => {
  const t = await go('text')
  try {
    const totals = await t.engine.run(t.args)
    assert.deepEqual(t.events, [{ type: 'text', delta: 'Hel' }, { type: 'text', delta: 'lo' }])
    assert.equal(totals.durationMs, 42); assert.equal(totals.sessionId, 'cs-7')
    const [{ argv }] = await t.calls()
    assert.equal(after(argv, '--model'), 'm'); assert.equal(argv.at(-1), 'hi')
    assert.ok(argv.includes('--stream-partial-output'))
  } finally { await t.cleanup() }
})

test('cursor: tool_call started/completed map to tool + tool_result', async () => {
  const t = await go('tool')
  try {
    await t.engine.run(t.args)
    assert.deepEqual(t.events, [
      { type: 'tool', id: 'c1', name: 'read', input: { path: 'README.md' } },
      { type: 'tool_result', id: 'c1', isError: false, output: '{"content":"body","totalLines":1}' },
    ])
  } finally { await t.cleanup() }
})

test('cursor: ask/every are read-only (mode ask, no --force); never is --force', async () => {
  const seen = {}
  for (const a of ['ask', 'every', 'never']) {
    const t = await go('text', { approval: a })
    try { await t.engine.run(t.args); const { argv } = (await t.calls())[0]; seen[a] = [argv.includes('--force'), argv.includes('--mode') ? after(argv, '--mode') : undefined] } finally { await t.cleanup() }
  }
  assert.deepEqual(seen, { ask: [false, 'ask'], every: [false, 'ask'], never: [true, undefined] })
})

test('cursor: error result rejects; guide is unsupported', async () => {
  const t = await go('error')
  try {
    await assert.rejects(t.engine.run(t.args), /boom/)
    assert.equal(t.engine.guide('t', 'x'), false)
  } finally { await t.cleanup() }
})

test('cursor: abort rejects as cancelled', async () => {
  const t = await go('hang')
  try {
    const p = t.engine.run(t.args)
    p.catch(() => {})
    await new Promise(r => setTimeout(r, 400))
    assert.equal(t.engine.abort('t'), true)
    await assert.rejects(p, /cancelled/)
  } finally { await t.cleanup() }
})

test('cursor: resume passes --resume with the chat id; a fresh run does not', async () => {
  const t = await go('text')
  try {
    await t.engine.run(t.args)
    await t.engine.run({ ...t.args, resume: true, sessionId: 'cs-7' })
    const [first, second] = (await t.calls()).map(c => c.argv)
    assert.ok(!first.includes('--resume'))
    assert.equal(after(second, '--resume'), 'cs-7')
  } finally { await t.cleanup() }
})

test('cursor: API keys never reach the child', async () => {
  const t = await go('text', {}, BAD_ENV)
  try {
    await t.engine.run(t.args)
    assert.deepEqual((await t.calls())[0].env, [])
  } finally { await t.cleanup() }
})

test('cursor: missing CLI rejects with the install hint; status and exports', async () => {
  const engine = createCursorEngine({ push: () => {} })
  await assert.rejects(engine.run({ threadId: 't', cursorPath: '/nonexistent/cursor-agent', project: tmpdir(), prompt: 'x', approval: 'ask' }), e => e.message === INSTALL_HINT)
  assert.equal(findCursor('/nonexistent/x'), null)
  const t = await go('text')
  try { assert.equal((await cursorStatus(t.bin)).loggedIn, true) } finally { await t.cleanup() }
  assert.ok(CURSOR_MODELS.length && CURSOR_EFFORTS.length === 0)
})
