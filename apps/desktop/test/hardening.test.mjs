import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hash } from '@suffice/harness'
import { createHost } from '../electron/host/host.mjs'
import { createErrorLog, redact } from '../electron/host/errorlog.mjs'

const MODELS = [{ id: 'gpt-6.1-sol', name: 'Sol', reasoning: true, contextWindow: 1, cost: {}, thinkingLevelMap: { off: null, low: 'low' } }]
const runtime = (extra = {}) => ({ isUsingSubscription: () => true, hasConfiguredAuth: () => true, getModels: () => MODELS, getModel: (_p, id) => MODELS.find(m => m.id === id), logout: async () => {}, ...extra })
const ARGS = { model: 'gpt-6.1-sol', effort: 'low', prompt: 'go' }

/** A session whose run() waits for `gate` (or the abort) and honours abort like the real harness. */
function gatedSession({ gate = new Promise(() => {}), counts = { disposed: 0, aborted: 0 } } = {}) {
  const create = async (options) => {
    let abortRun
    const aborted = new Promise((_, rej) => (abortRun = () => rej(new Error('Task stopped: cancelled'))))
    aborted.catch(() => {})
    return {
      session: { model: MODELS[0], setModel: async () => {}, setThinkingLevel: () => {}, subscribe: () => {} },
      totals: {},
      sessionPath: () => join(options.home, 'sessions', `${options.cwd.length}-${Math.random()}.jsonl`),
      abort: () => (counts.aborted++, abortRun()),
      dispose: async () => void counts.disposed++,
      run: () => Promise.race([gate, aborted]),
    }
  }
  create.counts = counts
  return create
}

