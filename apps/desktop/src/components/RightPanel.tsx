import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconArrowLeft, IconArrowRight, IconClose, IconDiff, IconFolder, IconGlobe, IconPlus, IconPrompt, IconReload, IconSearch } from '../icons'
import { Changes, type TurnEdit } from './panel/Changes'
import { Empty } from './panel/Empty'
import { Files } from './panel/Files'
import { FileIcon } from './panel/code'
import { dragResize, savedWidth, setVar } from './resize'
import { Term } from './panel/Term'

type Kind = 'new' | 'changes' | 'files' | 'browser' | 'terminal'
type Tab = { id: number; kind: Kind; url?: string; title?: string; file?: string }

const KINDS: { kind: Exclude<Kind, 'new'>; label: string; icon: ReactNode }[] = [
  { kind: 'changes', label: 'Changes', icon: <IconDiff size={14} /> },
  { kind: 'files', label: 'Files', icon: <IconFolder size={14} /> },
  { kind: 'browser', label: 'Browser', icon: <IconGlobe size={14} /> },
  { kind: 'terminal', label: 'Terminal', icon: <IconPrompt size={14} /> },
]
// a Files tab with a file open takes that file's icon and name
const iconOf = (t: Tab) => (t.file ? <FileIcon name={t.file.split('/').pop()!} size={14} /> : KINDS.find(k => k.kind === t.kind)?.icon ?? <IconSearch size={13} />)
const labelOf = (t: Tab) => t.file?.split('/').pop() || t.title || (t.kind === 'new' ? 'New tab' : KINDS.find(k => k.kind === t.kind)!.label)

/** What someone typed in an address field: a URL as is, a bare host with a scheme added, anything else as a search. */
export function toUrl(text: string) {
  const t = text.trim()
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(t)) return `http://${t}`
  if (/^[^\s/]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(t)) return `https://${t}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`
}

function Browser({ url, hidden, onUrl, onTitle }: { url: string; hidden: boolean; onUrl: (u: string) => void; onTitle: (t: string) => void }) {
  const view = useRef<any>(null)
  const [text, setText] = useState(url)
  const [first] = useState(url)
  const [nav, setNav] = useState({ back: false, forward: false, loading: false })
  const ready = useRef(false)
  useEffect(() => {
    const el = view.current
    if (!el) return
    const sync = () => {
      ready.current = true
      setNav(n => ({ ...n, back: el.canGoBack(), forward: el.canGoForward() }))
      const u = el.getURL()
      setText(u)
      onUrl(u)
    }
    const title = (e: any) => onTitle(String(e.title ?? '').slice(0, 60))
    const start = () => setNav(n => ({ ...n, loading: true }))
    const stop = () => setNav(n => ({ ...n, loading: false }))
    el.addEventListener('did-navigate', sync)
    el.addEventListener('did-navigate-in-page', sync)
    el.addEventListener('page-title-updated', title)
    el.addEventListener('did-start-loading', start)
    el.addEventListener('did-stop-loading', stop)
    return () => {
      el.removeEventListener('did-navigate', sync)
      el.removeEventListener('did-navigate-in-page', sync)
      el.removeEventListener('page-title-updated', title)
      el.removeEventListener('did-start-loading', start)
      el.removeEventListener('did-stop-loading', stop)
    }
  }, [first])
  const go = () => {
    const u = toUrl(text)
    if (!u) return
    setText(u)
    if (first && ready.current) view.current?.loadURL(u).catch(() => {})
    else onUrl(u)
  }
  return (
    <div className={`rp-layer rp-browser${hidden ? ' is-hidden' : ''}`}>
      <div className="rp-bar">
        <button className="icon-btn sm" disabled={!nav.back} onClick={() => view.current?.goBack()} aria-label="Back"><IconArrowLeft size={12} /></button>
        <button className="icon-btn sm" disabled={!nav.forward} onClick={() => view.current?.goForward()} aria-label="Forward"><IconArrowRight size={12} /></button>
        <button className="icon-btn sm" disabled={!first} onClick={() => (nav.loading ? view.current?.stop() : view.current?.reload())} aria-label={nav.loading ? 'Stop loading' : 'Reload'}>{nav.loading ? <IconClose size={11} /> : <IconReload size={12} />}</button>
        <input className="rp-field" value={text} placeholder="Enter a URL, like localhost:3000" aria-label="Address" spellCheck={false} autoFocus={!url} onChange={e => setText(e.target.value)} onFocus={e => e.currentTarget.select()} onKeyDown={e => e.key === 'Enter' && go()} />
      </div>
      {first ? <webview ref={view} className="rp-web" src={first} partition="persist:suffice-browser" /> : <Empty title="Nothing open yet" hint="Enter an address above to load a page." />}
    </div>
  )
}

