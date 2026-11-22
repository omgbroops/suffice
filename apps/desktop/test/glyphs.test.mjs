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
  assert.equal(seen.size, 6 + 3 + 3 + 3 + 2, 'all 17 motions occur')
  for (let i = 0; i < 400; i++) {
    const seed = hash('t' + i)
    if (genPick(seed).fam !== 0) continue
    for (const S of [12, 16, 24]) {
      const rects = []
      const c = { set fillStyle(v) {}, beginPath() {}, fill() {}, clearRect() {}, roundRect(x, y, w, h) { rects.push({ x, y, w, h }) } }
      drawGlyph(c, S, 'gen', 0.7, 'working', seed, '255,255,255', 1)
      assert.ok(rects.length === 25 || rects.length === 9, `a 5x5 or 3x3 grid (seed ${i})`)
      for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= S + 1e-9 && r.y + r.h <= S + 1e-9, `inside the box (seed ${i}, S ${S})`)
    }
  }
})
