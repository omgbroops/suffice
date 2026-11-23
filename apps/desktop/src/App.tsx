import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, type AuthEvent, type InitInfo, type ModelInfo, type Settings, type ThreadSummary } from './api'
import { emptyTranscript, reduce, type Transcript } from '../shared/transcript.mjs'
import { ago, type Status } from './data'
import { Composer } from './components/Composer'
import { PermissionPicker, ProjectPicker } from './components/Pickers'
import { ModelPicker } from './components/ModelPicker'
import { ThreadView } from './components/ThreadView'
import { Dither } from './components/Dither'
import { Segmented, StatusGlyph } from './components/ui'
import { IconArrowLeft, IconArrowRight, IconClose, IconCompose, IconFolder, IconHome, IconNotes, IconPlus, IconSearch, IconSelector, IconSidebar } from './icons'
import { ProjectOrb } from './components/Orb'
import { AutoNamesContext, ColorsContext, IconsContext, NamesContext, ProjectEmblem, SearchPalette, SideProjects } from './components/Sidebar'
import { baseName, displayName, threadsByProject } from './components/groups'
import { NotesView } from './components/NotesView'

export type Thread = {
  key: string
  path?: string
  project: string
  title: string
  modified: number
  running: boolean
  transcript?: Transcript
  loading?: boolean
}

type View = { kind: 'home' } | { kind: 'notes' } | { kind: 'thread'; key: string }
const same = (a: View, b: View) => a.kind === b.kind && (a.kind !== 'thread' || a.key === (b as { key: string }).key)

function statusOf(t: Thread): Status {
  const last = t.transcript?.messages.at(-1)
  const pending = last?.role === 'agent' && last.steps.some(s => s.kind === 'approval' && s.state === 'pending')
  if (pending) return 'input'
  if (t.running) return 'working'
  if (last?.role === 'agent' && last.error) return 'idle'
  return 'done'
}

/** Balanced runs take mid-run guidance; Fast and Efficient runs work in copies. */
const guidable = (t: { transcript?: { messages: { role: string; mode?: string }[] } }) => {
  const last = t.transcript?.messages.at(-1)
  return !(last?.role === 'agent' && last.mode && last.mode !== 'balanced')
}

function Titlebar({ platform, children }: { platform: string; children?: ReactNode }) {
  return <header className={`titlebar is-${platform}`}>{children}</header>
}

