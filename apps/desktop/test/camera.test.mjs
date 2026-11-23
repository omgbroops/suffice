import test from 'node:test'
import assert from 'node:assert/strict'
import { DURATION, MOON, easeOut, offsetAt, tiltAt } from '../src/components/camera.ts'

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

test('fully tilted puts the moon at the screen centre', () => {
  const aspect = 1.6, o = offsetAt(1, aspect)
  assert.ok(Math.abs(MOON.x * aspect - o.x - 0.5 * aspect) < 1e-9)
  assert.ok(Math.abs(MOON.y - o.y - 0.5) < 1e-9)
  assert.ok(offsetAt(0, aspect).x === 0 && offsetAt(0, aspect).y === 0)
})
