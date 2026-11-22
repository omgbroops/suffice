// Smooth liveness glyphs and seeded emblems, drawn with vector arcs on canvas.
// Motion references (MIT): ldrs `ripples` / `chaoticOrbit`, svg-spinners `eclipse`; arc timing from Material Web (Apache-2.0).
// working = moving, input = still + one amber signal, done/idle = still and dimmer.
export type GlyphKind = 'swarm' | 'orbit' | 'ripple' | 'eclipse' | 'arc'
export type GlyphStatus = 'working' | 'done' | 'input' | 'idle'

const TAU = Math.PI * 2
const frac = (x: number) => x - Math.floor(x)

export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function rng(seed: number) {
  let a = seed | 0 || 0x9e3779b9
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Material's standard curve, cubic-bezier(0.4, 0, 0.2, 1)
function ease(x: number) {
  let u = x
  for (let i = 0; i < 6; i++) {
    const bx = 1.2 * (1 - u) ** 2 * u + 0.6 * (1 - u) * u * u + u ** 3 - x
    const d = 1.2 * (1 - u) ** 2 - 1.2 * (1 - u) * u + 2.4 * u * u
    u = Math.min(1, Math.max(0, u - bx / (d || 1)))
  }
  return 3 * (1 - u) * u * u + u ** 3
}

type G = { c: CanvasRenderingContext2D; S: number; t: number; s: Status; ink: (a: number) => string; seed: number }
type Status = GlyphStatus

const dot = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  c.beginPath()
  c.arc(x, y, Math.max(0.35, r), 0, TAU)
  c.fill()
}

// all sizes in fractions of the glyph's side S; the outer edge stays inside 0.46 S
type Ring = { k: number; r: number; size: number; cap: number; w: number; off: number }
const swarmCache = new Map<number, { rings: Ring[]; core: number }>()
function layout(seed: number) {
  let m = swarmCache.get(seed)
  if (m) return m
  const r = rng(seed)
  // k-fold symmetry reads as a designed mark at 12 px; the seed picks folds, radii and sizes
  const k = 3 + Math.floor(r() * 4)
  const k2 = Math.min(10, r() < 0.5 ? k : k * 2)
  const dir = r() < 0.5 ? 1 : -1
  // neighbouring motes keep a gap: chord >= 2.6 x mote radius
  const fit = (n: number, rad: number, size: number) => Math.min(size, (rad * Math.sin(Math.PI / n)) / 1.3)
  const core = 0.09 + 0.04 * r()
  const s2 = 0.04 + 0.02 * r(), r2 = 0.46 - s2
  let s1 = 0.055 + 0.02 * r()
  const r1 = core + s1 + 0.04
  s1 = fit(k, r1, s1)
  m = {
    core,
    rings: [
      { k, r: r1, size: s1, cap: Math.min((r1 * Math.sin(Math.PI / k)) / 1.3, r1 - core - 0.02), w: dir * 0.5, off: 0 },
      { k: k2, r: r2, size: fit(k2, r2, s2), cap: Math.min((r2 * Math.sin(Math.PI / k2)) / 1.3, 0.5 - r2), w: -dir * 0.3, off: r() < 0.5 ? 0 : Math.PI / k2 },
    ],
  }
  swarmCache.set(seed, m)
  return m
}

// Seeded k-fold swarm: a core and two rings of motes that counter-rotate while working, with fading tails.
function swarm({ c, S, t, s, ink, seed }: G) {
  const cx = S / 2, cy = S / 2
  const moving = s === 'working'
  const { rings, core } = layout(seed)
  // tiny marks need heavier motes to read; fit() still caps them below touching
  const boost = S < 24 ? 1.45 : 1
  for (const g of rings) {
    for (let q = moving ? 3 : 0; q >= 0; q--) {
      const tt = t - q * 0.035
      c.fillStyle = ink(q ? 0.28 * (1 - q / 4) : 0.92)
      for (let i = 0; i < g.k; i++) {
        const th = g.off + (i / g.k) * TAU + (moving ? g.w * TAU * tt : 0) - Math.PI / 2
        const rr = S * g.r * (moving ? 1 + 0.05 * Math.sin(tt * TAU * 0.7 + i) : 1)
        dot(c, cx + rr * Math.cos(th), cy + rr * Math.sin(th), Math.max(0.6, S * Math.min(g.size * boost, g.cap) * (q ? 0.75 : 1)))
      }
    }
  }
  c.fillStyle = ink(0.95)
  dot(c, cx, cy, Math.max(1, S * core * (S < 24 ? 1.2 : 1) * (moving ? 1 + 0.1 * Math.sin(t * TAU * 0.8) : 1)))
}