function SignIn({ platform, engine, onDone }: { platform: string; engine: 'claude' | 'openai'; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'waiting' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [prompt, setPrompt] = useState<{ id: string; message: string } | null>(null)
  const [answer, setAnswer] = useState('')

  useEffect(
    () =>
      api.on('auth:event', (e: AuthEvent) => {
        if (e.type === 'url') setUrl(e.url)
        else if (e.type === 'progress') setMessage(e.message)
        else if (e.type === 'prompt') setPrompt({ id: e.id, message: e.message })
        else if (e.type === 'error') {
          setState('error')
          setMessage(e.message)
        }
      }),
    [],
  )

  // Claude engine: the app uses the user's own Claude Code login and never handles credentials itself;
  // signing in happens in Claude Code, and this button only checks again
  const check = async () => {
    setState('waiting')
    setMessage('Checking Claude Code…')
    if ((await api.init()).signedIn) return onDone()
    const r = await api.login()
    setState('error')
    setMessage(r.error ?? 'Claude Code is not signed in yet.')
  }

  const start = async () => {
    setState('waiting')
    setMessage('Finish signing in from your browser.')
    setUrl('')
    setPrompt(null)
    const result = await api.login()
    if (result.ok) onDone()
    else {
      setState('error')
      setMessage(result.error ?? 'Sign-in did not complete.')
    }
  }

  return (
    <div className="app is-bare">
      <Titlebar platform={platform}>
        <span className="logo titlebar-logo">[suffice]</span>
      </Titlebar>
      <main className="signin">
        <Dither />
        <div className="signin-card">
          <span className="logo logo-lg">[suffice]</span>
          <p className="signin-copy">
            {engine === 'claude'
              ? 'Suffice runs tasks with your own Claude Code. Run claude once in a terminal and sign in with your Claude account, then check again here.'
              : 'Sign in with your ChatGPT account to run tasks. Credentials stay on this machine, shared with the Suffice CLI.'}
          </p>
          {state === 'waiting' ? (
            <>
              <div className="signin-status is-live">{message}</div>
              {url && (
                <a className="signin-link" href={url} target="_blank" rel="noreferrer">
                  Open the sign-in page again
                </a>
              )}
              {prompt && (
                <form
                  className="signin-prompt"
                  onSubmit={e => {
                    e.preventDefault()
                    void api.answerLogin(prompt.id, answer.trim())
                    setPrompt(null)
                    setAnswer('')
                  }}
                >
                  <label htmlFor="signin-answer">{prompt.message}</label>
                  <input id="signin-answer" autoFocus value={answer} onChange={e => setAnswer(e.target.value)} />
                  <button className="btn btn-primary" disabled={!answer.trim()}>Continue</button>
                </form>
              )}
              <button className="btn" onClick={() => void api.cancelLogin()}>Cancel</button>
            </>
          ) : (
            <>
              {state === 'error' && <div className="signin-error">{message}</div>}
              <button className="btn btn-primary btn-lg" onClick={engine === 'claude' ? check : start} autoFocus>
                {engine === 'claude' ? 'Check again' : state === 'error' ? 'Try again' : 'Sign in with ChatGPT'}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const [info, setInfo] = useState<InitInfo | null>(null)
  const [bootError, setBootError] = useState('')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [projects, setProjects] = useState<string[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [threads, setThreads] = useState<Record<string, Thread>>({})
  const [tabs, setTabs] = useState<string[]>([])
  const [hist, setHist] = useState<{ stack: View[]; i: number }>({ stack: [{ kind: 'home' }], i: 0 })
  const [sidebar, setSidebar] = useState(true)
  const [search, setSearch] = useState(false)
  const [git, setGit] = useState({ name: '', avatar: '' })
  const [notice, setNotice] = useState('')
  const [env, setEnv] = useState<'local' | 'cloud'>('local')
  const [, tick] = useState(0)
  const platform = api.platform()

  const view = hist.stack[hist.i]
  const active = view.kind === 'thread' ? threads[view.key] : undefined
  const project = settings?.project ?? null

  const boot = useCallback(async () => {
    try {
      const i = await api.init()
      setInfo(i)
      api.gitIdentity().then(setGit, () => setGit({ name: 'Git not set up', avatar: '' }))
      setSettings(i.settings)
      setProjects(i.projects)
      if (i.signedIn) setModels(await api.models())
    } catch (e) {
      setBootError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  const refreshThreads = useCallback(async (p: string | null) => {
    if (!p) return
    const list: ThreadSummary[] = await api.threads(p).catch(() => [])
    setThreads(prev => {
      const next: Record<string, Thread> = {}
      const byPath = new Map(Object.values(prev).filter(t => t.path).map(t => [t.path!, t]))
      for (const s of list) {
        const existing = byPath.get(s.path)
        const key = existing?.key ?? s.path
        next[key] = { ...(existing ?? { key, project: p, running: s.running }), path: s.path, project: p, title: existing?.title && existing.title !== 'Untitled' ? existing.title : s.title, modified: Math.max(existing?.modified ?? 0, s.modified) }
      }
      // Keep threads from other projects and ones that have not been saved yet.
      for (const t of Object.values(prev)) if (!next[t.key] && (t.project !== p || !t.path || t.running)) next[t.key] = t
      return next
    })
  }, [])

  useEffect(() => {
    for (const p of new Set([...projects, ...(project ? [project] : [])])) void refreshThreads(p)
  }, [projects, project, refreshThreads])

  useEffect(() => {
    const offs = [
      api.on('thread:event', ({ threadId, event }) =>
        setThreads(prev => {
          const t = prev[threadId]
          if (!t) return prev
          return {
            ...prev,
            [threadId]: {
              ...t,
              transcript: reduce(t.transcript ?? emptyTranscript(), event),
              running: event.type === 'agent_start' ? true : event.type === 'end' ? false : t.running,
              modified: Date.now(),
            },
          }
        }),
      ),
      api.on('thread:session', ({ threadId, path }) => setThreads(prev => (prev[threadId] ? { ...prev, [threadId]: { ...prev[threadId], path } } : prev))),
      api.on('thread:title', ({ threadId, title }) => setThreads(prev => (prev[threadId] ? { ...prev, [threadId]: { ...prev[threadId], title } } : prev))),
      api.on('threads:changed', ({ project: p }) => void refreshThreads(p)),
      api.on('models:changed', () => void api.models().then(setModels).catch(() => {})),
    ]
    const id = window.setInterval(() => tick(n => n + 1), 30_000)
    return () => {
      offs.forEach(off => off())
      window.clearInterval(id)
    }
  }, [refreshThreads])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((platform === 'darwin' ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setSidebar(s => !s)
      }
      if ((platform === 'darwin' ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch(s => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = useCallback((v: View) => {
    setHist(h => (same(h.stack[h.i], v) ? h : { stack: [...h.stack.slice(0, h.i + 1), v], i: h.i + 1 }))
    if (v.kind === 'thread') setTabs(t => (t.includes(v.key) ? t : [...t, v.key]))
  }, [])

  // Load a thread's transcript the first time it is shown.
  useEffect(() => {
    if (!active || active.transcript || active.loading || !active.path) return
    const { key, path } = active
    setThreads(prev => ({ ...prev, [key]: { ...prev[key], loading: true } }))
    api
      .openThread(key, path)
      .then(transcript => setThreads(prev => ({ ...prev, [key]: { ...prev[key], transcript, loading: false } })))
      .catch(e => {
        setNotice(e.message)
        setThreads(prev => ({ ...prev, [key]: { ...prev[key], transcript: emptyTranscript(), loading: false } }))
      })
  }, [active])

  const closeTab = (key: string) => {
    setTabs(t => t.filter(x => x !== key))
    // drop the closed thread from Back/Forward too, so history never reopens a thread with no tab
    setHist(h => {
      const keep = h.stack.map((v, j) => [v, j] as const).filter(([v]) => !(v.kind === 'thread' && v.key === key))
      const stack = keep.map(([v]) => v).filter((v, j, a) => j === 0 || !same(a[j - 1], v))
      if (!stack.length) return { stack: [{ kind: 'home' }], i: 0 }
      const i = Math.min(stack.length - 1, Math.max(0, keep.filter(([, j]) => j <= h.i).length - 1))
      return { stack, i }
    })
    if (view.kind === 'thread' && view.key === key) go({ kind: 'home' })
  }

  // tab and history keys read the latest view and tabs, so the handler is refreshed every render
  const shortcuts = useRef<(e: KeyboardEvent) => void>(() => {})
  shortcuts.current = e => {
    // Cmd on macOS (Ctrl there is emacs keys in text fields), Ctrl elsewhere
    if (!(platform === 'darwin' ? e.metaKey : e.ctrlKey) || e.altKey) return
    const k = e.key.toLowerCase()
    if (k === 'n' && !e.shiftKey) {
      e.preventDefault()
      go({ kind: 'home' })
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.home textarea')?.focus())
    } else if (/^[1-9]$/.test(k)) {
      // 1 is Home, 2-8 the tabs in order, 9 the last tab (browser convention)
      const key = k === '1' ? null : k === '9' ? tabs[tabs.length - 1] : tabs[+k - 2]
      if (k === '1') (e.preventDefault(), go({ kind: 'home' }))
      else if (key) (e.preventDefault(), go({ kind: 'thread', key }))
    } else if (k === '[' && hist.i > 0) {
      e.preventDefault()
      setHist(h => ({ ...h, i: h.i - 1 }))
    } else if (k === ']' && hist.i < hist.stack.length - 1) {
      e.preventDefault()
      setHist(h => ({ ...h, i: h.i + 1 }))
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcuts.current(e)
    window.addEventListener('keydown', onKey)
    const off = api.on('app:close-tab', () => (view.kind === 'thread' ? closeTab(view.key) : window.close()))
    return () => (window.removeEventListener('keydown', onKey), off())
  }, [view])

  // the newest settings, optimistic patches included, so two quick map edits don't spread the same stale map
  const liveSettings = useRef(settings)
  liveSettings.current = settings
  const patchSettings = async (patch: Partial<Settings>) => {
    liveSettings.current = liveSettings.current && { ...liveSettings.current, ...patch }
    const before = settings
    setSettings(s => (s ? { ...s, ...patch } : s))
    try {
      setSettings(await api.updateSettings(patch))
    } catch (e) {
      // the change was not saved: show the saved state again and say so
      liveSettings.current = before
      setSettings(before)
      setNotice(`Couldn't save that setting: ${(e as Error).message}`)
    }
  }

  const pickProject = async (path: string) => {
    try {
      const r = await api.setProject(path)
      setProjects(r.projects)
      setSettings(s => (s ? { ...s, project: r.project } : s))
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    }
  }
  const browseProject = async () => {
    const r = await api.chooseProject().catch(e => (setNotice(e.message), null))
    if (!r) return
    setProjects(r.projects)
    setSettings(s => (s ? { ...s, project: r.project } : s))
  }

  const modelInfo = models.find(m => m.id === settings?.model)
  const effortFor = (m?: ModelInfo) => (m?.efforts.length ? (m.efforts.includes(settings?.efforts[m.id] ?? '') ? settings!.efforts[m.id] : m.efforts.includes('low') ? 'low' : m.efforts[0]) : 'off')

  const failLocally = (key: string, text: string, error: string) =>
    setThreads(prev => {
      const t = prev[key]
      let tr = t?.transcript ?? emptyTranscript()
      tr = reduce(tr, { type: 'user', id: crypto.randomUUID(), text })
      tr = reduce(tr, { type: 'agent_start', id: crypto.randomUUID(), model: modelInfo?.name ?? settings?.model ?? '', effort: '' })
      tr = reduce(tr, { type: 'end', ok: false, error })
      return { ...prev, [key]: { ...t, transcript: tr, running: false } }
    })

  const send = async (key: string, text: string, proj?: string) => {
    const t = threads[key] ?? null
    const p = t?.project ?? proj ?? project
    if (!p || !settings) return
    try {
      await api.run({ threadId: key, path: t?.path, project: p, prompt: text, model: settings.model, effort: effortFor(modelInfo), fast: !!settings.fast[settings.model], mode: settings.mode ?? 'balanced', cheapModel: settings.cheapModel ?? 'gpt-6-luna' })
    } catch (e) {
      failLocally(key, text, e instanceof Error ? e.message : String(e))
    }
  }

  const startThread = async (text: string) => {
    let project = settings?.project ?? null
    if (!project) {
      const r = await api.defaultProject().catch(e => (setNotice(e.message), null))
      if (!r) return
      project = r.project
      setProjects(r.projects)
      setSettings(s => (s ? { ...s, project: r.project } : s))
    }
    const key = crypto.randomUUID()
    const title = text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text
    setThreads(prev => ({ ...prev, [key]: { key, project, title, modified: Date.now(), running: true, transcript: emptyTranscript() } }))
    go({ kind: 'thread', key })
    void send(key, text, project)
  }

  const list = useMemo(() => Object.values(threads).sort((a, b) => b.modified - a.modified), [threads])

  // ask the model once per project for a default name (cached in settings; the folder name stands in until then)
  const naming = useRef(new Set<string>())
  useEffect(() => {
    if (!info?.signedIn || !settings) return
    for (const p of projects)
      if (!settings.projectAutoNames?.[p] && !naming.current.has(p)) {
        naming.current.add(p)
        api.nameProject(p).then(s => setSettings(cur => (cur ? { ...cur, projectAutoNames: s.projectAutoNames } : cur)), () => {})
      }
  }, [projects, info?.signedIn, settings?.projectAutoNames])
  const names = useMemo(() => ({ ...settings?.projectAutoNames, ...settings?.projectNames }), [settings?.projectAutoNames, settings?.projectNames])

  if (bootError)
    return (
      <div className="app is-bare">
        <Titlebar platform={platform} />
        <main className="signin">
          <div className="signin-card">
            <span className="logo logo-lg">[suffice]</span>
            <div className="signin-error">Suffice could not start: {bootError}</div>
          </div>
        </main>
      </div>
    )
  if (!info || !settings) return <div className="app is-bare"><Titlebar platform={platform} /></div>
  if (!info.signedIn) return <SignIn platform={platform} engine={info.settings.engine ?? 'claude'} onDone={() => void boot()} />

  const picker = (
    <ModelPicker
      models={models}
      value={settings.model}
      mode={settings.mode ?? 'balanced'}
      cheap={settings.cheapModel ?? 'gpt-6-luna'}
      onMode={mode => void patchSettings({ mode })}
      onCheap={cheapModel => void patchSettings({ cheapModel })}
      efforts={settings.efforts}
      fast={settings.fast}
      recent={settings.recentModels}
      onChange={id => void patchSettings({ model: id, recentModels: [id, ...settings.recentModels.filter(x => x !== id)].slice(0, 3) })}
      onEffort={(id, e) => void patchSettings({ efforts: { ...settings.efforts, [id]: e } })}
      onFast={(id, on) => void patchSettings({ fast: { ...settings.fast, [id]: on } })}
    />
  )
  const permissions = <PermissionPicker value={settings.approval} onChange={approval => void patchSettings({ approval })} />
  const projectPicker = (current: string | null, locked = false) =>
    locked ? (
      <span className="ghost-btn is-static" title={current ?? undefined}>
        {current ? <ProjectEmblem path={current} size={14} /> : <IconFolder size={14} />}
        {current ? displayName(names, current) : ''}
      </span>
    ) : (
      <ProjectPicker project={current} projects={projects} onPick={p => void pickProject(p)} onAdd={() => void browseProject()} />
    )
  const composerProps = { permissions, model: picker }
  const grouped = threadsByProject(list, projects)
  const renderThread = (t: Thread & { key: string }) => (
    <button key={t.key} className={`side-thread${active?.key === t.key ? ' is-active' : ''}`} onClick={() => go({ kind: 'thread', key: t.key })} title={`${t.title} · ${displayName(names, t.project)}`}>
      <span className="side-thread-title">{t.title}</span>
      {/* one trailing slot: live glyph while running, else age */}
      {statusOf(t) === 'working' ? (
        <StatusGlyph status="working" seed={t.key} />
      ) : (
        <span className={`side-thread-time${statusOf(t) === 'input' ? ' is-needs' : ''}`}>{statusOf(t) === 'input' ? 'Reply' : ago(t.modified)}</span>
      )}
    </button>
  )

  return (
    <ColorsContext.Provider value={settings?.projectColors ?? {}}>
    <AutoNamesContext.Provider value={settings?.projectAutoNames ?? {}}>
    <NamesContext.Provider value={names}>
    <IconsContext.Provider value={settings?.projectIcons ?? {}}>
    <div className={`app${sidebar ? '' : ' no-sidebar'}`}>
      <Titlebar platform={platform}>
        <div className="titlebar-lead">
          <button className="icon-btn" onClick={() => setSidebar(s => !s)} aria-label="Toggle sidebar" title="Toggle sidebar (Ctrl+B)">
            <IconSidebar size={14} />
          </button>
          <span className="logo">[suffice]</span>
          <div className="spacer" />
          <button className="icon-btn" disabled={hist.i === 0} onClick={() => setHist(h => ({ ...h, i: h.i - 1 }))} aria-label="Back" title="Back (⌘[)">
            <IconArrowLeft size={14} />
          </button>
          <button className="icon-btn" disabled={hist.i === hist.stack.length - 1} onClick={() => setHist(h => ({ ...h, i: h.i + 1 }))} aria-label="Forward" title="Forward (⌘])">
            <IconArrowRight size={14} />
          </button>
        </div>
        <nav className="tabs">
          <button className={`tab${view.kind === 'home' ? ' is-active' : ''}`} onClick={() => go({ kind: 'home' })}>
            <IconHome size={13} />
            <span className="tab-label">Home</span>
          </button>
          {view.kind === 'notes' && (
            <button className="tab is-active">
              <IconNotes size={13} />
              <span className="tab-label">Notes</span>
            </button>
          )}
          {tabs.map(key => {
            const t = threads[key]
            if (!t) return null
            const on = view.kind === 'thread' && view.key === key
            return (
              <div
                key={key}
                className={`tab${on ? ' is-active' : ''}`}
                onClick={() => go({ kind: 'thread', key })}
                onAuxClick={e => { if (e.button === 1) (e.preventDefault(), closeTab(key)) }}
              >
                {/* the label is the focusable control; its click bubbles to the tab */}
                <button className="tab-open" aria-current={on ? 'page' : undefined}>
                  <StatusGlyph status={statusOf(t)} seed={key} />
                  <span className="tab-label">{t.title}</span>
                </button>
                <button
                  className="tab-close"
                  aria-label="Close tab"
                  onClick={e => {
                    e.stopPropagation()
                    closeTab(key)
                  }}
                >
                  <IconClose size={11} />
                </button>
              </div>
            )
          })}
          <button className="icon-btn" onClick={() => go({ kind: 'home' })} aria-label="New tab">
            <IconPlus size={13} />
          </button>
        </nav>
      </Titlebar>

      <aside className="sidebar">
        <div className="side-nav">
          <button className={`side-item is-primary${view.kind === 'home' ? ' is-active' : ''}`} onClick={() => go({ kind: 'home' })} title="New thread (⌘N)">
            <IconCompose size={14} />
            New thread
          </button>
          <button className={`side-item${search ? ' is-active' : ''}`} onClick={() => setSearch(true)}>
            <IconSearch size={14} />
            Search
            <kbd className="side-key">{platform === 'darwin' ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          <button className={`side-item${view.kind === 'notes' ? ' is-active' : ''}`} onClick={() => go({ kind: 'notes' })} disabled={!project} title={project ? undefined : 'Choose a project first'}>
            <IconNotes size={14} />
            Notes
          </button>
        </div>
        <div className="side-list">
          {projects.length > 0 && (
            <SideProjects
              projects={projects}
              current={project}
              running={new Set(list.filter(t => t.running).map(t => t.project))}
              byProject={grouped.byProject}
              renderThread={renderThread}
              onPick={p => (void pickProject(p), go({ kind: 'home' }))}
              onAdd={() => void browseProject()}
              onTint={(p, c) => void patchSettings({ projectColors: { ...liveSettings.current?.projectColors, [p]: c } })}
              onIcon={(p, i) => void patchSettings({ projectIcons: { ...liveSettings.current?.projectIcons, [p]: i } })}
              onRename={(p, name) => {
                const { [p]: _gone, ...rest } = liveSettings.current?.projectNames ?? {}
                const fallback = liveSettings.current?.projectAutoNames?.[p] || baseName(p)
                void patchSettings({ projectNames: name && name !== fallback ? { ...rest, [p]: name } : rest })
              }}
            />
          )}
          {projects.length === 0 && list.length === 0 && <div className="side-empty">No threads yet.</div>}
          {grouped.other.length > 0 && (
            <>
              <div className="side-label">Other threads</div>
              <div className="side-projects">{grouped.other.map(renderThread)}</div>
            </>
          )}
        </div>
        <AccountMenu
          identity={git}
          theme={settings?.theme ?? 'system'}
          onTheme={theme => void patchSettings({ theme })}
          onSignOut={async () => {
            await api.logout()
            await boot()
          }}
        />
      </aside>

      <main className="panel">
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button className="icon-btn sm" onClick={() => setNotice('')} aria-label="Dismiss">
              <IconClose size={11} />
            </button>
          </div>
        )}
        {view.kind === 'notes' && project ? (
          <NotesView project={project} prompt={settings.notesPrompt} onPrompt={notesPrompt => void patchSettings({ notesPrompt })} onGenerate={startThread} />
        ) : active ? (
          <ThreadView
            key={active.key}
            title={active.title}
            status={statusOf(active)}
            transcript={active.transcript}
            project={active.project}
            onApproval={(id, allow) => void api.answerApproval(id, allow)}
            composer={
              <Composer
                {...composerProps}
                onAttach={() => api.pickFiles(active.project)}
                key={active.key}
                draftKey={active.key}
                project={projectPicker(active.project, true)}
                autoFocus
                placeholder={
                  statusOf(active) === 'input'
                    ? 'Answer the request above first'
                    : active.running
                      ? guidable(active)
                        ? `Guide Suffice while it works, or ${platform === 'darwin' ? '⌘↵' : 'Ctrl+Enter'} to queue`
                        : 'Fast and Efficient runs can’t take guidance mid-run'
                      : 'Ask for a follow-up…'
                }
                working={active.running}
                onSend={text => void send(active.key, text)}
                onStop={() => void api.abort(active.key)}
                onGuide={guidable(active) ? (text, queue) => void api.guide(active.key, text, queue).catch(e => setNotice(e instanceof Error ? e.message : String(e))) : undefined}
              />
            }
          />
        ) : (
          <div className="home">
            <Dither />
            <div className="home-inner">
              <div className="home-head">
                <span className="logo logo-lg">[suffice]</span>
                <div className="spacer" />
                <Segmented<'local' | 'cloud'>
                  value={env}
                  onChange={setEnv}
                  options={[
                    { v: 'cloud', label: 'Cloud' },
                    { v: 'local', label: 'Local' },
                  ]}
                />
              </div>
              <Composer {...composerProps} draftKey="home" onAttach={project ? () => api.pickFiles(project) : undefined} project={projectPicker(project)} autoFocus tip onSend={startThread} />
              {project && list[0] && <HomeContinue thread={list[0]} onOpen={() => go({ kind: 'thread', key: list[0].key })} />}
              {!project && (
                <button className="home-hint" onClick={() => void browseProject()}>
                  Choose a project folder to start
                </button>
              )}
            </div>
          </div>
        )}
      </main>
      {search && <SearchPalette threads={list} onClose={() => setSearch(false)} onOpen={key => (setSearch(false), go({ kind: 'thread', key }))} />}
    </div>
    </IconsContext.Provider>
    </NamesContext.Provider>
    </AutoNamesContext.Provider>
    </ColorsContext.Provider>
  )
}

/** One way back into the last thread: click it, or Tab from an empty composer. */
function HomeContinue({ thread, onOpen }: { thread: Thread & { key: string }; onOpen: () => void }) {
  const open = useRef(onOpen)
  open.current = onOpen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (e.key === 'Tab' && !e.shiftKey && el instanceof HTMLTextAreaElement && el.closest('.home') && !el.value) (e.preventDefault(), open.current())
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const status = statusOf(thread)
  return (
    <button className="home-continue" onClick={onOpen}>
      <span className="home-continue-verb">Continue</span>
      <span className="home-continue-title">{thread.title}</span>
      {status === 'working' || status === 'input' ? <StatusGlyph status={status} /> : <span className="home-continue-age">{ago(thread.modified)}</span>}
      <kbd>Tab</kbd>
    </button>
  )
}

type Theme = 'system' | 'light' | 'dark'

function AccountMenu({ identity, onSignOut, theme, onTheme }: { identity: { name: string; avatar: string }; onSignOut: () => void; theme: Theme; onTheme: (t: Theme) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc))
  }, [open])
  return (
    <div className="menu-root side-account" ref={ref}>
      {open && (
        <div className="menu menu-top account-menu">
          <div className="menu-row">
            <span>Theme</span>
            <Segmented<Theme>
              value={theme}
              onChange={onTheme}
              options={[
                { v: 'system', label: 'Auto' },
                { v: 'light', label: 'Light' },
                { v: 'dark', label: 'Dark' },
              ]}
            />
          </div>
          <div className="menu-row menu-status">
            <span>ChatGPT</span>
            <span className="menu-status-val"><span className="side-user-dot" aria-hidden />Signed in</span>
          </div>
          <button className="menu-item" onClick={() => (setOpen(false), onSignOut())}>
            Sign out
          </button>
        </div>
      )}
      <button className="side-user" onClick={() => setOpen(o => !o)}>
        <span className="avatar">{identity.avatar ? <img src={identity.avatar} alt="" /> : <ProjectOrb seed={identity.name || 'account'} size={16} label="Account" />}</span>
        <span className="side-user-name">{identity.name || 'Account'}</span>
        <IconSelector size={13} className="side-user-chev" />
      </button>
    </div>
  )
}
