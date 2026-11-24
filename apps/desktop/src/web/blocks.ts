import { bayer, hash, pack, ramp, smooth } from './dither'

export interface FieldConfig {
  size: number
  origin: [number, number]
  lit: number
  step: number
  fade: (xn: number, yn: number, narrow: boolean) => number
}

// A codebase drawn as a field of columns. The agent lifts and lights only the few it needs.
// Copied from suffice-agent-web/src/blocks.ts. The app passes its own two colours so the field follows the theme.
export function createField(canvas: HTMLCanvasElement, cfg: FieldConfig, palette: ArrayLike<number> = ramp.map(pack)) {
  const ctx = canvas.getContext('2d')!
  const colors = new Uint32Array(palette)
  let cols = 0
  let rows = 0
  let tile = 16
  let image: ImageData
  let pixels: Uint32Array
  let tones: Float32Array
  let path: number[] = []
  let raf = 0
  let started = 0
  let elapsed = 0
  let lastStep = -1

  const height = (i: number, j: number) => {
    const v = hash(i, j, 7)
    return v < 0.12 ? 0 : Math.floor(3 + v * v * 26)
  }
  const place = (i: number, j: number) => [cfg.origin[0] * cols + (i - j) * tile, cfg.origin[1] * rows + ((i + j) * tile) / 2]
  const fadeAt = (x: number, y: number) => cfg.fade(x / cols, y / rows, cols < 200)

  function buildPath() {
    const candidates: number[] = []
    for (let i = 0; i < cfg.size; i++) {
      for (let j = 0; j < cfg.size; j++) {
        const [x, y] = place(i, j)
        const inside = x > tile && x < cols - tile && y > rows * 0.25 && y < rows + tile
        if (inside && height(i, j) > 10 && fadeAt(x, y - height(i, j) - 16 - tile) > 0.9) candidates.push(i * cfg.size + j)
      }
    }
    candidates.sort((a, b) => hash(a, 3, 5) - hash(b, 3, 5))
    path = candidates.slice(0, 16)
  }

  function column(i: number, j: number, age: number) {
    const base = height(i, j)
    if (!base) return
    const [bx, by] = place(i, j)
    const h = age < 0 ? base : base + 16 - age * 4
    const top = by - h
    if (bx + tile < 0 || bx - tile >= cols || top - tile / 2 >= rows || by + tile / 2 < 0) return
    const fade = fadeAt(bx, by - base - 16 - tile)
    if (fade < 0.02) return
    const lit = age >= 0
    const tone = lit ? 1 - age * 0.12 : 0.42 * fade
    const x0 = Math.max(0, Math.ceil(bx - tile))
    const x1 = Math.min(cols, Math.floor(bx + tile))
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - bx
      const half = (tile - Math.abs(dx)) / 2
      const side = dx < 0 ? tone * (lit ? 0.6 : 0.3) : lit ? tone * 0.22 : 0
      const y0 = Math.max(0, Math.round(top - half))
      const y1 = Math.min(rows, Math.round(top + half + h))
      const seam = Math.round(top + half)
      for (let y = y0; y < y1; y++) tones[y * cols + x] = y === seam - 1 || y === y0 ? 0 : y < seam ? tone : side
    }
  }

  function draw() {
    const step = Math.floor(elapsed / cfg.step)
    if (step === lastStep) return
    lastStep = step
    tones.fill(0)
    const ages = new Map<number, number>()
    for (let k = 0; k < cfg.lit && path.length; k++) ages.set(path[(step + path.length * 4 - k) % path.length], k)
    for (let sum = 0; sum <= (cfg.size - 1) * 2; sum++) {
      for (let i = Math.max(0, sum - cfg.size + 1); i <= Math.min(sum, cfg.size - 1); i++) {
        const j = sum - i
        column(i, j, ages.get(i * cfg.size + j) ?? -1)
      }
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) pixels[y * cols + x] = colors[tones[y * cols + x] > bayer(x, y) ? 1 : 0]
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
      const cell = width < 720 ? 3 : 4
      const c = Math.ceil(width / cell)
      const r = Math.ceil(height / cell)
      if (c === cols && r === rows) return
      cols = c
      rows = r
      tile = c < 200 ? 10 : 16
      canvas.width = c
      canvas.height = r
      canvas.style.width = `${c * cell}px`
      canvas.style.height = `${r * cell}px`
      image = ctx.createImageData(c, r)
      pixels = new Uint32Array(image.data.buffer)
      tones = new Float32Array(c * r)
      buildPath()
      lastStep = -1
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

export const FIELDS = {
  hero: {
    size: 28,
    origin: [0.76, 0],
    lit: 4,
    step: 1.1,
    fade: (xn, yn, narrow) => (narrow ? smooth((yn - 0.6) / 0.08) : Math.max(smooth((xn - 0.5) / 0.12), smooth((yn - 0.7) / 0.08))),
  },
  closing: {
    size: 36,
    origin: [0.5, 0.1],
    lit: 3,
    step: 1.4,
    fade: (_xn, yn) => smooth((yn - 0.46) / 0.08),
  },
  // the app's new-thread screen: the field fills the panel and thins out behind the logo and recent threads
  home: {
    size: 44,
    origin: [0.5, -0.2],
    lit: 5,
    step: 1.2,
    fade: (xn, yn) => smooth((Math.hypot((xn - 0.5) / 0.4, (yn - 0.46) / 0.3) - 0.75) / 0.5) * (1 - 0.6 * smooth((yn - 0.74) / 0.12)),
  },
} satisfies Record<string, FieldConfig>