function Launcher({ onOpen }: { onOpen: (kind: Exclude<Kind, 'new'>, url?: string) => void }) {
  const [text, setText] = useState('')
  return (
    <div className="rp-new">
      <label className="rp-search">
        <IconGlobe size={14} />
        <input autoFocus value={text} placeholder="Enter a URL or search the web" aria-label="Enter a URL or search the web" spellCheck={false} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && text.trim() && onOpen('browser', toUrl(text))} />
      </label>
      <div className="rp-kinds">
        {KINDS.map(k => (
          <button key={k.kind} className="rp-row" onClick={() => onOpen(k.kind)}>
            {k.icon}
            <span className="rp-row-name">{k.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** The panel on the right of the window: tabs for the project's changes, its files, and a browser. */
export function RightPanel({ open, project, turn, onClose }: { open: boolean; project: string | null; turn?: TurnEdit[]; onClose: () => void }) {
  const next = useRef(2)
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, kind: 'new' }])
  const [active, setActive] = useState(1)
  const current = useMemo(() => tabs.find(t => t.id === active) ?? tabs[0], [tabs, active])
  const patch = (id: number, p: Partial<Tab>) => setTabs(ts => ts.map(t => (t.id === id ? { ...t, ...p } : t)))
  const add = () => {
    const id = next.current++
    setTabs(ts => [...ts, { id, kind: 'new' }])
    setActive(id)
  }
  const close = (id: number) => {
    const i = tabs.findIndex(t => t.id === id)
    const rest = tabs.filter(t => t.id !== id)
    if (!rest.length) return onClose()
    setTabs(rest)
    if (id === active) setActive(rest[Math.min(i, rest.length - 1)].id)
  }
  // Changes is one tab: opening it again goes to the tab that is already there
  const openKind = (from: number, kind: Exclude<Kind, 'new'>, url?: string) => {
    const there = kind === 'changes' && tabs.find(t => t.kind === kind)
    if (there) {
      setTabs(ts => ts.filter(t => t.id !== from))
      return setActive(there.id)
    }
    patch(from, { kind, url: url ?? '', title: '' })
  }
  // widths the person dragged to last time
  useEffect(() => {
    for (const [key, name] of [['suffice.rightW', '--right-w'], ['suffice.treeW', '--tree-w']] as const) {
      const px = savedWidth(key)
      if (px) setVar(name, px)
    }
  }, [])
  if (!open) return null
  return (
    <aside className="rpanel" aria-label="Side panel">
      <div className="rs" onPointerDown={e => dragResize(e, { key: 'suffice.rightW', start: e.currentTarget.parentElement!.offsetWidth, min: 320, max: Math.max(320, window.innerWidth - 420), sign: -1, apply: px => setVar('--right-w', px) })} />
      <div className="rp-tabs">
        <div className="rp-tablist" role="tablist">
          {tabs.map(t => (
            <div key={t.id} className={`tab rp-tab${t.id === current.id ? ' is-active' : ''}`} onClick={() => setActive(t.id)} onAuxClick={e => e.button === 1 && close(t.id)}>
              {/* the close button takes the icon's place while the pointer is over the tab */}
              <button className="rp-tab-x" aria-label={`Close ${labelOf(t)}`} onClick={e => (e.stopPropagation(), close(t.id))}><IconClose size={11} /></button>
              <button className="tab-open" role="tab" aria-selected={t.id === current.id}>
                <span className="rp-tab-icon">{iconOf(t)}</span>
                <span className="tab-label">{labelOf(t)}</span>
              </button>
            </div>
          ))}
          <button className="icon-btn" onClick={add} aria-label="New tab" title="New tab"><IconPlus size={13} /></button>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close side panel" title="Close side panel"><IconClose size={13} /></button>
      </div>
      <div className="rp-body">
        {current.kind === 'new' && <Launcher key={current.id} onOpen={(kind, url) => openKind(current.id, kind, url)} />}
        {current.kind === 'changes' && (project ? <Changes project={project} turn={turn} /> : <Empty title="No project chosen" hint="Choose a project to see its changes." />)}
        {/* files tabs stay mounted, so each keeps its open file, its tree and its filter */}
        {tabs.filter(t => t.kind === 'files').map(t =>
          project ? <Files key={t.id} project={project} hidden={t.id !== current.id} onFile={file => patch(t.id, { file })} /> : t.id === current.id && <Empty key={t.id} title="No project chosen" hint="Choose a project to see its files." />,
        )}
        {/* browser tabs stay mounted so a page keeps its state while another tab is in front */}
        {tabs.filter(t => t.kind === 'browser').map(t => (
          <Browser key={`${t.id}:${t.url ? 1 : 0}`} url={t.url ?? ''} hidden={t.id !== current.id} onUrl={url => patch(t.id, { url })} onTitle={title => patch(t.id, { title })} />
        ))}
        {/* terminals too: a shell keeps running behind another tab */}
        {tabs.filter(t => t.kind === 'terminal').map(t =>
          project ? <Term key={t.id} project={project} hidden={t.id !== current.id} onTitle={title => patch(t.id, { title })} /> : t.id === current.id && <Empty key={t.id} title="No project chosen" hint="Choose a project to open a terminal in it." />,
        )}
      </div>
    </aside>
  )
}
