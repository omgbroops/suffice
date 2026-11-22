// Smooth liveness glyphs and seeded emblems, drawn with vector arcs on canvas.
// Motion references (MIT): ldrs `ripples` / `chaoticOrbit`, svg-spinners `eclipse`; arc timing from Material Web (Apache-2.0).
// working = moving, input = still + one amber signal, done/idle = still and dimmer.
export type GlyphKind = 'swarm' | 'orbit' | 'ripple' | 'eclipse' | 'arc' | 'gen'
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

type G = { c: CanvasRenderingContext2D; S: number; t: number; s: Status; ink: (a: number) => string; seed: number; darkInk?: boolean }
type Status = GlyphStatus

const dot = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  c.beginPath()
  c.arc(x, y, Math.max(0.35, r), 0, TAU)
  c.fill()
}

// all sizes in fractions of the glyph's side S; the outer edge stays inside 0.46 S
type Ring = { k: number; r: number; size: number; w: number; off: number }
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
      { k, r: r1, size: s1, w: dir * 0.5, off: 0 },
      { k: k2, r: r2, size: fit(k2, r2, s2), w: -dir * 0.3, off: r() < 0.5 ? 0 : Math.PI / k2 },
    ],
  }
  swarmCache.set(seed, m)
  return m
}

// Seeded k-fold swarm: a core and two rings of motes that counter-rotate while working, with fading tails.
// Final pixel radii are clamped after boosts and floors, so motes never touch each other, the core or the edge.
function swarm({ c, S, t, s, ink, seed }: G) {
  const cx = S / 2, cy = S / 2
  const moving = s === 'working'
  const { rings, core } = layout(seed)
  const small = S < 24, gap = Math.max(0.5, S * 0.03)
  const coreR = Math.max(1, S * core * (small ? 1.2 : 1))
  const pulse = moving ? 1 + 0.1 * Math.sin(t * TAU * 0.8) : 1
  let inside = coreR * 1.1 // furthest edge already used, core at its largest pulse
  const radii = rings.map(g => {
    const rr = S * g.r
    const want = Math.max(0.6, S * g.size * (small ? 1.45 : 1))
    const d = Math.max(0.35, Math.min(want, (rr * Math.sin(Math.PI / g.k)) / 1.3, rr - inside - gap, S / 2 - rr))
    inside = rr + d
    return d
  })
  rings.forEach((g, n) => {
    for (let q = moving ? 3 : 0; q >= 0; q--) {
      const tt = t - q * 0.035
      c.fillStyle = ink(q ? 0.28 * (1 - q / 4) : 0.92)
      for (let i = 0; i < g.k; i++) {
        const th = g.off + (i / g.k) * TAU + (moving ? g.w * TAU * tt : 0) - Math.PI / 2
        dot(c, cx + S * g.r * Math.cos(th), cy + S * g.r * Math.sin(th), radii[n] * (q ? 0.75 : 1))
      }
    }
  })
  c.fillStyle = ink(0.95)
  dot(c, cx, cy, coreR * pulse)
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

// ---- gen: generated spinners (Abhay 11-22: grids A-F "I like a-f"; square <-> circle morphs; blocks and
// shapes "okay"; the shaded 3D orbs dropped) ----
// The seed picks a family (grids weighted up), a motion, and small speed/direction changes.
export const GEN_FAMILIES = ['grid', 'morph', 'blocks', 'shapes'] as const
const GEN_VARIANTS = [6, 3, 3, 2]
export function genPick(seed: number) {
  const r = rng(seed ^ 0x5bd1e995)
  const u = r(), fam = u < 0.45 ? 0 : u < 0.67 ? 1 : u < 0.84 ? 2 : 3
  return { fam, v: Math.floor(r() * GEN_VARIANTS[fam]), speed: 0.85 + r() * 0.35, dir: r() < 0.5 ? 1 : -1, sides: r() < 0.5 ? 3 : 4, salt: Math.floor(r() * 1e9) }
}

// a cell's light along a travelling front: a soft on, a softer off (0..1)
function pulse(x: number, width = 0.34) {
  const u = frac(x)
  return u < width ? Math.sin((Math.PI * u) / width) ** 2 : 0
}

// cells in snake (boustrophedon) order
function snakeOrder(n: number) {
  const o: number[] = []
  for (let y = 0; y < n; y++) for (let k = 0; k < n; k++) o.push(y * n + (y % 2 ? n - 1 - k : k))
  return o
}
/**
 * Grids A-F (picked 11-22 from a sheet beside svg-spinners blocks-wave and SpinKit grid): cells flow off and on
 * by SIZE, not by dimming, so the outline changes and reads at 14-16 px. B, C, E, F round into circles as they shrink.
 * v0 A 5x5 diagonal squares · v1 B 5x5 diagonal round · v2 C 5x5 ripple round · v3 D 5x5 snake squares
 * v4 E 4x4 diagonal round · v5 F 3x3 diagonal round
 */
function grid(g: G, p: ReturnType<typeof genPick>, T: number) {
  const n = p.v === 4 ? 4 : p.v === 5 ? 3 : 5
  const round = p.v !== 0 && p.v !== 3
  const period = p.v === 3 ? 1.8 : 1.4, spread = p.v === 2 ? 0.5 : p.v === 3 ? 0.9 : 0.6
  const snake = p.v === 3 ? snakeOrder(n) : null
  const rank = snake ? Object.fromEntries(snake.map((c, i) => [c, i])) : null
  const pad = g.S * 0.04, pitch = (g.S - 2 * pad) / n, full = pitch * 0.82
  g.c.fillStyle = g.ink(0.95)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const delay = rank ? rank[y * n + x] / (n * n)
        : p.v === 2 ? Math.hypot(x - (n - 1) / 2, y - (n - 1) / 2) / Math.hypot((n - 1) / 2, (n - 1) / 2)
        : (p.dir > 0 ? x + y : n - 1 - x + y) / (2 * (n - 1))
      // full, then shrinks away and comes back as the wave passes (70% of the cycle), then rests full
      const u = frac(T / period - delay * spread)
      const k = 0.5 + 0.5 * Math.cos(TAU * Math.min(1, u / 0.7))
      const side = full * k
      if (side < 0.35) continue
      const cx = pad + pitch * (x + 0.5), cy = pad + pitch * (y + 0.5)
      g.c.beginPath()
      g.c.roundRect(cx - side / 2, cy - side / 2, side, side, side * (round ? 0.12 + 0.38 * (1 - k) : 0.12))
      g.c.fill()
    }
}

