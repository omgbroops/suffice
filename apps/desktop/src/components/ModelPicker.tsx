import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Mode, ModelInfo } from '../api'
import { IconBolt as IconLightning, IconCheck, IconChevronDown, IconLayers, IconMixer, IconSearch, IconTarget } from '../icons'
import { Dropdown } from './Dropdown'

const LIST_W = 300
const DETAIL_W = 300
const MAX_H = 460

export const EFFORT_LABEL: Record<string, string> = { off: 'Off', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high' }
const SHORT: Record<string, string> = { off: 'Off', minimal: 'Min', low: 'Low', medium: 'Med', high: 'High', xhigh: 'XHigh' }

export const MODE_INFO: Record<Mode, { name: string; note: string; icon: ReactNode }> = {
  balanced: { name: 'Balanced', note: 'Regular Suffice: one model at the effort you pick', icon: <IconLayers size={14} /> },
  efficient: { name: 'Efficient', note: 'A cheap model tries first; the lead model runs only if it makes no changes', icon: <IconTarget size={14} /> },
  fast: { name: 'Fast', note: 'Races three low-effort attempts and keeps the first finished patch', icon: <IconLightning size={14} /> },
}

type Order = 'default' | 'cost'
type Section = { title?: string; items: Item[] }
type Item = { kind: 'mode'; id: Mode } | { kind: 'model'; m: ModelInfo }
const itemId = (it: Item) => (it.kind === 'mode' ? `mode:${it.id}` : it.m.id)

const blended = (m: ModelInfo) => m.cost.input * 0.75 + m.cost.output * 0.25
const money = (n: number) => (n === 0 ? '$0' : `$${n < 1 ? +n.toFixed(3) : +n.toFixed(2)}`)
const ctx = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : `${Math.round(n / 1000)}K`)
export const shortName = (name: string) => name.replace(/^GPT-[\d.]+\s+/, '') || name

function relativeCost(models: ModelInfo[]) {
  const values = models.map(blended).filter(v => v > 0)
  const lo = Math.log(Math.min(...values)), hi = Math.log(Math.max(...values))
  return (m: ModelInfo) => (blended(m) > 0 && hi > lo ? (Math.log(blended(m)) - lo) / (hi - lo) : 0)
}

// Priority tier is OpenAI's priority processing; engines that list their modes (Claude Code) have no such tier
const priorityOk = (models: ModelInfo[]) => !models[0]?.modes
const effortIn = (m: ModelInfo | undefined, wanted?: string) => (!m?.efforts.length ? undefined : m.efforts.includes(wanted ?? '') ? wanted : m.efforts.includes('low') ? 'low' : m.efforts[0])

function CostMeter({ cost }: { cost: number }) {
  return (
    <span className="mp-meter" aria-hidden>
      <span style={{ width: `${Math.max(8, Math.min(1, cost) * 100)}%`, background: cost < 0.34 ? 'var(--green)' : cost < 0.67 ? 'var(--amber)' : 'var(--red)' }} />
    </span>
  )
}

const BAR = 44, SPAN = 0.42
/**
 * Devin's cost bar (Abhay 11-20: colour where the reference uses it): a thin track and a segment placed by the
 * model's blended price, coloured by where it sits (green cheap, orange middle, purple dear), a white dot on the price.
 */
