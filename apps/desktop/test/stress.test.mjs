import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hash } from '@suffice/harness'
import { createClaudeEngine, INSTALL_HINT } from '../electron/host/claude-engine.mjs'
import { createCodexEngine } from '../electron/host/codex-engine.mjs'
import { createAccounts } from '../electron/host/accounts.mjs'
import { createHost } from '../electron/host/host.mjs'
import { scanNotes } from '../electron/host/notes.mjs'
import { neighbourhood } from '../shared/notes.mjs'

// A fake `claude`: speaks stream-json like claude-engine.test.mjs, plus hostile scenarios.
// FAKE_SCENARIO picks the script; every non-auth invocation logs argv to FAKE_LOG.
const FAKE = `#!/usr/bin/env node
const fs = require('fs')
const argv = process.argv.slice(2)
const scenario = process.env.FAKE_SCENARIO
const log = o => process.env.FAKE_LOG && fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(o) + '\\n')
if (argv[0] === 'auth') {
  console.log(JSON.stringify({ loggedIn: process.env.FAKE_LOGGED_OUT !== '1', subscriptionType: 'max' }))
  process.exit(0)
}
log({ argv })
const out = o => process.stdout.write(JSON.stringify(o) + '\\n')
const delta = t => out({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } } })
const result = (extra = {}) => out({ type: 'result', subtype: 'success', is_error: false, result: 'ok', num_turns: 1, duration_ms: 1, total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 2 }, ...extra })
if (scenario === 'deaf') {
  // never reads stdin and never writes: only a signal can end it
  process.on('SIGTERM', () => process.exit(0))
  setInterval(() => {}, 1000)
} else if (scenario === 'stubborn') {
  process.stdin.resume()
  process.on('SIGTERM', () => {}) // ignores SIGTERM on purpose
  setInterval(() => {}, 1000)
} else if (scenario === 'missing-session') {
  process.stderr.write('No conversation found with session ID\\n')
  process.exit(1)
} else {
  let buf = ''
  process.stdin.on('data', c => {
    buf += c
    let i
    while ((i = buf.indexOf('\\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1)
      if (m.type === 'user') onUser()
      else if (m.type === 'control_request' && m.request.subtype === 'interrupt') process.exit(0)
      else if (m.type === 'control_response') { delta('answered'); result() }
    }
  })
}
function onUser() {
  if (scenario === 'text') { delta('hi'); result() }
  else if (scenario === 'crash') { delta('half'); process.stderr.write('panic: segfault\\n'); process.exit(3) }
  else if (scenario === 'signal') process.kill(process.pid, 'SIGSEGV')
  else if (scenario === 'badjson') { process.stdout.write('not json\\n'); process.stdout.write('{broken\\n'); delta('ok'); result() }
  else if (scenario === 'giant') { delta('x'.repeat(10 * 1024 * 1024)); result() }
  else if (scenario === 'noresult') { delta('only text'); process.stderr.write('done early\\n'); process.exit(0) }
  else if (scenario === 'hang') delta('working')
  else if (scenario === 'permcrash') {
    out({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: '/p/x' } } })
    setTimeout(() => { process.stderr.write('child died\\n'); process.exit(1) }, 60)
  }
  else if (scenario === 'weirdperm') out({ type: 'control_request', request_id: 'r9', request: { subtype: 'can_use_tool' } }) // no tool_name: only a control_response unblocks this
  else if (scenario === 'weirdmsg') { out({ type: 'assistant', message: { content: 5 } }); result() } // content must be an array
}
`

const sleep = ms => new Promise(r => setTimeout(r, ms))
const until = async (fn, ms = 8000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out'); await sleep(5) } }

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-stress-'))
  const bin = join(dir, 'claude')
  await writeFile(bin, FAKE)
  await chmod(bin, 0o755)
  return { dir, bin, log: join(dir, 'log.jsonl') }
}

/** One fake claude + one engine. env/scenario restored on cleanup. */
async function runFake(scenario) {
  const s = await setup()
  const saved = { FAKE_SCENARIO: process.env.FAKE_SCENARIO, FAKE_LOG: process.env.FAKE_LOG }
  process.env.FAKE_SCENARIO = scenario
  process.env.FAKE_LOG = s.log
  const events = []
  const engine = createClaudeEngine({ push: (t, e) => events.push([t, e]) })
  const args = { threadId: 't', claudePath: s.bin, project: s.dir, prompt: 'hi', model: 'claude-haiku-5-5', effort: 'low', approval: 'ask', sessionId: 'sid-1', resume: false, onApproval: async () => true }
  const cleanup = async () => {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v)
    engine.dispose()
    await rm(s.dir, { recursive: true, force: true })
  }
  return { s, events, engine, args, cleanup }
}

