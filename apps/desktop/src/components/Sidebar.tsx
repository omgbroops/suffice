import type { Thread } from '../App'
import { ProjectOrb } from './Orb'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ago } from '../data'
import * as Radix from '@radix-ui/react-icons'
import { IconChevronRight, IconDots, IconPlus, IconSearch } from '../icons'
import { Live } from './Live'
import { baseName, displayName } from './groups'

/** Project tints: Auto follows the theme's ink; the rest are pastels redefined per theme in banger.css. */
export const PASTELS = ['auto', 'rose', 'peach', 'butter', 'mint', 'sky', 'lilac'] as const
export const ColorsContext = createContext<Record<string, string>>({})
/** project path -> display name; the folder on disk is never renamed */
export const NamesContext = createContext<Record<string, string>>({})
/** the model's suggested name per project: what a cleared name box falls back to */
export const AutoNamesContext = createContext<Record<string, string>>({})
/** project path -> Radix icon name (e.g. RocketIcon); absent = the project's generated emblem */
export const IconsContext = createContext<Record<string, string>>({})

type RadixIcon = (p: { width?: number; height?: number }) => ReactNode
const RADIX = Radix as unknown as Record<string, RadixIcon>
// icons that read as a project lead the picker; the alignment and border glyphs that open the alphabet come after
const FIRST = 'Rocket Cube Code Component1 Desktop Laptop Mobile Globe Star Heart Home Gear Camera Calendar Reader Layers Stack Mix Target Sun Moon Timer Person Backpack Archive Tokens Bookmark Dashboard Bell Pencil1 Video Image File Commit Cookie Table BarChart PieChart Keyboard Box'.split(' ').map(n => n + 'Icon')
/** every icon the picker offers: the app's Radix set, searchable by its words ("RocketIcon" -> "rocket") */
export const PICKER_ICONS = [...FIRST, ...Object.keys(Radix).filter(k => !FIRST.includes(k))]
  .filter(k => k.endsWith('Icon') && typeof RADIX[k] !== 'undefined')
  .map(k => ({ id: k, words: k.replace(/Icon$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase() }))
const iconOf = (id?: string) => (id && id.endsWith('Icon') ? RADIX[id] : undefined)

export function ProjectEmblem({ path, size = 16, tint, icon, label }: { path: string; size?: number; tint?: string; icon?: string; label?: string }) {
  const colors = useContext(ColorsContext)
  const icons = useContext(IconsContext)
  const names = useContext(NamesContext)
  const c = tint ?? colors[path] ?? 'auto'
  const Icon = iconOf(icon ?? icons[path])
  if (Icon) return <span className="proj-icon" style={{ color: `var(--pastel-${c})` }} role="img" aria-label={label ?? displayName(names, path)}><Icon width={size} height={size} /></span>
  // static orb; a running thread shows its own spinner in its row (Abhay 11-22)
  return <ProjectOrb seed={path} size={size} tint={c} label={label ?? displayName(names, path)} />
}

type Row = Thread & { key: string }

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

const cap = (c: string) => c[0].toUpperCase() + c.slice(1)

/**
 * The name box at the top of the ⋯ menu. It holds the current name; clearing it and leaving the box (blur,
 * Enter, clicking out) brings back the default name (Abhay 11-22). Esc puts the saved name back.
 */
function NameField({ path, onRename }: { path: string; onRename: (name: string) => void }) {
  const names = useContext(NamesContext)
  const fallback = useContext(AutoNamesContext)[path] || baseName(path)
  const [text, setText] = useState(displayName(names, path))
  // Esc closes the menu, and the unmount fires a blur; this keeps that blur from saving
  const skip = useRef(false)
  const save = (t: string) => onRename(t === fallback ? '' : t)
  const commit = () => {
    if (skip.current) return
    const t = text.trim()
    save(t)
    setText(t || fallback)
  }
  // clicking outside closes the menu before the box blurs, so the last text is saved when the box goes away
  const last = useRef({ text, save })
  last.current = { text, save }
  useEffect(() => () => { if (!skip.current) last.current.save(last.current.text.trim()) }, [])
  // the menu's own Esc handler (document, capture) stops the key before the box sees it, so listen one level up
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && document.activeElement === box.current) skip.current = true }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [])
  return (
    <label className="proj-name">
      <input
        aria-label="Project name"
        value={text}
        spellCheck={false}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        ref={box}
        onKeyDown={e => { if (e.key === 'Enter') (e.preventDefault(), commit(), e.currentTarget.select()) }}
      />
    </label>
  )
}

