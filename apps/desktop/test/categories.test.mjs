import test from 'node:test'
import assert from 'node:assert/strict'
import { cluster, categorize, cleanLabel } from '../electron/host/categories.mjs'

const T = (path, title, description = '') => ({ path, title, description })
const four = [T('1', 'Login form validation', 'Email checks'), T('2', 'Login form styling', 'Email field'), T('3', 'Release notes draft', 'Changelog'), T('4', 'Release notes tweaks', 'Changelog copy')]

test('cluster groups close threads, none under 4 threads', () => {
  assert.deepEqual(cluster(four).map(g => g.sort()), [['1', '2'], ['3', '4']])
  assert.deepEqual(cluster(four.slice(0, 3)), [])
})
test('cleanLabel keeps 1-3 words', () => {
  assert.equal(cleanLabel('"Login form."'), 'Login form')
  assert.equal(cleanLabel('far too many words here'), null)
})
test('categorize asks per cluster, recomputes once per new thread', async () => {
  let asks = 0
  const ask = async () => (asks++, 'Some label')
  const s1 = await categorize(four, null, ask)
  assert.equal(asks, 2)
  assert.equal(s1.labels['1'], 'Some label')
  assert.equal(await categorize(four, s1, ask), s1)
  assert.equal(asks, 2)
  const s2 = await categorize([...four, T('5', 'Login form errors', 'Email')], s1, ask)
  assert.equal(s2.n, 5)
  assert.ok(asks > 2)
})