const argvLog = async f => (await readFile(f, 'utf8')).trim().split('\n').map(l => JSON.parse(l))

/** A host wired to the fake claude bin (engine: 'claude'). */
async function claudeHost(scenario, opts = {}) {
  const s = await setup()
  const saved = { FAKE_SCENARIO: process.env.FAKE_SCENARIO, FAKE_LOG: process.env.FAKE_LOG }
  process.env.FAKE_SCENARIO = scenario
  process.env.FAKE_LOG = s.log
  const home = await mkdtemp(join(tmpdir(), 'suffice-stress-home-'))
  const events = []
  const host = await createHost({
    home, claudePath: s.bin, openExternal: () => {}, chooseDirectory: async () => home,
    emit: (c, p) => { events.push([c, p]); opts.onEmit?.(c, p, host) },
    ...opts.deps,
  })
  const done = async () => {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v)
    await host.dispose().catch(() => {})
    await rm(home, { recursive: true, force: true })
    await rm(s.dir, { recursive: true, force: true })
  }
  const ends = id => events.filter(([c, p]) => c === 'thread:event' && p.threadId === id && p.event.type === 'end')
  return { s, home, host, events, ends, done }
}

// ---- claude engine: concurrency and lifecycle -------------------------------

test('stress: 20 concurrent runs on different threads all finish', async () => {
  const t = await runFake('text')
  try {
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => t.engine.run({ ...t.args, threadId: `t${i}`, sessionId: `s${i}` })))
    assert.equal(rs.length, 20)
    assert.ok(rs.every(r => r.outputTokens === 2))
    assert.equal(t.events.filter(([id, e]) => e.type === 'text' && id.startsWith('t')).length, 20)
    const spawns = await argvLog(t.s.log)
    assert.equal(spawns.length, 20)
    assert.equal(t.engine.abort('t0'), false, 'a finished run cannot be aborted')
    assert.equal(t.engine.guide('t0', 'late'), false, 'a finished run cannot be guided')
  } finally { await t.cleanup() }
})

test('stress: abort within 5 ms of start rejects as cancelled', async () => {
  const t = await runFake('hang')
  try {
    const p = t.engine.run(t.args)
    p.catch(() => {})
    assert.equal(t.engine.abort('t'), true)
    await assert.rejects(p, /cancelled/)
  } finally { await t.cleanup() }
})

test('stress: a child that never reads stdin is still stopped cleanly', async () => {
  const t = await runFake('deaf')
  try {
    const p = t.engine.run(t.args)
    p.catch(() => {})
    await sleep(200)
    assert.equal(t.engine.abort('t'), true)
    await assert.rejects(p, /cancelled/, 'SIGTERM ends a child that never read the interrupt', { timeout: 8000 })
  } finally { await t.cleanup() }
})

test('stress: a child that ignores SIGTERM is SIGKILLed after the grace period', { timeout: 15000 }, async () => {
  const t = await runFake('stubborn')
  try {
    const p = t.engine.run(t.args)
    p.catch(() => {})
    await sleep(200)
    assert.equal(t.engine.abort('t'), true)
    await assert.rejects(p, /cancelled/, 'SIGKILL escalation must end a SIGTERM-proof child')
  } finally { await t.cleanup() }
})

test('stress: dispose() escalates to SIGKILL for a SIGTERM-proof child', { timeout: 15000 }, async () => {
  const t = await runFake('stubborn')
  try {
    const p = t.engine.run(t.args)
    p.catch(() => {})
    await sleep(200)
    t.engine.dispose()
    await assert.rejects(p, /cancelled/, 'dispose must kill, not just ask')
  } finally { await t.cleanup() }
})

test('stress: a second run on a live threadId is refused, the first is untouched', { timeout: 8000 }, async () => {
  const t = await runFake('hang')
  try {
    const p1 = t.engine.run(t.args)
    p1.catch(() => {})
    await sleep(150)
    await assert.rejects(t.engine.run(t.args), /already running/)
    t.engine.abort('t')
    await assert.rejects(p1, /cancelled/, 'the first run is still tracked and stoppable')
  } finally { await t.cleanup() }
})

