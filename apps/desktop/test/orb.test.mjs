import { test } from 'node:test'
import assert from 'node:assert/strict'
import { orbPalette, TINT_HUE } from '../shared/orb.mjs'

const hue = c => +c.match(/hsl\((\d+)/)[1]
test('orb colours: same project same orb, projects differ, a chosen tint sets the base hue', () => {
  assert.deepEqual(orbPalette('/a/harbor-api'), orbPalette('/a/harbor-api'))
  const hues = new Set(['/a/harbor-api', '/a/notes-app', '/a/ledger-sync', '/a/site', '/a/voice'].map(p => Math.round(hue(orbPalette(p)[0]) / 30)))
  assert.ok(hues.size >= 3, `five projects land on ${hues.size} hue bands`)
  assert.equal(hue(orbPalette('/a/site', { tint: 'sky' })[0]), TINT_HUE.sky)
  assert.equal(orbPalette('/a/site').length, 3)
  assert.notDeepEqual(orbPalette('/a/site'), orbPalette('/a/site', { light: true }), 'light theme gets its own lightness')
})
