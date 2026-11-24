import type { PointerEvent as ReactPointerEvent } from 'react'

/** A remembered width, or null when nothing (or nonsense) is stored. */
export function savedWidth(key: string) {
  try {
    const n = Number(localStorage.getItem(key))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch { return null }
}

/**
 * Drags an edge to resize what it bounds. `sign` is 1 when dragging right makes it wider, -1 when left does.
 * `apply` runs on every move; the final width is stored under `key`.
 */
export function dragResize(e: ReactPointerEvent<HTMLElement>, o: { key: string; start: number; min: number; max: number; sign: 1 | -1; apply: (px: number) => void }) {
  if (e.button !== 0) return
  e.preventDefault()
  const handle = e.currentTarget, x0 = e.clientX
  let width = o.start
  const move = (m: PointerEvent) => {
    width = Math.round(Math.min(o.max, Math.max(o.min, o.start + (m.clientX - x0) * o.sign)))
    o.apply(width)
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    handle.classList.remove('is-on')
    document.body.classList.remove('is-resizing')
    try { localStorage.setItem(o.key, String(width)) } catch {}
  }
  handle.classList.add('is-on')
  // while dragging: no text selection, no column animation, and webviews stop swallowing the pointer
  document.body.classList.add('is-resizing')
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

export const setVar = (name: string, px: number) => document.documentElement.style.setProperty(name, `${px}px`)