// ---- claude engine: hostile output -------------------------------------------

test('stress: a crash mid-stream rejects with the stderr tail', async () => {
  const t = await runFake('crash')
  try {
    const p = t.engine.run(t.args)
    await assert.rejects(p, /panic: segfault/)
    assert.deepEqual(t.events, [['t', { type: 'text', delta: 'half' }]], 'the delta streamed before the crash survives')
  } finally { await t.cleanup() }
})

test('stress: a signal death names the signal, not "code null"', async () => {
  const t = await runFake('signal')
  try {
    await assert.rejects(t.engine.run(t.args), /SIGSEGV|killed/i)
  } finally { await t.cleanup() }
})

test('stress: invalid JSON lines on stdout are ignored', async () => {
  const t = await runFake('badjson')
  try {
    await t.engine.run(t.args)
    assert.deepEqual(t.events, [['t', { type: 'text', delta: 'ok' }]])
  } finally { await t.cleanup() }
})

test('stress: 10 MB of streamed output parses and resolves', async () => {
  const t = await runFake('giant')
  try {
    const totals = await t.engine.run(t.args)
    assert.equal(totals.outputTokens, 2)
    const delta = t.events.find(([, e]) => e.type === 'text')
    assert.equal(delta[1].delta.length, 10 * 1024 * 1024)
  } finally { await t.cleanup() }
})

test('stress: exit 0 without a result line rejects', async () => {
  const t = await runFake('noresult')
  try {
    await assert.rejects(t.engine.run(t.args), /done early|exited/)
  } finally { await t.cleanup() }
})

test('stress: malformed wire events cannot kill the run', { timeout: 8000 }, async () => {
  const bad = []
  const onBad = e => bad.push(e)
  process.on('unhandledRejection', onBad)
  const t = await runFake('weirdperm')
  try {
    // a can_use_tool with no tool_name must still get a control_response, or the CLI waits forever
    await t.engine.run(t.args)
    assert.deepEqual(t.events, [['t', { type: 'text', delta: 'answered' }]])
  } finally { await t.cleanup() }
  const w = await runFake('weirdmsg')
  try {
    await w.engine.run(w.args)
  } finally { await w.cleanup() }
  await sleep(50)
  assert.deepEqual(bad, [], 'one bad line rejected handle() without an unhandled rejection')
  process.off('unhandledRejection', onBad)
})

test('stress: a missing project folder names the folder, not "not installed"', async () => {
  const t = await runFake('text')
  try {
    await assert.rejects(t.engine.run({ ...t.args, project: join(t.s.dir, 'nope') }), e => e.message !== INSTALL_HINT && /missing|ENOENT|folder/i.test(e.message))
  } finally { await t.cleanup() }
})

// ---- host on the claude engine ------------------------------------------------

test('stress: 20 concurrent host runs on different threads all end ok', async () => {
  const t = await claudeHost('text')
  try {
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => t.host.run({ threadId: `t${i}`, project: t.home, prompt: 'go', model: 'claude-haiku-5-5', effort: 'low' })))
    assert.equal(rs.length, 20)
    await until(() => t.events.filter(([c, p]) => c === 'thread:event' && p.event.type === 'end').length === 20)
    assert.ok(t.events.filter(([c, p]) => c === 'thread:event' && p.event.type === 'end').every(([, p]) => p.event.ok))
  } finally { await t.done() }
})

test('stress: Stop during the sign-in check halts the run before a child spawns', async () => {
  const t = await claudeHost('text')
  try {
    const p = t.host.run({ threadId: 't', project: t.home, prompt: 'go', model: 'claude-haiku-5-5', effort: 'low' })
    assert.equal(t.host.abort('t'), true, 'abort while authStatus is in flight is accepted')
    const r = await p
    assert.equal(r.stopped, true)
    await sleep(100)
    assert.ok(!t.events.some(([c, p]) => c === 'thread:event' && p.event.type === 'agent_start'), 'no agent ever started')
    assert.ok(!t.events.some(([c, p]) => c === 'thread:event' && p.event.type === 'user'), 'the prompt was never queued')
    const log = await readFile(t.s.log, 'utf8').catch(() => '')
    assert.equal(log.trim(), '', 'no child process was spawned')
    // and the thread can run again afterwards: the first end is the stopped run, the second the retry
    await t.host.run({ threadId: 't', project: t.home, prompt: 'go', model: 'claude-haiku-5-5', effort: 'low' })
    await until(() => t.ends('t').length === 2)
    assert.equal(t.ends('t')[0][1].event.error, 'Stopped.')
    assert.equal(t.ends('t')[1][1].event.ok, true)
  } finally { await t.done() }
})

