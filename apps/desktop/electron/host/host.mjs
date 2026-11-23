// The desktop's side of the harness: sign-in, models, projects, threads and
// runs. No Electron imports, so it can be driven from tests with plain Node.
// Everything the renderer sees comes through `emit(channel, payload)`.

import { mkdir, readFile, readdir, stat, writeFile, rename } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
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
import { suggestName } from './project-name.mjs'
import { createErrorLog } from './errorlog.mjs'
import { CLAUDE_EFFORTS, CLAUDE_MODELS, INSTALL_HINT, LOGIN_HINT, authStatus, childEnv, createClaudeEngine, findClaude } from './claude-engine.mjs'
import { DEFAULTS, createAccounts } from './accounts.mjs'
import { bool, cleanSettingsPatch, object, oneOf, sessionPath, str } from './validate.mjs'

export const PROVIDER = 'openai'

export const DEFAULT_MODEL = 'gpt-6.1-sol'
export const DEFAULT_CHEAP_MODEL = 'gpt-6-luna'
export const MODES = ['balanced', 'efficient', 'fast']
// the Claude engine drives one agent loop; the other modes need the OpenAI engine's own attempts
const modesFor = engine => (engine === 'claude' ? ['balanced'] : MODES)
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

/**
 * Partial output of running tools (bash streams it): forwards the latest snapshot per tool at most
 * every `delay` ms, trailing, so a command that goes quiet still shows its last lines; done() drops
 * anything pending once the result lands.
 */
export function updateForwarder(send, delay = 250) {
  const pending = new Map()
  return {
    update(id, output) {
      if (!output) return
      const p = pending.get(id)
      if (p) return void (p.output = output)
      const entry = { output }
      pending.set(id, entry)
      setTimeout(() => {
        if (pending.get(id) !== entry) return
        pending.delete(id)
        send({ id, output: entry.output })
      }, delay)
    },
    done: id => void pending.delete(id),
  }
}

// a settings file holding a string, array or null must not be spread into the settings
const plain = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return fallback
    // a corrupt file is kept aside, never overwritten by the next save
    if (e instanceof SyntaxError) return rename(path, `${path}.corrupt-${Date.now()}`).then(() => fallback, () => fallback)
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
 *   engine?: 'claude' | 'openai',
 *   claudePath?: string,
 *   claudeSpawn?: typeof import('node:child_process').spawn,
 * }} deps
 */
