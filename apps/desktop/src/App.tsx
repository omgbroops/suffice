import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, type AuthEvent, type InitInfo, type ModelInfo, type Settings, type ThreadSummary } from './api'
import { emptyTranscript, reduce, type Transcript } from '../shared/transcript.mjs'
import { ago, type Status } from './data'
import { Composer } from './components/Composer'
import { EnvPicker, PermissionPicker, ProjectPicker, baseName, type Env } from './components/Pickers'
import { ModelPicker } from './components/ModelPicker'
import { ThreadView } from './components/ThreadView'
import { Dither } from './components/Dither'
import { SettingsPage } from './components/Settings'
import { applyPrefs, notify, watchSystemTheme } from './prefs'
import { PREF_DEFAULTS, type Prefs } from '../shared/prefs.mjs'
import { StatusGlyph } from './components/ui'
import { IconArchive, IconArrowLeft, IconArrowRight, IconChevronDown, IconClose, IconCompose, IconFolder, IconGear, IconHome, IconPlus, IconSelector, IconSidebar } from './icons'

type Thread = {
  key: string
  path?: string
  project: string
  title: string
  modified: number
  running: boolean
  transcript?: Transcript
  loading?: boolean
}

type View = { kind: 'home' } | { kind: 'settings' } | { kind: 'thread'; key: string }
const same = (a: View, b: View) => a.kind === b.kind && (a.kind !== 'thread' || a.key === (b as { key: string }).key)

function statusOf(t: Thread): Status {
  const last = t.transcript?.messages.at(-1)
  const pending = last?.role === 'agent' && last.steps.some(s => s.kind === 'approval' && s.state === 'pending')
  if (pending) return 'input'
  if (t.running) return 'working'
  if (last?.role === 'agent' && last.error) return 'idle'
  return 'done'
}

function Titlebar({ platform, children }: { platform: string; children?: ReactNode }) {
  return <header className={`titlebar is-${platform}`}>{children}</header>
}

