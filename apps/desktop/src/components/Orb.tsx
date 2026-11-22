import { useEffect, useRef } from 'react'
import { hashName, orbPalette, rng } from '../../shared/orb.mjs'

type Draw = (c: CanvasRenderingContext2D, S: number, name: string, cols: string[]) => void
// The four candidates from the round-7 pick sheet; ORB_STYLE is the one in use.
const STYLES: Record<'marble' | 'mesh' | 'swirl' | 'bands', Draw> = {
  // base colour plus two blurred shapes (boring-avatars' marble, MIT, rebuilt)
  marble(c, S, name, cols) {
    const r = rng(hashName(name) ^ 0xa1)
    c.fillStyle = cols[0]; c.fillRect(0, 0, S, S)
    c.filter = `blur(${S * 0.09}px)`
    for (const k of [1, 2]) {
      c.save(); c.translate(S / 2, S / 2); c.rotate(r() * 6.28); c.translate((r() - 0.5) * S * 0.5, (r() - 0.5) * S * 0.5)
      c.fillStyle = cols[k]; c.beginPath()
      c.moveTo(-S * 0.5, -S * 0.1); c.bezierCurveTo(-S * 0.2, -S * 0.55, S * 0.45, -S * 0.35, S * 0.35, S * 0.1); c.bezierCurveTo(S * 0.25, S * 0.5, -S * 0.3, S * 0.4, -S * 0.5, -S * 0.1)
      c.fill(); c.restore()
    }
    c.filter = 'none'
  },
  // three soft pools of light at seeded spots
  mesh(c, S, name, cols) {
    const r = rng(hashName(name) ^ 0xb2)
    c.fillStyle = cols[1]; c.fillRect(0, 0, S, S)
    const a0 = r() * 6.28
    for (const k of [0, 2, 1]) {
      const a = a0 + k * 2.1, x = S / 2 + Math.cos(a) * S * 0.32, y = S / 2 + Math.sin(a) * S * 0.32
      const g = c.createRadialGradient(x, y, 0, x, y, S * 0.62)
      g.addColorStop(0, cols[k]); g.addColorStop(1, cols[k].replace(')', ' / 0)'))
      c.fillStyle = g; c.fillRect(0, 0, S, S)
    }
  },
  // a conic sweep through the three colours, softened
  swirl(c, S, name, cols) {
    const r = rng(hashName(name) ^ 0xc3)
    const g = c.createConicGradient(r() * 6.28, S / 2, S / 2)
    ;[cols[0], cols[1], cols[2], cols[0]].forEach((col, i) => g.addColorStop(i / 3, col))
    c.filter = `blur(${S * 0.06}px)`; c.fillStyle = g; c.fillRect(-S * 0.2, -S * 0.2, S * 1.4, S * 1.4); c.filter = 'none'
  },
  // three flat bands with soft wavy edges
  bands(c, S, name, cols) {
    const r = rng(hashName(name) ^ 0xd4)
    c.save(); c.translate(S / 2, S / 2); c.rotate(r() * 6.28); c.translate(-S / 2, -S / 2)
    c.fillStyle = cols[0]; c.fillRect(-S, -S, S * 3, S * 3)
    c.filter = `blur(${S * 0.04}px)`
    for (const [k, y0] of [[1, 0.38], [2, 0.66]] as const) {
      const ph = r() * 6.28
      c.fillStyle = cols[k]; c.beginPath(); c.moveTo(-S, S * 2)
      for (let x = -S; x <= S * 2; x += S / 16) c.lineTo(x, S * y0 + Math.sin((x / S) * 6.28 + ph) * S * 0.07)
      c.lineTo(S * 2, S * 2); c.fill()
    }
    c.restore(); c.filter = 'none'
  },
}
// shortcut: B (mesh) is my guess until Abhay picks on the round-7 sheet; change this one word after his pick
export const ORB_STYLE: keyof typeof STYLES = 'mesh'

const dark = () => typeof matchMedia !== 'function' || matchMedia('(prefers-color-scheme: dark)').matches

/** The project's emblem: a static three-colour orb from its path (or around its tint). */
export function ProjectOrb({ seed, size = 16, tint, label }: { seed: string; size?: number; tint?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const draw = () => {
      const d = Math.min(3, window.devicePixelRatio || 1), c = cv.getContext('2d')
      if (!c) return
      cv.width = cv.height = Math.round(size * d)
      c.setTransform(d, 0, 0, d, 0, 0)
      c.clearRect(0, 0, size, size)
      c.save(); c.beginPath(); c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); c.clip()
      STYLES[ORB_STYLE](c, size, seed, orbPalette(seed, { tint, light: !dark() }))
      c.restore()
    }
    draw()
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    mq?.addEventListener('change', draw)
    return () => mq?.removeEventListener('change', draw)
  }, [seed, size, tint])
  return <canvas ref={ref} className="proj-orb" role="img" aria-label={label} style={{ width: size, height: size }} />
}
