import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTree, neighbourhood, DEFAULT_NOTES_PROMPT } from '../shared/notes.mjs'

test('buildTree nests folders by path, folders before notes, sorted', () => {
  const t = buildTree(['b.md', 'notes/Zed.md', 'notes/adr/0001.md', 'notes/Alpha.md', 'a.md'])
  assert.deepEqual(t.notes, ['a.md', 'b.md'])
  assert.deepEqual(t.folders.map(f => f.path), ['notes'])
  const n = t.folders[0]
  assert.deepEqual(n.notes, ['notes/Alpha.md', 'notes/Zed.md'])
  assert.deepEqual(n.folders.map(f => [f.name, f.path, f.notes]), [['adr', 'notes/adr', ['notes/adr/0001.md']]])
})

const mk = (path, links = []) => ({ path, title: path, links })
test('neighbourhood: depth 2, backlinks count, hubs not expanded, caps hold', () => {
  const notes = [mk('a', ['b', 'c']), mk('b', ['d']), mk('c'), mk('d', ['e']), mk('e'), mk('x', ['a'])]
  const { nodes, edges } = neighbourhood(notes, 'a')
  const ring = Object.fromEntries(nodes.map(n => [n.path, n.ring]))
  assert.deepEqual(ring, { a: 0, b: 1, c: 1, x: 1, d: 2 })
  assert.ok(!('e' in ring))
  assert.equal(edges.length, 4)
  // a hub with 13 links is shown but its links are not
  const hub = mk('h', Array.from({ length: 13 }, (_, i) => `n${i}`))
  const r = neighbourhood([mk('a', ['h']), hub, ...hub.links.map(l => mk(l))], 'a', { ring2: 50 })
  assert.equal(r.nodes.length, 2)
  assert.equal(neighbourhood(notes, 'nope').nodes.length, 0)
  const big = [mk('c0', Array.from({ length: 30 }, (_, i) => `p${i}`)), ...Array.from({ length: 30 }, (_, i) => mk(`p${i}`, [`q${i}`]))]
  const rb = neighbourhood(big, 'c0')
  assert.equal(rb.nodes.filter(n => n.ring === 1).length, 14)
  assert.ok(rb.nodes.filter(n => n.ring === 2).length <= 18)
})

test('default prompt covers the required instructions', () => {
  for (const s of ['notes/', 'wikilinks', 'Index', 'Runbook', 'decision', 'Do not invent', 'file path', 'short', 'Update an existing note']) assert.ok(DEFAULT_NOTES_PROMPT.toLowerCase().includes(s.toLowerCase()), s)
})
