import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { parseMeta, buildInput, createTitler } from '../electron/host/thread-meta.mjs'
import { createClaudeEngine } from '../electron/host/claude-engine.mjs'

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
  await e.run({ threadId: 't', claudePath: 'claude', project: '/a', prompt: 'p', model: 'm', approval: 'ask', sessionId: 's', addDirs: ['/b', '/c'] })
  assert.deepEqual(args.slice(args.indexOf('--add-dir'), args.indexOf('--add-dir') + 3), ['--add-dir', '/b', '/c'])
})
