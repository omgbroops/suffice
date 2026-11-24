export interface Layer {
  seed: number
  sx: number
  sy: number
  speed: number
  dark: number
  light: number
  thr: (yn: number) => number
}

export interface SceneConfig {
  ramp: string[]
  cell?: number
  sky: (yn: number) => number
  layers: Layer[]
  sun?: { x: number; y: number; r: number; halo: number; spread: number; phase?: boolean }
  stars?: boolean
  mist?: (yn: number) => number
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)
export const bayer = (x: number, y: number) => BAYER[(x & 3) + ((y & 3) << 2)]
export const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const smooth = (v: number) => {
  const t = clamp(v)
  return t * t * (3 - 2 * t)
}

export function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function vnoise(x: number, y: number, period: number, seed: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const u = smooth(x - x0)
  const v = smooth(y - y0)
  const xa = ((x0 % period) + period) % period
  const xb = (xa + 1) % period
  const top = hash(xa, y0, seed) * (1 - u) + hash(xb, y0, seed) * u
  const bottom = hash(xa, y0 + 1, seed) * (1 - u) + hash(xb, y0 + 1, seed) * u
  return top * (1 - v) + bottom * v
}

function fbm(x: number, y: number, period: number, seed: number) {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let o = 0; o < 4; o++) {
    sum += amp * vnoise(x * freq, y * freq, period * freq, seed + o * 17)
    amp *= 0.5
    freq *= 2
  }
  return sum / 0.9375
}

const disc = (phase: boolean | undefined, nx: number, ny: number) =>
  phase ? clamp(0.5 - (nx * 0.8 + ny * 0.5) * 1.1) : 1 - 0.3 * clamp((Math.hypot(nx, ny) - 0.6) / 0.4)

export function pack(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)
}

const EMPTY = 255

// Copied from suffice-agent-web/src/dither.ts. The app passes its own colours so the scene follows the theme.
export function createScene(canvas: HTMLCanvasElement, cfg: SceneConfig, palette: ArrayLike<number> = cfg.ramp.map(pack)) {
  const ctx = canvas.getContext('2d')!
  const colors = new Uint32Array(palette)
  const top = cfg.ramp.length - 1
  let cols = 0
  let rows = 0
  let image: ImageData
  let pixels: Uint32Array
  let base: Uint8Array
  let mist: Uint8Array
  let tiles: { data: Uint8Array; width: number; speed: number }[] = []
  let raf = 0
  let started = 0
  let elapsed = 0
  let lastKey = 'stale'

  const quantize = (t: number, x: number, y: number) => {
    const f = clamp(t) * top
    const i = Math.floor(f)
    return f - i > bayer(x, y) ? i + 1 : i
  }

  function buildTile(layer: Layer) {
    const width = (Math.ceil(cols / layer.sx) + 2) * layer.sx
    const period = width / layer.sx
    const density = new Float32Array(width * rows)
    for (let y = 0; y < rows; y++) {
      const thr = layer.thr(y / rows)
      for (let x = 0; x < width; x++) {
        const streak = (hash(x >> 3, y, layer.seed + 5) - 0.5) * 0.045
        density[y * width + x] = thr > 1.2 ? -1 : fbm(x / layer.sx, y / layer.sy, period, layer.seed) + streak - thr
      }
    }
    const data = new Uint8Array(width * rows).fill(EMPTY)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < width; x++) {
        const d = density[y * width + x]
        if (d <= 0 || d / 0.03 < bayer(x, y)) continue
        const upLeft = y < 2 ? -1 : density[(y - 2) * width + ((x - 2 + width) % width)]
        const lit = clamp(0.5 + (d - Math.max(upLeft, -0.05)) * 8)
        data[y * width + x] = quantize(layer.dark + (layer.light - layer.dark) * lit, x, y)
      }
    }
    return { data, width, speed: layer.speed }
  }

  function build() {
    base = new Uint8Array(cols * rows)
    mist = new Uint8Array(cols * rows)
    const sun = cfg.sun && { x: cfg.sun.x * cols, y: cfg.sun.y * rows, r: Math.max(5, cfg.sun.r * Math.min(rows, cols * 0.6)) }
    for (let y = 0; y < rows; y++) {
      const yn = y / rows
      const sky = cfg.sky(yn)
      const band = 4 + Math.floor(hash(7, y, 1) * 10)
      const fog = cfg.mist ? cfg.mist(yn) : 0
      for (let x = 0; x < cols; x++) {
        const streak = hash(Math.floor(x / band), y, 2) - 0.5
        let t = sky + streak * 0.5 * Math.min(sky, 0.3)
        if (cfg.stars && yn < 0.4 && hash(x, y, 99) > 0.9978) t = 0.45 + hash(x, y, 98) * 0.55
        if (sun) {
          const dist = Math.hypot(x - sun.x, y - sun.y)
          t = dist < sun.r ? disc(cfg.sun!.phase, (x - sun.x) / sun.r, (y - sun.y) / sun.r) : t + cfg.sun!.halo * Math.exp(-(dist - sun.r) / (sun.r * cfg.sun!.spread))
        }
        base[y * cols + x] = quantize(t, x, y)
        if (fog > 0 && fog + streak * 0.25 > bayer(x, y)) mist[y * cols + x] = 1
      }
    }
    tiles = cfg.layers.map(buildTile)
  }

  function draw() {
    const offsets = tiles.map((tile) => Math.floor(elapsed * tile.speed) % tile.width)
    const key = offsets.join()
    if (key === lastKey) return
    lastKey = key
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const p = y * cols + x
        let index = base[p]
        for (let k = 0; k < tiles.length; k++) {
          const tile = tiles[k]
          const v = tile.data[y * tile.width + ((x + offsets[k]) % tile.width)]
          if (v !== EMPTY) index = v
        }
        pixels[p] = colors[mist[p] ? top : index]
      }
    }
    ctx.putImageData(image, 0, 0)
  }

  function frame(now: number) {
    elapsed = (now - started) / 1000
    draw()
    raf = requestAnimationFrame(frame)
  }

  return {
    resize(width: number, height: number) {
      if (!width || !height) return
      const cell = cfg.cell ?? (width < 720 ? 3 : 4)
      const c = Math.ceil(width / cell)
      const r = Math.ceil(height / cell)
      if (c === cols && r === rows) return
      cols = c
      rows = r
      canvas.width = c
      canvas.height = r
      canvas.style.width = `${c * cell}px`
      canvas.style.height = `${r * cell}px`
      image = ctx.createImageData(c, r)
      pixels = new Uint32Array(image.data.buffer)
      build()
      lastKey = 'stale'
      draw()
    },
    start() {
      if (raf) return
      started = performance.now() - elapsed * 1000
      raf = requestAnimationFrame(frame)
    },
    stop() {
      cancelAnimationFrame(raf)
      raf = 0
    },
  }
}

export const ramp = ['#0d0c0a', '#ebe5d5']

export const PRESETS = {
  card: {
    ramp,
    cell: 4,
    sky: (yn) => 0.015 + yn * yn * 0.1,
    layers: [],
  },
} satisfies Record<string, SceneConfig>

export type PresetName = keyof typeof PRESETS