/** ⋯ menu: name, colour, and the generated emblem or an icon (Abhay 11-22: "pick name, color, emblem, that's it"; Icon opens a picker). */
function ProjectMenu({ path, onTint, onIcon, onRename }: { path: string; onTint: (c: string) => void; onIcon: (i: string) => void; onRename: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const colors = useContext(ColorsContext)
  const icons = useContext(IconsContext)
  const names = useContext(NamesContext)
  const current = colors[path] ?? 'auto'
  const icon = iconOf(icons[path]) ? icons[path] : ''
  const [picking, setPicking] = useState(false)
  const [q, setQ] = useState('')
  useDismiss(open, () => setOpen(false), ref)
  useEffect(() => { if (!open) (setPicking(false), setQ('')) }, [open])
  const words = q.trim().toLowerCase()
  const found = useMemo(() => (picking ? PICKER_ICONS.filter(i => !words || i.words.includes(words)) : []), [picking, words])
  const iconMode = picking || !!icon
  return (
    <div className="menu-root side-proj-more" ref={ref}>
      <button className="icon-btn sm" aria-label={`Options for ${displayName(names, path)}`} aria-haspopup="menu" aria-expanded={open} onClick={e => (e.stopPropagation(), setOpen(o => !o))}>
        <IconDots size={13} />
      </button>
      {open && (
        <div className="menu menu-bottom menu-right proj-menu" role="menu" aria-label="Project" onClick={e => e.stopPropagation()}>
          <NameField path={path} onRename={onRename} />
          <div className="proj-menu-label">Colour</div>
          <div className="proj-menu-row" role="group" aria-label="Colour">
            {PASTELS.map(c => (
              <button key={c} role="menuitemradio" aria-checked={c === current} className={`tint-swatch${c === current ? ' is-selected' : ''}`} title={cap(c)} onClick={() => onTint(c)}>
                <ProjectEmblem path={path} size={18} tint={c} icon={icon} label={cap(c)} />
              </button>
            ))}
          </div>
          <div className="proj-seg" role="radiogroup" aria-label="Emblem or icon">
            <button role="radio" aria-checked={!iconMode} className={!iconMode ? 'is-on' : ''} onClick={() => (setPicking(false), icon && onIcon(''))}>
              <ProjectEmblem path={path} size={14} tint={current} icon="" label="Emblem" /> Emblem
            </button>
            <button role="radio" aria-checked={iconMode} className={iconMode ? 'is-on' : ''} onClick={() => setPicking(true)}>
              {icon ? <ProjectEmblem path={path} size={14} tint={current} icon={icon} label="Icon" /> : null} Icon
            </button>
          </div>
          {picking && (
            <div className="proj-picker">
              <label className="proj-picker-search">
                <IconSearch size={12} />
                <input autoFocus placeholder="Search icons" value={q} onChange={e => setQ(e.target.value)} aria-label="Search icons" />
              </label>
              <div className="proj-picker-grid" role="listbox" aria-label="Icons">
                {found.map(i => (
                  <button key={i.id} role="option" aria-selected={i.id === icon} className={`tint-swatch${i.id === icon ? ' is-selected' : ''}`} title={i.words} onClick={() => onIcon(i.id)}>
                    <ProjectEmblem path={path} size={15} tint={current} icon={i.id} label={i.words} />
                  </button>
                ))}
                {found.length === 0 && <div className="proj-picker-none">No icons match.</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const SHOWN = 5

function ProjectRow({ path, current, working, open, onToggle, threads, renderThread, onPick, onTint, onIcon, onRename }: {
  path: string; current: boolean; working: boolean; open: boolean; onToggle: () => void; threads: Row[]; renderThread: (t: Row) => ReactNode
  onPick: () => void; onTint: (c: string) => void; onIcon: (i: string) => void; onRename: (name: string) => void
}) {
  const names = useContext(NamesContext)
  const name = displayName(names, path)
  const [all, setAll] = useState(false)
  const shown = all ? threads : threads.slice(0, SHOWN)
  return (
    <div className="side-proj-block">
      <div className={`side-proj${current ? ' is-active' : ''}`}>
          <button className="side-proj-main" onClick={onPick} title={path} aria-expanded={open}>
            <ProjectEmblem path={path} />
            <span className="side-thread-title">{name}</span>
            {/* the emblem never moves; a collapsed project lifts its running thread's spinner into its row */}
            {working && !open && <Live status="working" seed={path} size={12} label={`${name}: a thread is running`} />}
          </button>
        {threads.length > 0 && (
          <button className={`icon-btn sm side-proj-chev${open ? ' is-open' : ''}`} onClick={onToggle} aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`} aria-expanded={open}>
            <IconChevronRight size={11} />
          </button>
        )}
        <ProjectMenu path={path} onTint={onTint} onIcon={onIcon} onRename={onRename} />
      </div>
      {open && threads.length > 0 && (
        <div className="side-proj-threads">
          {shown.map(renderThread)}
          {threads.length > SHOWN && (
            <button className="side-more" onClick={() => setAll(a => !a)}>{all ? 'Show less' : `Show ${threads.length - SHOWN} more`}</button>
          )}
        </div>
      )}
    </div>
  )
}

const readOpen = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem('suffice.expanded') ?? '{}') || {} } catch { return {} }
}

export function SideProjects({ projects, current, running, byProject, renderThread, onPick, onAdd, onTint, onIcon, onRename }: {
  projects: string[]; current: string | null; running: Set<string>; byProject: Map<string, Row[]>; renderThread: (t: Row) => ReactNode
  onPick: (p: string) => void; onAdd: () => void; onTint: (p: string, c: string) => void; onIcon: (p: string, i: string) => void; onRename: (p: string, name: string) => void
}) {
  const [expanded, setExpanded] = useState(readOpen)
  const isOpen = (p: string) => expanded[p] ?? p === current
  const setOpen = (p: string, v: boolean) => setExpanded(m => {
    const next = { ...m, [p]: v }
    try { localStorage.setItem('suffice.expanded', JSON.stringify(next)) } catch { /* storage unavailable: state stays in memory */ }
    return next
  })
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
          <ProjectRow
            key={p}
            path={p}
            current={p === current}
            working={running.has(p)}
            open={isOpen(p)}
            onToggle={() => setOpen(p, !isOpen(p))}
            threads={byProject.get(p) ?? []}
            renderThread={renderThread}
            onPick={() => (p === current ? setOpen(p, !isOpen(p)) : (setOpen(p, true), onPick(p)))}
            onTint={c => onTint(p, c)}
            onIcon={i => onIcon(p, i)}
            onRename={n => onRename(p, n)}
          />
        ))}
      </div>
    </>
  )
}

/** ⌘K: one input over every thread title, keys in the footer. */
export function SearchPalette({ threads, onOpen, onClose }: { threads: Row[]; onOpen: (key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const names = useContext(NamesContext)
  const ref = useRef<HTMLDivElement>(null)
  // centred over the chat pane, not the window: the scrim's content box starts where the pane starts (Abhay 11-22)
  const [edge, setEdge] = useState({ left: 0, right: 0 })
  useEffect(() => {
    const pane = document.querySelector('main.panel')
    const fit = () => { const r = pane?.getBoundingClientRect(); setEdge(r ? { left: r.left, right: window.innerWidth - r.right } : { left: 0, right: 0 }) }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  useDismiss(true, onClose, ref)
  // hand focus back to wherever ⌘K was pressed (usually the composer)
  useEffect(() => {
    const from = document.activeElement as HTMLElement | null
    return () => { if (from?.isConnected) from.focus() }
  }, [])
  const hits = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return threads.filter(t => words.every(w => `${t.title} ${displayName(names, t.project)}`.toLowerCase().includes(w))).slice(0, 50)
  }, [q, threads, names])
  useEffect(() => setI(0), [q])
  useEffect(() => { ref.current?.querySelector('.is-cursor')?.scrollIntoView({ block: 'nearest' }) }, [i])
  return (
    <div className="palette-scrim" style={{ paddingLeft: edge.left, paddingRight: edge.right }}>
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
              <span className="palette-meta">{displayName(names, t.project)} · {ago(t.modified)}</span>
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
