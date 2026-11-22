import { createContext, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ago } from '../data'
import { IconDots, IconPlus, IconSearch } from '../icons'
import { Live } from './Live'
import { baseName } from './Pickers'

/** Project tints: Auto follows the theme's ink; the rest are pastels redefined per theme in banger.css. */
export const PASTELS = ['auto', 'rose', 'peach', 'butter', 'mint', 'sky', 'lilac'] as const
export const ColorsContext = createContext<Record<string, string>>({})

export function ProjectEmblem({ path, size = 16, working = false, tint }: { path: string; size?: number; working?: boolean; tint?: string }) {
  const colors = useContext(ColorsContext)
  const c = tint ?? colors[path] ?? 'auto'
  return <Live kind="swarm" seed={path} size={size} status={working ? 'working' : 'done'} dim={false} color={`var(--pastel-${c})`} label={baseName(path)} />
}

type Row = { key: string; title: string; project: string; modified: number }

const DAY = 86_400_000
/** Today / Last week / Last month / Older, newest first, empty groups dropped. */
export function groupByDate<T extends { modified: number }>(list: T[], now = Date.now()) {
  const midnight = new Date(now).setHours(0, 0, 0, 0)
  const groups: [string, T[]][] = [['Today', []], ['Last week', []], ['Last month', []], ['Older', []]]
  for (const t of list) groups[t.modified >= midnight ? 0 : t.modified >= now - 7 * DAY ? 1 : t.modified >= now - 30 * DAY ? 2 : 3][1].push(t)
  return groups.filter(([, items]) => items.length)
}

function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') (e.stopPropagation(), close()) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, close, ref])
}

function TintMenu({ path, onTint }: { path: string; onTint: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const colors = useContext(ColorsContext)
  const current = colors[path] ?? 'auto'
  useDismiss(open, () => setOpen(false), ref)
  return (
    <div className="menu-root side-proj-more" ref={ref}>
      <button className="icon-btn sm" aria-label={`Colour for ${baseName(path)}`} aria-haspopup="menu" aria-expanded={open} onClick={e => (e.stopPropagation(), setOpen(o => !o))}>
        <IconDots size={13} />
      </button>
      {open && (
        <div className="menu menu-bottom menu-right tint-menu" role="menu" aria-label="Colour">
          {PASTELS.map(c => (
            <button key={c} role="menuitemradio" aria-checked={c === current} className={`tint-swatch${c === current ? ' is-selected' : ''}`} title={c[0].toUpperCase() + c.slice(1)} onClick={e => (e.stopPropagation(), onTint(c), setOpen(false))}>
              <ProjectEmblem path={path} size={18} tint={c} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SideProjects({ projects, current, running, onPick, onAdd, onTint }: { projects: string[]; current: string | null; running: Set<string>; onPick: (p: string) => void; onAdd: () => void; onTint: (p: string, c: string) => void }) {
  return (
    <>
      <div className="side-label side-label-row">
        Projects
        <button className="icon-btn sm" onClick={onAdd} aria-label="Add project folder" title="Add project folder">
          <IconPlus size={12} />
        </button>
      </div>
      <div className="side-projects">
        {projects.map(p => (
          <div key={p} className={`side-proj${p === current ? ' is-active' : ''}`}>
            <button className="side-proj-main" onClick={() => onPick(p)} title={p}>
              <ProjectEmblem path={p} working={running.has(p)} />
              <span className="side-thread-title">{baseName(p)}</span>
            </button>
            <TintMenu path={p} onTint={c => onTint(p, c)} />
          </div>
        ))}
      </div>
    </>
  )
}

/** ⌘K: one input over every thread title, keys in the footer. */
export function SearchPalette({ threads, onOpen, onClose }: { threads: Row[]; onOpen: (key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(true, onClose, ref)
  const hits = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return threads.filter(t => words.every(w => `${t.title} ${baseName(t.project)}`.toLowerCase().includes(w))).slice(0, 50)
  }, [q, threads])
  useEffect(() => setI(0), [q])
  useEffect(() => { ref.current?.querySelector('.is-cursor')?.scrollIntoView({ block: 'nearest' }) }, [i])
  return (
    <div className="palette-scrim">
      <div className="palette" role="dialog" aria-label="Search threads" ref={ref}>
        <div className="palette-input">
          <IconSearch size={14} />
          <input
            autoFocus
            placeholder="Search threads"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setI(n => Math.min(n + 1, hits.length - 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setI(n => Math.max(n - 1, 0)))
              else if (e.key === 'Enter' && hits[i]) onOpen(hits[i].key)
            }}
          />
        </div>
        <div className="palette-list" role="listbox">
          {hits.map((t, n) => (
            <button key={t.key} role="option" aria-selected={n === i} className={`palette-row${n === i ? ' is-cursor' : ''}`} onMouseMove={() => setI(n)} onClick={() => onOpen(t.key)}>
              <ProjectEmblem path={t.project} size={14} />
              <span className="side-thread-title">{t.title}</span>
              <span className="palette-meta">{baseName(t.project)} · {ago(t.modified)}</span>
            </button>
          ))}
          {!hits.length && <div className="side-empty">No threads match.</div>}
        </div>
        <div className="palette-keys">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
