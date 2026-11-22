import { useEffect, useRef } from 'react'
import { createSim, ease, FADE, nodeScale, nodeSize, OBSIDIAN_FORCES, textAlpha, tick } from '../../shared/graph.mjs'

export type GraphNode = { id: string; label: string; weight: number }
type Forces = typeof OBSIDIAN_FORCES
type Sim = ReturnType<typeof createSim>
type Anim = { fade: number; rgb: number[]; move: number }
type RGBA = { rgb: number[]; a: number }

// colours come from CSS (--graph-*), so the theme decides them, as in Obsidian
const probe = document.createElement('canvas').getContext('2d')!
function parse(css: string): RGBA {
  probe.fillStyle = '#000'
  probe.fillStyle = css.trim() || '#000'
  const v = String(probe.fillStyle)
  if (v.startsWith('#')) return { rgb: [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16)), a: 1 }
  const m = v.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]
  return { rgb: m.slice(0, 3), a: m[3] ?? 1 }
}
const rgba = (c: number[], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const FONT = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Inter", sans-serif'

/** label lines wrapped at `width` px (Obsidian wraps node names at 300 units) */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > width) (out.push(line), (line = word))
    else line = next
  }
  return line ? [...out, line] : out
}

/**
 * Obsidian's graph view on a canvas. Nodes are filled circles sized by link count, links are 1px lines between
 * node edges, labels sit under the nodes and fade out as you zoom out. Hovering a node paints it and its links
 * in the accent and fades everything unrelated to 20%. Drag a node to move it, drag the background to pan,
 * scroll to zoom, click a node to open it.
 */
