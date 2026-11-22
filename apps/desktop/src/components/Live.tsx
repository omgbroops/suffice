import { useEffect, useRef } from 'react'
import type { Status } from '../data'
import { drawGlyph, hash, type GlyphKind } from './glyphs'

export type { GlyphKind }
export const GLYPH_KIND: GlyphKind = 'swarm'

type Inst = { cv: HTMLCanvasElement; status: Status; kind: GlyphKind; size: number; dpr: number; seed: number; dim: boolean; visible: boolean; drawn: boolean; phase: number }
const live = new Set<Inst>()
let raf = 0
const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

function draw(g: Inst, t: number) {
  const ctx = g.cv.getContext('2d')
  if (!ctx) return
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0)
  // ink follows the theme: the canvas's CSS color, alpha included
  const c = getComputedStyle(g.cv).color.match(/\d+(\.\d+)?/g) ?? ['255', '255', '255']
  const a = (c[3] ? +c[3] : 1) * (g.dim && (g.status === 'idle' || g.status === 'done') ? 0.55 : 1)
  drawGlyph(ctx, g.size, g.kind, t + g.phase, g.status, g.seed, c.slice(0, 3).join(','), a)
  g.drawn = true
}

function tick(now: number) {
  raf = 0
  const t = reduce?.matches ? 1.3 : now / 1000
  let again = false
  for (const g of live) {
    if (g.status === 'working' && !reduce?.matches) {
      // offscreen or hidden glyphs stop the loop; the observer and visibilitychange wake it
      if (g.visible && !document.hidden) (draw(g, t), (again = true))
    } else if (!g.drawn) draw(g, t)
  }
  if (again) raf = requestAnimationFrame(tick)
}
const wake = () => { if (!raf) raf = requestAnimationFrame(tick) }
document.addEventListener('visibilitychange', wake)
reduce?.addEventListener('change', () => { for (const g of live) g.drawn = false; wake() })

/**
 * phase (seconds) offsets the animation so sibling glyphs don't move in lockstep.
 * seed picks a swarm's layout, so each thread or project gets its own emblem.
 * dim=false keeps emblems at full strength when still.
 */
export function Live({ status, size = 12, kind = GLYPH_KIND, label, phase = 0, seed = '', dim = true, color }: { status: Status; size?: number; kind?: GlyphKind; label?: string; phase?: number; seed?: string; dim?: boolean; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const inst = useRef<Inst | null>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    cv.width = cv.height = Math.round(size * dpr)
    const g: Inst = { cv, status, kind, size, dpr, seed: hash(seed || 'suffice'), dim, visible: true, drawn: false, phase }
    inst.current = g
    live.add(g)
    const io = new IntersectionObserver(([e]) => { g.visible = e.isIntersecting; if (g.visible) wake() })
    io.observe(cv)
    wake()
    return () => { io.disconnect(); live.delete(g); inst.current = null }
  }, [size, kind, phase, seed, dim])
  useEffect(() => {
    const g = inst.current
    if (!g) return
    g.status = status
    g.drawn = false
    wake()
  }, [status, color])
  return <canvas ref={ref} className="live" style={{ width: size, height: size, color }} role="img" aria-label={label ?? status} />
}
