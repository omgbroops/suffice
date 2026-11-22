import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Mode, ModelInfo } from '../api'
import { IconBolt, IconCheck, IconChevronDown, IconLayers, IconMixer, IconSearch, IconTarget, IconTimer } from '../icons'
import { Dropdown } from './Dropdown'
import { PROVIDER_NAME, ProviderIcon, providerOf } from './ProviderIcon'

const LIST_W = 300
const DETAIL_W = 280
const MAX_H = 400

export const EFFORT_LABEL: Record<string, string> = { off: 'Off', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high' }

const MODES: { id: Mode; name: string; note: string; icon: ReactNode }[] = [
  { id: 'balanced', name: 'Balanced', note: 'One model', icon: <IconLayers size={14} /> },
  { id: 'efficient', name: 'Efficient', note: 'Cheap model first, lead on a miss', icon: <IconTarget size={14} /> },
  { id: 'fast', name: 'Fast', note: 'Three low-effort attempts race', icon: <IconBolt size={14} /> },
]

type Order = 'provider' | 'price'
type Section = { title?: string; icon?: ReactNode; items: Item[] }
type Item = { kind: 'mode'; id: Mode } | { kind: 'model'; m: ModelInfo }
const itemId = (it: Item) => (it.kind === 'mode' ? `mode:${it.id}` : it.m.id)

/** Newest GPT models first, then older GPTs, then everything else. */
const rank = (m: ModelInfo) => (/^gpt-6/.test(m.id) ? 0 : /^gpt/.test(m.id) ? 1 : 2)
const blended = (m: ModelInfo) => m.cost.input * 0.75 + m.cost.output * 0.25
const money = (n: number) => (n === 0 ? '$0' : `$${n < 1 ? n.toFixed(2) : +n.toFixed(2)}`)
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

/** A model chooser inside the detail card (the lead or the cheap model). */
function ModelSelect({ models, value, onChange, label }: { models: ModelInfo[]; value: string; onChange: (id: string) => void; label: string }) {
  const current = models.find(m => m.id === value)
  return (
    <Dropdown
      width={220}
      align="right"
      maxHeight={300}
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
              <ProviderIcon id={m.id} />
              <span className="dd-title dd-grow">{m.name}</span>
              {m.id === value && <IconCheck size={13} className="dd-check" />}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

const THUMB = 14
const INSET = 3
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** The dithered fill: sparse at the left, dense up against the handle. */
function DitherFill({ width, height }: { width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const c = ref.current
    if (!c || width <= 0) return
    const dpr = window.devicePixelRatio || 1
    const px = Math.max(1, Math.round(2 * dpr))
    c.width = Math.round(width * dpr)
    c.height = Math.round(height * dpr)
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    g.fillStyle = '#5b7cfa'
    const cols = Math.ceil(c.width / px)
    const rows = Math.ceil(c.height / px)
    for (let x = 0; x < cols; x++) {
      const t = Math.pow((x + 0.5) / cols, 1.35)
      for (let y = 0; y < rows; y++) if (t * 16 > BAYER[(y % 4) * 4 + (x % 4)] + 0.5) g.fillRect(x * px, y * px, px, px)
    }
  }, [width, height])
  return <canvas ref={ref} className="eff-fill" style={{ width, height }} aria-hidden />
}

/** Reasoning effort: a track with a dithered fill up to a handle, a tick for each level above it. */
function Effort({ m, value, onChange }: { m: ModelInfo; value?: string; onChange: (e: string) => void }) {
  const levels = m.efforts
  const track = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = track.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [levels.length])
  if (!levels.length) return null
  const i = Math.max(0, levels.indexOf(value ?? ''))
  const span = Math.max(0, w - INSET * 2 - THUMB)
  const leftOf = (j: number) => INSET + (levels.length > 1 ? (span * j) / (levels.length - 1) : span)
  const pick = (x: number) => {
    const r = track.current!.getBoundingClientRect()
    const t = (x - r.left - INSET - THUMB / 2) / (span || 1)
    onChange(levels[Math.round(Math.min(1, Math.max(0, t)) * (levels.length - 1))])
  }
  return (
    <>
      <div className="mp-kv">
        <span>Reasoning</span>
        <span className="mp-kv-v">{EFFORT_LABEL[levels[i]]}</span>
      </div>
      <div
        ref={track}
        className="eff-track"
        role="slider"
        tabIndex={0}
        aria-label="Reasoning effort"
        aria-valuemin={0}
        aria-valuemax={levels.length - 1}
        aria-valuenow={i}
        aria-valuetext={EFFORT_LABEL[levels[i]]}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e.clientX)
        }}
        onPointerMove={e => e.buttons & 1 && pick(e.clientX)}
        onKeyDown={e => {
          const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
          if (!d) return
          e.preventDefault()
          onChange(levels[Math.min(levels.length - 1, Math.max(0, i + d))])
        }}
      >
        {w > 0 && <DitherFill width={Math.round(leftOf(i) - INSET + THUMB / 2)} height={22} />}
        {levels.map((l, j) => j > i && <span key={l} className="eff-tick" style={{ left: Math.round(leftOf(j) + THUMB / 2) }} />)}
        <span className="eff-thumb" style={{ left: Math.round(leftOf(i)) }} />
      </div>
    </>
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