export async function createHost({ home = parseOptions([]).home, emit, openExternal, chooseDirectory, runtime: givenRuntime, createSession = createSufficeSession, engine: givenEngine, claudePath: givenClaudePath, claudeSpawn, accounts: givenAccounts, safeStorage }) {
  process.env.PI_CODING_AGENT_DIR = home
  const desktopDir = resolve(home, 'desktop')
  const accounts = givenAccounts ?? (safeStorage ? createAccounts({ desktopDir, safeStorage }) : null)
  const need = () => accounts ?? (() => { throw new Error('Accounts are not available.') })()
  const transcriptDir = resolve(desktopDir, 'transcripts')
  await mkdir(transcriptDir, { recursive: true, mode: 0o700 })
  const settingsPath = resolve(desktopDir, 'settings.json')
  const savedSettings = plain(await readJson(settingsPath, {}))
  let settings = { project: null, model: DEFAULT_MODEL, efforts: {}, fast: {}, approval: 'ask', recentModels: [], mode: 'balanced', cheapModel: DEFAULT_CHEAP_MODEL, engine: 'claude', ...savedSettings }
  if (givenEngine) settings.engine = givenEngine
  // the model must be one the active engine offers: a Claude engine never shows a GPT default, nor the reverse
  const CLAUDE_DEFAULT = 'claude-opus-5-5'
  const fixModel = () => {
    if (settings.engine === 'openai') { if (CLAUDE_MODELS.some(m => m.id === settings.model)) settings.model = DEFAULT_MODEL }
    else if (!CLAUDE_MODELS.some(m => m.id === settings.model)) settings.model = CLAUDE_DEFAULT
  }
  fixModel()
  let accountRows = null
  let firstRunDone = false
  const isClaude = () => settings.engine !== 'openai'
  // writes run one after another, each with the settings as they are then, so an older snapshot never lands last
  let settingsWrite = Promise.resolve()
  const saveSettings = () => (settingsWrite = settingsWrite.catch(() => {}).then(() => writeJson(settingsPath, settings)))
  // threads between "run asked" and "agent running": a second start is refused, a stop is kept for when it is ready
  const starting = new Map()
  const errorLog = createErrorLog(home)
  let disposed = false

  // the pi runtime is only built for the OpenAI engine
  let runtime = givenRuntime ?? null
  const ensureRuntime = async () => (runtime ??= await createSufficeModelRuntime(modelRuntimeOptions(home), { onRefresh: () => emit('models:changed', null) }))
  if (!isClaude()) await ensureRuntime()
  // claudePath comes from the settings file or the host, never from the renderer (cleanSettingsPatch drops it)
  const claudePath = () => givenClaudePath ?? settings.claudePath ?? findClaude()
  const claudeEngine = createClaudeEngine({ push: (id, e) => push(id, e), spawn: claudeSpawn })

  // ---- sign-in -----------------------------------------------------------
  let login = null
  const signedIn = () => !!runtime && (runtime.isUsingSubscription(PROVIDER) || runtime.hasConfiguredAuth(PROVIDER))

  async function startLogin() {
    if (login) return { ok: false, error: 'Sign-in is already in progress.' }
    const controller = new AbortController()
    const prompts = new Map()
    const cleanups = new Set() // abort listeners of prompts still waiting
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
              const onAbort = () => reject(new Error('Sign-in cancelled'))
              const cleanup = () => controller.signal.removeEventListener('abort', onAbort)
              cleanups.add(cleanup)
              prompts.set(id, value => (cleanup(), cleanups.delete(cleanup), resolvePrompt(value)))
              controller.signal.addEventListener('abort', onAbort, { once: true })
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
      for (const cleanup of cleanups) cleanup()
      login = null
    }
  }

  // ---- threads and runs ----------------------------------------------------
  /** threadId -> live harness session and its transcript */
  const live = new Map()
  /** approval id -> resolver */
  const approvals = new Map()

  const knownPaths = () => [...live.values()].map(t => t.path).filter(Boolean)
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
    thread.saving = (thread.saving ?? Promise.resolve()).then(() => writeJson(transcriptPath(thread.path), thread.transcript)).catch(e => console.error('[suffice] transcript save failed', thread.path, e))
    return thread.saving
  }

  function observer(threadId) {
    return pi => {
      pi.on('tool_call', e => {
        push(threadId, { type: 'tool', id: e.toolCallId, parent: e.parentToolCallId, name: e.toolName, input: e.input })
      })
      const updates = updateForwarder(u => push(threadId, { type: 'tool_update', ...u }))
      pi.on('tool_execution_update', e => updates.update(e.toolCallId, resultText(e.partialResult?.content)))
      pi.on('tool_result', e => {
        updates.done(e.toolCallId)
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
    str(id, 'approval'); bool(allow, 'answer')
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
    const agent = await createSession(options, runtime, { onApproval: (name, input) => approve(threadId, name, input) })
    if (disposed) {
      await agent.dispose().catch(() => {}) // app closed while the agent was being created
      live.delete(threadId)
      throw new Error('The app is closing.')
    }
    thread.agent = agent
    thread.agent.session.subscribe(e => {
      if (e.type !== 'message_update') return
      const d = e.assistantMessageEvent
      if (d?.type === 'text_delta' && d.delta) push(threadId, { type: 'text', delta: d.delta })
      else if (d?.type === 'thinking_delta' && d.delta) push(threadId, { type: 'thinking', delta: d.delta })
    })
    return thread
  }

  async function run(args) {
    let { threadId, path, project, prompt, model, effort, fast = false, mode = 'balanced', cheapModel = DEFAULT_CHEAP_MODEL } = object(args, 'run')
    str(threadId, 'thread'); str(prompt, 'prompt'); str(model, 'model'); str(cheapModel, 'model'); bool(fast, 'fast')
    if (effort !== undefined && typeof effort !== 'string') throw new Error('Invalid effort.')
    if (project !== null && project !== undefined) str(project, 'project')
    oneOf(mode, MODES, 'mode')
    if (disposed) throw new Error('The app is closing.')
    if (isClaude()) return runClaude({ threadId, path, project, prompt, model: CLAUDE_MODELS.some(m => m.id === model) ? model : settings.model, effort, mode })
    if (mode === 'efficient' && !runtime.getModel(PROVIDER, cheapModel)) throw new Error(`${cheapModel} is not in the model catalog.`)
    if (!signedIn()) throw new Error('Sign in to start a task.')
    if (!project) throw new Error('Choose a project first.')
    const info = runtime.getModel(PROVIDER, model)
    if (!info) throw new Error(`${model} is not in the model catalog.`)
    if (path !== undefined && path !== null) path = sessionPath(path, [sessionDir(home, project)], knownPaths())
    else path = undefined
    const level = effectiveEffort(info, effort)
    const existing = live.get(threadId)
    if (existing?.running || starting.has(threadId)) throw new Error('This thread is already running.')
    starting.set(threadId, { stop: false }) // set before any await, so a double submit is refused
    let thread, stopped
    try {
      thread = await ensureAgent(threadId, { path, project, model, effort: level, fast })
    } finally {
      stopped = starting.get(threadId)?.stop
      starting.delete(threadId)
    }
    if (stopped) {
      push(threadId, { type: 'end', ok: false, error: 'Stopped.' })
      return { threadId, effort: level, mode, stopped: true }
    }
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

  async function runClaude({ threadId, path, project, prompt, model, effort, mode }) {
    if (!modesFor('claude').includes(mode)) throw new Error('Needs the OpenAI engine.')
    if (!project) throw new Error('Choose a project first.')
    const info = CLAUDE_MODELS.find(m => m.id === model)
    if (!info) throw new Error(`${model} is not a Claude model.`)
    const level = CLAUDE_EFFORTS.includes(effort) ? effort : 'medium'
    const bin = claudePath()
    if (!bin) throw new Error(INSTALL_HINT)
    if (path !== undefined && path !== null) path = sessionPath(path, [sessionDir(home, project)], knownPaths())
    else path = undefined
    let thread = live.get(threadId)
    if (thread?.running || starting.has(threadId)) throw new Error('This thread is already running.')
    starting.set(threadId, { stop: false })
    try {
      if (!(await authStatus(bin, childEnv())).loggedIn) throw new Error(LOGIN_HINT)
    } finally {
      starting.delete(threadId)
    }
    const resume = !!(thread?.path || path)
    const filePath = thread?.path ?? samePath(path) ?? resolve(sessionDir(home, project), `${randomUUID()}.claude.json`)
    const sessionId = basename(filePath, '.claude.json')
    const transcript = thread?.transcript ?? (path ? await openTranscript(path) : emptyTranscript())
    thread = { ...thread, project, path: filePath, transcript, running: true, mode, claude: true }
    live.set(threadId, thread)
    push(threadId, { type: 'user', id: randomUUID(), text: prompt })
    push(threadId, { type: 'agent_start', id: randomUUID(), model: info.name, effort: level, mode })
    await mkdir(sessionDir(home, project), { recursive: true, mode: 0o700 })
    if (!resume) await writeJson(filePath, { sessionId, project, title: prompt.replace(/\s+/g, ' ').trim().slice(0, 120) })
    emit('thread:session', { threadId, path: filePath })
    void (async () => {
      try {
        const totals = await claudeEngine.run({ threadId, claudePath: bin, project, prompt, model, effort: level, approval: settings.approval, sessionId, resume, onApproval: (name, input) => approve(threadId, name, input) })
        push(threadId, { type: 'end', ok: true, totals })
      } catch (e) {
        push(threadId, { type: 'end', ok: false, error: /cancelled/.test(e?.message ?? '') ? 'Stopped.' : e?.message || 'The run failed.' })
      } finally {
        thread.running = false
        await persist(thread)
        emit('threads:changed', { project })
      }
    })()
    return { threadId, effort: level, mode }
  }

  /** Mid-run input: steer reaches the agent before its next step; queue waits until it finishes. */
  async function guide({ threadId, text, queue = false }) {
    str(threadId, 'thread'); bool(queue, 'queue')
    if (typeof text !== 'string') throw new Error('Invalid text.')
    const thread = live.get(threadId)
    const body = text.trim()
    if (!body) throw new Error('Nothing to send.')
    if (!thread?.running) throw new Error('Nothing is running in this thread.')
    if (thread.claude) {
      // the CLI takes the message on stdin; queue is steer here, it has one input line per run
      if (!claudeEngine.guide(threadId, body)) throw new Error('Nothing is running in this thread.')
      push(threadId, { type: 'note', text: queue ? `Queued: ${body}` : `You: ${body}`, level: 'info' })
      return true
    }
    // Efficient and Fast runs drive their own attempts; mid-run input would land in the wrong one.
    if (thread.mode && thread.mode !== 'balanced') throw new Error('Guiding works in Balanced mode only.')
    const session = thread.agent.session
    await (queue ? session.followUp(body) : session.steer(body))
    push(threadId, { type: 'note', text: queue ? `Queued: ${body}` : `You: ${body}`, level: 'info' })
    return true
  }

  function abort(threadId) {
    str(threadId, 'thread')
    const thread = live.get(threadId)
    const pendingStart = starting.get(threadId)
    if (pendingStart) return (pendingStart.stop = true)
    if (!thread?.running) return false
    for (const [id, pending] of approvals) if (pending.threadId === threadId) answerApproval(id, false)
    if (thread.claude) return claudeEngine.abort(threadId)
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
    str(project, 'project')
    if (isClaude()) {
      const dir = sessionDir(home, project)
      const files = (await readdir(dir).catch(() => [])).filter(f => f.endsWith('.claude.json'))
      const rows = await Promise.all(files.map(async f => {
        const path = resolve(dir, f)
        const [meta, st] = await Promise.all([readJson(path, null).catch(() => null), stat(path).catch(() => null)])
        if (!meta || !st) return null
        return { path, title: String(meta.title || 'Untitled'), modified: +st.mtime, running: [...live.values()].some(t => t.path === path && t.running) }
      }))
      return rows.filter(Boolean).sort((a, b) => b.modified - a.modified)
    }
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
    str(path, 'path')
    const project = await resolveProject(path)
    await rememberProject(home, project)
    settings = { ...settings, project }
    await saveSettings()
    return { project, projects: await recentProjects(home) }
  }

  function models() {
    // Claude ids and prices (USD per million tokens) are OWNER TO VERIFY; see claude-engine.mjs
    if (isClaude()) return CLAUDE_MODELS.map(m => ({ ...m, contextWindow: 0, cost: { ...m.cost, cacheRead: 0 }, efforts: CLAUDE_EFFORTS, modes: modesFor('claude') }))
    return runtime
      .getModels(PROVIDER)
      .filter(m => !m.type || m.type === 'chat')
      .map(describeModel)
  }

  async function updateSettings(patch) {
    const clean = cleanSettingsPatch(patch)
    settings = { ...settings, ...clean, ...(clean.engine ? { engineAuto: false } : {}) }
    fixModel()
    if (!isClaude()) await ensureRuntime()
    for (const t of live.values()) if (t.desktopSettings) t.desktopSettings['approval-mode'] = APPROVAL[settings.approval] ?? APPROVAL.ask
    await saveSettings()
    return settings
  }

  async function dispose() {
    disposed = true
    claudeEngine.dispose()
    login?.controller.abort()
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
    init: async () => {
      let rows = null
      if (accounts) {
        rows = await accounts.list()
        // first run only: no engine was ever chosen, so use the best connected account; a manual choice is never touched
        if (!firstRunDone && !givenEngine && !Object.hasOwn(savedSettings, 'engine') && settings.engineAuto !== false) {
          const best = accounts.pick(rows)
          if (best) {
            const d = DEFAULTS[best.id]
            settings = { ...settings, ...(d ? { engine: d.engine, model: d.model, efforts: { ...settings.efforts, ...d.efforts } } : {}), engineAuto: true, defaultProvider: best.id }
            fixModel()
            await saveSettings()
          }
        }
        firstRunDone = true
      }
      const claude = isClaude() ? await authStatus(claudePath(), childEnv()) : null
      const connected = rows ? rows.some(r => r.connected) || (!isClaude() && signedIn()) : null
      return { signedIn: connected ?? (claude ? claude.loggedIn : signedIn()), accounts: rows, defaultLabel: accounts ? accounts.label(settings.defaultProvider ?? accounts.pick(rows)?.id) : null, engine: settings.engine, modes: modesFor(settings.engine), claude, home, settings, projects: await recentProjects(home), platform: process.platform }
    },
    login: () => (isClaude() ? Promise.resolve({ ok: false, error: claudePath() ? LOGIN_HINT : INSTALL_HINT }) : startLogin()),
    answerLogin: (id, value) => {
      str(id, 'prompt')
      if (typeof value !== 'string') throw new Error('Invalid answer.')
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
      if (isClaude()) return { signedIn: (await authStatus(claudePath(), childEnv())).loggedIn }
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
    listNotes: async ({ project }) => (typeof project === 'string' && (await recentProjects(home)).includes(project) ? scanNotes(project) : []),
    // the model's suggested name, kept in settings.projectAutoNames; the rename box falls back to it
    nameProject: async ({ project }) => {
      str(project, 'project')
      if (isClaude() || !(await recentProjects(home)).includes(project) || !signedIn()) return settings
      if (settings.projectAutoNames?.[project]) return settings
      const model = runtime.getModel(PROVIDER, settings.cheapModel ?? DEFAULT_CHEAP_MODEL)
      if (!model) return settings
      const name = await suggestName(project, async (systemPrompt, text) => {
        const reply = await runtime.completeSimple(model, { systemPrompt, messages: [{ role: 'user', content: text, timestamp: Date.now() }] })
        return reply.content.filter(c => c.type === 'text').map(c => c.text).join('')
      })
      return name ? updateSettings({ projectAutoNames: { ...settings.projectAutoNames, [project]: name } }) : settings
    },
    readNote: async ({ project, path }) => {
      str(project, 'project'); str(path, 'path')
      if (!(await recentProjects(home)).includes(project)) throw new Error('Open that project first.')
      return readNote(project, path)
    },
    openThread: async ({ threadId, path, project }) => {
      str(threadId, 'thread')
      const known = live.get(threadId)?.transcript
      if (known) return known
      str(project, 'project', { optional: true })
      return openTranscript(sessionPath(path, [project ? sessionDir(home, project) : resolve(home, 'sessions')], knownPaths()))
    },
    logError: (source, error) => errorLog.write(source, error),
    run,
    abort,
    guide,
    answerApproval,
    updateSettings,
    accountsList: () => accounts?.list() ?? [],
    setKey: ({ provider, key }) => need().setKey(str(provider, 'provider', { max: 40 }), str(key, 'key', { max: 500 })),
    testKey: ({ provider }) => need().testKey(str(provider, 'provider', { max: 40 })),
    removeKey: ({ provider }) => need().removeKey(str(provider, 'provider', { max: 40 })),
    dispose,
  }
}
