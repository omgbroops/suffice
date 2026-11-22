import { useEffect, useRef } from 'react'
import type { Status } from '../data'

// Custom liveness glyphs, drawn on canvas in 1-bit pixel cells to match the dithered home art.
// working = moving, input = still + one amber signal, done = settled, idle = faint.
export type GlyphKind = 'moon' | 'ripple' | 'orbit'
export const GLYPH_KIND: GlyphKind = 'moon'

const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map(r => r.map(v => (v + 0.5) / 16))
const dith = (v: number, i: number, j: number) => v > B4[j & 3][i & 3]
const TAU = Math.PI * 2

type Fill = (n: number, t: number, s: Status, buf: Float32Array) => void

const moon: Fill = (n, t, s, buf) => {
  // light circles in the image plane, so a lit crescent orbits the disc and never goes dark
  const th = s === 'working' ? (t * TAU) / 1.8 : -Math.PI / 4
  const zl = s === 'done' ? 3 : s === 'idle' ? 1.2 : 0.2
  const lx = Math.cos(th), ly = Math.sin(th), ln = Math.hypot(lx, ly, zl)
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n * 2 - 1) / 0.94, y = ((j + 0.5) / n * 2 - 1) / 0.94, r2 = x * x + y * y
      if (r2 > 1) continue
      const lam = Math.max(0, (x * lx + y * ly + Math.sqrt(1 - r2) * zl) / ln)
      buf[j * n + i] = dith(lam * 1.05, i, j) ? 0.9 : 0.05
    }
}

const ripple: Fill = (n, t, s, buf) => {
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n * 2 - 1, y = (j + 0.5) / n * 2 - 1, r = Math.hypot(x, y)
      if (r > 0.97) continue
      const v = s === 'working' || s === 'input' ? (0.5 + 0.5 * Math.cos((r * 1.6 - (s === 'working' ? t : 1.3) * 0.9) * TAU)) * (1.05 - 0.35 * r) : 0.55 * (1.1 - 0.3 * r)
      buf[j * n + i] = dith(v, i, j) ? 0.9 : 0.07
    }
}

const orbit: Fill = (n, t, s, buf) => {
  const c = (n - 1) / 2
  const put = (x: number, y: number, a: number) => {
    const i = Math.round(x), j = Math.round(y)
    if (i >= 0 && j >= 0 && i < n && j < n) buf[j * n + i] = Math.max(buf[j * n + i], a)
  }
  put(c, c, 0.92)
  const R = [0.28, 0.42, 0.5].map(f => f * n), W = [2.1, 1.45, 1.0], TR = [6, 4, 8]
  for (let k = 0; k < 3; k++) {
    const moving = s === 'working'
    const a0 = moving ? W[k] * t + k * 2.1 : (k * TAU) / 3 - Math.PI / 2
    const len = moving ? TR[k] : 0
    for (let q = len; q >= 0; q--) {
      const a = a0 - q * 0.17
      put(c + R[k] * Math.cos(a), c + R[k] * Math.sin(a), q === 0 ? 1 : 0.2 + 0.65 * (1 - q / (len + 1)))
    }
  }
}

const FILLS: Record<GlyphKind, Fill> = { moon, ripple, orbit }

type Inst = { cv: HTMLCanvasElement; status: Status; kind: GlyphKind; n: number; buf: Float32Array; visible: boolean; drawn: boolean; phase: number }
const live = new Set<Inst>()
let raf = 0
const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

function draw(g: Inst, t: number) {
  const ctx = g.cv.getContext('2d')
  if (!ctx) return
  const S = g.cv.width
  ctx.clearRect(0, 0, S, S)
  g.buf.fill(0)
  FILLS[g.kind](g.n, t + g.phase, g.status, g.buf)
  const cs = S / g.n
  // ink follows the theme: the canvas's CSS color, as "r,g,b"
  const ink = (getComputedStyle(g.cv).color.match(/\d+(\.\d+)?/g) ?? ['255', '255', '255']).slice(0, 3).join(',')
  for (let j = 0; j < g.n; j++)
    for (let i = 0; i < g.n; i++) {
      let a = g.buf[j * g.n + i]
      if (!a) continue
      if (g.status === 'idle' || g.status === 'done') a *= 0.55
      ctx.fillStyle = `rgba(${ink},${a})`
      const x0 = Math.round(i * cs), y0 = Math.round(j * cs)
      ctx.fillRect(x0, y0, Math.round((i + 1) * cs) - x0, Math.round((j + 1) * cs) - y0)
    }
  if (g.status === 'input') {
    ctx.fillStyle = '#d4a160'
    ctx.beginPath()
    ctx.arc(S * 0.84, S * 0.16, Math.max(1.5, S * 0.13), 0, TAU)
    ctx.fill()
  }
  g.drawn = true
}

function tick(now: number) {
  raf = 0
  const t = reduce?.matches ? 1.3 : now / 1000
  let again = false
  for (const g of live) {
    if (g.status === 'working' && !reduce?.matches) {
      if (g.visible && !document.hidden) draw(g, t)
      again = true
    } else if (!g.drawn) draw(g, t)
  }
  if (again) raf = requestAnimationFrame(tick)
}
const wake = () => { if (!raf) raf = requestAnimationFrame(tick) }
document.addEventListener('visibilitychange', wake)

/** phase (seconds) offsets the animation so sibling glyphs don't move in lockstep. */
export function Live({ status, size = 12, kind = GLYPH_KIND, label, phase = 0 }: { status: Status; size?: number; kind?: GlyphKind; label?: string; phase?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const inst = useRef<Inst | null>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    cv.width = cv.height = Math.round(size * dpr)
    // ~1 css px per cell keeps the pixels crisp at any size
    const n = Math.max(9, Math.round(size * (dpr >= 2 ? 1 : 0.75)))
    const g: Inst = { cv, status, kind, n, buf: new Float32Array(n * n), visible: true, drawn: false, phase }
    inst.current = g
    live.add(g)
    const io = new IntersectionObserver(([e]) => { g.visible = e.isIntersecting; if (g.visible) wake() })
    io.observe(cv)
    wake()
    return () => { io.disconnect(); live.delete(g); inst.current = null }
  }, [size, kind, phase])
  useEffect(() => {
    const g = inst.current
    if (!g) return
    g.status = status
    g.drawn = false
    wake()
  }, [status])
  return <canvas ref={ref} className="live" style={{ width: size, height: size }} role="img" aria-label={label ?? status} />
}
