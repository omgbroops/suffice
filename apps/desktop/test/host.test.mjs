import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
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

/** Attempt sessions edit a file in their copy; the main session only records history. */
function strategySessions(log, { edit = () => true } = {}) {
  return async (options, _runtime, hooks = {}) => {
    const subscribers = []
    let aborted = false
    const send = []
    options.extensions[0]({ on: (name, fn) => send.push([name, fn]) })
    const fire = (name, e) => send.filter(([n]) => n === name).forEach(([, fn]) => fn(e))
    const isAttempt = !hooks.onApproval
    return {
      session: {
        model: MODELS[0],
        setModel: async () => {},
        setThinkingLevel: () => {},
        subscribe: fn => subscribers.push(fn),
        sessionManager: { appendMessage: m => log.push(['history', m.role]), appendCustomMessageEntry: (type, text) => log.push(['history', type, text]) },
      },
      totals: {},
      sessionPath: () => join(options.home, 's.jsonl'),
      abort: () => (aborted = true),
      dispose: async () => {},
      async run(task) {
        if (!isAttempt) throw new Error('the main session should not run a strategy turn')
        log.push(['attempt', options.model, options.effort, options.desktopSettings['approval-mode']])
        fire('tool_call', { toolCallId: 'e', toolName: 'edit', input: { path: 'a.txt' } })
        await new Promise(r => setTimeout(r, 5))
        if (aborted) throw new Error('Task stopped: cancelled')
        if (edit(options, task)) await writeFile(join(options.cwd, 'a.txt'), 'changed')
        fire('tool_result', { toolCallId: 'e', isError: false, content: [] })
        subscribers.forEach(fn => fn({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'report' } }))
        return 'All done.'
      },
    }
  }
}

async function strategyHost(createSession, approve = true) {
  const home = await mkdtemp(join(tmpdir(), 'suffice-desktop-'))
  const project = join(home, 'project')
  await mkdir(project)
  await writeFile(join(project, 'a.txt'), 'original')
  const events = []
  const ended = {}
  const host = await createHost({
    home,
    runtime: fakeRuntime(),
    createSession,
    openExternal: () => {},
    chooseDirectory: async () => home,
    emit: (c, p) => {
      if (c !== 'thread:event') return
      events.push(p.event)
      if (p.event.type === 'approval') host.answerApproval(p.event.id, approve)
      if (p.event.type === 'end') ended[p.threadId]?.(p.event)
    },
  })
  const runTo = async args => {
    const end = new Promise(r => (ended[args.threadId] = r))
    await host.run({ project, model: 'gpt-6.1-sol', effort: 'high', ...args })
    return end
  }
  return { home, project, events, host, runTo }
}