// a rounded square whose corners open to a circle and close again (f: 0 square, 1 circle)
function morphCell(g: G, x: number, y: number, side: number, f: number, turn: number, a = 0.95) {
  const { c } = g
  c.save()
  c.translate(x, y)
  c.rotate(turn)
  c.fillStyle = g.ink(a)
  c.beginPath()
  c.roundRect(-side / 2, -side / 2, side, side, side * (0.14 + 0.36 * f))
  c.fill()
  c.restore()
}

function morph(g: G, p: ReturnType<typeof genPick>, T: number) {
  const { S } = g, cx = S / 2, cy = S / 2
  if (p.v === 0) {
    // one shape: square to circle and back, a quarter turn while it closes
    const f = (1 - Math.cos((TAU * T) / 1.6)) / 2
    morphCell(g, cx, cy, S * 0.66, f, (p.dir * Math.PI * ease(frac(T / 1.6))) / 2)
  } else if (p.v === 1) {
    // 2x2: each cell morphs in turn, so a circle walks around the square
    const b = S * 0.4, o = S * 0.235
    const cells = [[-o, -o], [o, -o], [o, o], [-o, o]]
    cells.forEach(([dx, dy], i) => {
      const j = p.dir > 0 ? i : 3 - i
      const f = Math.max(0, Math.cos(TAU * (T / 1.4 - j / 4))) ** 2
      morphCell(g, cx + dx, cy + dy, b * (0.9 + 0.1 * f), f, 0, 0.45 + 0.5 * f)
    })
  } else {
    // 3x3: a wave of circles crossing a grid of squares
    const n = 3, pitch = S / n, b = pitch * 0.76
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const f = pulse(T / 1.5 - (p.dir > 0 ? x + y : n - 1 - x + y) / 6, 0.5)
        morphCell(g, (x + 0.5) * pitch, (y + 0.5) * pitch, b, f, 0, 0.35 + 0.6 * f)
      }
  }
}

function block(g: G, x: number, y: number, b: number, a = 0.95) {
  g.c.fillStyle = g.ink(a)
  g.c.beginPath()
  g.c.roundRect(x - b / 2, y - b / 2, b, b, b * 0.28)
  g.c.fill()
}