export function ObsidianGraph({ nodes, links, focus, onOpen, forces = OBSIDIAN_FORCES, maxFit = 1, label }: {
  nodes: GraphNode[]; links: [string, string][]; focus?: string; onOpen: (id: string) => void; forces?: Forces; maxFit?: number; label: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef({ nodes, links, focus, onOpen, forces, maxFit })
  live.current = { nodes, links, focus, onOpen, forces, maxFit }
  const state = useRef<{ sim: Sim | null; wake: () => void; refit: () => void }>({ sim: null, wake: () => {}, refit: () => {} })

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    let raf = 0, w = 0, h = 0, dpr = 1
    const view = { x: 0, y: 0, s: 1, target: 1, zx: 0, zy: 0, touched: false }
    const anim = new Map<string, Anim>()
    const linkFade = new Map<string, number>()
    let hot: string | null = null
    let colors: Record<string, RGBA> = {}
    const readColors = () => {
      const cs = getComputedStyle(cv)
      colors = Object.fromEntries(['node', 'line', 'text', 'focused', 'accent'].map(k => [k, parse(cs.getPropertyValue(`--graph-${k}`))]))
    }
    readColors()

    const size = (id: string) => nodeSize(live.current.nodes.find(n => n.id === id)?.weight ?? 0)
    const toWorld = (sx: number, sy: number) => ({ x: (sx - view.x) / view.s, y: (sy - view.y) / view.s })
    const hit = (sx: number, sy: number) => {
      const sim = state.current.sim
      if (!sim) return null
      const p = toWorld(sx, sy), f = nodeScale(view.s)
      let best: string | null = null, bd = Infinity
      for (const [id, n] of sim.nodes) {
        const r = Math.max(size(id) * f, 6 / view.s), d = Math.hypot(n.x - p.x, n.y - p.y)
        if (d <= r && d < bd) (best = id), (bd = d)
      }
      return best
    }

    const fit = () => {
      const sim = state.current.sim
      if (!sim || !sim.nodes.size || !w) return
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const n of sim.nodes.values()) (x0 = Math.min(x0, n.x), x1 = Math.max(x1, n.x), y0 = Math.min(y0, n.y), y1 = Math.max(y1, n.y))
      // room for node radius and a label under the lowest node
      const s = Math.min(live.current.maxFit, (w - 80) / Math.max(x1 - x0, 1), (h - 70) / Math.max(y1 - y0, 1))
      view.s = view.target = s
      view.x = w / 2 - ((x0 + x1) / 2) * s
      view.y = h / 2 - ((y0 + y1) / 2) * s - 8
    }

    const frame = () => {
      raf = 0
      const { focus, forces } = live.current
      const sim = state.current.sim
      if (!sim || !w) return
      let busy = false
      if (sim.alpha > 0.001 || sim.alphaTarget > 0) (tick(sim, forces), (busy = true))
      if (!view.touched) fit()
      // zoom eases toward its target around the wheel point
      if (Math.abs(view.target - view.s) > 1e-4) {
        const wx = (view.zx - view.x) / view.s, wy = (view.zy - view.y) / view.s
        view.s = ease(view.s, view.target, 0.85)
        view.x = view.zx - wx * view.s; view.y = view.zy - wy * view.s
        busy = true
      }
      const s = view.s, f = nodeScale(s), ta = textAlpha(s)
      const ids = new Map([...sim.nodes].map(([id, n]) => [n, id]))
      const near = new Set<string>()
      if (hot) for (const l of sim.links) if (ids.get(l.s) === hot) near.add(ids.get(l.t)!); else if (ids.get(l.t) === hot) near.add(ids.get(l.s)!)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const X = (x: number) => x * s + view.x, Y = (y: number) => y * s + view.y

      // links: 1px, from node edge to node edge
      ctx.lineWidth = 1
      for (const l of sim.links) {
        const a = ids.get(l.s)!, b = ids.get(l.t)!, key = `${a}>${b}`
        const lit = !!hot && (a === hot || b === hot)
        const fade = ease(linkFade.get(key) ?? 1, hot && !lit ? FADE : 1)
        linkFade.set(key, fade)
        if (Math.abs(fade - (hot && !lit ? FADE : 1)) > 0.002) busy = true
        const c = lit ? colors.accent : colors.line
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, m = Math.hypot(dx, dy)
        const rs = size(a) * f, rt = size(b) * f
        if (m <= rs + rt) continue
        ctx.strokeStyle = rgba(c.rgb, fade * c.a)
        ctx.beginPath()
        ctx.moveTo(X(l.s.x + (dx * rs) / m), Y(l.s.y + (dy * rs) / m))
        ctx.lineTo(X(l.t.x - (dx * rt) / m), Y(l.t.y - (dy * rt) / m))
        ctx.stroke()
      }

      // nodes, then labels above every node
      const labels: (() => void)[] = []
      for (const [id, n] of sim.nodes) {
        const isHot = id === hot
        const target = !hot || isHot || near.has(id) ? 1 : FADE
        const fill = isHot ? colors.accent : id === focus ? colors.focused : colors.node
        const an = anim.get(id) ?? { fade: 1, rgb: [...fill.rgb], move: 0 }
        an.fade = ease(an.fade, target)
        an.rgb = an.rgb.map((v, i) => ease(v, fill.rgb[i]))
        an.move = ease(an.move, isHot ? 15 : 0)
        anim.set(id, an)
        if (Math.abs(an.fade - target) > 0.002 || an.rgb.some((v, i) => Math.abs(v - fill.rgb[i]) > 0.5) || Math.abs(an.move - (isHot ? 15 : 0)) > 0.05) busy = true
        const sz = size(id), r = sz * f * s
        ctx.fillStyle = rgba(an.rgb, an.fade * fill.a)
        ctx.beginPath()
        ctx.arc(X(n.x), Y(n.y), r, 0, Math.PI * 2)
        ctx.fill()
        if (isHot) {
          // the hover ring: focused colour, hugging the node
          const E = Math.max(1, 1 / s / f) * f * s
          ctx.strokeStyle = rgba(colors.focused.rgb, colors.focused.a)
          ctx.lineWidth = E
          ctx.beginPath()
          ctx.arc(X(n.x), Y(n.y), r + E / 2, 0, Math.PI * 2)
          ctx.stroke()
          ctx.lineWidth = 1
        }
        const alpha = (isHot ? 1 : ta * an.fade) * colors.text.a
        if (alpha <= 0.001) continue
        const k = isHot && s < 1 ? 1 : f * s
        labels.push(() => {
          const node = live.current.nodes.find(m => m.id === id)
          if (!node) return
          ctx.font = `${(14 + sz / 4) * k}px ${FONT}`
          ctx.fillStyle = rgba(colors.text.rgb, alpha)
          const lines = wrap(ctx, node.label, 300 * k)
          const lh = (14 + sz / 4) * k * 1.2
          lines.forEach((t, i) => ctx.fillText(t, X(n.x), Y(n.y) + (sz + 5) * f * s + an.move + i * lh))
        })
      }
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (const draw of labels) draw()
      if (busy || drag) raf = requestAnimationFrame(frame)
    }
    const wake = () => { if (!raf) raf = requestAnimationFrame(frame) }
    state.current.wake = wake
    state.current.refit = () => { view.touched = false }

    const resize = () => {
      const r = cv.getBoundingClientRect()
      dpr = Math.min(3, window.devicePixelRatio || 1)
      w = r.width; h = r.height
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      wake()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(cv)
    resize()

    const pos = (e: PointerEvent | WheelEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
    let drag: { id: string | null; sx: number; sy: number; vx: number; vy: number; click: boolean } | null = null
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      cv.setPointerCapture(e.pointerId)
      const p = pos(e)
      drag = { id: hit(p.x, p.y), sx: p.x, sy: p.y, vx: view.x, vy: view.y, click: true }
    }
    const move = (e: PointerEvent) => {
      const p = pos(e)
      if (!drag) {
        const id = hit(p.x, p.y)
        if (id !== hot) ((hot = id), (cv.style.cursor = id ? 'pointer' : ''), wake())
        return
      }
      if ((p.x - drag.sx) ** 2 + (p.y - drag.sy) ** 2 > 25) drag.click = false
      if (drag.click) return
      view.touched = true
      const sim = state.current.sim!
      if (drag.id) {
        const n = sim.nodes.get(drag.id)!, wpt = toWorld(p.x, p.y)
        n.fx = wpt.x; n.fy = wpt.y
        sim.alpha = Math.max(sim.alpha, 0.3); sim.alphaTarget = 0.3
      } else (view.x = drag.vx + p.x - drag.sx), (view.y = drag.vy + p.y - drag.sy)
      wake()
    }
    const up = () => {
      const d = drag
      drag = null
      if (!d) return
      const sim = state.current.sim
      if (d.id && sim) {
        const n = sim.nodes.get(d.id)
        if (n) (n.fx = null), (n.fy = null)
        sim.alphaTarget = 0
        if (d.click && d.id !== live.current.focus) live.current.onOpen(d.id)
      }
      wake()
    }
    const leave = () => { if (!drag && hot) ((hot = null), (cv.style.cursor = ''), wake()) }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1)
      const p = pos(e)
      view.touched = true
      view.target = Math.min(8, Math.max(0.05, view.target * Math.pow(1.5, -dy / 120)))
      view.zx = p.x; view.zy = p.y
      wake()
    }
    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', up)
    cv.addEventListener('pointerleave', leave)
    cv.addEventListener('wheel', wheel, { passive: false })
    const theme = matchMedia('(prefers-color-scheme: dark)')
    const recolor = () => (readColors(), anim.clear(), wake())
    theme.addEventListener('change', recolor)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      theme.removeEventListener('change', recolor)
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerup', up)
      cv.removeEventListener('pointercancel', up)
      cv.removeEventListener('pointerleave', leave)
      cv.removeEventListener('wheel', wheel)
      state.current.wake = () => {}
    }
  }, [])

  // new notes or links: rebuild the simulation, keeping placed nodes where they are
  const key = nodes.map(n => n.id).join('\n') + '\n\n' + links.map(l => l.join('>')).join('\n')
  useEffect(() => {
    const prev = state.current.sim
    state.current.sim = createSim(nodes.map(n => n.id), links, prev)
    if (prev) state.current.sim.alpha = 0.5
    state.current.refit()
    state.current.wake()
  }, [key])
  useEffect(() => state.current.wake(), [focus])

  return <canvas ref={ref} className="ob-graph" role="img" aria-label={label} />
}