// ldrs chaoticOrbit: two dots swinging through the centre of a slowly turning axis
function orbit({ c, S, t, s, ink }: G) {
  const cx = S / 2, cy = S / 2, R = S * 0.36
  const moving = s === 'working'
  const A = moving ? (TAU * t) / 2.5 : -Math.PI / 4
  const ph = moving ? (TAU * t) / 1.5 : Math.PI / 2
  for (const k of [0, 1]) {
    const d = R * Math.sin(ph + k * Math.PI)
    const sc = 0.55 + 0.45 * Math.abs(Math.cos(ph + k * Math.PI))
    c.fillStyle = ink(0.95)
    dot(c, cx + d * Math.cos(A), cy + d * Math.sin(A), S * 0.15 * (moving ? sc : 0.8))
  }
  c.strokeStyle = ink(0.18)
  c.lineWidth = Math.max(1, S / 14)
  c.beginPath()
  c.arc(cx, cy, R + S * 0.1, 0, TAU)
  c.stroke()
}

// ldrs ripples: rings grow and fade, staggered by a third of a 2 s period
function ripple({ c, S, t, s, ink }: G) {
  const cx = S / 2, cy = S / 2, R = S * 0.46
  c.lineWidth = Math.max(1, S / 12)
  if (s === 'working') {
    for (let i = 0; i < 3; i++) {
      const p = frac(t / 2 + i / 3)
      c.strokeStyle = ink((1 - p) ** 1.3)
      c.beginPath()
      c.arc(cx, cy, R * (0.12 + 0.88 * p), 0, TAU)
      c.stroke()
    }
  } else {
    for (const [r, a] of [[0.5, 0.7], [0.92, 0.3]]) {
      c.strokeStyle = ink(a)
      c.beginPath()
      c.arc(cx, cy, R * r, 0, TAU)
      c.stroke()
    }
  }
  c.fillStyle = ink(0.95)
  dot(c, cx, cy, S * 0.1)
}

// svg-spinners eclipse: a lit crescent sweeps round the disc and never goes dark
function eclipse({ c, S, t, s, ink }: G) {
  const cx = S / 2, cy = S / 2, R = S * 0.44
  const th = s === 'working' ? (TAU * t) / 1.8 : -Math.PI * 0.75
  const off = s === 'working' ? 0.62 : 0.5
  c.save()
  c.beginPath()
  c.arc(cx, cy, R, 0, TAU)
  c.clip()
  c.fillStyle = ink(0.16)
  c.fillRect(0, 0, S, S)
  c.beginPath()
  c.moveTo(cx + R, cy)
  c.arc(cx, cy, R, 0, TAU)
  const sx = cx + Math.cos(th) * R * off, sy = cy + Math.sin(th) * R * off
  c.moveTo(sx + R, sy)
  c.arc(sx, sy, R, 0, TAU)
  c.fillStyle = ink(0.95)
  c.fill('evenodd')
  c.restore()
}

// Material indeterminate arc: head races out, tail catches up, 1333 ms per stroke, 1568 ms per turn
function arc({ c, S, t, s, ink }: G) {
  const cx = S / 2, cy = S / 2, R = S * 0.38
  c.lineWidth = Math.max(1.25, S * 0.1)
  c.lineCap = 'round'
  c.strokeStyle = ink(0.16)
  c.beginPath()
  c.arc(cx, cy, R, 0, TAU)
  c.stroke()
  if (s !== 'working') {
    c.strokeStyle = ink(0.95)
    c.beginPath()
    c.arc(cx, cy, R, -Math.PI / 2, s === 'done' ? Math.PI * 1.5 : Math.PI / 2)
    c.stroke()
    return
  }
  const k = Math.floor(t / 1.333), f = frac(t / 1.333)
  const deg = Math.PI / 180, base = (TAU * t) / 1.568 + k * 250 * deg
  const tail = f < 0.5 ? 0 : 250 * deg * ease(2 * f - 1)
  const head = f < 0.5 ? 10 * deg + 250 * deg * ease(2 * f) : 260 * deg
  c.strokeStyle = ink(0.95)
  c.beginPath()
  c.arc(cx, cy, R, base + tail - Math.PI / 2, base + head - Math.PI / 2)
  c.stroke()
}

const KINDS: Record<GlyphKind, (g: G) => void> = { swarm, orbit, ripple, eclipse, arc }

/** Draws one frame in CSS pixels; the caller scales the context for device pixels. */
export function drawGlyph(c: CanvasRenderingContext2D, S: number, kind: GlyphKind, t: number, s: Status, seed: number, rgb: string, alpha: number) {
  c.clearRect(0, 0, S, S)
  KINDS[kind]({ c, S, t, s, seed, ink: a => `rgba(${rgb},${a * alpha})` })
  if (s === 'input') {
    c.fillStyle = '#d4a160'
    dot(c, S * 0.84, S * 0.16, Math.max(1.5, S * 0.13))
  }
}
