import { useEffect, useRef } from 'react'
import { DURATION, MOON, tiltAt, viewAt } from './camera'

const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map(v => (v + 0.5) / 64)

const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}
const noise = (x: number) => {
  const i = Math.floor(x)
  const f = x - i
  const t = f * f * (3 - 2 * f)
  return hash(i) * (1 - t) + hash(i + 1) * t
}
const fbm = (x: number, oct = 5) => {
  let a = 0.5, s = 0
  for (let o = 0; o < oct; o++) {
    s += a * noise(x)
    x *= 2.03
    a *= 0.5
  }
  return s
}

const ridged = (x: number) => {
  let a = 0.5, s = 0
  for (let o = 0; o < 4; o++) {
    const n = 1 - Math.abs(noise(x) * 2 - 1)
    s += a * n * n
    x *= 2.05
    a *= 0.42
  }
  return s
}

const RIDGES = [
  { base: 0.6, amp: 0.4, freq: 2.0, seed: 7, lum: 0.17 },
  { base: 0.76, amp: 0.3, freq: 2.2, seed: 17, lum: 0.12 },
  { base: 0.9, amp: 0.22, freq: 3.4, seed: 41, lum: 0.04 },
]

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function scene(u: number, v: number, aspect: number, ox = 0, oy = 0) {
  const x = u * aspect + ox
  v += oy
  u = x / aspect
  for (let i = RIDGES.length - 1; i >= 0; i--) {
    const r = RIDGES[i]
    const at = (px: number) => r.base - (ridged(px * r.freq + r.seed) - 0.45) * r.amp
    const h = at(x)
    if (v >= h) {
      const rim = i ? (1 - smooth(0, 0.012, v - h)) * 0.1 : 0
      const mist = smooth(0.05, 0.35, v - h) * 0.06
      return r.lum + rim + mist
    }
  }
  const mx = aspect * MOON.x, my = MOON.y, mr = 0.1
  const dx = (x - mx) / mr, dy = (v - my) / mr
  const d2 = dx * dx + dy * dy
  if (d2 < 1) {
    const nz = Math.sqrt(1 - d2)
    const light = Math.max(0, -dx * 0.6 - dy * 0.3 + nz * 0.74)
    const crater = fbm(dx * 5 + 40) * fbm(dy * 5 + 90) * 0.3
    return 0.12 + light * 0.85 - crater
  }
  const glow = Math.max(0, 1 - (Math.sqrt(d2) - 1) * 0.35) * 0.12
  const star = hash(Math.floor(u * 900) * 3.1 + Math.floor(v * 600) * 17.7) > 0.9975 ? 0.9 : 0
  return 0.03 + smooth(0.0, 0.7, v) * 0.42 + glow + star
}

/** look: the camera looks up and closes in until the moon sits centred above the composer; eases back when false. */
export function Dither({ cell = 2, look = false }: { cell?: number; look?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const tilt = useRef(look ? 1 : 0)
  const redraw = useRef<() => void>(() => {})

  useEffect(() => {
    const canvas = ref.current!
    let frame = 0
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect()
      const w = Math.ceil(width / cell), h = Math.ceil(height / cell)
      if (!w || !h) return
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      const img = ctx.createImageData(w, h)
      const aspect = w / h
      const t = tilt.current
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = t ? viewAt(t, x / w, y / h) : { u: x / w, v: y / h }
          const l = scene(p.u, p.v, aspect)
          if (l > BAYER[(y & 7) * 8 + (x & 7)]) {
            const p = (y * w + x) * 4
            img.data[p] = img.data[p + 1] = img.data[p + 2] = 255
            img.data[p + 3] = 255
          }
        }
      }
      ctx.putImageData(img, 0, 0)
    }
    redraw.current = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    const ro = new ResizeObserver(() => redraw.current())
    ro.observe(canvas)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [cell])

  useEffect(() => {
    const to = look ? 1 : 0
    if (tilt.current === to) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      tilt.current = to
      redraw.current()
      return
    }
    const from = tilt.current, t0 = performance.now()
    let id = 0
    const step = (now: number) => {
      const ms = now - t0
      tilt.current = tiltAt(from, look, ms)
      redraw.current()
      if (ms < DURATION) id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [look])

  return <canvas ref={ref} className="dither" aria-hidden />
}
