import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Status } from '../data'
import { IconCheck, IconCopy } from '../icons'
import { Live } from './Live'

export function StatusGlyph({ status, size = 12, seed }: { status: Status; size?: number; seed?: string }) {
  return <Live status={status} size={size} seed={seed} />
}

/** Seconds since `from`, re-rendered once a second while mounted. */
export function Elapsed({ from }: { from: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick(n => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  const s = Math.max(0, Math.floor((Date.now() - from) / 1000))
  return <span className="elapsed">{s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`}</span>
}

export function Menu({
  trigger,
  items,
  value,
  onSelect,
  side = 'bottom',
  hotkey,
  align = 'left',
}: {
  trigger: (open: boolean) => ReactNode
  items: string[]
  value: string
  onSelect: (v: string) => void
  side?: 'top' | 'bottom'
  hotkey?: string
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!hotkey) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === hotkey) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hotkey])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div className="menu-root" ref={ref}>
      <div onClick={() => setOpen(o => !o)}>{trigger(open)}</div>
      {open && (
        <div className={`menu menu-${side} menu-${align}`} role="listbox">
          {items.map(it => (
            <button
              key={it}
              role="option"
              aria-selected={it === value}
              className={`menu-item${it === value ? ' is-selected' : ''}`}
              onClick={() => {
                onSelect(it)
                setOpen(false)
              }}
            >
              {it}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle')
  const timer = useRef<number>(0)
  const copy = () => {
    setState('done')
    window.clearTimeout(timer.current)
    navigator.clipboard.writeText(text).catch(() => setState('fail'))
    timer.current = window.setTimeout(() => setState('idle'), 1400)
  }
  return (
    <button className="icon-btn sm" onClick={copy} aria-label="Copy" title={state === 'fail' ? 'Copy failed' : 'Copy'}>
      {state === 'done' ? <IconCheck size={13} /> : <IconCopy size={13} />}
    </button>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { v: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map(o => (
        <button key={o.v} role="tab" aria-selected={o.v === value} className={`seg-opt${o.v === value ? ' is-active' : ''}`} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
