import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type NoteSummary } from '../api'
import { ago } from '../data'
import { buildTree, neighbourhood, DEFAULT_NOTES_PROMPT, type TreeNode } from '../../shared/notes.mjs'
import { IconChevronRight, IconSearch } from '../icons'
import { Prose } from './ThreadView'
import { baseName } from './Pickers'

const stem = (p: string) => p.split('/').pop()!.replace(/\.(md|markdown)$/i, '')
const dir = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** Wikilinks become ordinary links with a note: scheme, so Prose can render them. */
const linkify = (text: string) => text.replace(/\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g, (_, t: string, _h, alias?: string) => `[${(alias ?? t).trim()}](note:${encodeURIComponent(t.trim()).replace(/[()]/g, c => `%${c.charCodeAt(0).toString(16)}`)})`)

function resolveHref(href: string, from: string, notes: NoteSummary[]) {
  const lower = (s: string) => s.toLowerCase()
  if (href.startsWith('note:')) {
    const t = lower(decodeURIComponent(href.slice(5)))
    return notes.find(n => lower(n.path) === t || lower(n.path) === `${t}.md`)?.path ?? notes.find(n => lower(stem(n.path)) === lower(t.split('/').pop()!))?.path
  }
  if (!/\.(md|markdown)(#.*)?$/i.test(href) || /^[a-z]+:/i.test(href)) return undefined
  const parts = [...(dir(from) ? dir(from).split('/') : []), ...decodeURI(href.replace(/#.*$/, '')).split('/')]
  const out: string[] = []
  for (const p of parts) p === '..' ? out.pop() : p && p !== '.' && out.push(p)
  return notes.find(n => lower(n.path) === lower(out.join('/')))?.path
}

type P = { x: number; y: number; vx: number; vy: number; pin?: boolean }
const radius = (deg: number) => Math.min(8, 3 + 1.6 * Math.sqrt(deg))

/**
 * Local graph: open note plus links two deep. Force layout settles on its own (rAF runs only while it moves);
 * drag a node, wheel to zoom, drag the background to pan. Hover lights a node and its neighbours.
 */
function LocalGraph({ notes, current, onOpen }: { notes: NoteSummary[]; current: string; onOpen: (p: string) => void }) {
  const hood = useMemo(() => neighbourhood(notes, current), [notes, current])
  const title = useMemo(() => new Map(notes.map(n => [n.path, n.title])), [notes])
  const [hot, setHot] = useState<string | null>(null)
  const [, tick] = useState(0)
  const pos = useRef(new Map<string, P>())
  const view = useRef({ x: 0, y: 0, k: 1 })
  const alpha = useRef(0)
  const raf = useRef(0)
  const svg = useRef<SVGSVGElement>(null)
  const hoodRef = useRef(hood)
  hoodRef.current = hood
  const W = 360, H = 320
  const touched = useRef(false)

  const step = () => {
    raf.current = 0
    const { nodes, edges } = hoodRef.current, P = pos.current, a = alpha.current
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const p = P.get(nodes[i].path)!, q = P.get(nodes[j].path)!
        const dx = q.x - p.x, dy = q.y - p.y, d2 = Math.max(dx * dx + dy * dy, 36), d = Math.sqrt(d2), f = (7000 * a) / d2
        p.vx -= (dx / d) * f; p.vy -= (dy / d) * f; q.vx += (dx / d) * f; q.vy += (dy / d) * f
      }
    for (const [s, t] of edges) {
      const p = P.get(s)!, q = P.get(t)!
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.max(Math.hypot(dx, dy), 1), f = (d - 70) * 0.05 * a
      p.vx += (dx / d) * f; p.vy += (dy / d) * f; q.vx -= (dx / d) * f; q.vy -= (dy / d) * f
    }
    for (const p of P.values()) {
      p.vx -= p.x * 0.008 * a; p.vy -= p.y * 0.008 * a
      if (p.pin) { p.vx = p.vy = 0; continue }
      p.vx *= 0.78; p.vy *= 0.78; p.x += p.vx; p.y += p.vy
    }
    // keep the cluster centred: forces alone leave the initial offset in place
    let mx = 0, my = 0
    for (const p of P.values()) (mx += p.x, my += p.y)
    mx /= P.size || 1; my /= P.size || 1
    for (const p of P.values()) if (!p.pin) (p.x -= mx, p.y -= my)
    alpha.current *= 0.985
    tick(n => n + 1)
    if (alpha.current > 0.02) raf.current = requestAnimationFrame(step)
    if (!touched.current && P.size) {
      // zoom to fit so every node and label stays in view while it settles
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
      for (const p of P.values()) (x0 = Math.min(x0, p.x - 40), x1 = Math.max(x1, p.x + 40), y0 = Math.min(y0, p.y - 12), y1 = Math.max(y1, p.y + 24))
      const k = Math.min(1.4, (W - 24) / (x1 - x0), (H - 24) / (y1 - y0))
      view.current = { x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k, k }
      tick(n => n + 1)
    }
  }
  const heat = (a = 1) => { alpha.current = Math.max(alpha.current, a); if (!raf.current) raf.current = requestAnimationFrame(step) }

  useEffect(() => {
    const P = pos.current, keep = new Set(hood.nodes.map(n => n.path))
    for (const k of [...P.keys()]) if (!keep.has(k)) P.delete(k)
    const count = [0, 0, 0]
    const total = [0, 1, 2].map(r => hood.nodes.filter(n => n.ring === r).length)
    for (const n of hood.nodes) {
      const i = count[n.ring]++
      if (P.has(n.path)) { P.get(n.path)!.pin = false; continue }
      const a = (i / Math.max(1, total[n.ring])) * Math.PI * 2 - Math.PI / 2 + n.ring * 0.5, r = n.ring * 58
      P.set(n.path, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 })
    }
    view.current = { x: 0, y: 0, k: 1 }
    touched.current = false
    heat(1)
    return () => { cancelAnimationFrame(raf.current); raf.current = 0 }
  }, [hood])

  // client pixels -> svg units (the svg scales to its column)
  const toSvg = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect(), s = W / (r.width || W) // a hidden column has width 0
    return { x: (cx - r.left) * s - W / 2, y: (cy - r.top) * s - H / 2, s }
  }
  useEffect(() => {
    const el = svg.current!
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      touched.current = true
      const v = view.current, k = Math.min(3, Math.max(0.4, v.k * Math.exp(-e.deltaY * 0.0015))), p = toSvg(e.clientX, e.clientY)
      v.x = p.x - ((p.x - v.x) * k) / v.k; v.y = p.y - ((p.y - v.y) * k) / v.k; v.k = k
      tick(n => n + 1)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const drag = useRef<{ path?: string; sx: number; sy: number; moved: number; vx: number; vy: number } | null>(null)
  const down = (e: React.PointerEvent, path?: string) => {
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    touched.current = true
    drag.current = { path, sx: e.clientX, sy: e.clientY, moved: 0, vx: view.current.x, vy: view.current.y }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.sx, e.clientY - d.sy))
    if (d.moved < 4) return
    const v = view.current
    if (d.path) {
      const p = toSvg(e.clientX, e.clientY), n = pos.current.get(d.path)!
      n.x = (p.x - v.x) / v.k; n.y = (p.y - v.y) / v.k; n.pin = true
      heat(0.4)
    } else {
      const s = toSvg(0, 0).s
      v.x = d.vx + (e.clientX - d.sx) * s; v.y = d.vy + (e.clientY - d.sy) * s
      tick(n => n + 1)
    }
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d?.path) return
    const n = pos.current.get(d.path)
    if (n) n.pin = false
    if (d.moved < 4 && d.path !== current) onOpen(d.path)
    else heat(0.3)
  }

  const v = view.current
  const near = hot ? new Set([hot, ...hood.edges.filter(e => e.includes(hot)).flat()]) : null
  const labelOpacity = Math.min(1, Math.max(0, (v.k - 0.5) * 2))
  return (
    <svg ref={svg} className="graph" viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`} role="group" aria-label="Linked notes" onPointerDown={e => down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onMouseLeave={() => setHot(null)}>
      <g transform={`translate(${v.x} ${v.y}) scale(${v.k})`}>
        <g className="graph-edges">
          {hood.edges.map(([a, b]) => {
            const p = pos.current.get(a), q = pos.current.get(b)
            if (!p || !q) return null
            const lit = hot && (a === hot || b === hot)
            return <line key={`${a}>${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={lit ? 'is-hot' : near ? 'is-dim' : undefined} />
          })}
        </g>
        {hood.nodes.map(n => {
          const p = pos.current.get(n.path)
          if (!p) return null
          const r = radius(n.deg), on = near?.has(n.path)
          const label = clip(title.get(n.path) ?? stem(n.path), 22)
          return (
            <g key={n.path} className={`graph-node${n.ring === 0 ? ' is-current' : ''}${on ? ' is-near' : ''}${near && !on ? ' is-dim' : ''}`} transform={`translate(${p.x} ${p.y})`}
              onPointerDown={e => down(e, n.path)} onMouseEnter={() => setHot(n.path)}
              role="button" tabIndex={0} aria-label={`Open ${title.get(n.path) ?? n.path}`} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && n.ring && (e.preventDefault(), onOpen(n.path))}>
              <circle r={r} />
              <text y={r + 10} textAnchor="middle" style={{ opacity: hot === n.path || n.ring === 0 ? 1 : labelOpacity }}>{label}</text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}

function Tree({ node, depth, open, toggle, current, onOpen, all }: { node: TreeNode; depth: number; open: Set<string>; toggle: (p: string) => void; current: string | null; onOpen: (p: string) => void; all: boolean }) {
  return (
    <>
      {node.folders.map(f => {
        const isOpen = all || open.has(f.path)
        return (
          <div key={f.path}>
            <button className="tree-row tree-folder" aria-expanded={isOpen} onClick={() => toggle(f.path)}>
              <IconChevronRight size={12} className={`tree-chev${isOpen ? ' is-open' : ''}`} />
              <span className="tree-name">{f.name}</span>
            </button>
            {isOpen && <div className="tree-kids"><Tree node={f} depth={depth + 1} open={open} toggle={toggle} current={current} onOpen={onOpen} all={all} /></div>}
          </div>
        )
      })}
      {node.notes.map(p => (
        <button key={p} className={`tree-row tree-note${p === current ? ' is-active' : ''}`} aria-current={p === current} onClick={() => onOpen(p)} title={p}>
          <span className="tree-name">{stem(p)}</span>
        </button>
      ))}
    </>
  )
}

// the note last open in each project, so leaving Notes and coming back lands in the same place
const lastNote = new Map<string, string>()

/** Explorer-header popover: the editable generation prompt (saved on blur) and the Generate button. */
function GenerateMenu({ prompt, onPrompt, onGenerate }: { prompt: string; onPrompt: (p: string) => void; onGenerate: (p: string) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(prompt)
  const root = useRef<HTMLDivElement>(null)
  // reopening shows the saved prompt, even after the box was cleared and dismissed
  useEffect(() => { if (open) setText(prompt) }, [prompt, open])
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', off)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', off) }
  }, [open])
  const save = () => text.trim() && text !== prompt && onPrompt(text)
  return (
    <div className="menu-root notes-gen" ref={root}>
      <button className="notes-gen-btn" aria-expanded={open} aria-label="Generate notes" onClick={() => setOpen(o => !o)}>Generate</button>
      {open && (
        <div className="menu menu-bottom notes-gen-pop" role="dialog" aria-label="Generate notes">
          <textarea value={text} onChange={e => setText(e.target.value)} onBlur={save} spellCheck={false} aria-label="Prompt" />
          <div className="notes-gen-foot">
            <button className="btn-link" onClick={() => { setText(DEFAULT_NOTES_PROMPT); onPrompt(DEFAULT_NOTES_PROMPT) }} disabled={text === DEFAULT_NOTES_PROMPT}>Reset</button>
            <button className="btn btn-primary" disabled={!text.trim()} onClick={() => { save(); setOpen(false); onGenerate(text) }}>Generate</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function NotesView({ project, prompt, onPrompt, onGenerate }: { project: string; prompt?: string; onPrompt: (p: string) => void; onGenerate: (p: string) => void }) {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null)
  const [current, setCurrentRaw] = useState<string | null>(null)
  const [page, setPage] = useState<{ path: string; text?: string; error?: string } | null>(null)
  const [listError, setListError] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const setCurrent = (p: string) => (lastNote.set(project, p), setCurrentRaw(p))

  useEffect(() => {
    let live = true
    setNotes(null)
    setCurrentRaw(null)
    setListError('')
    api.notes(project).then(
      list => {
        if (!live) return
        setNotes(list)
        // the last note open here, else the README, else the most connected note
        const deg = (n: NoteSummary) => n.links.length + list.filter(m => m.links.includes(n.path)).length
        const last = lastNote.get(project)
        setCurrentRaw((last && list.some(n => n.path === last) ? last : (list.find(n => /^readme\.md$/i.test(n.path)) ?? [...list].sort((a, b) => deg(b) - deg(a))[0])?.path) ?? null)
      },
      e => live && setListError(e instanceof Error ? e.message : String(e)),
    )
    return () => { live = false }
  }, [project])

  useEffect(() => {
    if (!current) return
    let live = true
    api.readNote(project, current).then(
      text => live && setPage({ path: current, text }),
      e => live && setPage({ path: current, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => { live = false }
  }, [project, current])
  // a page only shows under its own note, never a slower read for a note already left
  const shown = page?.path === current ? page : null

  const tree = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return buildTree((notes ?? []).filter(n => words.every(w => `${n.title} ${n.path}`.toLowerCase().includes(w))).map(n => n.path))
  }, [notes, q])
  // the open note's folders stay open, so it is always visible in the tree
  useEffect(() => {
    if (!current || !current.includes('/')) return
    const parts = current.split('/').slice(0, -1)
    setOpen(o => new Set([...o, ...parts.map((_, i) => parts.slice(0, i + 1).join('/'))]))
  }, [current])
  const toggle = (p: string) => setOpen(o => { const n = new Set(o); n.has(p) ? n.delete(p) : n.add(p); return n })
  const note = notes?.find(n => n.path === current)
  const backlinks = (notes ?? []).filter(n => current && n.links.includes(current))
  const title = (p: string) => notes?.find(n => n.path === p)?.title ?? stem(p)

  if (notes && notes.length === 0)
    return (
      <div className="notes-empty">
        <p>No markdown notes in {baseName(project)} yet.</p>
        <p className="meta">Notes are the .md files in the project folder; [[links]] between them draw the graph.</p>
      </div>
    )

  return (
    <div className="notes">
      <div className="notes-list">
        <div className="notes-head">
          <label className="notes-search">
            <IconSearch size={13} />
            <input placeholder="Search notes" value={q} onChange={e => setQ(e.target.value)} />
          </label>
          <GenerateMenu prompt={prompt || DEFAULT_NOTES_PROMPT} onPrompt={onPrompt} onGenerate={onGenerate} />
        </div>
        <div className="notes-rows" role="tree" aria-label="Notes">
          <Tree node={tree} depth={0} open={open} toggle={toggle} current={current} onOpen={setCurrent} all={!!q.trim()} />
        </div>
      </div>
      <article className="notes-page">
        {listError && <div className="msg-error">{listError}</div>}
        {note && <div className="notes-crumbs">{[baseName(project), ...dir(note.path).split('/').filter(Boolean)].join(' / ')}<span className="meta">{ago(note.modified)}</span></div>}
        {note && <h1 className="note-title">{note.title}</h1>}
        {shown?.error ? <div className="msg-error">{shown.error}</div> : current && shown?.text != null && <Prose text={linkify(shown.text.replace(/^(\s*---\n[\s\S]*?\n---\n)?\s*#\s[^\n]*\n?/, '$1'))} onLink={href => { const p = resolveHref(href, current, notes ?? []); if (p) setCurrent(p) }} />}
      </article>
      <aside className="notes-side">
        {current && notes && <LocalGraph notes={notes} current={current} onOpen={p => setCurrent(p)} />}
        {[['Linked from', backlinks.map(n => n.path)], ['Links to', note?.links ?? []]].filter(([, paths]) => paths.length).map(([label, paths]) => (
          <section key={label as string} className="notes-links">
            <div className="side-group-label">{label as string} <span className="meta">{(paths as string[]).length}</span></div>
            {(paths as string[]).map(p => (
              <button key={p} className="tree-row" onClick={() => setCurrent(p)}>
                <span className="tree-name">{title(p)}</span>
              </button>
            ))}
          </section>
        ))}
      </aside>
    </div>
  )
}