async function setup(opts = {}) {
  const home = await mkdtemp(join(tmpdir(), 'suffice-hard-'))
  const events = []
  const host = await createHost({ home, runtime: runtime(opts.runtime), createSession: opts.createSession ?? gatedSession(), openExternal: () => {}, chooseDirectory: async () => home, emit: (c, p) => { events.push([c, p]); opts.onEmit?.(c, p, host) } })
  return { home, host, events, done: () => rm(home, { recursive: true, force: true }) }
}
const ended = events => events.filter(([c, p]) => c === 'thread:event' && p.event.type === 'end')
const until = async (fn, ms = 3000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out'); await new Promise(r => setTimeout(r, 5)) } }

test('ipc: run and friends reject wrongly typed arguments', async () => {
  const { host, home, done } = await setup()
  try {
    const base = { threadId: 't', project: home, ...ARGS }
    for (const bad of [{ threadId: 5 }, { prompt: {} }, { model: ['x'] }, { effort: 3 }, { fast: 'yes' }, { mode: 'turbo' }, { project: 7 }, { cheapModel: 1 }, { path: 42 }])
      await assert.rejects(host.run({ ...base, ...bad }), /Invalid|Unknown mode/, JSON.stringify(bad))
    await assert.rejects(host.run(null), /Invalid/)
    await assert.rejects(host.guide({ threadId: 1, text: 'x' }), /Invalid/)
    await assert.rejects(host.guide({ threadId: 't', text: 5 }), /Invalid/)
    assert.throws(() => host.abort({}), /Invalid/)
    assert.throws(() => host.answerApproval('x', 'yes'), /Invalid/)
    await assert.rejects(host.setProject(['/x']), /Invalid/)
    await assert.rejects(host.readNote({ project: home, path: 5 }), /Invalid/)
  } finally { await host.dispose(); await done() }
})

test('ipc: session paths must be inside the project session dir or already known', async () => {
  const { host, home, done } = await setup()
  try {
    const project = join(home, 'proj')
    await mkdir(project)
    const dir = join(home, 'sessions', hash(project).slice(0, 20))
    await assert.rejects(host.run({ threadId: 'a', project, ...ARGS, path: '/etc/passwd' }), /not in this project/)
    await assert.rejects(host.run({ threadId: 'a', project, ...ARGS, path: join(dir, '..', 'other', 'x.jsonl') }), /not in this project/)
    await assert.rejects(host.openThread({ threadId: 'b', path: '/etc/passwd' }), /not in this project/)
    await assert.rejects(host.openThread({ threadId: 'b', project, path: join(home, 'sessions', 'elsewhere.jsonl') }), /not in this project/)
    const ok = await host.openThread({ threadId: 'b', project, path: join(dir, 'x.jsonl') })
    assert.equal(ok.version, 1)
  } finally { await host.dispose(); await done() }
})

test('ipc: notes:read stays inside the project', async () => {
  const { host, home, done } = await setup()
  try {
    const project = join(home, 'proj')
    await mkdir(project)
    await writeFile(join(home, 'secret.md'), 'secret')
    await host.setProject(project)
    await assert.rejects(host.readNote({ project, path: '../secret.md' }))
    await assert.rejects(host.readNote({ project: home, path: 'secret.md' }), /Open that project/)
  } finally { await host.dispose(); await done() }
})

test('ipc: settings:update keeps only known keys with sane types', async () => {
  const { host, home, done } = await setup()
  try {
    const s = await host.updateSettings({ theme: 'dark', approval: 'every', evil: 1, __proto__: { x: 1 }, mode: 'turbo', fast: { a: 'no' }, efforts: { m: 'high' }, recentModels: [1], project: 5 })
    assert.equal(s.theme, 'dark'); assert.equal(s.approval, 'every'); assert.deepEqual(s.efforts, { m: 'high' })
    assert.equal(s.evil, undefined); assert.equal(s.mode, 'balanced'); assert.deepEqual(s.fast, {}); assert.deepEqual(s.recentModels, []); assert.equal(s.project, null)
    const disk = JSON.parse(await readFile(join(home, 'desktop', 'settings.json'), 'utf8'))
    assert.equal(disk.evil, undefined)
    await assert.rejects(host.updateSettings([1]), /Invalid/)
    await assert.rejects(host.updateSettings('x'), /Invalid/)
  } finally { await host.dispose(); await done() }
})

test('login: prompt abort listeners are removed, answered or not', async () => {
  let signal
  const sent = []
  const rt = runtime({
    login: async (_p, _k, cb) => {
      signal = cb.signal
      for (let i = 0; i < 5; i++) assert.equal(await cb.prompt({ message: 'code' }), 'v')
      cb.prompt({ message: 'left hanging' }) // never answered
    },
  })
  const { host, done } = await setup({ runtime: rt, onEmit: (c, p, h) => { if (c === 'auth:event' && p.type === 'prompt') { sent.push(p.id); setImmediate(() => h.answerLogin(p.id, 'v')) } } })
  try {
    // the 6th prompt is answered by the emit hook too; make it hang by answering only the first five
    const r = await host.login()
    assert.equal(r.ok, true)
    assert.equal(getEventListeners(signal, 'abort').length, 0)
  } finally { await host.dispose(); await done() }
})

test('login: dispose cancels a pending sign-in without an unhandled rejection', async () => {
  const bad = []
  const onBad = e => bad.push(e)
  process.on('unhandledRejection', onBad)
  const rt = runtime({ login: (_p, _k, cb) => cb.prompt({ message: 'code' }) })
  const { host, done } = await setup({ runtime: rt })
  try {
    const pending = host.login()
    await new Promise(r => setTimeout(r, 20))
    await host.dispose()
    assert.equal((await pending).ok, false)
    await new Promise(r => setTimeout(r, 20))
    assert.deepEqual(bad, [])
  } finally { process.off('unhandledRejection', onBad); await done() }
})

test('error log redacts secrets and rotates', async () => {
  assert.doesNotMatch(redact('key sk-abcdef1234567890 and Bearer abc.def-ghi and ' + 'A'.repeat(60)), /sk-abc|abc\.def|AAAAAAAA/)
  assert.match(redact('plain message'), /plain message/)
  const home = await mkdtemp(join(tmpdir(), 'suffice-log-'))
  try {
    const log = createErrorLog(home, 1000)
    for (let i = 0; i < 30; i++) await log.write('main', `failure ${i} token=sk-secretsecret12345`)
    const files = (await readdir(join(home, 'desktop', 'logs'))).sort()
    assert.deepEqual(files, ['app.log', 'app.log.1'])
    const all = (await readFile(log.file, 'utf8')) + (await readFile(log.file + '.1', 'utf8'))
    assert.doesNotMatch(all, /secretsecret/)
    assert.match(all, /failure 29/)
    assert.ok((await readFile(log.file, 'utf8')).length <= 1000)
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('host.logError writes to <home>/desktop/logs/app.log', async () => {
  const { host, home, done } = await setup()
  try {
    await host.logError('renderer', new Error('boom Bearer abcdef123456'))
    const text = await readFile(join(home, 'desktop', 'logs', 'app.log'), 'utf8')
    assert.match(text, /renderer.*boom Bearer \[redacted\]/s)
  } finally { await host.dispose(); await done() }
})

test('stress: 20 threads run at once and all finish', async () => {
  let release
  const gate = new Promise(r => (release = r))
  const { host, home, events, done } = await setup({ createSession: gatedSession({ gate }) })
  try {
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => host.run({ threadId: `t${i}`, project: home, ...ARGS })))
    assert.equal(rs.length, 20)
    release()
    await until(() => ended(events).length === 20)
    assert.ok(ended(events).every(([, p]) => p.event.ok))
    assert.equal((await readdir(join(home, 'desktop', 'transcripts'))).filter(f => f.endsWith('.json')).length, 20)
  } finally { await host.dispose(); await done() }
})

test('stress: abort storms (during start, during run, twice)', async () => {
  let release
  const slow = new Promise(r => (release = r))
  const inner = gatedSession()
  const { host, home, events, done } = await setup({ createSession: async (...a) => (await slow, inner(...a)) })
  try {
    const starts = Array.from({ length: 5 }, (_, i) => host.run({ threadId: `s${i}`, project: home, ...ARGS }))
    for (let i = 0; i < 5; i++) { assert.equal(host.abort(`s${i}`), true); assert.equal(host.abort(`s${i}`), true) }
    release()
    assert.ok((await Promise.all(starts)).every(r => r.stopped))
    // during run: twice, then the thread can run again
    await host.run({ threadId: 'r', project: home, ...ARGS })
    assert.equal(host.abort('r'), true)
    host.abort('r')
    await until(() => ended(events).filter(([, p]) => p.threadId === 'r').length === 1)
    assert.equal(host.abort('r'), false)
    assert.equal(host.abort('never-seen'), false)
    await host.run({ threadId: 'r', project: home, ...ARGS })
    host.abort('r')
    await until(() => ended(events).filter(([, p]) => p.threadId === 'r').length === 2)
  } finally { await host.dispose(); await done() }
})

test('stress: 100 rapid updateSettings calls leave the file equal to the final state', async () => {
  const { host, home, done } = await setup()
  try {
    const all = await Promise.all(Array.from({ length: 100 }, (_, i) => host.updateSettings({ notesPrompt: `n${i}`, recentModels: [`m${i}`] })))
    assert.equal(all.length, 100)
    const disk = JSON.parse(await readFile(join(home, 'desktop', 'settings.json'), 'utf8'))
    assert.deepEqual(disk, host.getSettings())
    assert.equal(disk.notesPrompt, 'n99')
    assert.deepEqual((await readdir(join(home, 'desktop'))).filter(f => f.endsWith('.tmp')), [])
  } finally { await host.dispose(); await done() }
})

test('stress: empty, truncated and non-object settings files fall back to defaults', async () => {
  for (const body of ['', '{"theme":"da', 'null', '[]', '"abc"', '42']) {
    const home = await mkdtemp(join(tmpdir(), 'suffice-hard-'))
    try {
      await mkdir(join(home, 'desktop'), { recursive: true })
      await writeFile(join(home, 'desktop', 'settings.json'), body)
      const host = await createHost({ home, runtime: runtime(), openExternal: () => {}, chooseDirectory: async () => home, emit: () => {} })
      const s = host.getSettings()
      assert.equal(s.approval, 'ask', JSON.stringify(body))
      assert.deepEqual(Object.keys(s).sort(), ['approval', 'cheapModel', 'efforts', 'fast', 'mode', 'model', 'project', 'recentModels'], JSON.stringify(body))
      await host.updateSettings({ theme: 'dark' })
      await host.dispose()
    } finally { await rm(home, { recursive: true, force: true }) }
  }
})

test('stress: corrupt, empty, truncated and 5 MB transcripts open without throwing', async () => {
  const { host, home, done } = await setup()
  try {
    const sessions = join(home, 'sessions')
    await mkdir(sessions, { recursive: true })
    const put = async (name, body) => {
      const path = join(sessions, name)
      await writeFile(path, '')
      await writeFile(join(home, 'desktop', 'transcripts', `${hash(path).slice(0, 24)}.json`), body)
      return path
    }
    const big = JSON.stringify({ version: 1, messages: [{ role: 'agent', steps: [{ kind: 'text', text: 'x'.repeat(5 * 1024 * 1024) }] }] })
    for (const [i, body] of ['', '{"version":1,"mess', 'null', '[]', '{"version":2}', big].entries()) {
      const path = await put(`s${i}.jsonl`, body)
      const t = await host.openThread({ threadId: `o${i}`, path })
      assert.ok(Array.isArray(t.messages), `case ${i}`)
      if (body === big) assert.ok(JSON.stringify(t).length > 5 * 1024 * 1024)
    }
    // a 5 MB session file that is garbage
    const garbage = join(sessions, 'garbage.jsonl')
    await writeFile(garbage, 'not json\n'.repeat(600_000))
    assert.ok(Array.isArray((await host.openThread({ threadId: 'g', path: garbage })).messages))
  } finally { await host.dispose(); await done() }
})

test('stress: dispose() with active runs leaves no unhandled rejections or live agents', async () => {
  const bad = []
  const onBad = e => bad.push(e)
  process.on('unhandledRejection', onBad)
  const counts = { disposed: 0, aborted: 0 }
  const inner = gatedSession({ counts })
  let release
  const slow = new Promise(r => (release = r))
  const { host, home, events, done } = await setup({ createSession: async (o, ...a) => (o.cwd.endsWith('slow') ? (await slow, inner(o, ...a)) : inner(o, ...a)) })
  try {
    for (let i = 0; i < 8; i++) await host.run({ threadId: `d${i}`, project: home, ...ARGS })
    const project = join(home, 'slow'); await mkdir(project)
    const starting = host.run({ threadId: 'late', project, ...ARGS }).catch(e => e)
    await host.dispose()
    release()
    assert.match((await starting).message, /closing/)
    await until(() => ended(events).length === 8)
    await new Promise(r => setTimeout(r, 50))
    assert.equal(counts.disposed, 9, 'the agent created during dispose is disposed too')
    await assert.rejects(host.run({ threadId: 'x', project: home, ...ARGS }), /closing/)
    assert.deepEqual(bad, [])
  } finally { process.off('unhandledRejection', onBad); await done() }
})