function CostBar({ m, cost }: { m: ModelInfo; cost: number }) {
  const d = Math.min(1, Math.max(0, cost)), a = Math.min(1 - SPAN, Math.max(0, d - SPAN / 2))
  return (
    <span className="mp-bar" title={`${money(m.cost.input)} in / ${money(m.cost.output)} out per 1M`} aria-label={`${money(m.cost.input)} in, ${money(m.cost.output)} out per million tokens`}>
      <span className="mp-bar-range" style={{ left: a * BAR, width: SPAN * BAR, backgroundPosition: `${-a * BAR}px 0` }} />
      <span className="mp-bar-dot" style={{ left: Math.min(BAR - 2, Math.max(2, d * BAR)) }} />
    </span>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`mp-switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

/** A model chooser inside the detail panel (the lead or the cheap model). */
function ModelSelect({ models, value, onChange, label }: { models: ModelInfo[]; value: string; onChange: (id: string) => void; label: string }) {
  const current = models.find(m => m.id === value)
  return (
    <Dropdown
      width={240}
      align="right"
      maxHeight={320}
      trigger={({ open, toggle, ref }) => (
        <button ref={ref} className={`mp-select${open ? ' is-open' : ''}`} onClick={toggle} aria-label={label} aria-expanded={open}>
          {current?.name ?? value}
          <IconChevronDown size={12} />
        </button>
      )}
    >
      {close => (
        <div className="dd-list">
          {models.map(m => (
            <button
              key={m.id}
              className={`dd-row${m.id === value ? ' is-selected' : ''}`}
              onClick={() => {
                onChange(m.id)
                close()
              }}
            >
              <span className="dd-title">{m.name}</span>
              {m.id === value && <IconCheck size={13} className="dd-check" />}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

function Effort({ m, value, onChange }: { m: ModelInfo; value?: string; onChange: (e: string) => void }) {
  const levels = m.efforts
  const track = useRef<HTMLDivElement>(null)
  if (!levels.length) return null
  const i = Math.max(0, levels.indexOf(value ?? ''))
  const at = levels.length > 1 ? i / (levels.length - 1) : 1
  const pick = (x: number) => {
    const r = track.current!.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (x - r.left) / r.width))
    onChange(levels[Math.round(t * (levels.length - 1))])
  }
  return (
    <div className="mp-effort">
      <div className="mp-kv"><span>Reasoning</span><span className="mp-kv-v">{EFFORT_LABEL[levels[i]]}</span></div>
      <div
        ref={track}
        className="mp-slider"
        role="slider"
        tabIndex={0}
        aria-label="Reasoning effort"
        aria-valuetext={EFFORT_LABEL[levels[i]]}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX) }}
        onPointerMove={e => e.buttons & 1 && pick(e.clientX)}
        onKeyDown={e => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(levels[Math.min(levels.length - 1, i + 1)])
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(levels[Math.max(0, i - 1)])
        }}
      >
        <span className="mp-slider-fill" style={{ width: `calc(${at * 100}% - ${at * 14}px + 14px)` }} />
        {levels.map((l, j) => j > i && <span key={l} className="mp-slider-tick" style={{ left: `calc(${(j / (levels.length - 1)) * 100}% - ${(j / (levels.length - 1)) * 14}px + 7px)` }} />)}
        <span className="mp-slider-thumb" style={{ left: `calc(${at * 100}% - ${at * 14}px)` }} />
      </div>
    </div>
  )
}

function Prices({ m }: { m: ModelInfo }) {
  if (m.engine === 'codex') return <div className="mp-kvs"><div className="mp-kv"><span>Runs on</span><span className="mp-kv-v">Codex · ChatGPT plan</span></div></div>
  return (
    <div className="mp-kvs">
      {m.contextWindow > 0 && <div className="mp-kv"><span>Context</span><span className="mp-kv-v">{ctx(m.contextWindow)}</span></div>}
      <div className="mp-kv"><span>Input</span><span className="mp-kv-v">{money(m.cost.input)}<span className="mp-faint"> / 1M</span></span></div>
      <div className="mp-kv"><span>Cached</span><span className="mp-kv-v">{money(m.cost.cacheRead)}<span className="mp-faint"> / 1M</span></span></div>
      <div className="mp-kv"><span>Output</span><span className="mp-kv-v">{money(m.cost.output)}<span className="mp-faint"> / 1M</span></span></div>
    </div>
  )
}

function Scale(_: { cost: number; label?: string }) {
  return null
}

type PickerProps = {
  models: ModelInfo[]
  mode: Mode
  value: string
  cheap: string
  efforts: Record<string, string>
  fast: Record<string, boolean>
  recent: string[]
  onMode: (mode: Mode) => void
  onChange: (id: string) => void
  onCheap: (id: string) => void
  onEffort: (id: string, effort: string) => void
  onFast: (id: string, on: boolean) => void
}

function ModeDetail({ mode, p, costOf, maxHeight }: { mode: Mode; p: PickerProps; costOf: (m: ModelInfo) => number; maxHeight?: CSSProperties['maxHeight'] }) {
  const lead = p.models.find(m => m.id === p.value)
  const cheap = p.models.find(m => m.id === p.cheap)
  const info = MODE_INFO[mode]
  return (
    <div className="mp-detail" style={{ width: DETAIL_W, maxHeight }}>
      <div className="mp-detail-head">
        <span className="mp-detail-name">{info.name}</span>
      </div>
      <div className="mp-detail-sub">{info.note}</div>
      <div className="mp-field">
        <span>{mode === 'efficient' ? 'Lead' : 'Model'}</span>
        <ModelSelect models={p.models} value={p.value} onChange={p.onChange} label={mode === 'efficient' ? 'Lead model' : 'Model'} />
      </div>
      {lead && mode !== 'fast' && <Effort m={lead} value={effortIn(lead, p.efforts[lead.id])} onChange={e => p.onEffort(lead.id, e)} />}
      {mode === 'fast' && (
        <div className="mp-field">
          <span>Effort</span>
          <span className="mp-faint">Low, three attempts</span>
        </div>
      )}
      {mode === 'efficient' && (
        <div className="mp-field">
          <span>Cheap model</span>
          <ModelSelect models={p.models} value={p.cheap} onChange={p.onCheap} label="Cheap model" />
        </div>
      )}
      {mode === 'efficient' && p.cheap === p.value && <div className="mp-detail-sub mp-warn">The lead and cheap model are the same, so escalating changes nothing. Pick a stronger lead.</div>}
      {lead && priorityOk(p.models) && (
        <div className="mp-field">
          <span>Priority tier</span>
          <Switch on={!!p.fast[lead.id]} onChange={v => p.onFast(lead.id, v)} label="Priority tier" />
        </div>
      )}
      <div className="mp-rule" />
      <div className="mp-cost-head">
        <span>Cost</span>
        <span className="mp-faint">{mode === 'efficient' ? 'Lead runs only on a miss' : mode === 'fast' ? 'About three low-effort runs' : 'Per million tokens'}</span>
      </div>
      {mode === 'efficient' && cheap && lead ? (
        <>
          <Scale cost={costOf(cheap)} label={shortName(cheap.name)} />
          <Prices m={cheap} />
          <div className="mp-detail-sub mp-escalate">
            If it escalates: {shortName(lead.name)} at {money(lead.cost.input)} in, {money(lead.cost.output)} out per 1M
          </div>
        </>
      ) : lead ? (
        <>
          <Scale cost={mode === 'fast' ? Math.min(1, costOf(lead) + 0.25) : costOf(lead)} label={mode === 'fast' ? `${shortName(lead.name)} ×3` : undefined} />
          <Prices m={lead} />
        </>
      ) : null}
    </div>
  )
}

function ModelDetail({ m, p, cost, maxHeight }: { m: ModelInfo; p: PickerProps; cost: number; maxHeight?: CSSProperties['maxHeight'] }) {
  const effort = effortIn(m, p.efforts[m.id])
  return (
    <div className="mp-detail" style={{ width: DETAIL_W, maxHeight }}>
      <div className="mp-detail-head">
        <span className="mp-detail-name">{m.name}</span>
        {effort && <span className="mp-faint">{EFFORT_LABEL[effort] ?? effort}</span>}
      </div>
      
      <Effort m={m} value={effort} onChange={e => p.onEffort(m.id, e)} />
      {priorityOk(p.models) && (
        <div className="mp-field">
          <span>Priority tier</span>
          <Switch on={!!p.fast[m.id]} onChange={v => p.onFast(m.id, v)} label="Priority tier" />
        </div>
      )}
      <div className="mp-rule" />
      <Scale cost={cost} />
      <Prices m={m} />
    </div>
  )
}

const RECOMMENDED = /^gpt-6/

export function ModelPicker(p: PickerProps) {
  const { models, value, mode, efforts, fast, recent } = p
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<Order>('default')
  const [sortOpen, setSortOpen] = useState(false)
  const [hi, setHi] = useState('')
  const [hiKey, setHiKey] = useState('')
  const [pos, setPos] = useState<CSSProperties & { up?: boolean }>({})
  const trigger = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  // Escape closes the picker wherever focus is (a click on a non-focusable part used to leave Escape dead)
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => {
      // a model menu open inside the detail panel takes Escape for itself
      if (e.key !== 'Escape' || document.querySelector('.dd')) return
      e.preventDefault()
      if (sortOpen) setSortOpen(false)
      else {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, sortOpen])
  const listRef = useRef<HTMLDivElement>(null)
  const byId = useMemo(() => new Map(models.map(m => [m.id, m])), [models])
  const costOf = useMemo(() => relativeCost(models), [models])
  const current = byId.get(value)
  const cheapModel = byId.get(p.cheap)
  const selectedId = mode === 'balanced' ? value : `mode:${mode}`

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase()
    const modes: Item[] = (['balanced', 'efficient', 'fast'] as Mode[]).filter(id => !q || id.includes(q)).map(id => ({ kind: 'mode', id }))
    const asItems = (ms: ModelInfo[]): Item[] => ms.map(m => ({ kind: 'model', m }))
    if (q) return [{ items: [...modes, ...asItems(models.filter(m => `${m.name} ${m.id}`.toLowerCase().includes(q)))] }]
    if (order === 'cost') return [{ items: modes }, { title: 'By cost', items: asItems([...models].sort((a, b) => blended(a) - blended(b))) }]
    const rec = recent.map(id => byId.get(id)).filter((m): m is ModelInfo => !!m)
    const recommended = models.filter(m => RECOMMENDED.test(m.id)).sort((a, b) => b.id.localeCompare(a.id))
    const rest = models.filter(m => !RECOMMENDED.test(m.id)).sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))
    return [
      { items: modes },
      ...(rec.length ? [{ title: 'Recently used', items: asItems(rec) }] : []),
      { title: 'Recommended', items: asItems(recommended) },
      { title: 'More models', items: asItems(rest) },
    ].filter(s => s.items.length)
  }, [query, order, recent, models, byId])

  const flat = useMemo(() => sections.flatMap((s, si) => s.items.map(it => ({ it, key: `${si}:${itemId(it)}` }))), [sections])

  const place = () => {
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = above >= Math.min(MAX_H, below) || above > below
    const right = Math.max(8, window.innerWidth - r.right)
    setPos(up ? { up, right, bottom: window.innerHeight - r.top + 8, maxHeight: Math.min(MAX_H, above - 8) } : { up, right, top: r.bottom + 8, maxHeight: Math.min(MAX_H, below - 8) })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    setQuery('')
    setHi(selectedId)
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    const first = flat.find(f => itemId(f.it) === hi) ?? flat[0]
    setHiKey(first?.key ?? '')
    if (first && itemId(first.it) !== hi) setHi(itemId(first.it))
  }, [flat, open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const t = e.target as Element
      // Menus opened from the detail panel live in their own portal.
      if (!pop.current?.contains(t) && !trigger.current?.contains(t) && !t.closest?.('.dd')) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector(`[data-key="${CSS.escape(hiKey)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hiKey])

  const modeOff = (id: string) => !!models[0]?.modes && !models[0].modes.includes(id)
  const choose = (it: Item) => {
    if (it.kind === 'mode' && modeOff(it.id)) return
    if (it.kind === 'mode') p.onMode(it.id)
    else {
      p.onMode('balanced')
      p.onChange(it.m.id)
    }
    setOpen(false)
    trigger.current?.focus()
  }

  const move = (d: number) => {
    if (!flat.length) return
    const i = flat.findIndex(f => f.key === hiKey)
    const next = flat[(i + d + flat.length) % flat.length]
    setHiKey(next.key)
    setHi(itemId(next.it))
  }

  const shownModel = byId.get(hi)
  const shownMode = hi.startsWith('mode:') ? (hi.slice(5) as Mode) : null
  const label =
    mode === 'efficient' ? (
      <>
        Efficient<span className="mp-faint">{cheapModel ? shortName(cheapModel.name) : p.cheap} → {current ? shortName(current.name) : value}</span>
      </>
    ) : mode === 'fast' ? (
      <>
        Fast<span className="mp-faint">{current ? shortName(current.name) : value} ×3</span>
      </>
    ) : (
      <>
        {current?.name ?? value}
        {current && effortIn(current, efforts[current.id]) && <span className="mp-faint">{EFFORT_LABEL[effortIn(current, efforts[current.id])!]}</span>}
      </>
    )

  const modeSub = (id: Mode) => {
    const lead = current ? shortName(current.name) : value
    if (id === 'efficient') return `${cheapModel ? shortName(cheapModel.name) : p.cheap} → ${lead}`
    if (id === 'fast') return `${lead} ×3`
    return current?.name ?? value
  }

  return (
    <>
      <button ref={trigger} className={`ghost-btn mp-trigger${open ? ' is-open' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} disabled={!models.length}>
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className={`mp${pos.up ? ' is-up' : ''}`}
            style={{ right: pos.right, top: pos.top, bottom: pos.bottom }}
          >
            {shownMode ? <ModeDetail mode={shownMode} p={p} costOf={costOf} maxHeight={pos.maxHeight} /> : shownModel ? <ModelDetail m={shownModel} p={p} cost={costOf(shownModel)} maxHeight={pos.maxHeight} /> : null}
            <div className="mp-list" style={{ width: LIST_W, maxHeight: pos.maxHeight }}>
              <div className="mp-search">
                <IconSearch size={14} />
                <input
                  autoFocus
                  value={query}
                  placeholder="Search models and modes"
                  aria-label="Search models"
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => {
                    // nothing typed: left/right step the hovered model's effort; while typing they move the caret
                    if (!query && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                      const m = byId.get(hi) ?? (hi.startsWith('mode:') && hi !== 'mode:fast' ? current : undefined)
                      const cur = m && effortIn(m, efforts[m.id])
                      if (m && cur) {
                        e.preventDefault()
                        const i = m.efforts.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : -1)
                        if (i >= 0 && i < m.efforts.length) p.onEffort(m.id, m.efforts[i])
                      }
                    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault()
                      move(e.key === 'ArrowDown' ? 1 : -1)
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      const f = flat.find(x => x.key === hiKey)
                      if (f) choose(f.it)
                    }
                  }}
                />
                <div className="mp-sort">
                  <button className={`icon-btn sm${sortOpen ? ' is-open' : ''}`} aria-label="Order models" title="Order by" onClick={() => setSortOpen(o => !o)}>
                    <IconMixer size={13} />
                  </button>
                  {sortOpen && (
                    <div className="mp-sort-menu">
                      <div className="mp-sort-title">Order by</div>
                      {(['default', 'cost'] as Order[]).map(o => (
                        <button
                          key={o}
                          className={`menu-item${order === o ? ' is-selected' : ''}`}
                          onClick={() => {
                            setOrder(o)
                            setSortOpen(false)
                          }}
                        >
                          {o === 'default' ? 'Recommended' : 'Cost'}
                        </button>
                      ))}
                      <div className="mp-sort-foot">Prices are per million tokens, at API rates</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="mp-scroll" ref={listRef} role="listbox" aria-label="Models">
                {flat.length === 0 && <div className="mp-empty">No models match “{query}”</div>}
                {sections.map((s, si) => (
                  <Fragment key={si}>
                    {s.title && <div className="mp-section">{s.title}</div>}
                    {si > 0 && !s.title && <div className="mp-divider" />}
                    {s.items.map(it => {
                      const key = `${si}:${itemId(it)}`
                      const hover = () => {
                        if (key !== hiKey) {
                          setHiKey(key)
                          setHi(itemId(it))
                        }
                      }
                      if (it.kind === 'mode') {
                        const info = MODE_INFO[it.id]
                        return (
                          <button key={key} data-key={key} role="option" aria-selected={selectedId === itemId(it)} className={`mp-row${key === hiKey ? ' is-hi' : ''}`} onMouseMove={hover} onClick={() => choose(it)} aria-disabled={modeOff(it.id)} style={modeOff(it.id) ? { opacity: 0.5 } : undefined}>
                            <span className="mp-mode-icon">{info.icon}</span>
                            <span className="mp-row-name">
                              {info.name}
                              <span className="mp-faint"> {modeOff(it.id) ? 'Needs the OpenAI engine' : modeSub(it.id)}</span>
                            </span>
                            {selectedId === itemId(it) && <IconCheck size={13} className="mp-check" />}
                          </button>
                        )
                      }
                      const m = it.m
                      const e = effortIn(m, efforts[m.id])
                      return (
                        <button key={key} data-key={key} role="option" aria-selected={selectedId === m.id} className={`mp-row${key === hiKey ? ' is-hi' : ''}`} onMouseMove={hover} onClick={() => choose(it)}>
                          <span className="mp-row-name">
                            {m.name}
                            {e && <span className="mp-faint"> {EFFORT_LABEL[e]}</span>}
                          </span>
                          {fast[m.id] && <span className="mp-tag">Priority</span>}
                          {selectedId === m.id && <IconCheck size={13} className="mp-check" />}
                          {m.engine !== 'codex' && <CostBar m={m} cost={costOf(m)} />}
                        </button>
                      )
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
