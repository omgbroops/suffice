import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Mode, ModelInfo } from '../api'
import { IconBolt as IconLightning, IconCheck, IconChevronDown, IconLayers, IconMixer, IconSearch, IconTarget } from '../icons'
import { Dropdown } from './Dropdown'

const LIST_W = 300
const DETAIL_W = 272
const MAX_H = 420

export const EFFORT_LABEL: Record<string, string> = { off: 'Off', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high' }
/** Thin ticks per level in the effort ramp. */
const TICKS = 5
const SHORT: Record<string, string> = { off: 'Off', minimal: 'Min', low: 'Low', medium: 'Med', high: 'High', xhigh: 'Max' }

export const MODE_INFO: Record<Mode, { name: string; note: string; icon: ReactNode }> = {
  balanced: { name: 'Balanced', note: 'Regular Suffice: one model at the effort you pick.', icon: <IconLayers size={14} /> },
  efficient: { name: 'Efficient', note: 'A cheap model tries first. The lead model runs only if the cheap one makes no changes.', icon: <IconTarget size={14} /> },
  fast: { name: 'Fast', note: 'Three low-effort attempts race on copies of the project. The first to finish with changes wins.', icon: <IconLightning size={14} /> },
}

/** The three Fast attempts differ only by a line of guidance (see the harness's RACE_ATTEMPTS). */
const FAST_LANES = ['As asked', 'Smallest correct change', 'Checks edge cases first']

type Order = 'default' | 'cost'
type Section = { title?: string; items: Item[] }
type Item = { kind: 'mode'; id: Mode } | { kind: 'model'; m: ModelInfo }
const itemId = (it: Item) => (it.kind === 'mode' ? `mode:${it.id}` : it.m.id)

const blended = (m: ModelInfo) => m.cost.input * 0.75 + m.cost.output * 0.25
const money = (n: number) => (n === 0 ? '$0' : `$${n < 1 ? +n.toFixed(3) : +n.toFixed(2)}`)
const ctx = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : `${Math.round(n / 1000)}K`)
export const shortName = (name: string) => name.replace(/^GPT-[\d.]+\s+/, '') || name

