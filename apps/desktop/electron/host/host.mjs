// The desktop's side of the harness: sign-in, models, projects, threads and
// runs. No Electron imports, so it can be driven from tests with plain Node.
// Everything the renderer sees comes through `emit(channel, payload)`.

import { cp, mkdir, mkdtemp, readFile, writeFile, rename, rm, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
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
  RACE_ATTEMPTS,
  applyPatch,
  diffFiles,
  workspacePrefill,
} from '@suffice/harness'
import { emptyTranscript, fromSessionMessages, reduce, resultText } from '../../shared/transcript.mjs'

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

// Workspace copies for Efficient and Fast attempts, as the harness makes them:
// no .git, and node_modules linked rather than copied.
const SKIP_COPY = new Set(['.git', 'node_modules'])
async function copyTree(from, to) {
  await cp(from, to, { recursive: true, filter: src => !SKIP_COPY.has(basename(src)), dereference: true })
  if (existsSync(join(from, 'node_modules'))) await symlink(join(from, 'node_modules'), join(to, 'node_modules'), 'junction').catch(() => {})
}

/** A session subscriber that forwards text and thinking deltas as run events. */
const streamTo = send => e => {
  if (e.type !== 'message_update') return
  const d = e.assistantMessageEvent
  if (d?.type === 'text_delta' && d.delta) send({ type: 'text', delta: d.delta })
  else if (d?.type === 'thinking_delta' && d.delta) send({ type: 'thinking', delta: d.delta })
}

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
      if (['end', 'approval', 'approval_resolved', 'user', 'attempt_end', 'attempts_result'].includes(stamped.type)) void persist(thread)
    }
    emit('thread:event', { threadId, event: stamped })
  }

  async function persist(thread) {
    if (!thread.path) return
    thread.saving = (thread.saving ?? Promise.resolve()).then(() => writeJson(transcriptPath(thread.path), thread.transcript)).catch(() => {})
    return thread.saving
  }

  /** An extension that forwards tool calls and results as run events. */
  function observer(send) {
    return pi => {
      pi.on('tool_call', e => {
        send({ type: 'tool', id: e.toolCallId, parent: e.parentToolCallId, name: e.toolName, input: e.input })
      })
      pi.on('tool_result', e => {
        send({ type: 'tool_result', id: e.toolCallId, isError: !!e.isError, output: resultText(e.content), patch: typeof e.details?.patch === 'string' ? e.details.patch : undefined })
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
      extensions: [observer(e => push(threadId, e))],
      onTitleChanged: title => emit('thread:title', { threadId, title }),
    }
    thread.agent = await createSession(options, runtime, { onApproval: (name, input) => approve(threadId, name, input) })
    thread.agent.session.subscribe(streamTo(e => push(threadId, e)))
    return thread
  }

  // ---- Efficient and Fast ----------------------------------------------------
  // The same strategies as the harness's /efficient and /fast commands, run
  // here so each attempt streams into its own sub-transcript, Stop reaches
  // every attempt, and the winning patch is offered for approval before it
  // touches the project.

  /** One attempt: a fresh harness session on a workspace copy. Resolves with what it changed. */
  async function attempt(threadId, thread, { aid, dir, task, model, effort }) {
    const sub = event => push(threadId, { type: 'attempt', aid, event })
    let control
    try {
      if (thread.stopped) throw new Error('cancelled')
      control = await createSession(
        {
          ...parseOptions([]),
          cwd: dir,
          home,
          // Attempts live in this thread's transcript; no session files for throwaway copies.
          sessionManager: SessionManager.inMemory(dir),
          model: model.id,
          modelObject: model,
          effort,
          access: 'full',
          speed: 'standard',
          browser: false,
          desktop: false,
          timeout: 600,
          desktopSettings: { 'approval-mode': APPROVAL.never, naming: 'Manual' },
          extensions: [observer(sub)],
        },
        runtime,
      )
      thread.controls.add(control)
      control.session.subscribe(streamTo(sub))
      if (thread.stopped) throw new Error('cancelled')
      const text = await control.run(task)
      const { changed, deleted } = await diffFiles(thread.race.snapshot, dir)
      return { ok: true, text, files: [...changed, ...deleted] }
    } catch (e) {
      return { ok: false, error: e?.message || 'The attempt failed.' }
    } finally {
      if (control) {
        thread.controls.delete(control)
        await control.dispose().catch(() => {})
      }
    }
  }

  async function fastRace(threadId, thread, { prompt, info, prefill }) {
    const effort = effectiveEffort(info, 'low')
    const name = info.name ?? info.id
    let winner = null
    const results = RACE_ATTEMPTS.map(() => null)
    RACE_ATTEMPTS.forEach((spec, i) => push(threadId, { type: 'attempt_start', mode: 'fast', aid: `a${i + 1}`, label: `Attempt ${i + 1}`, hint: spec.hint || undefined, model: name, effort, prompt }))
    await Promise.allSettled(
      RACE_ATTEMPTS.map(async (spec, i) => {
        const aid = `a${i + 1}`
        const dir = join(thread.race.dir, `attempt-${i}`)
        await copyTree(thread.project, dir)
        const r = winner ? { ok: false, error: 'Another attempt finished first.' } : await attempt(threadId, thread, { aid, dir, task: `${prompt}\n\n${prefill}${spec.hint ? `\n\n${spec.hint}` : ''}`, model: info, effort })
        results[i] = r
        if (r.ok && r.files.length && !winner && !thread.stopped) {
          winner = { aid, dir, label: `Attempt ${i + 1}`, ...r }
          // The first finished patch wins; the others are stopped and discarded.
          for (const c of thread.controls) c.abort()
          push(threadId, { type: 'attempt_end', aid, status: 'won', files: r.files })
        } else push(threadId, { type: 'attempt_end', aid, status: thread.stopped ? 'stopped' : winner ? 'discarded' : r.ok ? 'empty' : 'failed', error: winner || r.ok ? undefined : r.error })
      }),
    )
    return winner
  }

  async function efficientRun(threadId, thread, { prompt, info, level, cheap, prefill }) {
    const task = `${prompt}\n\n${prefill}`
    const cheapName = cheap.name ?? cheap.id
    const cheapEffort = effectiveEffort(cheap, 'low')
    const cheapDir = join(thread.race.dir, 'cheap')
    await copyTree(thread.project, cheapDir)
    let errored = false
    // The cheap model gets two rounds on one copy: a first try, then a nudge.
    for (let round = 0; round < 2 && !thread.stopped; round++) {
      const aid = `c${round + 1}`
      push(threadId, { type: 'attempt_start', mode: 'efficient', aid, label: round ? `${cheapName} retry` : cheapName, hint: round ? 'Asked to keep going after a miss' : 'Cheap model first', model: cheapName, effort: cheapEffort, prompt })
      const nudge = errored ? '\n\nYour previous attempt errored before finishing — the files may hold partial edits. Inspect the state and finish the task.' : '\n\nYour previous attempt made no changes — the task is not done. Keep fixing the actual files.'
      const r = await attempt(threadId, thread, { aid, dir: cheapDir, task: round ? task + nudge : task, model: cheap, effort: cheapEffort })
      if (r.ok && r.files.length) {
        push(threadId, { type: 'attempt_end', aid, status: 'won', files: r.files })
        return { aid, dir: cheapDir, label: cheapName, ...r }
      }
      errored = !r.ok
      push(threadId, { type: 'attempt_end', aid, status: thread.stopped ? 'stopped' : r.ok ? 'empty' : 'failed', error: r.ok ? undefined : r.error })
    }
    if (thread.stopped) return null
    // Escalate: the lead model on a fresh copy.
    const leadName = info.name ?? info.id
    const leadDir = join(thread.race.dir, 'lead')
    await copyTree(thread.project, leadDir)
    push(threadId, { type: 'attempt_start', mode: 'efficient', aid: 'l1', label: leadName, hint: `Escalated after ${cheapName} missed`, model: leadName, effort: level, prompt })
    const r = await attempt(threadId, thread, { aid: 'l1', dir: leadDir, task, model: info, effort: level })
    const won = r.ok && r.files.length > 0 && !thread.stopped
    push(threadId, { type: 'attempt_end', aid: 'l1', status: won ? 'won' : thread.stopped ? 'stopped' : r.ok ? 'empty' : 'failed', files: won ? r.files : undefined, error: r.ok ? undefined : r.error })
    return won ? { aid: 'l1', dir: leadDir, label: leadName, ...r } : null
  }

  /** Runs an Efficient or Fast turn, applies the winner and records the turn in the main session. */
  async function strategyRun(threadId, thread, { mode, prompt, info, level, cheap }) {
    thread.race = { dir: await mkdtemp(join(tmpdir(), `suffice-${mode}-`)) }
    try {
      thread.race.snapshot = join(thread.race.dir, 'base')
      await copyTree(thread.project, thread.race.snapshot)
      const prefill = await workspacePrefill(thread.project)
      const winner = mode === 'fast' ? await fastRace(threadId, thread, { prompt, info, prefill }) : await efficientRun(threadId, thread, { prompt, info, level, cheap, prefill })
      if (thread.stopped) throw new Error('cancelled')
      if (!winner) {
        const text = mode === 'fast' ? 'None of the three attempts finished with changes, so nothing was applied.' : 'Neither the cheap model nor the escalation produced changes, so nothing was applied.'
        push(threadId, { type: 'attempts_result', applied: false })
        record(thread, prompt, `[${mode} mode] ${text}`)
        throw new Error(text)
      }
      const files = winner.files
      const allowed = settings.approval === 'never' || (await approve(threadId, 'apply_changes', { from: winner.label, files }))
      if (thread.stopped) throw new Error('cancelled')
      if (!allowed) {
        push(threadId, { type: 'attempts_result', winner: winner.aid, applied: false, files })
        push(threadId, { type: 'text', delta: `${winner.label}'s changes were not applied.` })
        record(thread, prompt, `[${mode} mode] ${winner.label} produced changes to ${files.join(', ')}, but the user chose not to apply them.`)
        return
      }
      await applyPatch(thread.project, thread.race.snapshot, winner.dir)
      push(threadId, { type: 'attempts_result', winner: winner.aid, applied: true, files })
      push(threadId, { type: 'text', delta: winner.text?.trim() || `Applied ${files.length} change${files.length === 1 ? '' : 's'} from ${winner.label}.` })
      record(thread, prompt, `[${mode} mode] ${winner.label} won; its changes to ${files.join(', ')} were applied to the project. Its report:\n\n${winner.text ?? ''}`)
    } finally {
      await rm(thread.race.dir, { recursive: true, force: true }).catch(() => {})
      thread.race = null
    }
  }

  /** Puts a strategy turn into the main session's history, so follow-ups know what happened. */
  function record(thread, prompt, summary) {
    const session = thread.agent.session
    const manager = session.sessionManager
    if (!manager) return
    manager.appendMessage({ role: 'user', content: [{ type: 'text', text: prompt }], timestamp: Date.now() })
    manager.appendCustomMessageEntry('desktop-strategy', summary, true)
    session._refreshFinalizedContext?.()
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
    thread.stopped = false
    thread.controls = new Set()
    push(threadId, { type: 'user', id: randomUUID(), text: prompt })
    const cheapInfo = mode === 'efficient' ? runtime.getModel(PROVIDER, cheapModel) : null
    push(threadId, { type: 'agent_start', id: randomUUID(), model: info.name ?? model, effort: mode === 'fast' ? effectiveEffort(info, 'low') : level, mode, cheap: cheapInfo?.name })
    if (!thread.path) {
      thread.path = samePath(thread.agent.sessionPath())
      if (thread.path) emit('thread:session', { threadId, path: thread.path })
    }
    void (async () => {
      try {
        if (mode === 'balanced') await thread.agent.run(prompt)
        else await strategyRun(threadId, thread, { mode, prompt, info, level, cheap: cheapInfo })
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

  function abort(threadId) {
    const thread = live.get(threadId)
    if (!thread?.running) return false
    thread.stopped = true
    for (const [id, pending] of approvals) if (pending.threadId === threadId) answerApproval(id, false)
    for (const c of thread.controls ?? []) c.abort()
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
      t.stopped = true
      for (const c of t.controls ?? []) c.abort()
      t.agent?.abort()
      await t.saving
      await t.agent?.dispose().catch(() => {})
    }))
    live.clear()
  }

  return {
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
    openThread: async ({ threadId, path }) => live.get(threadId)?.transcript ?? (await openTranscript(path)),
    run,
    abort,
    answerApproval,
    updateSettings,
    dispose,
  }
}
