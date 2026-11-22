import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const src = await readFile(new URL('../src/components/glyphs.ts', import.meta.url), 'utf8')
const { drawGlyph, hash } = await import('data:text/javascript,' + encodeURIComponent(stripTypeScriptTypes(src, { mode: 'transform' })))

// Records the full-strength motes and the core (tails are drawn fainter and may trail).
function solids(S, status, t, seed) {
  const dots = []
  let style = ''
  const c = { set fillStyle(v) { style = v }, beginPath() {}, fill() {}, clearRect() {}, arc(x, y, r) { if (/,0\.9[25]\)$/.test(style)) dots.push({ x, y, r }) } }
  drawGlyph(c, S, 'swarm', t, status, hash(seed), '255,255,255', 1)
  return dots
}

test('seeded swarm motes never touch each other, the core or the edge', () => {
  for (let n = 0; n < 120; n++)
    for (const S of [12, 14, 16, 18, 23, 24, 32, 48])
      for (const [status, t] of [['done', 1.3], ['working', 0.1], ['working', 0.47], ['working', 1.9]]) {
        const d = solids(S, status, t, '/p/' + n)
        assert.ok(d.length >= 7, 'core + two rings drawn')
        for (let i = 0; i < d.length; i++) {
          const a = d[i]
          assert.ok(a.x - a.r >= 0 && a.y - a.r >= 0 && a.x + a.r <= S && a.y + a.r <= S, `inside the box: seed ${n} S ${S}`)
          for (let j = i + 1; j < d.length; j++) assert.ok(Math.hypot(a.x - d[j].x, a.y - d[j].y) >= a.r + d[j].r, `no touch: seed ${n} S ${S} ${status}`)
        }
      }
})

test('the same seed always draws the same emblem', () => {
  assert.deepEqual(solids(16, 'done', 1.3, '/a/project'), solids(16, 'done', 1.3, '/a/project'))
  assert.notDeepEqual(solids(16, 'done', 1.3, '/a/project'), solids(16, 'done', 1.3, '/b/project'))
})

test('generated spinners: every family and motion is reachable and grid cells stay inside the box', async () => {
  const { genPick, GEN_FAMILIES } = await import('data:text/javascript,' + encodeURIComponent(stripTypeScriptTypes(src, { mode: 'transform' })))
  const seen = new Set()
  for (let i = 0; i < 4000; i++) { const p = genPick(hash('t' + i)); seen.add(p.fam + '-' + p.v) }
  assert.equal(GEN_FAMILIES.length, 5)
  assert.equal(seen.size, 6 + 3 + 3 + 2 + 4, 'all 18 motions occur')
  for (let i = 0; i < 400; i++) {
    const seed = hash('t' + i)
    if (genPick(seed).fam !== 0) continue
    for (const S of [12, 16, 24]) {
      // A-F flow by size: over a cycle the drawn area must swing (cells shrink away and return), never leave the box
      const size = new Map() // cell centre -> sizes seen (0 when the cell is gone)
      const frames = []
      for (const t of [0.1, 0.4, 0.7, 1.0, 1.3, 1.6]) {
        const rects = []
        const c = { set fillStyle(v) {}, beginPath() {}, fill() {}, clearRect() {}, roundRect(x, y, w, h) { rects.push({ x, y, w, h }) } }
        drawGlyph(c, S, 'gen', t, 'working', seed, '255,255,255', 1)
        assert.ok(rects.length <= 25, `at most a 5x5 grid (seed ${i})`)
        for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= S + 1e-9 && r.y + r.h <= S + 1e-9, `inside the box (seed ${i}, S ${S})`)
        frames.push(new Map(rects.map(r => [`${Math.round((r.x + r.w / 2) * 10)},${Math.round((r.y + r.h / 2) * 10)}`, r.w])))
      }
      for (const f of frames) for (const k of f.keys()) size.set(k, [])
      for (const f of frames) for (const k of size.keys()) size.get(k).push(f.get(k) ?? 0)
      const swings = [...size.values()].filter(v => Math.min(...v) < 0.5 * Math.max(...v)).length
      assert.ok(swings >= size.size / 2, `most cells shrink and grow back (seed ${i}, S ${S}: ${swings}/${size.size})`)
    }
  }
})

test('shapeshifters stay inside their box at every size and moment', async () => {
  const { genPick } = await import('data:text/javascript,' + encodeURIComponent(stripTypeScriptTypes(src, { mode: 'transform' })))
  let checked = 0
  for (let i = 0; i < 600; i++) {
    const seed = hash('s' + i)
    if (genPick(seed).fam !== 4) continue
    for (const S of [12, 16, 24]) for (const t of [0.05, 0.3, 0.6, 0.9, 1.2, 1.5, 2.1, 3.3]) {
      const pts = []
      const c = { save() {}, restore() {}, clip() {}, rect() {}, translate() {}, rotate() {}, scale() {}, set fillStyle(v) {}, beginPath() {}, closePath() {}, fill() {}, clearRect() {},
        moveTo(x, y) { pts.push([x, y]) }, lineTo(x, y) { pts.push([x, y]) }, roundRect() {} }
      drawGlyph(c, S, 'gen', t, 'working', seed, '255,255,255', 1)
      for (const [x, y] of pts) assert.ok(x >= -1e-6 && y >= -1e-6 && x <= S + 1e-6 && y <= S + 1e-6, `outline inside the box (seed ${i}, S ${S}, t ${t})`)
      checked++
    }
  }
  assert.ok(checked > 50, `checked ${checked} frames`)
})
