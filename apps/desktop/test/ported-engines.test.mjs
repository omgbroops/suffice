// Ported from the codex-rs exec event shapes (exec/src/exec_events.rs, event_processor_with_jsonl_output*.rs,
// exec/tests/suite/completion_backfill_tests.rs) plus audit leads on cli-engine.mjs / codex-engine.mjs / transcript.mjs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCodexEngine } from '../electron/host/codex-engine.mjs'
import { emptyTranscript, reduce, describeTool, OUTPUT_LIMIT } from '../shared/transcript.mjs'
import { PRELUDE, runFake, after } from './cli-fake-helper.mjs'

// Generic fake `codex`: writes the base64 chunks in FAKE_RAW (JSON array) 25ms apart, then exits FAKE_EXIT (default 0).
// FAKE_HANG=1 keeps it alive after the chunks (abort tests).
const FAKE = PRELUDE + `
process.stdin.on('data', c => (stdin += c))
process.stdin.on('end', () => { log(); go() })
async function go() {
  for (const c of JSON.parse(process.env.FAKE_RAW)) { process.stdout.write(Buffer.from(c, 'base64')); await new Promise(r => setTimeout(r, 25)) }
  if (process.env.FAKE_HANG) return setInterval(() => {}, 1000)
  if (process.env.FAKE_ERR) process.stderr.write(process.env.FAKE_ERR)
  process.exit(Number(process.env.FAKE_EXIT || 0))
}
`
const j = o => JSON.stringify(o)
const b64 = x => Buffer.from(x).toString('base64')
const lines = (...evs) => evs.map(e => b64(j(e) + '\n'))
const usage = { input_tokens: 10, cached_input_tokens: 3, output_tokens: 20, reasoning_output_tokens: 5 }
const started = [{ type: 'thread.started', thread_id: 'thr-9' }, { type: 'turn.started' }]
const done = { type: 'turn.completed', usage }

async function drive(chunks, extra = {}, env = {}) {
  const t = await runFake(FAKE, 'codex', createCodexEngine, 'codexPath', 'x', extra, { FAKE_RAW: j(chunks), ...env })
  return { ...t, settle: () => t.engine.run(t.args).then(v => ({ ok: v }), e => ({ err: e })) }
}
const fold = events => {
  let tr = reduce(emptyTranscript(), { type: 'agent_start', id: 'a', model: 'm', effort: 'low', at: 1 })
  for (const e of events) tr = reduce(tr, e)
  return tr.messages[0]
}

test('ours: multi-byte UTF-8 char split across stdout chunks arrives intact', async () => {
  const text = 'héllo 🙂 世界'
  const buf = Buffer.from(j({ type: 'item.completed', item: { id: 'i', type: 'agent_message', text } }) + '\n')
  const cut = buf.indexOf(Buffer.from('🙂')) + 2 // mid 4-byte emoji
  const t = await drive([...lines(...started), buf.subarray(0, cut).toString('base64'), buf.subarray(cut).toString('base64'), ...lines(done)])
  try {
    const r = await t.settle()
    assert.ok(r.ok, String(r.err))
    assert.deepEqual(t.events, [{ type: 'text', delta: text }])
  } finally { await t.cleanup() }
})

test('ours: final JSON line without trailing newline is still parsed', async () => {
  const t = await drive([...lines(...started), b64(j(done))])
  try {
    const r = await t.settle()
    assert.ok(r.ok, `run rejected: ${r.err}`)
    assert.equal(r.ok.inputTokens, 10)
  } finally { await t.cleanup() }
})

test('ours: one JSON line split into many tiny chunks is reassembled', async () => {
  const text = 'x'.repeat(5000)
  const raw = Buffer.from(j({ type: 'item.completed', item: { id: 'i', type: 'agent_message', text } }) + '\n')
  const pieces = []
  for (let i = 0; i < raw.length; i += 997) pieces.push(raw.subarray(i, i + 997).toString('base64'))
  const t = await drive([...lines(...started), ...pieces, ...lines(done)])
  try {
    assert.ok((await t.settle()).ok)
    assert.equal(t.events[0].delta, text)
  } finally { await t.cleanup() }
})

