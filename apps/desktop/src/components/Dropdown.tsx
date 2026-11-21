import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A trigger and a floating panel anchored to it. The panel opens above the
 * trigger when there is room (composers sit low), else below, and lives in a
 * portal so no panel edge clips it.
 */
export function Dropdown({
  trigger,
  children,
  width,
  align = 'left',
  maxHeight = 420,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: (el: HTMLButtonElement | null) => void }) => ReactNode
  children: (close: () => void) => ReactNode
  width: number
  align?: 'left' | 'right'
  maxHeight?: number
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties & { up?: boolean }>({})
  const anchor = useRef<HTMLButtonElement | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  const place = () => {
    const r = anchor.current?.getBoundingClientRect()
    if (!r) return
    const above = r.top - 12
    const below = window.innerHeight - r.bottom - 12
    const up = above >= Math.min(maxHeight, below) || above > below
    const x = align === 'left' ? { left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) } : { right: Math.max(8, window.innerWidth - r.right) }
    setPos(up ? { up, ...x, bottom: window.innerHeight - r.top + 8, maxHeight: Math.min(maxHeight, above - 8) } : { up, ...x, top: r.bottom + 8, maxHeight: Math.min(maxHeight, below - 8) })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      anchor.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => setOpen(false)
  const { up, maxHeight: mh, ...at } = pos
  return (
    <>
      {trigger({ open, toggle: () => setOpen(o => !o), ref: el => (anchor.current = el) })}
      {open &&
        createPortal(
          <div ref={panel} className={`dd${up ? ' is-up' : ''}${align === 'right' ? ' is-right' : ''}`} style={{ ...at, width, maxHeight: mh }} role="menu">
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  )
}
