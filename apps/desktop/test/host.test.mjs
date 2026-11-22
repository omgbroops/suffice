import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHost, effectiveEffort, effortsFor } from '../electron/host/host.mjs'

const MODELS = [
  { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', reasoning: true, contextWindow: 272000, cost: { input: 2, output: 10, cacheRead: 0.1 }, thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' } },
  { id: 'gpt-4o', name: 'GPT-4o', reasoning: false, contextWindow: 128000, cost: { input: 2.5, output: 10 } },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna', reasoning: true, contextWindow: 272000, cost: { input: 0.1, output: 0.5 } },
]

function fakeRuntime() {
  return {
    isUsingSubscription: () => true,
    hasConfiguredAuth: () => true,
    getModels: () => MODELS,
    getModel: (_p, id) => MODELS.find(m => m.id === id),
    logout: async () => {},
  }
}

/** A harness session that streams a little text, asks once, runs one nested tool and finishes. */
function fakeCreateSession(calls) {
  return async (options, _runtime, { onApproval }) => {
    const handlers = {}
    options.extensions[0]({ on: (name, fn) => (handlers[name] = fn) })
    const subscribers = []
    let aborted = false
    const agent = {
      session: { model: MODELS[0], setModel: async m => calls.push(['setModel', m.id]), setThinkingLevel: l => calls.push(['effort', l]), subscribe: fn => subscribers.push(fn) },
      totals: { modelCalls: 1 },
      sessionPath: () => join(options.home, 'sessions', 'fake.jsonl'),
      abort: () => (aborted = true),
      dispose: async () => calls.push(['dispose']),
      async run(prompt) {
        calls.push(['run', prompt, options.effort, options.desktopSettings['approval-mode']])
        const delta = d => subscribers.forEach(fn => fn({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: d } }))
        delta('Working ')
        if (!(await onApproval('bash', { command: 'npm test' }))) throw new Error('denied')
        handlers.tool_call({ toolCallId: 'c1', toolName: 'codemode', input: { code: '1' } })
        handlers.tool_call({ toolCallId: 't1', parentToolCallId: 'c1', toolName: 'bash', input: { command: 'npm test' } })
        handlers.tool_result({ toolCallId: 't1', isError: false, content: [{ type: 'text', text: 'pass' }] })
        if (aborted) throw new Error('Task stopped: cancelled')
        delta('done')
      },
    }
    return agent
  }
}

test('effort levels follow the model', () => {
  assert.deepEqual(effortsFor(MODELS[0]), ['low', 'medium', 'high', 'xhigh'])
  assert.deepEqual(effortsFor(MODELS[1]), [])
  assert.equal(effectiveEffort(MODELS[0], 'medium'), 'medium')
  assert.equal(effectiveEffort(MODELS[0], 'off'), 'low')
  assert.equal(effectiveEffort(MODELS[1], 'high'), 'off')
})