function SignIn({ platform, onDone }: { platform: string; onDone: () => void }) {
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
          <p className="signin-copy">Sign in with your ChatGPT account to run tasks. Credentials stay on this machine, shared with the Suffice CLI.</p>
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
              <button className="btn btn-primary btn-lg" onClick={start} autoFocus>
                {state === 'error' ? 'Try again' : 'Sign in with ChatGPT'}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function ProjectMenu({ project, projects, onPick, onBrowse }: { project: string | null; projects: string[]; onPick: (p: string) => void; onBrowse: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div className="menu-root side-project" ref={ref}>
      <button className={`side-item${open ? ' is-active' : ''}`} onClick={() => setOpen(o => !o)} title={project ?? undefined}>
        <IconFolder size={14} />
        <span className="side-project-name">{project ? baseName(project) : 'Choose a project'}</span>
        <IconChevronDown size={12} className="side-project-chev" />
      </button>
      {open && (
        <div className="menu menu-bottom side-project-menu" role="listbox">
          {projects.map(p => (
            <button
              key={p}
              role="option"
              aria-selected={p === project}
              className={`menu-item${p === project ? ' is-selected' : ''}`}
              title={p}
              onClick={() => {
                setOpen(false)
                onPick(p)
              }}
            >
              <span className="menu-item-main">{baseName(p)}</span>
              <span className="menu-item-sub">{p}</span>
            </button>
          ))}
          <button
            className="menu-item menu-item-action"
            onClick={() => {
              setOpen(false)
              onBrowse()
            }}
          >
            Open folder…
          </button>
        </div>
      )}
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
  const [notice, setNotice] = useState('')
  const [env, setEnv] = useState<Env>('local')
  const [, tick] = useState(0)
  const [section, setSection] = useState('general')
  const prefs: Prefs = settings?.prefs ?? PREF_DEFAULTS
  // Event handlers registered once read the latest preferences and threads through refs.
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const threadsRef = useRef(threads)
  threadsRef.current = threads
  const goRef = useRef<(v: View) => void>(() => {})
  const platform = api.platform()

  const view = hist.stack[hist.i]
  const active = view.kind === 'thread' ? threads[view.key] : undefined
  const project = settings?.project ?? null

  const boot = useCallback(async () => {
    try {
      const i = await api.init()
      setInfo(i)
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

  useEffect(() => applyPrefs(prefs), [prefs])
  useEffect(() => watchSystemTheme(() => prefsRef.current), [])

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
      api.on('thread:event', ({ threadId, event }) => {
        const title = threadsRef.current[threadId]?.title ?? 'Suffice'
        const open = () => goRef.current({ kind: 'thread', key: threadId })
        if (event.type === 'approval') notify(prefsRef.current, 'approval', 'Approval needed', title, open)
        else if (event.type === 'end' && event.ok) notify(prefsRef.current, 'finished', 'Agent finished', title, open)
        else if (event.type === 'end' && !/^Stopped/.test(event.error ?? '')) notify(prefsRef.current, 'failed', 'Agent ran into an error', `${title}: ${event.error ?? 'The run failed.'}`, open)
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
        })
      }),
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
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setSidebar(s => !s)
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        newSessionRef.current()
      } else if (mod && e.key === ',') {
        e.preventDefault()
        goRef.current({ kind: 'settings' })
      } else if (e.key === 'Escape' && !e.defaultPrevented) stopRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = useCallback((v: View) => {
    setHist(h => (same(h.stack[h.i], v) ? h : { stack: [...h.stack.slice(0, h.i + 1), v], i: h.i + 1 }))
    if (v.kind === 'thread') setTabs(t => (t.includes(v.key) ? t : [...t, v.key]))
  }, [])
  goRef.current = go

  /** Home, with the project cleared first when new threads should ask for one. */
  const newSession = () => {
    if (prefs['new-project'] === 'Ask each time') setSettings(s => (s ? { ...s, project: null } : s))
    go({ kind: 'home' })
  }
  const newSessionRef = useRef(newSession)
  newSessionRef.current = newSession
  // Escape stops the open thread's run, when that preference is on and nothing else wants the key.
  const stopRef = useRef(() => {})
  stopRef.current = () => {
    if (!prefs.escape || !active?.running || document.querySelector('.dd, .mp, .crumb-back')) return
    void api.abort(active.key)
  }

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
    if (view.kind === 'thread' && view.key === key) go({ kind: 'home' })
  }

  const patchSettings = async (patch: Partial<Settings>) => {
    setSettings(s => (s ? { ...s, ...patch } : s))
    setSettings(await api.updateSettings(patch))
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
  const fallbackEffort = ({ Low: 'low', Medium: 'medium', High: 'high', 'Extra high': 'xhigh' } as Record<string, string>)[prefs['default-effort']] ?? 'low'
  const effortFor = (m?: ModelInfo) =>
    m?.efforts.length ? (m.efforts.includes(settings?.efforts[m.id] ?? '') ? settings!.efforts[m.id] : m.efforts.includes(fallbackEffort) ? fallbackEffort : m.efforts.includes('low') ? 'low' : m.efforts[0]) : 'off'
  const hidden = new Set<string>(prefs['disabled-models'] ?? [])
  const pickable = models.filter(m => !hidden.has(m.id) || m.id === settings?.model || m.id === settings?.cheapModel)
  const archived = new Set<string>(prefs.archived ?? [])
  const setPrefs = (patch: Prefs) => void patchSettings({ prefs: { ...prefs, ...patch } })

  const failLocally = (key: string, text: string, error: string) =>
    setThreads(prev => {
      const t = prev[key]
      let tr = t?.transcript ?? emptyTranscript()
      tr = reduce(tr, { type: 'user', id: crypto.randomUUID(), text })
      tr = reduce(tr, { type: 'agent_start', id: crypto.randomUUID(), model: modelInfo?.name ?? settings?.model ?? '', effort: '' })
      tr = reduce(tr, { type: 'end', ok: false, error })
      return { ...prev, [key]: { ...t, transcript: tr, running: false } }
    })

  const send = async (key: string, text: string) => {
    const t = threads[key] ?? null
    const p = t?.project ?? project
    if (!p || !settings) return
    try {
      await api.run({ threadId: key, path: t?.path, project: p, prompt: text, model: settings.model, effort: effortFor(modelInfo), fast: !!settings.fast[settings.model], mode: settings.mode ?? 'balanced', cheapModel: settings.cheapModel ?? 'gpt-6-luna' })
    } catch (e) {
      failLocally(key, text, e instanceof Error ? e.message : String(e))
    }
  }

  const startThread = (text: string) => {
    if (!project) return
    const key = crypto.randomUUID()
    const title = text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text
    setThreads(prev => ({ ...prev, [key]: { key, project, title, modified: Date.now(), running: true, transcript: emptyTranscript() } }))
    go({ kind: 'thread', key })
    void send(key, text)
  }

  const signOut = async () => {
    await api.logout()
    await boot()
  }
  const list = useMemo(() => Object.values(threads).filter(t => !t.path || !archived.has(t.path)).sort((a, b) => b.modified - a.modified), [threads, prefs.archived])

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
  if (!info.signedIn) return <SignIn platform={platform} onDone={() => void boot()} />

  const picker = (
    <ModelPicker
      models={pickable}
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
        <IconFolder size={14} />
        <span className="pii">{current ? baseName(current) : ''}</span>
      </span>
    ) : (
      <ProjectPicker project={current} projects={projects} onPick={p => void pickProject(p)} onAdd={() => void browseProject()} />
    )
  const composerProps = { permissions, model: picker }

  return (
    <div className={`app${sidebar ? '' : ' no-sidebar'}`}>
      <Titlebar platform={platform}>
        <div className="titlebar-lead">
          <button className="icon-btn" onClick={() => setSidebar(s => !s)} aria-label="Toggle sidebar" title="Toggle sidebar (Ctrl+B)">
            <IconSidebar size={14} />
          </button>
          <span className="logo">[suffice]</span>
          <div className="spacer" />
          <button className="icon-btn" disabled={hist.i === 0} onClick={() => setHist(h => ({ ...h, i: h.i - 1 }))} aria-label="Back">
            <IconArrowLeft size={14} />
          </button>
          <button className="icon-btn" disabled={hist.i === hist.stack.length - 1} onClick={() => setHist(h => ({ ...h, i: h.i + 1 }))} aria-label="Forward">
            <IconArrowRight size={14} />
          </button>
        </div>
        <nav className="tabs">
          <button className={`tab${view.kind === 'home' ? ' is-active' : ''}`} onClick={() => go({ kind: 'home' })}>
            <IconHome size={13} />
            <span className="tab-label">Home</span>
          </button>
          {tabs.map(key => {
            const t = threads[key]
            if (!t) return null
            const on = view.kind === 'thread' && view.key === key
            return (
              <div key={key} className={`tab${on ? ' is-active' : ''}`} onClick={() => go({ kind: 'thread', key })} role="button" tabIndex={0}>
                <StatusGlyph status={statusOf(t)} />
                <span className="tab-label">{t.title}</span>
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
          <button className={`side-item is-primary${view.kind === 'home' ? ' is-active' : ''}`} onClick={newSession} title="New thread (Ctrl+N)">
            <IconCompose size={14} />
            New thread
          </button>
        </div>
        <div className="side-label">Threads</div>
        <div className="side-list">
          {list.length === 0 && <div className="side-empty">No threads yet.</div>}
          {list.map(t => (
            <div key={t.key} role="button" tabIndex={0} className={`side-thread${active?.key === t.key ? ' is-active' : ''}`} onClick={() => go({ kind: 'thread', key: t.key })} onKeyDown={e => e.key === 'Enter' && go({ kind: 'thread', key: t.key })} title={t.title}>
              <StatusGlyph status={statusOf(t)} />
              <span className="side-thread-title">{t.title}</span>
              <span className="side-thread-time">{statusOf(t) === 'input' ? 'Reply' : ago(t.modified)}</span>
              {t.path && !t.running && (
                <button
                  className="side-thread-archive"
                  aria-label="Archive thread"
                  title="Archive"
                  onClick={e => {
                    e.stopPropagation()
                    setPrefs({ archived: [...(prefs.archived ?? []), t.path!] })
                    closeTab(t.key)
                  }}
                >
                  <IconArchive size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="side-foot">
          <AccountMenu onSignOut={signOut} />
          <button className={`icon-btn${view.kind === 'settings' ? ' is-on' : ''}`} onClick={() => go({ kind: 'settings' })} aria-label="Settings" title="Settings (Ctrl+,)">
            <IconGear size={14} />
          </button>
        </div>
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
        {view.kind === 'settings' ? (
          <SettingsPage
            prefs={prefs}
            models={models}
            section={section}
            onSection={setSection}
            archived={Object.values(threads).filter(t => t.path && archived.has(t.path)).map(t => ({ path: t.path!, title: t.title, project: t.project }))}
            onChange={setPrefs}
            onSignOut={() => void signOut()}
            onNotice={setNotice}
          />
        ) : active ? (
          <ThreadView
            prefs={prefs}
            key={active.key}
            title={active.title}
            status={statusOf(active)}
            transcript={active.transcript}
            project={active.project}
            onApproval={(id, allow) => void api.answerApproval(id, allow)}
            composer={
              <Composer
                {...composerProps}
                key={active.key}
                project={projectPicker(active.project, true)}
                autoFocus
                placeholder={statusOf(active) === 'input' ? 'Answer the request above first' : active.running ? (prefs['working-send'] === 'Queue' ? 'Queue a message for after this turn…' : 'Steer the agent…') : 'Ask for a follow-up…'}
                working={active.running}
                sendKey={prefs.send}
                onSteer={active.running ? (text, other) => void api.steer(active.key, text, (prefs['working-send'] === 'Queue') !== other ? 'queue' : 'steer').catch(e => setNotice(e.message)) : undefined}
                onSend={text => void send(active.key, text)}
                onStop={() => void api.abort(active.key)}
              />
            }
          />
        ) : (
          <div className="home">
            {prefs.wallpaper !== 'None' && <Dither />}
            <div className="home-dock thread-col">
              {!project && (
                <button className="home-hint" onClick={() => void browseProject()}>
                  Choose a project folder to start
                </button>
              )}
              <Composer
                {...composerProps}
                line
                env={<EnvPicker value={env} onChange={setEnv} />}
                project={projectPicker(project)}
                autoFocus
                placeholder="Describe a task or ask a question"
                sendKey={prefs.send}
                disabled={project ? undefined : 'Choose a project first'}
                onSend={startThread}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="menu-root side-account" ref={ref}>
      {open && (
        <div className="menu menu-top">
          <button className="menu-item" onClick={() => (setOpen(false), onSignOut())}>
            Sign out
          </button>
        </div>
      )}
      <button className="side-user" onClick={() => setOpen(o => !o)}>
        <span className="avatar">s</span>
        <span className="side-user-text">
          <span>ChatGPT account</span>
          <span className="meta">Signed in</span>
        </span>
        <IconSelector size={13} />
      </button>
    </div>
  )
}