test('codex exec/src/exec_events.rs:151: declined command_execution is not a success', async () => {
  const t = await drive(lines(...started,
    { type: 'item.started', item: { id: 'c1', type: 'command_execution', command: 'rm -rf x', aggregated_output: '', exit_code: null, status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'c1', type: 'command_execution', command: 'rm -rf x', aggregated_output: '', exit_code: null, status: 'declined' } }, done))
  try {
    assert.ok((await t.settle()).ok)
    const res = t.events.find(e => e.type === 'tool_result')
    assert.equal(res.isError, true)
    assert.equal(fold(t.events).steps[0].status, 'error')
  } finally { await t.cleanup() }
})

test('codex exec_events.rs: completed command with exit 0 is done, in_progress start is running', async () => {
  const t = await drive(lines(...started,
    { type: 'item.started', item: { id: 'c1', type: 'command_execution', command: 'ls', status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'c1', type: 'command_execution', command: 'ls', aggregated_output: 'a', exit_code: 0, status: 'completed' } }, done))
  try {
    await t.settle()
    assert.equal(fold(t.events.slice(0, 1)).steps[0].status, 'running')
    const s = fold(t.events).steps[0]
    assert.deepEqual([s.status, s.output], ['done', 'a'])
  } finally { await t.cleanup() }
})

test('event_processor...rs:908 file_change_completion_maps_change_kinds: every changed path is reported', async () => {
  const changes = [{ path: '/p/a.rs', kind: 'add' }, { path: '/p/b.rs', kind: 'update' }, { path: '/p/c.rs', kind: 'delete' }]
  const t = await drive(lines(...started, { type: 'item.completed', item: { id: 'f1', type: 'file_change', changes, status: 'completed' } }, done))
  try {
    await t.settle()
    const tool = t.events.find(e => e.type === 'tool')
    const res = t.events.find(e => e.type === 'tool_result')
    assert.equal(res.output, 'add /p/a.rs\nupdate /p/b.rs\ndelete /p/c.rs')
    const shown = JSON.stringify(describeTool(tool.name, tool.input))
    for (const c of changes) assert.ok(shown.includes(c.path), `${c.path} missing from ${shown}`)
  } finally { await t.cleanup() }
})

test('exec_events.rs PatchApplyStatus::Failed: failed file_change is an error step', async () => {
  const t = await drive(lines(...started, { type: 'item.completed', item: { id: 'f1', type: 'file_change', changes: [{ path: '/p/a', kind: 'update' }], status: 'failed' } }, done))
  try {
    await t.settle()
    assert.equal(fold(t.events).steps[0].status, 'error')
  } finally { await t.cleanup() }
})

test('exec_events.rs:119 ThreadItemDetails: mcp_tool_call and web_search items are not silently dropped', async () => {
  const t = await drive(lines(...started,
    { type: 'item.completed', item: { id: 'm1', type: 'mcp_tool_call', server: 's', tool: 'lookup', arguments: {}, status: 'completed' } },
    { type: 'item.completed', item: { id: 'w1', type: 'web_search', query: 'q' } }, done))
  try {
    await t.settle()
    const ids = new Set(t.events.map(e => e.id))
    assert.ok(ids.has('m1'), 'mcp_tool_call produced no event')
    assert.ok(ids.has('w1'), 'web_search produced no event')
  } finally { await t.cleanup() }
})

test('exec_events.rs reasoning item: becomes a thinking step then closes on the next text', async () => {
  const t = await drive(lines(...started,
    { type: 'item.completed', item: { id: 'r', type: 'reasoning', text: 'plan it' } },
    { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'done' } }, done))
  try {
    await t.settle()
    const steps = fold(t.events).steps
    assert.deepEqual(steps.map(s => s.kind), ['thinking', 'text'])
    assert.ok(steps[0].endedAt)
  } finally { await t.cleanup() }
})