test('fast races three attempts and applies the winner after approval', async () => {
  const log = []
  const { home, project, events, host, runTo } = await strategyHost(strategySessions(log))
  try {
    const end = await runTo({ threadId: 'f', prompt: 'change a', mode: 'fast' })
    assert.equal(end.ok, true)
    assert.equal(await readFile(join(project, 'a.txt'), 'utf8'), 'changed')
    const starts = events.filter(e => e.type === 'attempt_start')
    assert.deepEqual(starts.map(e => e.aid), ['a1', 'a2', 'a3'])
    assert.ok(log.filter(l => l[0] === 'attempt').every(l => l[2] === 'low' && l[3] === 'Never ask'))
    const statuses = events.filter(e => e.type === 'attempt_end').map(e => e.status)
    assert.equal(statuses.filter(s => s === 'won').length, 1)
    assert.ok(events.some(e => e.type === 'attempt' && e.event.type === 'tool'))
    assert.equal(events.find(e => e.type === 'approval').name, 'apply_changes')
    assert.deepEqual(events.find(e => e.type === 'attempts_result'), { ...events.find(e => e.type === 'attempts_result'), applied: true, files: ['a.txt'] })
    assert.ok(log.some(l => l[1] === 'desktop-strategy' && /fast mode/.test(l[2])))
    await host.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('efficient escalates to the lead model only when the cheap one makes no changes', async () => {
  const log = []
  const { home, project, events, host, runTo } = await strategyHost(strategySessions(log, { edit: o => o.model === 'gpt-6.1-sol' }), false)
  try {
    const end = await runTo({ threadId: 'e', prompt: 'change a', mode: 'efficient', cheapModel: 'gpt-6-luna' })
    assert.equal(end.ok, true)
    assert.deepEqual(log.filter(l => l[0] === 'attempt').map(l => l[1]), ['gpt-6-luna', 'gpt-6-luna', 'gpt-6.1-sol'])
    assert.deepEqual(events.filter(e => e.type === 'attempt_end').map(e => e.status), ['empty', 'empty', 'won'])
    // Approval was refused, so the project is untouched.
    assert.equal(await readFile(join(project, 'a.txt'), 'utf8'), 'original')
    assert.equal(events.find(e => e.type === 'attempts_result').applied, false)
    await assert.rejects(host.run({ threadId: 'g', project, prompt: 'x', model: 'gpt-6.1-sol', effort: 'low', mode: 'efficient', cheapModel: 'nope' }), /not in the model catalog/)
    await host.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('attempt copies of a git project leave ignored folders behind but keep loose ignored files', async () => {
  const log = []
  const seen = []
  const sessions = strategySessions(log, {
    edit: o => {
      seen.push({ build: existsSync(join(o.cwd, 'build')), env: existsSync(join(o.cwd, '.env')), git: existsSync(join(o.cwd, '.git')) })
      return true
    },
  })
  const { home, project, host, runTo } = await strategyHost(sessions)
  try {
    execFileSync('git', ['init', '-q'], { cwd: project })
    await writeFile(join(project, '.gitignore'), 'build/\n.env\n')
    await mkdir(join(project, 'build'))
    await writeFile(join(project, 'build', 'out.bin'), 'x')
    await writeFile(join(project, '.env'), 'KEY=1')
    const end = await runTo({ threadId: 'g', prompt: 'change a', mode: 'efficient', cheapModel: 'gpt-6-luna' })
    assert.equal(end.ok, true)
    assert.deepEqual(seen[0], { build: false, env: true, git: false })
    assert.equal(await readFile(join(project, 'a.txt'), 'utf8'), 'changed')
    assert.ok(existsSync(join(project, 'build', 'out.bin')))
    await host.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('preferences carry over from the old desktop app and reach new sessions', async () => {
  const home = await mkdtemp(join(tmpdir(), 'suffice-desktop-'))
  try {
    await writeFile(join(home, 'desktop-settings.json'), JSON.stringify({ mode: 'Light', 'disabled-models': ['openai|gpt-4o'], naming: 'Untitled', 'compact-at': '90%', bogus: 1 }))
    const seen = []
    const titles = []
    const createSession = async options => {
      seen.push(options)
      return {
        session: { model: MODELS[0], setModel: async () => {}, setThinkingLevel: () => {}, subscribe: () => {}, setSessionName: () => {} },
        totals: {},
        sessionPath: () => join(home, 's.jsonl'),
        abort: () => {},
        dispose: async () => {},
        run: async () => 'ok',
      }
    }
    let done
    const ended = new Promise(r => (done = r))
    const host = await createHost({ home, runtime: fakeRuntime(), createSession, openExternal: () => {}, chooseDirectory: async () => home, emit: (c, p) => (c === 'thread:title' && titles.push(p.title), c === 'threads:changed' && done()) })
    const { settings } = await host.init()
    assert.equal(settings.prefs.theme, 'Light')
    assert.deepEqual(settings.prefs['disabled-models'], ['gpt-4o'])
    assert.equal(settings.prefs.bogus, undefined)
    await host.updateSettings({ prefs: { ...settings.prefs, 'allow-network': false } })
    await host.run({ threadId: 'p', project: home, prompt: 'hello there', model: 'gpt-6.1-sol', effort: 'low' })
    await ended
    assert.equal(seen[0].desktopSettings.naming, 'Manual')
    assert.equal(seen[0].desktopSettings['compact-at'], '90%')
    assert.equal(seen[0].browser, false)
    assert.deepEqual(titles, ['Untitled thread'])
    await host.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