function Priority({ m, p }: { m: ModelInfo; p: PickerProps }) {
  return (
    <div className="mp-toggle">
      <IconTimer size={13} />
      <span>Priority tier</span>
      <Switch on={!!p.fast[m.id]} onChange={v => p.onFast(m.id, v)} label="Priority tier" />
    </div>
  )
}

function ModelCard({ m, p }: { m: ModelInfo; p: PickerProps }) {
  return (
    <div className="mp-card" style={{ width: DETAIL_W }}>
      <div className="mp-card-sec">
        <div className="mp-card-name">
          <ProviderIcon id={m.id} />
          {m.name}
        </div>
        <div className="mp-kv"><span>Context</span><span className="mp-kv-v">{ctx(m.contextWindow)}</span></div>
        <div className="mp-kv"><span>Input per 1M</span><span className="mp-kv-v">{money(m.cost.input)}</span></div>
        <div className="mp-kv"><span>Output per 1M</span><span className="mp-kv-v">{money(m.cost.output)}</span></div>
      </div>
      <div className="mp-card-sec">
        <Effort m={m} value={effortIn(m, p.efforts[m.id])} onChange={e => p.onEffort(m.id, e)} />
        <Priority m={m} p={p} />
      </div>
    </div>
  )
}

function ModeCard({ mode, p }: { mode: Mode; p: PickerProps }) {
  const info = MODES.find(x => x.id === mode)!
  const lead = p.models.find(m => m.id === p.value)
  return (
    <div className="mp-card" style={{ width: DETAIL_W }}>
      <div className="mp-card-sec">
        <div className="mp-card-name">
          <span className="mp-card-icon">{info.icon}</span>
          {info.name}
          <span className="mp-faint">{info.note}</span>
        </div>
        {mode === 'efficient' && (
          <div className="mp-kv">
            <span>Cheap</span>
            <ModelSelect models={p.models} value={p.cheap} onChange={p.onCheap} label="Cheap model" />
          </div>
        )}
        <div className="mp-kv">
          <span>{mode === 'efficient' ? 'Lead' : 'Model'}</span>
          <ModelSelect models={p.models} value={p.value} onChange={p.onChange} label={mode === 'efficient' ? 'Lead model' : 'Model'} />
        </div>
      </div>
      {lead && mode !== 'fast' && (
        <div className="mp-card-sec">
          <Effort m={lead} value={effortIn(lead, p.efforts[lead.id])} onChange={e => p.onEffort(lead.id, e)} />
          {mode === 'balanced' && <Priority m={lead} p={p} />}
        </div>
      )}
    </div>
  )
}