test('event_processor...rs:70 runtime_warning_emits_a_non_fatal_error_item: error item does not fail the turn', async () => {
  const t = await drive(lines(...started, { type: 'item.completed', item: { id: 'e', type: 'error', message: 'invalid global instructions' } },
    { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'ok' } }, done))
  try {
    const r = await t.settle()
    assert.ok(r.ok, String(r.err))
    assert.equal(r.ok.sessionId, 'thr-9')
  } finally { await t.cleanup() }
})

test('exec/tests/suite/completion_backfill_tests.rs:194 failed turn: turn.failed + exit 1 rejects with the message', async () => {
  const t = await drive(lines(...started, { type: 'turn.failed', error: { message: 'Unknown model' } }), {}, { FAKE_EXIT: '1' })
  try {
    const r = await t.settle()
    assert.match(String(r.err?.message), /Unknown model/)
  } finally { await t.cleanup() }
})

test('event_processor...rs:1744 turn_failure_prefers_structured_error_message', async () => {
  const t = await drive(lines(...started, { type: 'error', message: 'stream disconnected' },
    { type: 'turn.failed', error: { message: 'backend failed (request id abc)' } }), {}, { FAKE_EXIT: '1' })
  try {
    assert.match(String((await t.settle()).err?.message), /backend failed \(request id abc\)/)
  } finally { await t.cleanup() }
})

test('exec_events.rs:35 top-level error event alone (exit 1) rejects with its message', async () => {
  const t = await drive(lines(...started, { type: 'error', message: 'rate limited' }), {}, { FAKE_EXIT: '1' })
  try {
    assert.match(String((await t.settle()).err?.message), /rate limited/)
  } finally { await t.cleanup() }
})

test('event_processor...rs:1658 failed_turn: text streamed before turn.failed is still pushed and the transcript can close as failed', async () => {
  const t = await drive(lines(...started, { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'partial' } },
    { type: 'turn.failed', error: { message: 'cut off' } }), {}, { FAKE_EXIT: '1' })
  try {
    const r = await t.settle()
    assert.match(String(r.err?.message), /cut off/)
    assert.equal(fold(t.events).steps[0].text, 'partial')
  } finally { await t.cleanup() }
})

test('ours: non-JSON noise and CRLF line endings between events are tolerated', async () => {
  const t = await drive([b64('WARN: something\r\n'), ...lines(...started), b64(j({ type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'hi' } }) + '\r\n'), b64('\n\n'), ...lines(done)])
  try {
    assert.ok((await t.settle()).ok)
    assert.deepEqual(t.events, [{ type: 'text', delta: 'hi' }])
  } finally { await t.cleanup() }
})

test('ours: two turn.completed events accumulate usage', async () => {
  const t = await drive(lines(...started, done, done))
  try {
    const r = (await t.settle()).ok
    assert.deepEqual([r.modelCalls, r.inputTokens, r.outputTokens, r.cacheReadTokens], [2, 20, 40, 6])
  } finally { await t.cleanup() }
})

test('ours: exit 0 without turn.completed rejects instead of resolving empty', async () => {
  const t = await drive(lines(...started))
  try {
    assert.ok((await t.settle()).err)
  } finally { await t.cleanup() }
})

test('ours: nonzero exit with no events surfaces the last stderr line', async () => {
  const t = await drive([], {}, { FAKE_EXIT: '2', FAKE_ERR: 'noise\nauth expired\n' })
  try {
    assert.match(String((await t.settle()).err?.message), /auth expired/)
  } finally { await t.cleanup() }
})

test('ours: abort mid-tool rejects "Task stopped", keeps the running tool in the transcript, frees the thread', async () => {
  const t = await drive(lines(...started, { type: 'item.started', item: { id: 'c1', type: 'command_execution', command: 'sleep 99', status: 'in_progress' } }), {}, { FAKE_HANG: '1' })
  try {
    const p = t.engine.run(t.args).then(v => ({ ok: v }), e => ({ err: e }))
    for (let i = 0; i < 100 && !t.events.length; i++) await new Promise(r => setTimeout(r, 25))
    assert.equal(t.engine.abort('t'), true)
    const r = await p
    assert.match(String(r.err?.message), /Task stopped/)
    assert.equal(fold(t.events).steps[0].status, 'running')
    assert.equal(t.engine.abort('t'), false)
    const again = t.engine.run(t.args).catch(e => e)
    assert.equal(t.engine.abort('t'), true) // a fresh run was tracked, so the thread was freed
    assert.doesNotMatch(String((await again)?.message), /already running/)
  } finally { await t.cleanup() }
})

