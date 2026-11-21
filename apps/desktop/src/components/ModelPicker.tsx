import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ModelInfo } from '../api'
import { IconCheck, IconMixer, IconSearch } from '../icons'

const LIST_W = 300
const DETAIL_W = 280
const MAX_H = 440

export const EFFORT_LABEL: Record<string, string> = { off: 'Off', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high' }
const SHORT: Record<string, string> = { off: 'Off', minimal: 'Min', low: 'Low', medium: 'Med', high: 'High', xhigh: 'XHigh' }

type Order = 'default' | 'cost'
type Section = { title?: string; items: ModelInfo[] }

const blended = (m: ModelInfo) => m.cost.input * 0.75 + m.cost.output * 0.25
const money = (n: number) => (n === 0 ? '$0' : `$${n < 1 ? +n.toFixed(3) : +n.toFixed(2)}`)
const ctx = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : `${Math.round(n / 1000)}K`)

function relativeCost(models: ModelInfo[]) {
  const values = models.map(blended).filter(v => v > 0)
  const lo = Math.log(Math.min(...values)), hi = Math.log(Math.max(...values))
  return (m: ModelInfo) => (blended(m) > 0 && hi > lo ? (Math.log(blended(m)) - lo) / (hi - lo) : 0)
}

function CostMeter({ cost }: { cost: number }) {
  return (
    <span className="mp-meter" aria-hidden>
      <span style={{ width: `${Math.max(8, cost * 100)}%`, background: cost < 0.34 ? 'var(--green)' : cost < 0.67 ? 'var(--amber)' : 'var(--red)' }} />
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

function Detail({ m, effort, fast, cost, onEffort, onFast }: { m: ModelInfo; effort?: string; fast: boolean; cost: number; onEffort: (e: string) => void; onFast: (v: boolean) => void }) {
  return (
    <div className="mp-detail" style={{ width: DETAIL_W }}>
      <div className="mp-detail-head">
        <span className="mp-detail-name">{m.name}</span>
        {effort && <span className="mp-faint">{EFFORT_LABEL[effort] ?? effort}</span>}
      </div>
      <div className="mp-detail-sub">{ctx(m.contextWindow)} context</div>
      {m.efforts.length > 0 && (
        <div className="mp-field">
          <span>Effort</span>
          <div className="seg mp-seg">
            {m.efforts.map(e => (
              <button key={e} className={`seg-opt${effort === e ? ' is-active' : ''}`} onClick={() => onEffort(e)} title={EFFORT_LABEL[e]}>
                {SHORT[e] ?? e}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mp-field">
        <span>Fast mode</span>
        <Switch on={fast} onChange={onFast} label="Fast mode" />
      </div>
      <div className="mp-rule" />
      <div className="mp-cost-head">
        <span>Cost</span>
        <span className="mp-faint">{m.efforts.length ? 'Higher effort uses more tokens' : 'Per million tokens'}</span>
      </div>
      <div className="mp-scale">
        <span className="mp-scale-dot" style={{ left: `${cost * 100}%` }} />
      </div>
      <div className="mp-prices">
        {([['Input', m.cost.input], ['Cached', m.cost.cacheRead], ['Output', m.cost.output]] as const).map(([k, v]) => (
          <div key={k} className="mp-price">
            <span className="mp-price-k">{k}</span>
            <span className="mp-price-v">
              {money(v)}
              <span className="mp-faint"> / 1M</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const RECOMMENDED = /^gpt-6/

export function ModelPicker({
  models,
  value,
  efforts,
  fast,
  recent,
  onChange,
  onEffort,
  onFast,
}: {
  models: ModelInfo[]
  value: string
  efforts: Record<string, string>
  fast: Record<string, boolean>
  recent: string[]
  onChange: (id: string) => void
  onEffort: (id: string, effort: string) => void
  onFast: (id: string, on: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<Order>('default')
  const [sortOpen, setSortOpen] = useState(false)
  const [hi, setHi] = useState(value)
  const [hiKey, setHiKey] = useState('')
  const [pos, setPos] = useState<CSSProperties & { up?: boolean }>({})
  const trigger = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const byId = useMemo(() => new Map(models.map(m => [m.id, m])), [models])
  const costOf = useMemo(() => relativeCost(models), [models])
  const current = byId.get(value)
  const effortOf = (m: ModelInfo) => (m.efforts.length ? (m.efforts.includes(efforts[m.id]) ? efforts[m.id] : m.efforts.includes('low') ? 'low' : m.efforts[0]) : undefined)

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase()
    if (q) return [{ items: models.filter(m => `${m.name} ${m.id}`.toLowerCase().includes(q)) }]
    if (order === 'cost') return [{ title: 'By cost', items: [...models].sort((a, b) => blended(a) - blended(b)) }]
    const rec = recent.map(id => byId.get(id)).filter((m): m is ModelInfo => !!m)
    const recommended = models.filter(m => RECOMMENDED.test(m.id)).sort((a, b) => b.id.localeCompare(a.id))
    const rest = models.filter(m => !RECOMMENDED.test(m.id)).sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))
    return [
      ...(rec.length ? [{ title: 'Recently used', items: rec }] : []),
      { title: 'Recommended', items: recommended },
      { title: 'More models', items: rest },
    ].filter(s => s.items.length)
  }, [query, order, recent, models, byId])

  const flat = useMemo(() => sections.flatMap((s, si) => s.items.map(m => ({ m, key: `${si}:${m.id}` }))), [sections])

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
    setHi(value)
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    const first = flat.find(f => f.m.id === hi) ?? flat[0]
    setHiKey(first?.key ?? '')
    if (first && first.m.id !== hi) setHi(first.m.id)
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
      const t = e.target as Node
      if (!pop.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector(`[data-key="${CSS.escape(hiKey)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hiKey])

  const choose = (id: string) => {
    onChange(id)
    setOpen(false)
    trigger.current?.focus()
  }

  const move = (d: number) => {
    if (!flat.length) return
    const i = flat.findIndex(f => f.key === hiKey)
    const next = flat[(i + d + flat.length) % flat.length]
    setHiKey(next.key)
    setHi(next.m.id)
  }

  const shown = byId.get(hi) ?? current

  return (
    <>
      <button ref={trigger} className={`ghost-btn mp-trigger${open ? ' is-open' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} disabled={!models.length}>
        {current?.name ?? value}
        {current && effortOf(current) && <span className="mp-faint">{EFFORT_LABEL[effortOf(current)!]}</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className={`mp${pos.up ? ' is-up' : ''}`}
            style={{ right: pos.right, top: pos.top, bottom: pos.bottom }}
            onKeyDown={e => {
              if (e.key !== 'Escape') return
              e.preventDefault()
              if (sortOpen) setSortOpen(false)
              else {
                setOpen(false)
                trigger.current?.focus()
              }
            }}
          >
            {shown && (
              <Detail
                m={shown}
                effort={effortOf(shown)}
                fast={!!fast[shown.id]}
                cost={costOf(shown)}
                onEffort={e => onEffort(shown.id, e)}
                onFast={v => onFast(shown.id, v)}
              />
            )}
            <div className="mp-list" style={{ width: LIST_W, maxHeight: pos.maxHeight }}>
              <div className="mp-search">
                <IconSearch size={14} />
                <input
                  autoFocus
                  value={query}
                  placeholder="Search models"
                  aria-label="Search models"
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault()
                      move(e.key === 'ArrowDown' ? 1 : -1)
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      const f = flat.find(x => x.key === hiKey)
                      if (f) choose(f.m.id)
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
                    {s.items.map(m => {
                      const key = `${si}:${m.id}`
                      const e = effortOf(m)
                      return (
                        <button
                          key={key}
                          data-key={key}
                          role="option"
                          aria-selected={m.id === value}
                          className={`mp-row${key === hiKey ? ' is-hi' : ''}`}
                          onMouseMove={() => {
                            if (key !== hiKey) {
                              setHiKey(key)
                              setHi(m.id)
                            }
                          }}
                          onClick={() => choose(m.id)}
                        >
                          <span className="mp-row-name">
                            {m.name}
                            {e && <span className="mp-faint"> {EFFORT_LABEL[e]}</span>}
                          </span>
                          {fast[m.id] && <span className="mp-tag">Fast</span>}
                          {m.id === value && <IconCheck size={13} className="mp-check" />}
                          <CostMeter cost={costOf(m)} />
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