test('a run streams events, waits for approval and saves its transcript', async () => {
  const home = await mkdtemp(join(tmpdir(), 'suffice-desktop-'))
  try {
    const events = []
    const calls = []
    let done
    const finished = new Promise(r => (done = r))
    const host = await createHost({
      home,
      runtime: fakeRuntime(),
      createSession: fakeCreateSession(calls),
      openExternal: () => {},
      chooseDirectory: async () => home,
      emit: (channel, payload) => {
        events.push([channel, payload])
        if (channel === 'thread:event' && payload.event.type === 'approval') host.answerApproval(payload.event.id, true)
        if (channel === 'threads:changed') done()
      },
    })
    const info = await host.init()
    assert.equal(info.signedIn, true)
    assert.equal(host.models().length, 3)
    await host.updateSettings({ approval: 'never' })
    const r = await host.run({ threadId: 't', project: home, prompt: 'test it', model: 'gpt-6.1-sol', effort: 'off', fast: false })
    assert.equal(r.effort, 'low')
    await finished
    const types = events.filter(([c]) => c === 'thread:event').map(([, p]) => p.event.type)
    assert.deepEqual(types, ['user', 'agent_start', 'text', 'approval', 'approval_resolved', 'tool', 'tool', 'tool_result', 'text', 'end'])
    assert.ok(events.some(([c, p]) => c === 'thread:session' && p.path.endsWith('fake.jsonl')))
    assert.deepEqual(calls[0], ['run', 'test it', 'low', 'Never ask'])
    const files = await readdir(join(home, 'desktop', 'transcripts'))
    assert.equal(files.length, 1)
    const saved = JSON.parse(await readFile(join(home, 'desktop', 'transcripts', files[0]), 'utf8'))
    const agent = saved.messages[1]
    assert.equal(agent.done, true)
    assert.equal(agent.steps.at(-1).text, 'done')
    assert.equal(agent.steps.find(s => s.kind === 'approval').state, 'allowed')
    const reopened = await host.openThread({ threadId: 'other', path: join(home, 'sessions', 'fake.jsonl') })
    assert.equal(reopened.messages.length, 2)
    await host.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('guide steers or queues a running thread and refuses otherwise', async () => {
  const home = await mkdtemp(join(tmpdir(), 'suffice-desktop-'))
  try {
    const sent = []
    let release
    const gate = new Promise(r => (release = r))
    const createSession = async () => ({
      session: { model: MODELS[0], setModel: async () => {}, setThinkingLevel: () => {}, subscribe: () => {}, steer: async t => sent.push(['steer', t]), followUp: async t => sent.push(['followUp', t]) },
      totals: {},
      sessionPath: () => join(home, 'g.jsonl'),
      abort: () => {},
      dispose: async () => {},
      run: () => gate,
    })
    const notes = []
    const host = await createHost({ home, runtime: fakeRuntime(), createSession, openExternal: () => {}, chooseDirectory: async () => home, emit: (c, p) => c === 'thread:event' && p.event.type === 'note' && notes.push(p.event.text) })
    await assert.rejects(host.guide({ threadId: 'g', text: 'x' }), /Nothing is running/)
    await host.run({ threadId: 'g', project: home, prompt: 'go', model: 'gpt-6.1-sol', effort: 'low' })
    await host.guide({ threadId: 'g', text: ' use the fake clock ' })
    await host.guide({ threadId: 'g', text: 'then update docs', queue: true })
    await assert.rejects(host.guide({ threadId: 'g', text: '  ' }), /Nothing to send/)
    assert.deepEqual(sent, [['steer', 'use the fake clock'], ['followUp', 'then update docs']])
    assert.deepEqual(notes, ['You: use the fake clock', 'Queued: then update docs'])
    await host.run({ threadId: 'f', project: home, prompt: 'go', model: 'gpt-6.1-sol', effort: 'low', mode: 'fast' })
    await assert.rejects(host.guide({ threadId: 'f', text: 'x' }), /Balanced mode only/)
    release()
    await new Promise(r => setTimeout(r, 50)) // both runs end and save before cleanup
    await host.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('runs refuse without a project or with an unknown model', async () => {
  const home = await mkdtemp(join(tmpdir(), 'suffice-desktop-'))
  try {
    const host = await createHost({ home, runtime: fakeRuntime(), createSession: fakeCreateSession([]), openExternal: () => {}, chooseDirectory: async () => undefined, emit: () => {} })
    await assert.rejects(host.run({ threadId: 'a', project: null, prompt: 'x', model: 'gpt-6.1-sol', effort: 'low' }), /Choose a project/)
    await assert.rejects(host.run({ threadId: 'a', project: home, prompt: 'x', model: 'nope', effort: 'low' }), /not in the model catalog/)
    assert.equal(await host.chooseProject(), null)
    await host.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('efficient and fast runs go through the harness commands', async () => {
  const home = await mkdtemp(join(tmpdir(), 'suffice-desktop-'))
  try {
    const prompts = []
    const ends = []
    const createSession = async options => {
      assert.equal(options.extensions.length, 3)
      return {
        session: { model: MODELS[0], setModel: async () => {}, setThinkingLevel: () => {}, subscribe: () => {} },
        totals: {},
        sessionPath: () => join(home, 's.jsonl'),
        abort: () => {},
        dispose: async () => {},
        run: async prompt => prompts.push(prompt),
      }
    }
    const host = await createHost({ home, runtime: fakeRuntime(), createSession, openExternal: () => {}, chooseDirectory: async () => home, emit: (c, p) => c === 'thread:event' && p.event.type === 'end' && ends.push(p.event) })
    await host.run({ threadId: 'e', project: home, prompt: 'fix it', model: 'gpt-6.1-sol', effort: 'low', mode: 'efficient', cheapModel: 'gpt-6-luna' })
    await host.run({ threadId: 'f', project: home, prompt: 'go', model: 'gpt-6.1-sol', effort: 'low', mode: 'fast' })
    await new Promise(r => setTimeout(r, 50))
    assert.equal(prompts.length, 3)
    assert.ok(prompts.includes('/efficient fix it') && prompts.includes('/fast go') && prompts.indexOf('/efficient cheap gpt-6-luna') < prompts.indexOf('/efficient fix it'))
    assert.equal(ends.length, 2)
    await assert.rejects(host.run({ threadId: 'g', project: home, prompt: 'x', model: 'gpt-6.1-sol', effort: 'low', mode: 'efficient', cheapModel: 'nope' }), /not in the model catalog/)
    await host.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
