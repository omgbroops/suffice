// The desktop's side of the harness: sign-in, models, projects, threads and
// runs. No Electron imports, so it can be driven from tests with plain Node.
// Everything the renderer sees comes through `emit(channel, payload)`.

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import {
  createSufficeModelRuntime,
  createSufficeSession,
  hash,
  installationId,
  modelRuntimeOptions,
  parseOptions,
  recentProjects,
  refreshModelCatalog,
  rememberProject,
  resolveProject,
  sufficeEfficientCommand,
  sufficeFastCommand,
} from '@suffice/harness'
import { emptyTranscript, fromSessionMessages, reduce, resultText } from '../../shared/transcript.mjs'
import { readNote, scanNotes } from './notes.mjs'

export const PROVIDER = 'openai'
export const DEFAULT_MODEL = 'gpt-6.1-sol'
export const DEFAULT_CHEAP_MODEL = 'gpt-6-luna'
export const MODES = ['balanced', 'efficient', 'fast']
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']
const APPROVAL = { ask: 'Ask when needed', every: 'Ask before every action', never: 'Never ask' }

/** Effort levels a model accepts, in order. Non-reasoning models only run with effort off. */
export function effortsFor(model) {
  if (!model?.reasoning) return []
  const map = model.thinkingLevelMap
  if (!map) return ['minimal', 'low', 'medium', 'high']
  return LEVELS.filter(level => map[level] !== null)
}

export function describeModel(m) {
  return {
    id: m.id,
    name: m.name ?? m.id,
    contextWindow: m.contextWindow ?? 0,
    cost: { input: m.cost?.input ?? 0, output: m.cost?.output ?? 0, cacheRead: m.cost?.cacheRead ?? 0 },
    efforts: effortsFor(m),
  }
}

/** The effort to run with: the one asked for if the model takes it, else its nearest default. */
export function effectiveEffort(model, wanted) {
  const levels = effortsFor(model)
  if (!levels.length) return 'off'
  if (levels.includes(wanted)) return wanted
  return levels.includes('low') ? 'low' : levels.includes('medium') ? 'medium' : levels[0]
}

/** One spelling per file, so paths from the session list and from a live session compare equal. */
const samePath = path => (path ? resolve(path) : path)

const sessionDir = (home, project) => resolve(home, 'sessions', hash(project).slice(0, 20))

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT' || e instanceof SyntaxError) return fallback
    throw e
  }
}

async function writeJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  await rename(temporary, path)
}

/**
 * @param {{
 *   home?: string,
 *   emit: (channel: string, payload: any) => void,
 *   openExternal: (url: string) => void,
 *   chooseDirectory: () => Promise<string | undefined>,
 *   runtime?: any,
 *   createSession?: typeof createSufficeSession,
 * }} deps
 */