test('stress: a failed run setup does not wedge the thread as running', async () => {
  const t = await claudeHost('text')
  try {
    await chmod(t.home, 0o555) // sessions dir cannot be created
    await assert.rejects(t.host.run({ threadId: 't', project: t.home, prompt: 'go', model: 'claude-haiku-5-5', effort: 'low' }))
    await chmod(t.home, 0o755)
    await t.host.run({ threadId: 't', project: t.home, prompt: 'go', model: 'claude-haiku-5-5', effort: 'low' })
    await until(() => t.ends('t').length === 1)
    assert.equal(t.ends('t')[0][1].event.ok, true, 'the thread must not stay marked running after the failure')
  } finally { await t.done() }
})

test('stress: guide reaches a running claude thread and refuses after it ends', async () => {
  const t = await claudeHost('hang')
  try {
    await t.host.run({ threadId: 'g', project: t.home, prompt: 'go', model: 'claude-haiku-5-5', effort: 'low' })
    await sleep(200)
    assert.equal(await t.host.guide({ threadId: 'g', text: 'turn left' }), true)
    assert.ok(t.events.some(([c, p]) => c === 'thread:event' && p.event.type === 'note' && /turn left/.test(p.event.text)))
    assert.equal(t.host.abort('g'), true)
    await until(() => t.ends('g').length === 1)
    await assert.rejects(t.host.guide({ threadId: 'g', text: 'too late' }), /Nothing is running/)
    assert.equal(t.host.abort('g'), false, 'abort after completion is refused')
  } finally { await t.done() }
})

test('stress: dispose during a live run stops the child and leaves no unhandled rejection', async () => {
  const bad = []
  const onBad = e => bad.push(e)
  process.on('unhandledRejection', onBad)
  const t = await claudeHost('hang')
  try {
    await t.host.run({ threadId: 'd', project: t.home, prompt: 'go', model: 'claude-haiku-5-5', effort: 'low' })
    await sleep(200)
    await t.host.dispose()
    await until(() => t.ends('d').length === 1, 5000).catch(() => {})
    await sleep(100)
    assert.deepEqual(bad, [])
    await assert.rejects(t.host.run({ threadId: 'x', project: t.home, prompt: 'go', model: 'claude-haiku-5-5', effort: 'low' }), /closing/)
  } finally { process.off('unhandledRejection', onBad); await t.done() }
})

test('stress: a resume against a session the CLI does not know ends with its error', async () => {
  const t = await claudeHost('missing-session')
  try {
    const dir = join(t.home, 'sessions', hash(t.home).slice(0, 20))
    await mkdir(dir, { recursive: true })
    const ghost = join(dir, 'ghost.claude.json')
    await t.host.run({ threadId: 'r', project: t.home, prompt: 'go', model: 'claude-haiku-5-5', effort: 'low', path: ghost })
    await until(() => t.ends('r').length === 1)
    assert.equal(t.ends('r')[0][1].event.ok, false)
    assert.match(t.ends('r')[0][1].event.error, /No conversation found/)
    const [{ argv }] = await argvLog(t.s.log)
    assert.deepEqual(argv.slice(-2), ['--resume', 'ghost'])
  } finally { await t.done() }
})

test('stress: a crash while an approval is pending resolves it denied, never answerable again', async () => {
  const t = await claudeHost('permcrash')
  let approvalId = null
  try {
    await t.host.run({ threadId: 'a', project: t.home, prompt: 'go', model: 'claude-haiku-5-5', effort: 'low', approval: 'ask' })
    await until(() => t.ends('a').length === 1)
    const req = t.events.find(([c, p]) => c === 'thread:event' && p.event.type === 'approval')
    assert.ok(req, 'the permission request was pushed before the crash')
    approvalId = req[1].event.id
    const resolved = t.events.find(([c, p]) => c === 'thread:event' && p.event.type === 'approval_resolved' && p.event.id === approvalId)
    assert.ok(resolved, 'the pending approval is closed when the run ends')
    assert.equal(resolved[1].event.allow, false)
    assert.equal(t.host.answerApproval(approvalId, true), false, 'answering afterwards is a no-op')
  } finally { await t.done() }
})

