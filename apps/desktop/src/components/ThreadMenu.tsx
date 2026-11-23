import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type OpenTarget, type ThreadAction } from '../api'
import { IconChevronRight, IconDots } from '../icons'

type Row = { key: string; path?: string; project: string; pinned?: boolean; unread?: boolean; section?: string; running: boolean; title: string }
type Item = { id: string; label: string; key?: string; danger?: boolean; sub?: boolean; run: () => void }
type Mode = 'main' | 'open' | 'section' | 'new' | 'rename'

/** Pinned first, then newest: the order every thread list in the sidebar uses. */
export const pinnedFirst = <T extends { pinned?: boolean }>(rows: T[]): T[] => [...rows.filter(r => r.pinned), ...rows.filter(r => !r.pinned)]

/** Threads with no section first, then one labelled group per section. */
export function sectioned<T extends { key: string; section?: string }>(rows: T[], render: (t: T) => ReactNode): ReactNode[] {
  const names = [...new Set(rows.map(r => r.section).filter(Boolean))] as string[]
  return [
    ...rows.filter(r => !r.section).map(render),
    ...names.flatMap(n => [<div key={`s:${n}`} className="side-section">{n}</div>, ...rows.filter(r => r.section === n).map(render)]),
  ]
}

export function ArchivedList<T extends { key: string }>({ rows, render }: { rows: T[]; render: (t: T) => ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!rows.length) return null
  return (
    <>
      <button className="side-more side-archived" onClick={() => setOpen(o => !o)} aria-expanded={open}>Archived ({rows.length})</button>
      {open && <div className="side-projects">{rows.map(render)}</div>}
    </>
  )
}

/** One sidebar thread: the row, a hover ⋯ button and the right-click menu. */
export function ThreadRow({ t, sections, onAct, children }: { t: Row; sections: string[]; onAct: (a: ThreadAction, value?: string | boolean) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`side-thread-row${open ? ' is-open' : ''}`} onContextMenu={e => { e.preventDefault(); setOpen(true) }}>
      {children}
      <button className="icon-btn sm side-thread-more" aria-label="Thread options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <IconDots size={12} />
      </button>
      {open && <ThreadMenu t={t} sections={sections} onAct={onAct} onClose={() => setOpen(false)} />}
    </div>
  )
}

function ThreadMenu({ t, sections, onAct, onClose }: { t: Row; sections: string[]; onAct: (a: ThreadAction, value?: string | boolean) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>('main')
  const [sel, setSel] = useState(0)
  const [targets, setTargets] = useState<OpenTarget[]>([])
  const [text, setText] = useState(t.title)
  useEffect(() => { void api.openTargets().then(setTargets).catch(() => {}) }, [])

  const act = (a: ThreadAction, v?: string | boolean) => (onAct(a, v), onClose())
  const go = (m: Mode) => (setMode(m), setSel(0))
  const main: Item[] = [
    { id: 'open', label: 'Open in', sub: true, run: () => go('open') },
    { id: 'pin', label: t.pinned ? 'Unpin' : 'Pin', key: 'p', run: () => act('pin', !t.pinned) },
    { id: 'unread', label: t.unread ? 'Mark as read' : 'Mark as unread', key: 'u', run: () => act('unread', !t.unread) },
    { id: 'rename', label: 'Rename', key: 'r', run: () => (setText(t.title), go('rename')) },
    { id: 'fork', label: 'Fork', key: 'f', run: () => act('fork') },
    { id: 'section', label: 'Move to section', sub: true, run: () => go('section') },
    { id: 'archive', label: 'Archive', key: 'a', run: () => act('archive', true) },
    { id: 'delete', label: 'Delete', key: 'd', danger: true, run: () => act('delete') },
  ]
  const items: Item[] =
    mode === 'open' ? targets.map(x => ({ id: x.id, label: x.label, run: () => (void api.openIn(t.project, x.id).catch(() => {}), onClose()) }))
    : mode === 'section' ? [
        ...(t.section ? [{ id: 'none', label: 'No section', run: () => act('section', '') }] : []),
        ...sections.filter(s => s !== t.section).map(s => ({ id: `s:${s}`, label: s, run: () => act('section', s) })),
        { id: 'new', label: 'New section…', run: () => (setText(''), go('new')) },
      ]
    : mode === 'main' ? main : []
  const typing = mode === 'rename' || mode === 'new'

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.side-thread-more')) onClose() }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode === 'main' ? onClose() : go('main'); return }
      if (typing) return
      const k = e.key.toLowerCase()
      if (e.key === 'ArrowDown') (e.preventDefault(), setSel(s => (s + 1) % items.length))
      else if (e.key === 'ArrowUp') (e.preventDefault(), setSel(s => (s - 1 + items.length) % items.length))
      else if (e.key === 'ArrowLeft' && mode !== 'main') go('main')
      else if (e.key === 'Enter' || (e.key === 'ArrowRight' && items[sel]?.sub)) (e.preventDefault(), items[sel]?.run())
      else if (mode === 'main' && !e.metaKey && !e.ctrlKey && !e.altKey) { const hit = main.find(i => i.key === k); if (hit) (e.preventDefault(), hit.run()) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true) }
  })

  const submit = () => {
    const v = text.trim()
    if (!v) return
    act(mode === 'rename' ? 'rename' : 'section', v)
  }
  return (
    <div ref={ref} className="menu menu-bottom menu-right thread-menu" role="menu" onClick={e => e.stopPropagation()}>
      {typing ? (
        <form onSubmit={e => (e.preventDefault(), submit())}>
          <input className="thread-menu-input" autoFocus value={text} maxLength={120} placeholder={mode === 'rename' ? 'Thread name' : 'Section name'} aria-label={mode === 'rename' ? 'Thread name' : 'Section name'} onChange={e => setText(e.target.value)} onFocus={e => e.currentTarget.select()} />
        </form>
      ) : (
        items.map((i, n) => (
          <button key={i.id} role="menuitem" className={`menu-item thread-menu-item${n === sel ? ' is-selected' : ''}${i.danger ? ' is-danger' : ''}`} onMouseEnter={() => setSel(n)} onClick={i.run}>
            <span className="thread-menu-label">{i.label}</span>
            {i.key && <kbd className="thread-menu-key">{i.key.toUpperCase()}</kbd>}
            {i.sub && <IconChevronRight size={11} />}
          </button>
        ))
      )}
      {mode === 'open' && items.length === 0 && <div className="side-empty">Nothing found.</div>}
    </div>
  )
}