export async function createHost({ home = parseOptions([]).home, emit, openExternal, chooseDirectory, runtime: givenRuntime, createSession = createSufficeSession }) {
  process.env.PI_CODING_AGENT_DIR = home
  const desktopDir = resolve(home, 'desktop')
  const transcriptDir = resolve(desktopDir, 'transcripts')
  await mkdir(transcriptDir, { recursive: true, mode: 0o700 })
  const settingsPath = resolve(desktopDir, 'settings.json')
  let settings = { project: null, model: DEFAULT_MODEL, efforts: {}, fast: {}, approval: 'ask', recentModels: [], mode: 'balanced', cheapModel: DEFAULT_CHEAP_MODEL, ...(await readJson(settingsPath, {})) }
  const saveSettings = () => writeJson(settingsPath, settings)

  const runtime = givenRuntime ?? (await createSufficeModelRuntime(modelRuntimeOptions(home), { onRefresh: () => emit('models:changed', null) }))

  // ---- sign-in -----------------------------------------------------------
  let login = null
  const signedIn = () => runtime.isUsingSubscription(PROVIDER) || runtime.hasConfiguredAuth(PROVIDER)

  async function startLogin() {
    if (login) return { ok: false, error: 'Sign-in is already in progress.' }
    const controller = new AbortController()
    const prompts = new Map()
    login = { controller, prompts }
    const timer = setTimeout(() => controller.abort(), 15 * 60_000)
    try {
      const deviceId = await installationId(home)
      await runtime.login(
        PROVIDER,
        'oauth',
        {
          signal: controller.signal,
          notify(event) {
            if (event.type === 'auth_url') {
              openExternal(event.url)
              emit('auth:event', { type: 'url', url: event.url })
            } else if (event.type === 'progress') emit('auth:event', { type: 'progress', message: event.message })
          },
          prompt(request) {
            const id = randomUUID()
            emit('auth:event', { type: 'prompt', id, message: request?.message ?? 'Paste the sign-in response' })
            return new Promise((resolvePrompt, reject) => {
              prompts.set(id, resolvePrompt)
              controller.signal.addEventListener('abort', () => reject(new Error('Sign-in cancelled')), { once: true })
            })
          },
        },
        { getDeviceId: () => deviceId, agentName: 'Suffice' },
      )
      emit('auth:event', { type: 'done' })
      void refreshModelCatalog(runtime, { force: true, onRefresh: () => emit('models:changed', null) })
      return { ok: true }
    } catch (e) {
      const error = controller.signal.aborted ? 'Sign-in was cancelled.' : e?.message || 'Sign-in did not complete.'
      emit('auth:event', { type: 'error', message: error })
      return { ok: false, error }
    } finally {
      clearTimeout(timer)
      login = null
    }
  }

  // ---- threads and runs ----------------------------------------------------
  /** threadId -> live harness session and its transcript */
  const live = new Map()
  /** approval id -> resolver */
  const approvals = new Map()

  const transcriptPath = path => resolve(transcriptDir, `${hash(path).slice(0, 24)}.json`)

  function push(threadId, event) {
    const thread = live.get(threadId)
    const stamped = { at: Date.now(), ...event }
    if (thread) {
      thread.transcript = reduce(thread.transcript, stamped)
      if (['end', 'approval', 'approval_resolved', 'user'].includes(stamped.type)) void persist(thread)
    }
    emit('thread:event', { threadId, event: stamped })
  }

  async function persist(thread) {
    if (!thread.path) return
    thread.saving = (thread.saving ?? Promise.resolve()).then(() => writeJson(transcriptPath(thread.path), thread.transcript)).catch(() => {})
    return thread.saving
  }

  function observer(threadId) {
    return pi => {
      pi.on('tool_call', e => {
        push(threadId, { type: 'tool', id: e.toolCallId, parent: e.parentToolCallId, name: e.toolName, input: e.input })
      })
      // partial output of a running tool (bash streams it): the latest snapshot at most every 250 ms,
      // trailing, so a command that goes quiet still shows its last lines; dropped once the result lands
      const pending = new Map()
      pi.on('tool_execution_update', e => {
        const output = resultText(e.partialResult?.content)
        if (!output) return
        const p = pending.get(e.toolCallId)
        if (p) return void (p.output = output)
        const entry = { output }
        pending.set(e.toolCallId, entry)
        setTimeout(() => {
          if (pending.get(e.toolCallId) !== entry) return
          pending.delete(e.toolCallId)
          push(threadId, { type: 'tool_update', id: e.toolCallId, output: entry.output })
        }, 250)
      })
      pi.on('tool_result', e => {
        pending.delete(e.toolCallId)
        push(threadId, { type: 'tool_result', id: e.toolCallId, isError: !!e.isError, output: resultText(e.content), patch: typeof e.details?.patch === 'string' ? e.details.patch : undefined })
      })
    }
  }

  function approve(threadId, name, input) {
    // codemode only wraps other tools (each nested call asks for itself), and
    // naming the thread touches nothing outside the app.
    if (name === 'codemode' || name === 'set_session_title') return Promise.resolve(true)
    const id = randomUUID()
    const answered = new Promise(resolveApproval => approvals.set(id, { threadId, resolve: resolveApproval }))
    push(threadId, { type: 'approval', id, name, input })
    return answered
  }

  function answerApproval(id, allow) {
    const pending = approvals.get(id)
    if (!pending) return false
    approvals.delete(id)
    push(pending.threadId, { type: 'approval_resolved', id, allow })
    pending.resolve(!!allow)
    return true
  }

  async function ensureAgent(threadId, { path, project, model, effort, fast }) {
    let thread = live.get(threadId)
    const desktopSettings = { 'approval-mode': APPROVAL[settings.approval] ?? APPROVAL.ask, naming: 'Automatic' }
    if (thread?.agent && thread.project === project && thread.fast === fast) {
      Object.assign(thread.desktopSettings, desktopSettings)
      const m = runtime.getModel(PROVIDER, model)
      if (thread.agent.session.model?.id !== model) await thread.agent.session.setModel(m)
      thread.agent.session.setThinkingLevel(effort)
      return thread
    }
    if (thread?.agent) await thread.agent.dispose().catch(() => {})
    const transcript = thread?.transcript ?? (path ? await openTranscript(path) : emptyTranscript())
    thread = { ...thread, project, fast, path: thread?.path ?? samePath(path), transcript, desktopSettings, running: false }
    live.set(threadId, thread)
    const options = {
      ...parseOptions([]),
      cwd: project,
      home,
      model,
      effort,
      access: 'full',
      ...(fast ? { speed: 'fast' } : {}),
      desktopSettings,
      ...(thread.path ? { sessionManager: SessionManager.open(thread.path, sessionDir(home, project)) } : {}),
      extensions: [observer(threadId)],
      onTitleChanged: title => emit('thread:title', { threadId, title }),
      // The harness's /efficient and /fast commands report through ui.notify.
      extensionBindings: ui => {
        const uiContext = Object.create(ui)
        uiContext.notify = (message, level = 'info') => {
          if (!thread.quiet) push(threadId, { type: 'note', text: String(message), level })
        }
        return { uiContext }
      },
    }
    // Their attempts run in workspace copies as fresh sessions: no naming, and
    // no title changes leaking back into this thread.
    const commandOptions = { ...options, desktopSettings: { ...desktopSettings, naming: 'Manual' }, onTitleChanged: undefined, extensionBindings: undefined, onRace: e => push(threadId, { type: 'race', attempt: e.attempt, state: e.state, changes: e.changes }) }
    options.extensions.push(sufficeFastCommand(commandOptions, runtime), sufficeEfficientCommand(commandOptions, runtime))
    thread.agent = await createSession(options, runtime, { onApproval: (name, input) => approve(threadId, name, input) })
    thread.agent.session.subscribe(e => {
      if (e.type !== 'message_update') return
      const d = e.assistantMessageEvent
      if (d?.type === 'text_delta' && d.delta) push(threadId, { type: 'text', delta: d.delta })
      else if (d?.type === 'thinking_delta' && d.delta) push(threadId, { type: 'thinking', delta: d.delta })
    })
    return thread
  }

  async function run({ threadId, path, project, prompt, model, effort, fast = false, mode = 'balanced', cheapModel = DEFAULT_CHEAP_MODEL }) {
    if (!MODES.includes(mode)) throw new Error(`Unknown mode ${mode}`)
    if (mode === 'efficient' && !runtime.getModel(PROVIDER, cheapModel)) throw new Error(`${cheapModel} is not in the model catalog.`)
    if (!signedIn()) throw new Error('Sign in to start a task.')
    if (!project) throw new Error('Choose a project first.')
    const info = runtime.getModel(PROVIDER, model)
    if (!info) throw new Error(`${model} is not in the model catalog.`)
    const level = effectiveEffort(info, effort)
    const existing = live.get(threadId)
    if (existing?.running) throw new Error('This thread is already running.')
    const thread = await ensureAgent(threadId, { path, project, model, effort: level, fast })
    thread.running = true
    thread.mode = mode
    push(threadId, { type: 'user', id: randomUUID(), text: prompt })
    const cheapInfo = mode === 'efficient' ? runtime.getModel(PROVIDER, cheapModel) : null
    push(threadId, { type: 'agent_start', id: randomUUID(), model: info.name ?? model, effort: level, mode, cheap: cheapInfo?.name })
    if (!thread.path) {
      thread.path = samePath(thread.agent.sessionPath())
      if (thread.path) emit('thread:session', { threadId, path: thread.path })
    }
    void (async () => {
      try {
        if (mode === 'efficient') {
          thread.quiet = true
          try {
            await thread.agent.run(`/efficient cheap ${cheapModel}`)
          } finally {
            thread.quiet = false
          }
          await thread.agent.run(`/efficient ${prompt}`)
        } else if (mode === 'fast') await thread.agent.run(`/fast ${prompt}`)
        else await thread.agent.run(prompt)
        push(threadId, { type: 'end', ok: true, totals: thread.agent.totals })
      } catch (e) {
        const cancelled = /cancelled/.test(e?.message ?? '')
        push(threadId, { type: 'end', ok: false, error: cancelled ? 'Stopped.' : e?.message || 'The run failed.' })
      } finally {
        thread.running = false
        if (!thread.path) {
          thread.path = samePath(thread.agent.sessionPath())
          if (thread.path) emit('thread:session', { threadId, path: thread.path })
        }
        await persist(thread)
        emit('threads:changed', { project })
      }
    })()
    return { threadId, effort: level, mode }
  }

  /** Mid-run input: steer reaches the agent before its next step; queue waits until it finishes. */
  async function guide({ threadId, text, queue = false }) {
    const thread = live.get(threadId)
    const body = String(text ?? '').trim()
    if (!body) throw new Error('Nothing to send.')
    if (!thread?.running) throw new Error('Nothing is running in this thread.')
    // Efficient and Fast runs drive their own attempts; mid-run input would land in the wrong one.
    if (thread.mode && thread.mode !== 'balanced') throw new Error('Guiding works in Balanced mode only.')
    const session = thread.agent.session
    await (queue ? session.followUp(body) : session.steer(body))
    push(threadId, { type: 'note', text: queue ? `Queued: ${body}` : `You: ${body}`, level: 'info' })
    return true
  }

  function abort(threadId) {
    const thread = live.get(threadId)
    if (!thread?.running) return false
    for (const [id, pending] of approvals) if (pending.threadId === threadId) answerApproval(id, false)
    thread.agent.abort()
    return true
  }

  async function openTranscript(path) {
    const saved = await readJson(transcriptPath(path), null)
    if (saved?.version === 1) return saved
    try {
      const manager = SessionManager.open(path)
      return fromSessionMessages(manager.buildSessionContext().messages)
    } catch {
      return emptyTranscript()
    }
  }

  async function listThreads(project) {
    if (!project) return []
    const sessions = await SessionManager.list(project, sessionDir(home, project)).catch(() => [])
    return sessions
      .filter(s => s.messageCount > 0)
      .sort((a, b) => +new Date(b.modified) - +new Date(a.modified))
      .map(s => ({
        path: samePath(s.path),
        title: (s.name || s.firstMessage || 'Untitled').replace(/\s+/g, ' ').trim().slice(0, 120),
        modified: +new Date(s.modified),
        running: [...live.values()].some(t => t.path === samePath(s.path) && t.running),
      }))
  }

  // ---- projects, models, settings -----------------------------------------
  async function setProject(path) {
    const project = await resolveProject(path)
    await rememberProject(home, project)
    settings = { ...settings, project }
    await saveSettings()
    return { project, projects: await recentProjects(home) }
  }

  function models() {
    return runtime
      .getModels(PROVIDER)
      .filter(m => !m.type || m.type === 'chat')
      .map(describeModel)
  }

  async function updateSettings(patch) {
    settings = { ...settings, ...patch }
    for (const t of live.values()) if (t.desktopSettings) t.desktopSettings['approval-mode'] = APPROVAL[settings.approval] ?? APPROVAL.ask
    await saveSettings()
    return settings
  }

  async function dispose() {
    for (const [id] of approvals) answerApproval(id, false)
    await Promise.all([...live.values()].map(async t => {
      t.agent?.abort()
      await t.saving
      await t.agent?.dispose().catch(() => {})
    }))
    live.clear()
  }

  return {
    getSettings: () => settings,
    init: async () => ({ signedIn: signedIn(), home, settings, projects: await recentProjects(home), platform: process.platform }),
    login: startLogin,
    answerLogin: (id, value) => {
      const resolver = login?.prompts.get(id)
      if (!resolver) return false
      login.prompts.delete(id)
      resolver(value)
      return true
    },
    cancelLogin: () => {
      login?.controller.abort()
      return true
    },
    logout: async () => {
      await runtime.logout(PROVIDER)
      return { signedIn: signedIn() }
    },
    models,
    chooseProject: async () => {
      const path = await chooseDirectory()
      return path ? setProject(path) : null
    },
    setProject,
    recentProjects: () => recentProjects(home),
    listThreads,
    // notes are read only from a project the user has opened
    listNotes: async ({ project }) => ((await recentProjects(home)).includes(project) ? scanNotes(project) : []),
    readNote: async ({ project, path }) => {
      if (!(await recentProjects(home)).includes(project)) throw new Error('Open that project first.')
      return readNote(project, path)
    },
    openThread: async ({ threadId, path }) => live.get(threadId)?.transcript ?? (await openTranscript(path)),
    run,
    abort,
    guide,
    answerApproval,
    updateSettings,
    dispose,
  }
}