test('stress: transcript save failure does not lose the run result', async () => {
  const t = await claudeHost('text')
  const errs = []
  const orig = console.error
  console.error = (...a) => errs.push(a)
  try {
    await chmod(join(t.home, 'desktop', 'transcripts'), 0o555)
    await t.host.run({ threadId: 't', project: t.home, prompt: 'go', model: 'claude-haiku-5-5', effort: 'low' })
    await until(() => t.ends('t').length === 1)
    assert.equal(t.ends('t')[0][1].event.ok, true, 'the run still reports success')
    await until(() => errs.some(a => /transcript save failed/.test(String(a[0]))), 3000).catch(() => {})
    assert.ok(errs.some(a => /transcript save failed/.test(String(a[0]))), 'the failure is logged, not silent')
  } finally { console.error = orig; await t.done() }
})

test('stress: an unwritable settings file rejects the update but recovers', async () => {
  const t = await claudeHost('text')
  try {
    await chmod(join(t.home, 'desktop'), 0o555)
    await assert.rejects(t.host.updateSettings({ theme: 'dark' }))
    await chmod(join(t.home, 'desktop'), 0o755)
    const s = await t.host.updateSettings({ theme: 'dark' })
    assert.equal(s.theme, 'dark')
    const disk = JSON.parse(await readFile(join(t.home, 'desktop', 'settings.json'), 'utf8'))
    assert.equal(disk.theme, 'dark')
  } finally { await t.done() }
})

test('stress: unicode prompts and long unicode project paths run end to end', async () => {
  const t = await claudeHost('text')
  try {
    const project = join(t.home, 'proj-üñíçødé--' + 'l'.repeat(160))
    await mkdir(project, { recursive: true })
    await t.host.run({ threadId: 'u', project, prompt: 'fix ünïçødé  →λ', model: 'claude-haiku-5-5', effort: 'low' })
    await until(() => t.ends('u').length === 1)
    assert.equal(t.ends('u')[0][1].event.ok, true)
    const threads = await t.host.listThreads(project)
    assert.equal(threads.length, 1)
    assert.ok(threads[0].title.length > 0)
  } finally { await t.done() }
})

// ---- IPC argument types --------------------------------------------------------

test('stress: every arg-taking host entry point rejects wrongly typed input', async () => {
  const t = await claudeHost('text', {
    deps: { accounts: createAccounts({ desktopDir: '/tmp/suffice-stress-accts', safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() } }) },
  })
  try {
    const base = { threadId: 't', project: t.home, prompt: 'p', model: 'claude-haiku-5-5', effort: 'low' }
    // run
    await assert.rejects(t.host.run(null), /Invalid/)
    await assert.rejects(t.host.run(5), /Invalid/)
    await assert.rejects(t.host.run('x'), /Invalid/)
    for (const bad of [{ threadId: 5 }, { prompt: {} }, { model: [] }, { effort: 3 }, { fast: 'yes' }, { mode: 'x' }, { project: 7 }, { cheapModel: 1 }, { path: 42 }])
      await assert.rejects(t.host.run({ ...base, ...bad }), /Invalid/, JSON.stringify(bad))
    // abort / approvals / login answers (sync)
    assert.throws(() => t.host.abort({}), /Invalid/)
    assert.throws(() => t.host.abort(5), /Invalid/)
    assert.throws(() => t.host.answerApproval(5, true), /Invalid/)
    assert.throws(() => t.host.answerApproval('x', 'yes'), /Invalid/)
    assert.throws(() => t.host.answerLogin(5, 'x'), /Invalid/)
    assert.throws(() => t.host.answerLogin('x', 5), /Invalid/)
    // guide
    await assert.rejects(t.host.guide(null), /Invalid/)
    await assert.rejects(t.host.guide(5), /Invalid/)
    await assert.rejects(t.host.guide({ threadId: 5, text: 'x' }), /Invalid/)
    await assert.rejects(t.host.guide({ threadId: 't', text: 5 }), /Invalid/)
    await assert.rejects(t.host.guide({ threadId: 't', text: 'x', queue: 'y' }), /Invalid/)
    // threads / notes / projects
    await assert.rejects(t.host.openThread(null), /Invalid/)
    await assert.rejects(t.host.openThread({ threadId: 5 }), /Invalid/)
    await assert.rejects(t.host.listThreads(5), /Invalid/)
    assert.deepEqual(await t.host.listNotes({ project: 5 }), [])
    await assert.rejects(t.host.listNotes(null), /Invalid/)
    await assert.rejects(t.host.readNote(null), /Invalid/)
    await assert.rejects(t.host.readNote({ project: t.home, path: 5 }), /Invalid/)
    await assert.rejects(t.host.nameProject(null), /Invalid/)
    await assert.rejects(t.host.nameProject({ project: 5 }), /Invalid/)
    await assert.rejects(t.host.setProject(5), /Invalid/)
    // accounts (these throw synchronously inside the arrow, so wrap to make them rejections)
    for (const bad of [() => t.host.setKey(null), () => t.host.setKey({ provider: 5, key: 'x' }), () => t.host.setKey({ provider: 'anthropic', key: 5 }), () => t.host.testKey(null), () => t.host.testKey({ provider: 5 }), () => t.host.removeKey(null), () => t.host.removeKey({ provider: 5 })])
      await assert.rejects(async () => bad(), /Invalid/)
    // settings
    await assert.rejects(t.host.updateSettings(null), /Invalid/)
    await assert.rejects(t.host.updateSettings([1, 2]), /Invalid/)
    await assert.rejects(t.host.updateSettings('x'), /Invalid/)
  } finally { await t.done(); await rm('/tmp/suffice-stress-accts', { recursive: true, force: true }) }
})