export function ModelPicker(p: PickerProps) {
  const { models, value, mode } = p
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<Order>('provider')
  const [hi, setHi] = useState('')
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
    const modes: Item[] = MODES.filter(x => !q || x.id.includes(q)).map(x => ({ kind: 'mode', id: x.id }))
    const found = models.filter(m => !q || `${m.name} ${m.id}`.toLowerCase().includes(q))
    const asItems = (ms: ModelInfo[]): Item[] => ms.map(m => ({ kind: 'model', m }))
    if (order === 'price') return [{ title: 'Modes', items: modes }, { title: 'By price', items: asItems([...found].sort((a, b) => blended(a) - blended(b))) }].filter(s => s.items.length)
    const groups = new Map<string, ModelInfo[]>()
    for (const m of [...found].sort((a, b) => rank(a) - rank(b) || b.id.localeCompare(a.id, undefined, { numeric: true }))) {
      const key = providerOf(m.id) ?? 'other'
      groups.set(key, [...(groups.get(key) ?? []), m])
    }
    return [
      { title: 'Modes', items: modes },
      ...[...groups].map(([key, ms]) => ({ title: PROVIDER_NAME[key] ?? 'Other', icon: <ProviderIcon id={ms[0].id} size={12} />, items: asItems(ms) })),
    ].filter(s => s.items.length)
  }, [query, order, models])

  const flat = useMemo(() => sections.flatMap(s => s.items), [sections])

  const place = () => {
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = above >= Math.min(MAX_H, below) || above > below
    const right = Math.max(8, window.innerWidth - r.right)
    setPos(up ? { up, right, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(MAX_H, above - 6) } : { up, right, top: r.bottom + 6, maxHeight: Math.min(MAX_H, below - 6) })
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
    if (open && flat.length && !flat.some(it => itemId(it) === hi)) setHi(itemId(flat[0]))
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
      // Menus opened from the detail card live in their own portal.
      if (!pop.current?.contains(t) && !trigger.current?.contains(t) && !t.closest?.('.dd')) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector(`[data-id="${CSS.escape(hi)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi])

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
    const i = flat.findIndex(it => itemId(it) === hi)
    setHi(itemId(flat[(i + d + flat.length) % flat.length]))
  }

  const shownModel = byId.get(hi)
  const shownMode = hi.startsWith('mode:') ? (hi.slice(5) as Mode) : null
  const lead = current ? shortName(current.name) : value
  const modeSub = (id: Mode) => (id === 'efficient' ? `${cheapModel ? shortName(cheapModel.name) : p.cheap} → ${lead}` : id === 'fast' ? `${lead} ×3` : lead)
  const effort = current && effortIn(current, p.efforts[current.id])

  return (
    <>
      <button ref={trigger} className={`ghost-btn mp-trigger${open ? ' is-open' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} disabled={!models.length}>
        {mode === 'balanced' ? <ProviderIcon id={value} /> : <span className="mp-trigger-icon">{MODES.find(x => x.id === mode)!.icon}</span>}
        {mode === 'balanced' ? current?.name ?? value : MODES.find(x => x.id === mode)!.name}
        <span className="mp-faint">{mode === 'balanced' ? (effort ? EFFORT_LABEL[effort] : '') : modeSub(mode)}</span>
        <IconChevronDown size={12} className="mp-trigger-chev" />
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className={`mp${pos.up ? ' is-up' : ''}`}
            style={{ right: pos.right, top: pos.top, bottom: pos.bottom }}
            onKeyDown={e => {
              // A model menu open inside the detail card takes Escape for itself.
              if (e.key !== 'Escape' || document.querySelector('.dd')) return
              e.preventDefault()
              setOpen(false)
              trigger.current?.focus()
            }}
          >
            {shownMode ? <ModeCard mode={shownMode} p={p} /> : shownModel ? <ModelCard m={shownModel} p={p} /> : null}
            <div className="mp-list" style={{ width: LIST_W, maxHeight: pos.maxHeight }}>
              <div className="mp-search">
                <IconSearch size={13} />
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
                      const it = flat.find(x => itemId(x) === hi)
                      if (it) choose(it)
                    }
                  }}
                />
                <button className="mp-order" onClick={() => setOrder(o => (o === 'provider' ? 'price' : 'provider'))} title="Change the order">
                  <IconMixer size={12} />
                  {order === 'provider' ? 'By provider' : 'By price'}
                </button>
              </div>
              <div className="mp-scroll" ref={listRef} role="listbox" aria-label="Models">
                {flat.length === 0 && <div className="mp-empty">No models match “{query}”</div>}
                {sections.map((s, si) => (
                  <Fragment key={si}>
                    {si > 0 && <div className="mp-divider" />}
                    {s.title && (
                      <div className="mp-section">
                        {s.icon}
                        {s.title}
                      </div>
                    )}
                    {s.items.map(it => {
                      const id = itemId(it)
                      const row = { 'data-id': id, role: 'option', 'aria-selected': selectedId === id, className: `mp-row${id === hi ? ' is-hi' : ''}`, onMouseMove: () => id !== hi && setHi(id), onClick: () => choose(it) }
                      if (it.kind === 'mode') {
                        const info = MODES.find(x => x.id === it.id)!
                        return (
                          <button key={id} {...row}>
                            <span className="mp-row-icon">{info.icon}</span>
                            <span className="mp-row-name">{info.name}</span>
                            <span className="mp-row-sub">{modeSub(it.id)}</span>
                            {selectedId === id && <IconCheck size={13} className="mp-check" />}
                          </button>
                        )
                      }
                      return (
                        <button key={id} {...row}>
                          <ProviderIcon id={it.m.id} />
                          <span className="mp-row-name">{it.m.name}</span>
                          <span className="mp-row-sub">
                            {money(it.m.cost.input)} / {money(it.m.cost.output)}
                          </span>
                          {selectedId === id && <IconCheck size={13} className="mp-check" />}
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
