import test from 'node:test'
import assert from 'node:assert/strict'
import { describeTool, emptyTranscript, fromSessionMessages, patchLines, reduce, visibleSteps } from '../shared/transcript.mjs'

const fold = events => events.reduce(reduce, emptyTranscript())

test('streams text, thinking and tools into one agent message', () => {
  const t = fold([
    { type: 'user', id: 'u', text: 'fix it', at: 1 },
    { type: 'agent_start', id: 'a', model: 'GPT', effort: 'low', at: 2 },
    { type: 'thinking', delta: 'Look ', at: 3 },
    { type: 'thinking', delta: 'first', at: 4 },
    { type: 'text', delta: 'Reading', at: 5 },
    { type: 'tool', id: 'c', name: 'codemode', input: { code: 'x' }, at: 6 },
    { type: 'tool', id: 'r', parent: 'c', name: 'read', input: { path: 'a.js' }, at: 7 },
    { type: 'tool_result', id: 'r', isError: false, output: 'ok', at: 8 },
    { type: 'text', delta: 'Done', at: 9 },
    { type: 'text', delta: '.', at: 10 },
    { type: 'end', ok: true, at: 11 },
  ])
  const [user, agent] = t.messages
  assert.equal(user.text, 'fix it')
  assert.deepEqual(agent.steps.map(s => s.kind), ['thinking', 'text', 'tool', 'tool', 'text'])
  assert.equal(agent.steps[0].text, 'Look first')
  assert.equal(agent.steps[0].endedAt, 5)
  assert.equal(agent.steps[3].status, 'done')
  assert.equal(agent.steps[2].startedAt, 6, 'tool timers count from the tool event, not from when the row mounts')
  assert.equal(agent.steps.at(-1).text, 'Done.')
  assert.equal(agent.done, true)
  assert.deepEqual(visibleSteps(agent.steps).map(s => s.kind === 'tool' ? s.name : s.kind), ['thinking', 'text', 'read', 'text'])
})

test('a failed run closes running tools and pending approvals', () => {
  const t = fold([
    { type: 'user', id: 'u', text: 'x' },
    { type: 'agent_start', id: 'a', model: 'm', effort: 'low' },
    { type: 'tool', id: 't', name: 'bash', input: { command: 'ls' } },
    { type: 'approval', id: 'p', name: 'edit', input: { path: 'a' } },
    { type: 'end', ok: false, error: 'Stopped.' },
  ])
  const agent = t.messages[1]
  assert.equal(agent.error, 'Stopped.')
  assert.equal(agent.steps[0].status, 'error')
  assert.equal(agent.steps[1].state, 'denied')
})

test('reduce does not mutate its input', () => {
  const a = fold([{ type: 'user', id: 'u', text: 'x' }, { type: 'agent_start', id: 'a', model: 'm', effort: '' }])
  const frozen = JSON.stringify(a)
  reduce(a, { type: 'text', delta: 'hi' })
  assert.equal(JSON.stringify(a), frozen)
})

test('rebuilds a transcript from harness session messages', () => {
  const t = fromSessionMessages([
    { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    { role: 'assistant', model: 'gpt', content: [{ type: 'thinking', thinking: 'hm' }, { type: 'toolCall', id: '1', name: 'read', arguments: { path: 'x' } }] },
    { role: 'toolResult', toolCallId: '1', isError: false, content: [{ type: 'text', text: 'file' }] },
    { role: 'assistant', model: 'gpt', content: [{ type: 'text', text: 'Hi' }] },
  ])
  assert.equal(t.messages.length, 2)
  const agent = t.messages[1]
  assert.deepEqual(agent.steps.map(s => s.kind), ['thinking', 'tool', 'text'])
  assert.equal(agent.steps[1].output, 'file')
  assert.equal(agent.done, true)
})

test('describes tools and parses patches', () => {
  assert.deepEqual(describeTool('bash', { command: 'npm test\nmore' }), { verb: 'Ran', meta: 'npm test' })
  assert.deepEqual(describeTool('read', { path: String.raw`C:\a\b.js`, offset: 10, limit: 5 }), { verb: 'Read', meta: 'C:/a/b.js #L10-15' })
  assert.deepEqual(patchLines('--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n same').map(l => l.t), ['@', '-', '+', ' '])
})

test('fast-race lanes track each attempt and settle on end', () => {
  let t = emptyTranscript()
  for (const e of [
    { type: 'user', id: 'u', text: 'go', at: 1 },
    { type: 'agent_start', id: 'a', model: 'm', effort: 'low', mode: 'fast', at: 1 },
    { type: 'race', attempt: 0, state: 'running', at: 2 },
    { type: 'race', attempt: 1, state: 'running', at: 3 },
    { type: 'race', attempt: 2, state: 'running', at: 3 },
    { type: 'race', attempt: 1, state: 'won', changes: 2, at: 9 },
    { type: 'race', attempt: 0, state: 'lost', at: 10 },
    { type: 'end', ok: true, at: 11 },
  ]) t = reduce(t, e)
  const steps = t.messages[1].steps.filter(s => s.kind === 'race')
  assert.equal(steps.length, 1)
  const [a0, a1, a2] = steps[0].attempts
  assert.deepEqual([a0.state, a1.state, a2.state], ['lost', 'won', 'lost'])
  assert.equal(a1.changes, 2)
  assert.equal(a1.startedAt, 3)
  assert.equal(a1.endedAt, 9)
  assert.equal(a2.endedAt, 11)
})

test('race events after the run ended are ignored', () => {
  const t = fold([
    { type: 'agent_start', id: 'a', model: 'm', effort: 'low', at: 1 },
    { type: 'race', attempt: 0, state: 'running', at: 2 },
    { type: 'end', ok: false, error: 'stopped', at: 3 },
    { type: 'race', attempt: 1, state: 'running', at: 4 },
  ])
  const race = t.messages[0].steps.find(s => s.kind === 'race')
  assert.equal(race.attempts[0].state, 'lost')
  assert.equal(race.attempts[1], undefined)
})