// ---- shared cli engine (codex adapter) -----------------------------------------

const CODEX_FAKE = `#!/usr/bin/env node
const fs = require('fs')
const argv = process.argv.slice(2)
const scenario = process.env.FAKE_SCENARIO
if (argv[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0) }
const out = o => process.stdout.write(JSON.stringify(o) + '\\n')
let stdin = ''
if (scenario === 'deaf') { setInterval(() => {}, 1000) }
else if (scenario === 'stubborn') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000) }
else {
  process.stdin.on('data', c => (stdin += c))
  process.stdin.on('end', () => go())
}
function go() {
  if (scenario === 'ok') { out({ type: 'thread.started', thread_id: 'x' }); out({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }); process.exit(0) }
  if (scenario === 'silent') { process.exit(0) } // exit 0, no events at all
  if (scenario === 'hang') { out({ type: 'thread.started', thread_id: 'x' }); return setInterval(() => {}, 1000) }
  if (scenario === 'malformed') {
    out({ type: 'thread.started', thread_id: 'x' })
    out({ type: 'item.completed', item: { id: 'i1', type: 'file_change', changes: 'oops', status: 'completed' } }) // changes must be an array
    out({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })
    process.exit(0)
  }
  out({ type: 'thread.started', thread_id: 'x' }); out({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })
}
`

async function codexFake(scenario) {
  const s = await setup()
  const bin = join(s.dir, 'codex')
  await writeFile(bin, CODEX_FAKE)
  await chmod(bin, 0o755)
  const saved = { FAKE_SCENARIO: process.env.FAKE_SCENARIO }
  process.env.FAKE_SCENARIO = scenario
  const events = []
  const engine = createCodexEngine({ push: (t, e) => events.push([t, e]) })
  const args = { threadId: 't', codexPath: bin, project: s.dir, prompt: 'hi', model: 'gpt-5.5', approval: 'ask' }
  const cleanup = async () => {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v)
    engine.dispose()
    await rm(s.dir, { recursive: true, force: true })
  }
  return { s, events, engine, args, cleanup }
}

test('stress: codex engine refuses a second run on a live threadId', { timeout: 8000 }, async () => {
  const t = await codexFake('hang')
  try {
    const p1 = t.engine.run(t.args)
    p1.catch(() => {})
    await sleep(150)
    await assert.rejects(t.engine.run(t.args), /already running/)
    t.engine.abort('t')
    await assert.rejects(p1, /cancelled/)
  } finally { await t.cleanup() }
})

test('stress: codex engine: exit 0 with no completion rejects', async () => {
  const t = await codexFake('silent')
  try { await assert.rejects(t.engine.run(t.args), /exited/) } finally { await t.cleanup() }
})

test('stress: codex engine: a malformed event line cannot kill the run', async () => {
  const t = await codexFake('malformed')
  try {
    const totals = await t.engine.run(t.args)
    assert.equal(totals.inputTokens, 1, 'the run survives one bad event')
  } finally { await t.cleanup() }
})