function gen(g: G) {
  const p = genPick(g.seed)
  const T = g.s === 'working' ? g.t * p.speed : 0.2
  const { S } = g, cx = S / 2, cy = S / 2
  if (p.fam === 0) return grid(g, p, T)
  if (p.fam === 1) return morph(g, p, T)
  if (p.fam === 2) {
    const b = S * 0.34, o = (b + S * 0.09) / 2
    const cells = [[-o, -o], [o, -o], [o, o], [-o, o]]
    if (p.v === 0) {
      // sliding puzzle: three blocks, one hole, the neighbour slides in
      const k = Math.floor(T / 0.5), f = Math.min(1, Math.max(0, (frac(T / 0.5) - 0.3) / 0.7))
      const hole = (((k * p.dir) % 4) + 4) % 4, next = (((hole + p.dir) % 4) + 4) % 4
      for (let i = 0; i < 4; i++) if (i !== hole && i !== next) block(g, cx + cells[i][0], cy + cells[i][1], b)
      const e = ease(f)
      block(g, cx + cells[next][0] + (cells[hole][0] - cells[next][0]) * e, cy + cells[next][1] + (cells[hole][1] - cells[next][1]) * e, b)
    } else if (p.v === 1) {
      // four blocks lighting in turn
      for (let i = 0; i < 4; i++) {
        const j = p.dir > 0 ? i : 3 - i
        const k = Math.max(0, Math.cos(TAU * (T / 1.2 - j / 4)))
        block(g, cx + cells[i][0], cy + cells[i][1], b, 0.3 + 0.65 * k ** 2)
      }
    } else {
      // two blocks trading corners a quarter turn at a time
      const k = Math.floor(T / 0.6), a = (k + ease(frac(T / 0.6))) * (TAU / 4) * p.dir + Math.PI / 4
      for (const off of [0, Math.PI]) block(g, cx + Math.cos(a + off) * o * Math.SQRT2, cy + Math.sin(a + off) * o * Math.SQRT2, b * 1.05)
    }
    return
  }
  // one basic shape: triangle or square, a stepped turn (v0) or a slow breath (v1)
  const { c } = g
  c.fillStyle = g.ink(0.95)
  c.save()
  c.translate(cx, cy)
  const n = p.sides, rad = S * (n === 3 ? 0.42 : 0.4)
  const step = TAU / n
  const turn = p.v === 0 ? (Math.floor(T / 0.7) + ease(frac(T / 0.7))) * step * p.dir : 0.15 * Math.sin((TAU * T) / 2.4)
  const scale = p.v === 1 ? 0.78 + 0.22 * (1 - Math.cos((TAU * T) / 1.2)) / 2 : 1
  c.rotate(turn - Math.PI / 2 + (n === 4 ? Math.PI / 4 : 0))
  c.scale(scale, scale)
  // rounded corners in one fill (a stroke over the fill doubled the alpha into a visible frame)
  const pt = (i: number) => [Math.cos(i * step) * rad, Math.sin(i * step) * rad]
  const [sx, sy] = pt(0), [ex, ey] = pt(n - 1)
  c.beginPath()
  c.moveTo((sx + ex) / 2, (sy + ey) / 2)
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pt(i), [bx, by] = pt(i + 1)
    c.arcTo(ax, ay, (ax + bx) / 2, (ay + by) / 2, rad * 0.22)
  }
  c.closePath()
  c.fill()
  c.restore()
}

const KINDS: Record<GlyphKind, (g: G) => void> = { swarm, orbit, ripple, eclipse, arc, gen }

/** Draws one frame in CSS pixels; the caller scales the context for device pixels. */
export function drawGlyph(c: CanvasRenderingContext2D, S: number, kind: GlyphKind, t: number, s: Status, seed: number, rgb: string, alpha: number) {
  c.clearRect(0, 0, S, S)
  const [r, gr, b] = rgb.split(',').map(Number)
  KINDS[kind]({ c, S, t, s, seed, ink: a => `rgba(${rgb},${a * alpha})`, darkInk: 0.2126 * r + 0.7152 * gr + 0.0722 * b < 128 })
  if (s === 'input') {
    c.fillStyle = '#d4a160'
    dot(c, S * 0.84, S * 0.16, Math.max(1.5, S * 0.13))
  }
}
