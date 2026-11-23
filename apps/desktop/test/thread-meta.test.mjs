import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hash } from '@suffice/harness'
import { createHost } from '../electron/host/host.mjs'
import { parseMeta, buildInput, createTitler, ACTIONS, createThreadMeta, forkClaudeFile, forkSessionFile, openTargets, trashFile } from '../electron/host/thread-meta.mjs'
import { createClaudeEngine } from '../electron/host/claude-engine.mjs'
import { threadAction } from '../electron/host/validate.mjs'


test('parseMeta caps title at 6 words and description at 4 sentences', () => {
  const m = parseMeta('```json\n{"title":"One two three four five six seven eight","description":"A. B. C. D. E. F."}\n```', 'x')
  assert.equal(m.title, 'One two three four five six')
  assert.equal(m.description, 'A. B. C. D.')
})
test('parseMeta rejects the first message verbatim and junk', () => {
  assert.equal(parseMeta('{"title":"Fix the login bug","description":""}', 'fix the login bug.'), null)
  assert.equal(parseMeta('no json', ''), null)
})
test('buildInput keeps user text and final agent text, newest 4k', () => {
  const tr = { messages: [{ role: 'user', text: 'hi' }, { role: 'agent', steps: [{ kind: 'text', text: 'one' }, { kind: 'text', text: 'final' }] }] }
  assert.equal(buildInput(tr), 'User: hi\n\nAssistant: final')
  const big = { messages: [{ role: 'user', text: 'a'.repeat(5000) + 'END' }] }
  const s = buildInput(big)
  assert.equal(s.length, 4000)
  assert.ok(s.endsWith('END'))
})
test('titler debounces: three schedules, one ask, one done', async () => {
  let asks = 0
  const got = []
  const t = createTitler({ ask: async () => (asks++, '{"title":"Login flow","description":"Works."}'), done: (id, m) => got.push([id, m.title]), ms: 20 })
  t.schedule('a', () => 'x'); t.schedule('a', () => 'x'); t.schedule('a', () => 'x')
  await new Promise(r => setTimeout(r, 80))
  assert.equal(asks, 1)
  assert.deepEqual(got, [['a', 'Login flow']])
})
test('engine passes extra folders as --add-dir', async () => {
  let args
  const spawn = (_p, a) => {
    args = a
    const c = new EventEmitter()
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter()
    c.stdin = { writable: true, write() {}, end() {}, on() {} }
    c.kill = () => {}
    setImmediate(() => c.stdout.emit('data', JSON.stringify({ type: 'result', subtype: 'success' }) + '\n'))
    setImmediate(() => setImmediate(() => c.emit('close', 0)))
    return c
  }
  const e = createClaudeEngine({ push() {}, spawn })
  // the engine checks the binary and project exist before spawning: use real ones
  await e.run({ threadId: 't', claudePath: process.execPath, project: tmpdir(), prompt: 'p', model: 'm', approval: 'ask', sessionId: 's', addDirs: ['/b', '/c'] })
  assert.deepEqual(args.slice(args.indexOf('--add-dir'), args.indexOf('--add-dir') + 3), ['--add-dir', '/b', '/c'])
})

const tmp = () => mkdtemp(join(tmpdir(), 'suffice-tm-'))
const exists = p => access(p).then(() => true, () => false)