test('stress: codex engine: SIGTERM-proof child is SIGKILLed on abort and on dispose', { timeout: 20000 }, async () => {
  const t = await codexFake('stubborn')
  try {
    const p1 = t.engine.run(t.args)
    p1.catch(() => {})
    await sleep(150)
    t.engine.abort('t')
    await assert.rejects(p1, /cancelled/)
    const p2 = t.engine.run({ ...t.args, threadId: 'u' })
    p2.catch(() => {})
    await sleep(150)
    t.engine.dispose()
    await assert.rejects(p2, /cancelled/, 'dispose escalates to SIGKILL too')
  } finally { await t.cleanup() }
})

test('stress: codex engine: a missing project folder is not reported as "not installed"', async () => {
  const t = await codexFake('ok')
  try {
    await assert.rejects(t.engine.run({ ...t.args, project: join(t.s.dir, 'nope') }), e => !/not installed/i.test(e.message))
  } finally { await t.cleanup() }
})

// ---- accounts --------------------------------------------------------------------

test('stress: concurrent key writes never lose a provider or corrupt keys.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-stress-acct-'))
  try {
    const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(`enc:${s}`), decryptString: b => b.toString().slice(4) }
    const accts = createAccounts({ desktopDir: dir, safeStorage })
    const writes = [
      accts.setKey('anthropic', 'sk-ant-aaaa1111'),
      accts.setKey('openai', 'sk-oai-bbbb2222'),
      accts.setKey('openrouter', 'sk-or-cccc3333'),
      accts.setKey('google', 'goog-dddd4444'),
    ]
    const rs = await Promise.all(writes)
    assert.equal(rs.length, 4)
    const saved = JSON.parse(await readFile(join(dir, 'keys.json'), 'utf8'))
    assert.deepEqual(Object.keys(saved).sort(), ['anthropic', 'google', 'openai', 'openrouter'], 'every write landed')
    const rows = await accts.list()
    assert.equal(rows.filter(r => r.kind === 'key' && r.connected).length, 4)
    assert.equal((await readdir(dir)).filter(f => f.endsWith('.tmp')).length, 0, 'no temp files left behind')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

// ---- notes ------------------------------------------------------------------------

test('stress: 500 notes with cyclic links scan and form a bounded graph', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-stress-notes-'))
  try {
    const name = i => `n${String(i).padStart(3, '0')}`
    await Promise.all(Array.from({ length: 500 }, (_, i) =>
      writeFile(join(dir, `${name(i)}.md`), `# Note ${i}\nSee [[${name((i + 1) % 500)}]] and [[${name((i + 2) % 500)}]].`)))
    const notes = await scanNotes(dir)
    assert.equal(notes.length, 500)
    assert.ok(notes.every(n => n.links.length === 2), 'every cyclic link resolved')
    const g = neighbourhood(notes, 'n250.md')
    assert.ok(g.nodes.length <= 1 + 14 + 18, 'the cycle cannot blow up the neighbourhood')
    assert.ok(g.nodes.length > 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('stress: a malformed percent-encoding in a note link cannot break the scan', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-stress-notes-'))
  try {
    await writeFile(join(dir, 'ok.md'), '# OK\n[[bad]]')
    await writeFile(join(dir, 'bad.md'), '# Bad\n[x](%zz.md) [y](%E0%A4%A.md) [z](ok.md)')
    const notes = await scanNotes(dir)
    assert.equal(notes.length, 2, 'the scan survived the malformed links')
    const bad = notes.find(n => n.path === 'bad.md')
    assert.deepEqual(bad.links, ['ok.md'], 'the valid relative link still resolves')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('stress: notes with unicode names and very long paths scan and open', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-stress-notes-'))
  try {
    const uni = 'ünïçødé '
    await writeFile(join(dir, `${uni}.md`), `# ${uni}\n[[${'l'.repeat(180)}]]`)
    await writeFile(join(dir, `${'l'.repeat(180)}.md`), 'target')
    const notes = await scanNotes(dir)
    assert.equal(notes.length, 2)
    assert.ok(notes.find(n => n.path.includes(uni)).links.length === 1)
    const { readNote } = await import('../electron/host/notes.mjs')
    assert.match(await readNote(dir, `${uni}.md`), /ünïçødé/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
