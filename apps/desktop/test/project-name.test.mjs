import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanName, suggestName } from '../electron/host/project-name.mjs'

test('project names: the reply is cleaned to one short line; junk gives null', () => {
  assert.equal(cleanName('"Harbor API"\n'), 'Harbor API')
  assert.equal(cleanName('Name: Ledger Sync.'), 'Ledger Sync')
  assert.equal(cleanName('\n  **Notes App**  '), 'Notes App')
  assert.equal(cleanName(''), null)
  assert.equal(cleanName('This project is a very long description of a thing'), null)
})

test('project names: the model sees the README and package, and a failed call gives null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pn-'))
  try {
    await writeFile(join(dir, 'README.md'), '# Tidewater\nA ferry booking API.')
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'tidewater-api', description: 'ferry bookings' }))
    let seen = ''
    assert.equal(await suggestName(dir, async (_s, text) => ((seen = text), 'Tidewater')), 'Tidewater')
    assert.match(seen, /# Tidewater/)
    assert.match(seen, /tidewater-api — ferry bookings/)
    assert.equal(await suggestName(dir, async () => { throw new Error('offline') }), null)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
