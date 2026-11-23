import test from 'node:test'
import assert from 'node:assert/strict'
import { migrate, sync, addFolder, extraFolders } from '../electron/host/projects-store.mjs'

test('migrate: one project per folder, auto name else folder name', () => {
  const p = migrate(['/x/downloads', '/x/app'], { '/x/app': 'Billing app' })
  assert.deepEqual(p.map(q => [q.name, q.folders]), [['downloads', ['/x/downloads']], ['Billing app', ['/x/app']]])
})
test('sync adds only uncovered folders', () => {
  const saved = [{ id: '1', name: 'A', folders: ['/a', '/b'] }]
  const s = sync(saved, ['/a', '/b', '/c'])
  assert.equal(s.length, 2)
  assert.deepEqual(s[1].folders, ['/c'])
})
test('addFolder appends once; extraFolders excludes the first', () => {
  let p = [{ id: '1', name: 'A', folders: ['/a'] }]
  p = addFolder(addFolder(p, '1', '/b'), '1', '/b')
  assert.deepEqual(p[0].folders, ['/a', '/b'])
  assert.deepEqual(extraFolders(p, '/a'), ['/b'])
  assert.deepEqual(extraFolders(p, '/zzz'), [])
})
