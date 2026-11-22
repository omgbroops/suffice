import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, type NoteSummary } from '../api'
import { ago } from '../data'
import { buildTree, DEFAULT_NOTES_PROMPT, type TreeNode } from '../../shared/notes.mjs'
import { ChevronRightIcon, EnterFullScreenIcon } from '@radix-ui/react-icons'
import { IconChevronRight, IconClose, IconSearch } from '../icons'
import { GraphView } from './GraphView'
import { ObsidianGraph } from './ObsidianGraph'
import { Prose } from './ThreadView'
import { displayName } from './groups'
import { NamesContext } from './Sidebar'

const stem = (p: string) => p.split('/').pop()!.replace(/\.(md|markdown)$/i, '')
const dir = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

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

/** Every resolved [[link]] once, either direction, and each note's link count (Obsidian's node weight). */
function linkGraph(notes: NoteSummary[]) {
  const have = new Set(notes.map(n => n.path)), seen = new Set<string>(), links: [string, string][] = [], weight = new Map<string, number>()
  for (const n of notes)
    for (const l of n.links) {
      const key = [n.path, l].sort().join('\n')
      if (l === n.path || !have.has(l) || seen.has(key)) continue
      seen.add(key)
      links.push([n.path, l])
      for (const p of [n.path, l]) weight.set(p, (weight.get(p) ?? 0) + 1)
    }
  return { links, weight }
}

// the side panel is narrow: shorter links and a softer repel, Obsidian's own sliders turned down
const LOCAL_FORCES = { center: 0.1, repel: 6, link: 1, distance: 110 }

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
  const projectName = displayName(useContext(NamesContext), project)
  const [notes, setNotes] = useState<NoteSummary[] | null>(null)
  const [current, setCurrentRaw] = useState<string | null>(null)
  const [page, setPage] = useState<{ path: string; text?: string; error?: string } | null>(null)
  const [listError, setListError] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [graphView, setGraphView] = useState(false)
  // Abhay 11-22: the graph is opened by choice, never forced; the side graph starts closed and the choice is remembered
  const [localGraph, setLocalGraphRaw] = useState(() => { try { return localStorage.getItem('notes.localGraph') === '1' } catch { return false } })
  const setLocalGraph = (v: boolean) => { setLocalGraphRaw(v); try { localStorage.setItem('notes.localGraph', v ? '1' : '0') } catch {} }
  const modified = useMemo(() => new Map((notes ?? []).map(n => [n.path, n.modified])), [notes])
  const all = useMemo(() => linkGraph(notes ?? []), [notes])
  const allNodes = useMemo(() => (notes ?? []).map(n => ({ id: n.path, label: n.title, weight: all.weight.get(n.path) ?? 0 })), [notes, all])
  // local graph: the open note and the notes it links with (Obsidian's default depth 1)
  const local = useMemo(() => {
    if (!current) return { nodes: [], links: [] as [string, string][] }
    const ids = new Set([current, ...all.links.filter(l => l.includes(current)).flat()])
    return { nodes: allNodes.filter(n => ids.has(n.id)), links: all.links.filter(([a, b]) => ids.has(a) && ids.has(b)) }
  }, [current, all, allNodes])
  useEffect(() => {
    if (!graphView) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setGraphView(false)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [graphView])
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
        <p>No markdown notes in {projectName} yet.</p>
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
      {graphView ? (
        <GraphView nodes={allNodes} links={all.links} modified={modified} onOpen={p => (setCurrent(p), setGraphView(false))} onClose={() => setGraphView(false)} />
      ) : (
      <article className="notes-page">
        {listError && <div className="msg-error">{listError}</div>}
        {note && <div className="notes-crumbs">{[projectName, ...dir(note.path).split('/').filter(Boolean)].join(' / ')}<span className="meta">{ago(note.modified)}</span></div>}
        {note && <h1 className="note-title">{note.title}</h1>}
        {shown?.error ? <div className="msg-error">{shown.error}</div> : current && shown?.text != null && <Prose text={linkify(shown.text.replace(/^(\s*---\n[\s\S]*?\n---\n)?\s*#\s[^\n]*\n?/, '$1'))} onLink={href => { const p = resolveHref(href, current, notes ?? []); if (p) setCurrent(p) }} />}
      </article>
      )}
      <aside className="notes-side">
        {current && notes && (
          <div className="notes-graph-head">
            <button className="notes-graph-toggle" aria-expanded={localGraph} onClick={() => setLocalGraph(!localGraph)}>
              <ChevronRightIcon width={12} height={12} className={`gc-chev${localGraph ? ' is-open' : ''}`} />Graph
            </button>
            <button className="icon-btn sm" aria-label="Open graph view" title="Open graph view" onClick={() => setGraphView(true)}><EnterFullScreenIcon width={13} height={13} /></button>
          </div>
        )}
        {current && notes && localGraph && (
          <div className="notes-local">
            <ObsidianGraph nodes={local.nodes} links={local.links} focus={current} onOpen={setCurrent} forces={LOCAL_FORCES} maxFit={0.85} label={`Notes linked with ${note?.title ?? current}`} />
          </div>
        )}
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
