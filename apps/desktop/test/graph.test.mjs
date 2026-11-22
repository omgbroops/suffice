import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSim, nodeSize, nodeScale, textAlpha, tick } from '../shared/graph.mjs'

test("graph rules match Obsidian's: node size, node scale, label fade", () => {
  assert.equal(nodeSize(0), 8)
  assert.equal(nodeSize(15), 12)
  assert.equal(nodeSize(10_000), 30)
  assert.equal(nodeScale(4), 0.5)
  assert.equal(textAlpha(1), 1)
  assert.equal(textAlpha(0.5), 0)
  assert.ok(Math.abs(textAlpha(Math.SQRT1_2) - 0.5) < 1e-9)
})

test('the layout settles: linked notes near the link distance, unlinked ones pushed apart, nothing NaN', () => {
  const ids = ['hub', 'a', 'b', 'c', 'lone']
  const sim = createSim(ids, [['hub', 'a'], ['hub', 'b'], ['hub', 'c'], ['a', 'missing']])
  assert.equal(sim.links.length, 3, 'links to unknown notes are dropped')
  for (let i = 0; i < 400; i++) tick(sim)
  const p = id => sim.nodes.get(id)
  for (const n of sim.nodes.values()) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y))
  for (const id of ['a', 'b', 'c']) {
    const d = Math.hypot(p(id).x - p('hub').x, p(id).y - p('hub').y)
    assert.ok(d > 150 && d < 450, `hub-${id} ${d.toFixed(0)}`)
  }
  assert.ok(Math.hypot(p('a').x - p('b').x, p('a').y - p('b').y) > 100, 'siblings spread out')
  assert.ok(sim.alpha < 0.002, 'cools down')
  // a pinned node stays where it was dropped
  p('a').fx = 40; p('a').fy = -40; sim.alpha = 0.3
  tick(sim)
  assert.deepEqual([p('a').x, p('a').y], [40, -40])
  // a rebuilt sim keeps placed nodes
  const next = createSim([...ids, 'new'], [], sim)
  assert.equal(next.nodes.get('hub').x, p('hub').x)
})

test("Obsidian's collide force keeps notes apart even when a link wants them close", () => {
  const sim = createSim(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['a', 'c']])
  for (let i = 0; i < 400; i++) tick(sim, { center: 0.1, repel: 0, link: 1, distance: 30 })
  const [a, b] = [sim.nodes.get('a'), sim.nodes.get('b')]
  const d = Math.hypot(a.x - b.x, a.y - b.y)
  assert.ok(d > 90, `a-b ${d.toFixed(0)}: collide radius 60 should hold them near 120`)
})