test('thread meta: set, clear, overlay and serialized concurrent writes', async () => {
  const dir = await tmp()
  try {
    const m = createThreadMeta(join(dir, 'desktop', 'threads.json'))
    await Promise.all(['a', 'b', 'c', 'd'].map((k, i) => m.set(`/p/${k}`, { pinned: true, section: `s${i}` })))
    await m.set('/p/a', { title: 'Mine', unread: true })
    const rows = await createThreadMeta(join(dir, 'desktop', 'threads.json')).overlay([{ path: '/p/a', title: 'Engine' }, { path: '/p/b', title: 'B' }, { path: '/p/z', title: 'Z' }])
    assert.deepEqual(rows[0], { path: '/p/a', title: 'Mine', pinned: true, unread: true, archived: false, section: 's0' })
    assert.equal(rows[1].pinned, true)
    assert.deepEqual(rows[2], { path: '/p/z', title: 'Z' })
    await m.set('/p/a', { pinned: false, unread: false, title: '', section: '' })
    assert.deepEqual(await m.get('/p/a'), {})
    assert.equal(JSON.parse(await readFile(join(dir, 'desktop', 'threads.json'), 'utf8'))['/p/a'], undefined)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('thread meta: fork copies the Claude file and the OpenAI header id', async () => {
  const dir = await tmp()
  try {
    await writeFile(join(dir, 'old.claude.json'), JSON.stringify({ sessionId: 'old', title: 'Plan', cwd: '/x' }))
    const to = await forkClaudeFile(join(dir, 'old.claude.json'), 'new')
    assert.deepEqual(JSON.parse(await readFile(to, 'utf8')), { sessionId: 'new', forkOf: 'old', title: 'Plan (fork)', cwd: '/x' })
    await writeFile(join(dir, 'a.jsonl'), '{"type":"session","id":"old"}\n{"type":"message"}\n')
    const j = await forkSessionFile(join(dir, 'a.jsonl'), 'new')
    const lines = (await readFile(j, 'utf8')).split('\n')
    assert.equal(JSON.parse(lines[0]).id, 'new')
    assert.equal(lines[1], '{"type":"message"}')
    assert.ok(await exists(join(dir, 'a.jsonl')))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('thread meta: trash moves the file and keeps its contents', async () => {
  const dir = await tmp()
  try {
    await writeFile(join(dir, 'x.jsonl'), 'keep me')
    const to = await trashFile(join(dir, 'x.jsonl'), join(dir, 'trash'))
    assert.equal(await exists(join(dir, 'x.jsonl')), false)
    assert.equal(await readFile(to, 'utf8'), 'keep me')
    assert.equal((await readdir(join(dir, 'trash'))).length, 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('thread meta: threadAction validates the verb, path and value', () => {
  const ok = { path: '/a', project: '/p' }
  assert.deepEqual(threadAction({ ...ok, action: 'rename', value: '  New  ' }, ACTIONS), { ...ok, action: 'rename', value: 'New' })
  assert.equal(threadAction({ ...ok, action: 'section', value: '' }, ACTIONS).value, '')
  for (const bad of [{ action: 'nuke' }, { action: 'rename', value: '   ' }, { action: 'rename', value: 'x'.repeat(121) }, { action: 'pin', value: 'yes' }, { action: 'archive' }, { action: 'section', value: 5 }, { action: 'fork', path: '' }, { action: 'fork', project: undefined }])
    assert.throws(() => threadAction({ ...ok, ...bad }, ACTIONS), /Invalid/, JSON.stringify(bad))
  assert.throws(() => threadAction(null, ACTIONS), /Invalid/)
})

test('thread meta: open targets list only installed apps', () => {
  assert.deepEqual(openTargets('linux', () => true), [{ id: 'finder', label: 'File manager' }])
  const t = openTargets('darwin', p => p === '/Applications/Cursor.app')
  assert.deepEqual(t.map(x => x.id), ['finder', 'cursor'])
})

const MODELS = [{ id: 'm', name: 'M', reasoning: false, contextWindow: 1, cost: {} }]
async function hostSetup(extra = {}) {
  const home = await tmp()
  const calls = []
  const host = await createHost({ engine: 'claude', home, runtime: { isUsingSubscription: () => true, hasConfiguredAuth: () => true, getModels: () => MODELS, getModel: () => MODELS[0], logout: async () => {} }, createSession: async () => { throw new Error('no model runs') }, openExternal: () => {}, chooseDirectory: async () => home, emit: () => {}, openPath: async d => calls.push(['path', d]), openApp: async (a, d) => calls.push(['app', a, d]), exists: p => p === '/Applications/Cursor.app', ...extra })
  await mkdir(join(home, 'proj'))
  const { project } = await host.setProject(join(home, 'proj'))
  const dir = join(home, 'sessions', hash(project).slice(0, 20))
  await mkdir(dir, { recursive: true })
  return { host, home, project, dir, calls, done: async () => { await host.dispose(); await rm(home, { recursive: true, force: true }) } }
}

test('host threadAct: pin, rename, fork, delete-to-trash; outside paths rejected', async () => {
  const { host, home, project, dir, done } = await hostSetup()
  try {
    const file = join(dir, 'abc.claude.json')
    await writeFile(file, JSON.stringify({ sessionId: 'abc', title: 'Orig' }))
    const a = (action, value, path = file) => host.threadAct({ action, path, project, value })
    await assert.rejects(a('pin', true, '/etc/passwd'), /not in this project/)
    await assert.rejects(a('pin', 'yes'), /Invalid/)
    await a('pin', true)
    await a('rename', 'Hello')
    const row = (await host.listThreads(project)).find(r => r.path === file)
    assert.equal(row.pinned, true)
    assert.equal(row.title, 'Hello')
    const { path: forked } = await a('fork')
    assert.notEqual(forked, file)
    assert.ok(await exists(forked))
    await a('delete')
    assert.equal(await exists(file), false)
    assert.equal((await readdir(join(home, 'desktop', 'trash'))).length, 1)
  } finally { await done() }
})

test('host openIn: only known targets on known projects', async () => {
  const { host, project, calls, done } = await hostSetup()
  try {
    await host.openIn({ project, target: 'finder' })
    await assert.rejects(host.openIn({ project: '/nope', target: 'finder' }), /Cannot open/)
    await assert.rejects(host.openIn({ project, target: 'rm -rf' }), /Cannot open/)
    if (process.platform === 'darwin') { await host.openIn({ project, target: 'cursor' }); assert.deepEqual(calls.at(-1), ['app', 'Cursor', project]) }
    assert.deepEqual(calls[0], ['path', project])
  } finally { await done() }
})

// A fake `claude` for the title call: `auth` says signed in, `-p` answers with a title JSON.
const TITLE_CLAUDE = `#!/usr/bin/env node
if (process.argv[2] === 'auth') { console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' })); process.exit(0) }
process.stdin.resume()
process.stdin.on('end', () => { console.log(JSON.stringify({ result: JSON.stringify({ title: 'Slugify helper with tests', description: 'Adds slugify and three tests.' }) })) })
`

test('host: opening a saved Claude thread with no title asks for one once, then writes meta and transcript', async () => {
  const home = await mkdtemp(join(tmpdir(), 'suffice-retitle-'))
  const project = await mkdtemp(join(tmpdir(), 'suffice-retitle-proj-'))
  try {
    const bin = join(home, 'claude')
    await writeFile(bin, TITLE_CLAUDE)
    await chmod(bin, 0o755)
    const changed = []
    const host = await createHost({ engine: 'claude', home, claudePath: bin, openExternal: () => {}, chooseDirectory: async () => project, emit: (c, p) => c === 'threads:changed' && changed.push(p) })
    const dir = join(home, 'sessions', hash(project).slice(0, 20))
    await mkdir(dir, { recursive: true })
    const meta = join(dir, 'abc.claude.json')
    await writeFile(meta, JSON.stringify({ sessionId: 'abc', project }))
    const tdir = join(home, 'desktop', 'transcripts')
    await mkdir(tdir, { recursive: true })
    const transcript = { version: 1, messages: [{ role: 'user', text: 'add slugify with tests' }, { role: 'agent', steps: [{ kind: 'text', text: 'Done, 3 asserts pass.' }] }] }
    await writeFile(join(tdir, `${hash(meta).slice(0, 24)}.json`), JSON.stringify(transcript))
    await host.openThread({ threadId: 'x', path: meta, project })
    await host.openThread({ threadId: 'y', path: meta, project }) // a second open while waiting adds no second ask
    await new Promise(r => setTimeout(r, 2600))
    const saved = JSON.parse(await readFile(meta, 'utf8'))
    assert.equal(saved.title, 'Slugify helper with tests')
    assert.equal(saved.sessionId, 'abc')
    const tr = JSON.parse(await readFile(join(tdir, `${hash(meta).slice(0, 24)}.json`), 'utf8'))
    assert.equal(tr.title, 'Slugify helper with tests')
    assert.equal(changed.length, 1)
    await host.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(project, { recursive: true, force: true })
  }
})
