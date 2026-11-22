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
