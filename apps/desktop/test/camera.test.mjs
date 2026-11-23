import test from 'node:test'
import assert from 'node:assert/strict'
import { DURATION, MOON, VIEW, easeOut, tiltAt, viewAt } from '../src/components/camera.ts'

test('the tilt eases out: fast first, settled at the end, monotonic', () => {
  const xs = [0, 200, 400, 800, 1200, DURATION].map(ms => tiltAt(0, true, ms))
  assert.equal(xs[0], 0)
  assert.equal(xs.at(-1), 1)
  assert.ok(xs.every((x, i) => !i || x > xs[i - 1]))
  assert.ok(xs[2] > 0.5, 'more than half done by 400 ms')
  assert.equal(easeOut(5), 1)
})

test('it eases back from where it is, not from the end', () => {
  assert.equal(tiltAt(0.6, false, 0), 0.6)
  assert.equal(tiltAt(0.6, false, DURATION), 0)
})

test('looking up puts the moon centred above the composer, zoomed in; resting view is untouched', () => {
  const m = viewAt(1, VIEW.x, VIEW.y)
  assert.ok(Math.abs(m.u - MOON.x) < 1e-9 && Math.abs(m.v - MOON.y) < 1e-9)
  assert.ok(VIEW.x === 0.5 && VIEW.y < 0.35, 'above the composer, centred')
  const r = viewAt(0, 0.3, 0.8)
  assert.ok(Math.abs(r.u - 0.3) < 1e-9 && Math.abs(r.v - 0.8) < 1e-9)
  // the resting horizon row (scene v = 0.6) drops lower on screen: the camera reads as looking up
  const rowOf = v => { let lo = 0, hi = 2; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; viewAt(1, 0.5, m).v < v ? (lo = m) : (hi = m) } return lo }
  assert.ok(rowOf(0.6) > 0.64, "resting horizon row 0.6 must drop visibly")
})
