import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { GearIcon, ReloadIcon } from '@radix-ui/react-icons'
import { OBSIDIAN_FORCES } from '../../shared/graph.mjs'
import { IconChevronRight, IconClose, IconSearch } from '../icons'
import { DEFAULT_DISPLAY, ObsidianGraph, type GraphDisplay, type GraphNode } from './ObsidianGraph'

type Group = { query: string; color: string }
type Filters = { search: string; orphans: boolean }
const DEFAULT_FILTERS: Filters = { search: '', orphans: true }
// colours a new group takes in turn (Obsidian's own colour palette: --color-red ... --color-pink, dark theme)
const GROUP_COLORS = ['#fb464c', '#e9973f', '#e0de71', '#44cf6e', '#53dfdd', '#027aff', '#a882ff', '#fa99cd']

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="gc-row">
      <span>{label}</span>
      <button role="switch" aria-checked={on} aria-label={label} className={`mp-switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}><span /></button>
    </label>
  )
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="gc-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} style={{ ['--p' as string]: `${((value - min) / (max - min)) * 100}%` }} />
    </label>
  )
}

function Section({ title, open, onToggle, children, actions }: { title: string; open: boolean; onToggle: () => void; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="gc-section">
      <div className="gc-head">
        <button className="gc-title" aria-expanded={open} onClick={onToggle}>
          <IconChevronRight size={12} className={`gc-chev${open ? ' is-open' : ''}`} />
          {title}
        </button>
        {actions}
      </div>
      {open && <div className="gc-body">{children}</div>}
    </div>
  )
}

/**
 * Obsidian's graph view: the whole graph, its tab title, and the controls panel in the top right
 * (Filters, Groups, Display, Forces), with Obsidian's defaults. Clicking a node opens that note.
 */
export function GraphView({ nodes, links, modified, onOpen, onClose }: {
  nodes: GraphNode[]; links: [string, string][]; modified: Map<string, number>; onOpen: (id: string) => void; onClose: () => void
}) {
  const [panel, setPanel] = useState(true)
  const [open, setOpen] = useState<Record<string, boolean>>({ filters: true })
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [groups, setGroups] = useState<Group[]>([])
  const [display, setDisplay] = useState<GraphDisplay>(DEFAULT_DISPLAY)
  const [forces, setForces] = useState(OBSIDIAN_FORCES)
  // Animate: notes appear in the order they were last written, over five seconds
  const [reveal, setReveal] = useState<number | null>(null)
  const order = useMemo(() => [...nodes].sort((a, b) => (modified.get(a.id) ?? 0) - (modified.get(b.id) ?? 0)).map(n => n.id), [nodes, modified])
  useEffect(() => {
    if (reveal == null) return
    if (reveal >= order.length) return void setReveal(null)
    const t = setTimeout(() => setReveal(r => (r ?? 0) + Math.max(1, Math.ceil(order.length / 60))), 5000 / 60)
    return () => clearTimeout(t)
  }, [reveal, order.length])

  const shown = useMemo(() => {
    const words = filters.search.toLowerCase().split(/\s+/).filter(Boolean)
    let keep = new Set(nodes.filter(n => words.every(w => `${n.id} ${n.label}`.toLowerCase().includes(w))).map(n => n.id))
    if (reveal != null) keep = new Set(order.slice(0, reveal).filter(id => keep.has(id)))
    const ls = links.filter(([a, b]) => keep.has(a) && keep.has(b))
    if (!filters.orphans) {
      const linked = new Set(ls.flat())
      keep = new Set([...keep].filter(id => linked.has(id)))
    }
    const colour = (n: GraphNode) => groups.find(g => g.query.trim() && `${n.id} ${n.label}`.toLowerCase().includes(g.query.trim().toLowerCase()))?.color
    return { nodes: nodes.filter(n => keep.has(n.id)).map(n => ({ ...n, color: colour(n) })), links: ls }
  }, [nodes, links, filters, groups, reveal, order])

  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }))
  const reset = () => (setFilters(DEFAULT_FILTERS), setGroups([]), setDisplay(DEFAULT_DISPLAY), setForces(OBSIDIAN_FORCES))
  return (
    <section className="graph-view" aria-label="Graph view">
      <header className="graph-view-head">
        <span className="graph-view-title">Graph view</span>
        <button className="icon-btn graph-view-close" aria-label="Close graph view" onClick={onClose}><IconClose size={14} /></button>
      </header>
      <div className="graph-view-body">
        <ObsidianGraph nodes={shown.nodes} links={shown.links} onOpen={onOpen} forces={forces} display={display} label="Graph of every note" />
        {panel ? (
          <div className="graph-controls">
            <div className="gc-buttons">
              <button className="icon-btn sm" aria-label="Restore default settings" title="Restore default settings" onClick={reset}><ReloadIcon width={13} height={13} /></button>
              <button className="icon-btn sm" aria-label="Close settings" title="Close" onClick={() => setPanel(false)}><IconClose size={13} /></button>
            </div>
            <Section title="Filters" open={!!open.filters} onToggle={() => toggle('filters')}>
              <label className="gc-search">
                <IconSearch size={12} />
                <input placeholder="Search files..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} aria-label="Search files" />
                {filters.search && <button className="gc-clear" aria-label="Clear search" onClick={() => setFilters(f => ({ ...f, search: '' }))}><IconClose size={10} /></button>}
              </label>
              <Toggle label="Orphans" on={filters.orphans} onChange={v => setFilters(f => ({ ...f, orphans: v }))} />
            </Section>
            <Section title="Groups" open={!!open.groups} onToggle={() => toggle('groups')}>
              {groups.map((g, i) => (
                <div key={i} className="gc-group">
                  <button className="gc-swatch" style={{ background: g.color }} aria-label="Change colour" onClick={() => setGroups(gs => gs.map((x, j) => (j === i ? { ...x, color: GROUP_COLORS[(GROUP_COLORS.indexOf(x.color) + 1) % GROUP_COLORS.length] } : x)))} />
                  <input placeholder="Enter query..." value={g.query} onChange={e => setGroups(gs => gs.map((x, j) => (j === i ? { ...x, query: e.target.value } : x)))} aria-label="Group query" />
                  <button className="icon-btn sm" aria-label="Delete group" onClick={() => setGroups(gs => gs.filter((_, j) => j !== i))}><IconClose size={11} /></button>
                </div>
              ))}
              <button className="btn gc-cta" onClick={() => setGroups(gs => [...gs, { query: '', color: GROUP_COLORS[gs.length % GROUP_COLORS.length] }])}>New group</button>
            </Section>
            <Section title="Display" open={!!open.display} onToggle={() => toggle('display')}>
              <Toggle label="Arrows" on={display.arrows} onChange={v => setDisplay(d => ({ ...d, arrows: v }))} />
              <Slider label="Text fade threshold" min={-3} max={3} step={0.1} value={display.textFade} onChange={v => setDisplay(d => ({ ...d, textFade: v }))} />
              <Slider label="Node size" min={0.1} max={5} step={0.01} value={display.nodeSize} onChange={v => setDisplay(d => ({ ...d, nodeSize: v }))} />
              <Slider label="Link thickness" min={0.1} max={5} step={0.01} value={display.lineSize} onChange={v => setDisplay(d => ({ ...d, lineSize: v }))} />
              <button className="btn gc-cta" onClick={() => setReveal(0)} disabled={reveal != null}>Animate</button>
            </Section>
            <Section title="Forces" open={!!open.forces} onToggle={() => toggle('forces')}>
              <Slider label="Center force" min={0} max={1} step={0.01} value={forces.center} onChange={v => setForces(f => ({ ...f, center: v }))} />
              <Slider label="Repel force" min={0} max={20} step={0.1} value={forces.repel} onChange={v => setForces(f => ({ ...f, repel: v }))} />
              <Slider label="Link force" min={0} max={1} step={0.01} value={forces.link} onChange={v => setForces(f => ({ ...f, link: v }))} />
              <Slider label="Link distance" min={30} max={500} step={1} value={forces.distance} onChange={v => setForces(f => ({ ...f, distance: v }))} />
            </Section>
          </div>
        ) : (
          <button className="icon-btn graph-controls-open" aria-label="Open graph settings" title="Open graph settings" onClick={() => setPanel(true)}><GearIcon width={14} height={14} /></button>
        )}
      </div>
    </section>
  )
}