const effortIn = (m: ModelInfo | undefined, wanted?: string) => (!m?.efforts.length ? undefined : m.efforts.includes(wanted ?? '') ? wanted : m.efforts.includes('low') ? 'low' : m.efforts[0])

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`mp-switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

/** A model chooser inside the detail pane (the lead or the cheap model). */
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
              <span className="dd-title dd-grow">{m.name}</span>
              <span className="dd-path" style={{ flex: 'none' }}>{money(m.cost.input)} / {money(m.cost.output)}</span>
              {m.id === value && <IconCheck size={13} className="dd-check" />}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

/**
 * Reasoning effort as a row of rising bars, one per level the model accepts.
 * Click or drag across them, or use the arrow keys; hovering previews a level.
 */
function Effort({ m, value, onChange, label = 'Reasoning' }: { m: ModelInfo; value?: string; onChange: (e: string) => void; label?: string }) {
  const levels = m.efforts
  const bars = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  if (!levels.length) return null
  const i = Math.max(0, levels.indexOf(value ?? ''))
  const shown = hover ?? i
  const at = (x: number) => {
    const r = bars.current!.getBoundingClientRect()
    return Math.min(levels.length - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * levels.length)))
  }
  const step = (d: number) => onChange(levels[Math.min(levels.length - 1, Math.max(0, i + d))])
  return (
    <div className="eff">
      <div className="eff-head">
        <span>{label}</span>
        <span className={`eff-value${hover !== null && hover !== i ? ' is-preview' : ''}`}>{EFFORT_LABEL[levels[shown]]}</span>
      </div>
      <div
        ref={bars}
        className="eff-bars"
        role="slider"
        tabIndex={0}
        aria-label={`${label} effort`}
        aria-valuemin={0}
        aria-valuemax={levels.length - 1}
        aria-valuenow={i}
        aria-valuetext={EFFORT_LABEL[levels[i]]}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          onChange(levels[at(e.clientX)])
        }}
        onPointerMove={e => {
          const j = at(e.clientX)
          setHover(j)
          if (e.buttons & 1 && j !== i) onChange(levels[j])
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={e => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), step(1))
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), step(-1))
        }}
      >
        {levels.map((l, j) => (
          <span key={l} className={`eff-bar${j <= i ? ' is-on' : ''}${hover !== null && j <= hover && j > i ? ' is-ghost' : ''}${hover !== null && j > hover && j <= i ? ' is-dim' : ''}`}>
            {Array.from({ length: TICKS }, (_, k) => (
              <i key={k} style={{ height: `${Math.round(18 + (82 * (j * TICKS + k + 1)) / (levels.length * TICKS))}%` }} />
            ))}
          </span>
        ))}
      </div>
      <div className="eff-ticks" aria-hidden>
        {levels.map((l, j) => (
          <span key={l} className={j === i ? 'is-on' : undefined}>{SHORT[l]}</span>
        ))}
      </div>
    </div>
  )
}

function Prices({ m, title }: { m: ModelInfo; title?: string }) {
  return (
    <div className="mp-prices">
      {title && <div className="mp-prices-title">{title}</div>}
      <div className="mp-kv"><span>Input</span><span className="mp-kv-v">{money(m.cost.input)}</span></div>
      <div className="mp-kv"><span>Cached</span><span className="mp-kv-v">{money(m.cost.cacheRead)}</span></div>
      <div className="mp-kv"><span>Output</span><span className="mp-kv-v">{money(m.cost.output)}</span></div>
    </div>
  )
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

function ModeDetail({ mode, p }: { mode: Mode; p: PickerProps }) {
  const lead = p.models.find(m => m.id === p.value)
  const cheap = p.models.find(m => m.id === p.cheap)
  const info = MODE_INFO[mode]
  return (
    <div className="mp-detail" style={{ width: DETAIL_W }}>
      <div className="mp-d-head">
        <div className="mp-d-name">
          <span className="mp-d-icon">{info.icon}</span>
          {info.name}
        </div>
        <div className="mp-d-sub">{info.note}</div>
      </div>
      {mode === 'efficient' && (
        <div className="mp-field">
          <span>Cheap model</span>
          <ModelSelect models={p.models} value={p.cheap} onChange={p.onCheap} label="Cheap model" />
        </div>
      )}
      <div className="mp-field">
        <span>{mode === 'efficient' ? 'Lead model' : 'Model'}</span>
        <ModelSelect models={p.models} value={p.value} onChange={p.onChange} label={mode === 'efficient' ? 'Lead model' : 'Model'} />
      </div>
      {mode === 'efficient' && p.cheap === p.value && <div className="mp-d-sub mp-warn">The lead and cheap model are the same, so escalating changes nothing.</div>}
      {lead && mode !== 'fast' && <Effort m={lead} label={mode === 'efficient' ? 'Lead reasoning' : 'Reasoning'} value={effortIn(lead, p.efforts[lead.id])} onChange={e => p.onEffort(lead.id, e)} />}
      {mode === 'fast' && (
        <div className="mp-lanes">
          {FAST_LANES.map((l, i) => (
            <div key={l} className="mp-lane">
              <span className="mp-lane-n">{i + 1}</span>
              <span className="mp-lane-t">{l}</span>
              <span className="mp-faint">Low</span>
            </div>
          ))}
        </div>
      )}
      {lead && mode === 'balanced' && (
        <div className="mp-field">
          <span>Priority tier</span>
          <Switch on={!!p.fast[lead.id]} onChange={v => p.onFast(lead.id, v)} label="Priority tier" />
        </div>
      )}
      <div className="mp-d-foot">
        {mode !== 'balanced' && <div className="mp-d-sub">Attempts work on copies. You approve the winner’s changes unless you’re on Full access.</div>}
        {mode === 'efficient' && cheap && lead ? (
          <div className="mp-prices-2">
            <Prices m={cheap} title={shortName(cheap.name)} />
            <Prices m={lead} title={`${shortName(lead.name)}, on a miss`} />
          </div>
        ) : lead ? (
          <Prices m={lead} title={mode === 'fast' ? `${shortName(lead.name)}, per attempt` : undefined} />
        ) : null}
      </div>
    </div>
  )
}

function ModelDetail({ m, p }: { m: ModelInfo; p: PickerProps }) {
  const effort = effortIn(m, p.efforts[m.id])
  return (
    <div className="mp-detail" style={{ width: DETAIL_W }}>
      <div className="mp-d-head">
        <div className="mp-d-name">{m.name}</div>
        <div className="mp-d-sub">{ctx(m.contextWindow)} context{m.efforts.length ? '' : ' · no reasoning'}</div>
      </div>
      <Effort m={m} value={effort} onChange={e => p.onEffort(m.id, e)} />
      <div className="mp-field">
        <span>Priority tier</span>
        <Switch on={!!p.fast[m.id]} onChange={v => p.onFast(m.id, v)} label="Priority tier" />
      </div>
      <div className="mp-d-foot">
        <Prices m={m} title="Per million tokens" />
      </div>
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
  const listRef = useRef<HTMLDivElement>(null)
  const byId = useMemo(() => new Map(models.map(m => [m.id, m])), [models])
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

  const choose = (it: Item) => {
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
            style={{ right: pos.right, top: pos.top, bottom: pos.bottom, height: pos.maxHeight }}
            onKeyDown={e => {
              // A model menu open inside the detail panel takes Escape for itself.
              if (e.key !== 'Escape' || document.querySelector('.dd')) return
              e.preventDefault()
              if (sortOpen) setSortOpen(false)
              else {
                setOpen(false)
                trigger.current?.focus()
              }
            }}
          >
            {shownMode ? <ModeDetail mode={shownMode} p={p} /> : shownModel ? <ModelDetail m={shownModel} p={p} /> : <div className="mp-detail" style={{ width: DETAIL_W }} />}
            <div className="mp-list" style={{ width: LIST_W }}>
              <div className="mp-search">
                <IconSearch size={14} />
                <input
                  autoFocus
                  value={query}
                  placeholder="Search models and modes"
                  aria-label="Search models"
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
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
                          <button key={key} data-key={key} role="option" aria-selected={selectedId === itemId(it)} className={`mp-row${key === hiKey ? ' is-hi' : ''}`} onMouseMove={hover} onClick={() => choose(it)}>
                            <span className="mp-mode-icon">{info.icon}</span>
                            <span className="mp-row-name">
                              {info.name}
                              <span className="mp-faint"> {modeSub(it.id)}</span>
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
                          <span className="mp-price-tag">{money(m.cost.input)} / {money(m.cost.output)}</span>
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
