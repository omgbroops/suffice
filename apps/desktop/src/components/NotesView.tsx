import { useEffect, useMemo, useState } from 'react'
import { api, type NoteSummary } from '../api'
import { ago } from '../data'
import { IconSearch } from '../icons'
import { Prose } from './ThreadView'
import { baseName } from './Pickers'
import { ProjectEmblem } from './Sidebar'

const stem = (p: string) => p.split('/').pop()!.replace(/\.(md|markdown)$/i, '')
const dir = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** Wikilinks become ordinary links with a note: scheme, so Prose can render them. */
const linkify = (text: string) => text.replace(/\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g, (_, t: string, _h, alias?: string) => `[${(alias ?? t).trim()}](note:${encodeURIComponent(t.trim())})`)

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

type Node = { path: string; x: number; y: number; ring: 0 | 1 | 2 }

/**
 * Local graph: the open note, its direct links on one ring, their links on a second.
 * Text labels, not dots; hubs (over 12 links) are not expanded; edges light up on hover.
 */
function LocalGraph({ notes, current, project, onOpen }: { notes: NoteSummary[]; current: string; project: string; onOpen: (p: string) => void }) {
  const [hot, setHot] = useState<string | null>(null)
  const W = 360, H = 320, cx = W / 2, cy = H / 2
  const { nodes, edges, title } = useMemo(() => {
    const adj = new Map<string, Set<string>>()
    const add = (a: string, b: string) => (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b)
    for (const n of notes) for (const l of n.links) (add(n.path, l), add(l, n.path))
    const title = new Map(notes.map(n => [n.path, n.title]))
    const byTitle = (a: string, b: string) => (title.get(a) ?? a).localeCompare(title.get(b) ?? b)
    const ring1 = [...(adj.get(current) ?? [])].sort(byTitle).slice(0, 12)
    const seen = new Set([current, ...ring1])
    const nodes: Node[] = [{ path: current, x: cx, y: cy, ring: 0 }]
    const edges: [string, string][] = ring1.map(p => [current, p])
    // ellipses: labels run sideways, so rings are narrower than they are tall
    const R1 = [62, 96], R2 = [92, 140]
    const ang = new Map<string, number>()
    ring1.forEach((p, i) => {
      const a = (i / ring1.length) * Math.PI * 2 - Math.PI / 2
      ang.set(p, a)
      nodes.push({ path: p, x: cx + R1[0] * Math.cos(a), y: cy + R1[1] * Math.sin(a), ring: 1 })
    })
    let count = 0
    for (const p of ring1) {
      if ((adj.get(p)?.size ?? 0) > 12) continue
      const kids = [...(adj.get(p) ?? [])].filter(k => !seen.has(k)).sort(byTitle).slice(0, 3)
      kids.forEach((k, j) => {
        if (count >= 15) return
        seen.add(k)
        count++
        const spread = 0.62 / Math.max(1, ring1.length / 4)
        // never straight outward from the parent: that spot is under the parent's label
        const a = ang.get(p)! + (j - (kids.length - 1) / 2) * spread + (kids.length % 2 ? spread / 2 : 0)
        nodes.push({ path: k, x: cx + R2[0] * Math.cos(a), y: cy + R2[1] * Math.sin(a), ring: 2 })
        edges.push([p, k])
      })
    }
    // ring-1 notes that link to each other
    for (let i = 0; i < ring1.length; i++) for (let j = i + 1; j < ring1.length; j++) if (adj.get(ring1[i])?.has(ring1[j])) edges.push([ring1[i], ring1[j]])
    return { nodes, edges, title }
  }, [notes, current, cx, cy])
  const at = new Map(nodes.map(n => [n.path, n]))
  const near = hot ? new Set([hot, ...edges.filter(e => e.includes(hot)).flat()]) : null
  return (
    <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Linked notes" onMouseLeave={() => setHot(null)}>
      <g className="graph-edges">
        {edges.map(([a, b]) => {
          const p = at.get(a)!, q = at.get(b)!
          // edges bow slightly; ones between two side notes bow outward so they never cross the centre title
          const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, dx = q.x - p.x, dy = q.y - p.y
          const side = p.ring === 1 && q.ring === 1
          const md = Math.hypot(mx - cx, my - cy), len = Math.hypot(dx, dy)
          // outward from the centre; an edge through the centre bows sideways by a third of its length
          const ux = md > 1 ? (mx - cx) / md : -dy / len, uy = md > 1 ? (my - cy) / md : dx / len
          const bow = side ? Math.max(md * 0.45, len * 0.38 - md) : 0
          const ox = side ? ux * bow : -dy * 0.12, oy = side ? uy * bow : dx * 0.12
          const lit = near?.has(a) && near?.has(b) && (a === hot || b === hot)
          return <path key={`${a}>${b}`} d={`M${p.x},${p.y} Q${mx + ox},${my + oy} ${q.x},${q.y}`} className={lit ? 'is-hot' : near ? 'is-dim' : undefined} />
        })}
      </g>
      {nodes.map(n => {
        const cos = (n.x - cx) / Math.max(1, Math.hypot(n.x - cx, n.y - cy))
        // labels sit beside their dot, on the side away from the centre; only the open note is centred
        const anchor = n.ring === 0 ? 'middle' : n.ring === 2 && Math.abs(cos) < 0.08 ? 'middle' : cos >= 0 ? 'start' : 'end'
        const dx = anchor === 'start' ? 7 : anchor === 'end' ? -7 : 0
        const dy = n.ring === 0 ? 22 : anchor === 'middle' ? (n.y < cy ? -9 : 15) : 4
        const label = clip(title.get(n.path) ?? stem(n.path), n.ring === 2 ? 14 : n.ring === 1 ? 16 : 24)
        return (
          <g
            key={n.path}
            className={`graph-node ring-${n.ring}${near && !near.has(n.path) ? ' is-dim' : ''}`}
            style={{ transform: `translate(${n.x}px, ${n.y}px)` }}
            onMouseEnter={() => setHot(n.path)}
            onClick={() => n.ring && onOpen(n.path)}
            role={n.ring ? 'button' : undefined}
            tabIndex={n.ring ? 0 : undefined}
            aria-label={n.ring ? `Open ${title.get(n.path) ?? n.path}` : undefined}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && n.ring && (e.preventDefault(), onOpen(n.path))}
          >
            {n.ring === 0 ? (
              <foreignObject x={-9} y={-9} width={18} height={18}><ProjectEmblem path={project} size={18} /></foreignObject>
            ) : (
              <circle r={n.ring === 1 ? 2.5 : 1.75} />
            )}
            <text x={dx} y={dy} textAnchor={anchor}>{label}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function NotesView({ project }: { project: string }) {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    setNotes(null)
    api.notes(project).then(list => {
      setNotes(list)
      // start on the README if there is one, else the most connected note
      const deg = (n: NoteSummary) => n.links.length + list.filter(m => m.links.includes(n.path)).length
      setCurrent(c => (c && list.some(n => n.path === c) ? c : (list.find(n => /^readme\.md$/i.test(n.path)) ?? [...list].sort((a, b) => deg(b) - deg(a))[0])?.path ?? null))
    }, e => setError(e instanceof Error ? e.message : String(e)))
  }, [project])

  useEffect(() => {
    if (!current) return
    setError('')
    api.readNote(project, current).then(setText, e => setError(e instanceof Error ? e.message : String(e)))
  }, [project, current])

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return (notes ?? []).filter(n => words.every(w => `${n.title} ${n.path}`.toLowerCase().includes(w))).sort((a, b) => b.modified - a.modified)
  }, [notes, q])
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
        <label className="notes-search">
          <IconSearch size={13} />
          <input placeholder="Search notes" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <div className="notes-rows" role="listbox" aria-label="Notes">
          {list.map(n => (
            <button key={n.path} role="option" aria-selected={n.path === current} className={`notes-row${n.path === current ? ' is-active' : ''}`} onClick={() => setCurrent(n.path)} title={n.path}>
              <span className="side-thread-title">{n.title}</span>
              <span className="notes-row-meta">{dir(n.path) || baseName(project)}</span>
            </button>
          ))}
        </div>
      </div>
      <article className="notes-page">
        {note && (
          <div className="notes-crumbs">
            <span>{[baseName(project), ...dir(note.path).split('/').filter(Boolean)].join(' / ')}</span>
            <span className="meta">{ago(note.modified)}</span>
          </div>
        )}
        {error ? <div className="msg-error">{error}</div> : current && <Prose text={linkify(text)} onLink={href => { const p = resolveHref(href, current, notes ?? []); if (p) setCurrent(p) }} />}
      </article>
      <aside className="notes-side">
        {current && notes && <LocalGraph notes={notes} current={current} project={project} onOpen={setCurrent} />}
        {[['Linked from', backlinks.map(n => n.path)], ['Links to', note?.links ?? []]].map(([label, paths]) => (
          <section key={label as string} className="notes-links">
            <div className="side-group-label">{label as string} <span className="meta">{(paths as string[]).length}</span></div>
            {(paths as string[]).map(p => (
              <button key={p} className="notes-row" onClick={() => setCurrent(p)}>
                <span className="side-thread-title">{title(p)}</span>
              </button>
            ))}
          </section>
        ))}
      </aside>
    </div>
  )
}
