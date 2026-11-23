import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { createOpencodeEngine, findOpencode, opencodeStatus, INSTALL_HINT, OPENCODE_MODELS, OPENCODE_EFFORTS } from '../electron/host/opencode-engine.mjs'
import { PRELUDE, runFake, after, BAD_ENV } from './cli-fake-helper.mjs'

// Fake `opencode`: event shapes are ASSUMED (the docs fetched do not document `run --format json`); see opencode-engine.mjs.
const FAKE = PRELUDE + `
if (argv[0] === 'auth') { console.log('anthropic oauth'); process.exit(0) }
log()
const base = { sessionID: 'ses_1' }
out({ ...base, type: 'step_start', part: { type: 'step-start' } })
if (scenario === 'text') out({ ...base, type: 'text', part: { type: 'text', text: 'Hello' } })
if (scenario === 'tool') out({ ...base, type: 'tool_use', part: { type: 'tool', callID: 'k1', tool: 'read', state: { status: 'completed', input: { filePath: '/p/a' }, output: 'body' } } })
if (scenario === 'hang') setInterval(() => {}, 1000)
else if (scenario === 'error') { out({ ...base, type: 'error', error: { name: 'APIError', data: { message: 'boom' } } }); process.exit(1) }
else out({ ...base, type: 'step_finish', part: { type: 'step-finish', cost: 0.5, tokens: { input: 10, output: 20, reasoning: 0, cache: { read: 3, write: 4 } } } })
`
const go = (...a) => runFake(FAKE, 'opencode', createOpencodeEngine, 'opencodePath', ...a)

test('opencode: text, totals from step_finish and session id', async () => {
  const t = await go('text')
  try {
    const totals = await t.engine.run(t.args)
    assert.deepEqual(t.events, [{ type: 'text', delta: 'Hello' }])
    assert.deepEqual([totals.modelCalls, totals.inputTokens, totals.outputTokens, totals.cacheReadTokens, totals.cacheWriteTokens, totals.costUsd, totals.sessionId], [1, 10, 20, 3, 4, 0.5, 'ses_1'])
    const [{ argv }] = await t.calls()
    assert.deepEqual([argv[0], after(argv, '--format'), after(argv, '--model'), after(argv, '--variant'), argv.at(-1)], ['run', 'json', 'm', 'low', 'hi'])
  } finally { await t.cleanup() }
})

test('opencode: tool_use maps to tool + tool_result with path', async () => {
  const t = await go('tool')
  try {
    await t.engine.run(t.args)
    assert.deepEqual(t.events, [
      { type: 'tool', id: 'k1', name: 'read', input: { filePath: '/p/a', path: '/p/a' } },
      { type: 'tool_result', id: 'k1', isError: false, output: 'body' },
    ])
  } finally { await t.cleanup() }
})

test('opencode: ask/every deny edit and bash via OPENCODE_PERMISSION; never allows', async () => {
  const seen = {}
  for (const a of ['ask', 'every', 'never']) {
    const t = await go('text', { approval: a })
    try { await t.engine.run(t.args); seen[a] = JSON.parse((await t.calls())[0].perm).edit } finally { await t.cleanup() }
  }
  assert.deepEqual(seen, { ask: 'deny', every: 'deny', never: 'allow' })
})

test('opencode: error rejects; guide is unsupported', async () => {
  const t = await go('error')
  try {
    await assert.rejects(t.engine.run(t.args), /boom/)
    assert.equal(t.engine.guide('t', 'x'), false)
  } finally { await t.cleanup() }
})

test('opencode: abort rejects as cancelled', async () => {
  const t = await go('hang')
  try {
    const p = t.engine.run(t.args)
    p.catch(() => {})
    await new Promise(r => setTimeout(r, 400))
    assert.equal(t.engine.abort('t'), true)
    await assert.rejects(p, /cancelled/)
  } finally { await t.cleanup() }
})

test('opencode: resume passes --session with the id', async () => {
  const t = await go('text')
  try {
    await t.engine.run(t.args)
    await t.engine.run({ ...t.args, resume: true, sessionId: 'ses_1' })
    const [first, second] = (await t.calls()).map(c => c.argv)
    assert.ok(!first.includes('--session'))
    assert.equal(after(second, '--session'), 'ses_1')
  } finally { await t.cleanup() }
})

test('opencode: API keys never reach the child', async () => {
  const t = await go('text', {}, BAD_ENV)
  try {
    await t.engine.run(t.args)
    assert.deepEqual((await t.calls())[0].env, [])
  } finally { await t.cleanup() }
})

test('opencode: missing CLI rejects with the install hint; status and exports', async () => {
  const engine = createOpencodeEngine({ push: () => {} })
  await assert.rejects(engine.run({ threadId: 't', opencodePath: '/nonexistent/opencode', project: tmpdir(), prompt: 'x', approval: 'ask' }), e => e.message === INSTALL_HINT)
  assert.equal(findOpencode('/nonexistent/x'), null)
  const t = await go('text')
  try { assert.equal((await opencodeStatus(t.bin)).loggedIn, true) } finally { await t.cleanup() }
  assert.ok(OPENCODE_MODELS.length && OPENCODE_EFFORTS.length)
})