test('exec/tests/suite/ephemeral.rs resume: resume run passes exec resume <sessionId> - and sandbox via -c', async () => {
  const t = await drive(lines(...started, done), { resume: true, sessionId: 'sid-1' })
  try {
    await t.settle()
    const { argv } = (await t.calls())[0]
    assert.deepEqual(argv.slice(0, 2), ['exec', 'resume'])
    assert.deepEqual(argv.slice(-2), ['sid-1', '-'])
    assert.ok(!argv.includes('-s'))
    assert.ok(argv.includes('sandbox_mode="read-only"'))
    assert.equal(after(argv, '-m'), 'm')
  } finally { await t.cleanup() }
})

test('cli/tests/queue.rs:420 resume id survives a failed turn: rejection carries the thread id', async () => {
  const t = await drive(lines(...started, { type: 'turn.failed', error: { message: 'boom' } }), {}, { FAKE_EXIT: '1' })
  try {
    const r = await t.settle()
    assert.equal(r.err?.sessionId, 'thr-9')
  } finally { await t.cleanup() }
})

test('ours: a second run on a busy thread is refused', async () => {
  const t = await drive(lines(...started), {}, { FAKE_HANG: '1' })
  try {
    const first = t.engine.run(t.args).catch(e => e)
    await assert.rejects(t.engine.run(t.args), /already running/)
    t.engine.abort('t'); await first
  } finally { await t.cleanup() }
})

test('ours: transcript clip never splits a surrogate pair', () => {
  const out = 'a'.repeat(OUTPUT_LIMIT - 1) + '🙂' + 'tail'
  const m = fold([{ type: 'tool', id: 't', name: 'bash', input: {} }, { type: 'tool_result', id: 't', isError: false, output: out }])
  const got = m.steps[0].output
  assert.ok(got.isWellFormed(), 'clipped output ends in a lone surrogate')
})

test('ours: transcript output at exactly OUTPUT_LIMIT is unclipped, one over is clipped', () => {
  const run = s => fold([{ type: 'tool', id: 't', name: 'bash', input: {} }, { type: 'tool_result', id: 't', output: s }]).steps[0].output
  assert.equal(run('a'.repeat(OUTPUT_LIMIT)).length, OUTPUT_LIMIT)
  assert.ok(run('a'.repeat(OUTPUT_LIMIT + 1)).endsWith('…'))
})

test('ours: transcript ignores a duplicate tool start and a result for an unknown id', () => {
  const m = fold([{ type: 'tool', id: 't', name: 'bash', input: {} }, { type: 'tool', id: 't', name: 'bash', input: {} }, { type: 'tool_result', id: 'zzz', output: 'x' }])
  assert.equal(m.steps.length, 1)
  assert.equal(m.steps[0].status, 'running')
})

test('ours: full codex exec turn folds into thinking, tool, edit, text in order', async () => {
  const t = await drive(lines(...started,
    { type: 'item.completed', item: { id: 'r', type: 'reasoning', text: 'look' } },
    { type: 'item.started', item: { id: 'c', type: 'command_execution', command: 'ls', status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'c', type: 'command_execution', command: 'ls', aggregated_output: 'x', exit_code: 0, status: 'completed' } },
    { type: 'item.completed', item: { id: 'f', type: 'file_change', changes: [{ path: '/p/x', kind: 'add' }], status: 'completed' } },
    { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'all done' } }, done))
  try {
    await t.settle()
    const m = fold(t.events)
    assert.deepEqual(m.steps.map(s => s.kind === 'tool' ? `${s.name}:${s.status}` : s.kind), ['thinking', 'bash:done', 'edit:done', 'text'])
  } finally { await t.cleanup() }
})
