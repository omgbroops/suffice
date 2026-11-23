import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInstaller } from '../electron/install.mjs'

function setup({ inApps = false, packaged = true, platform = 'darwin', answer = 0, execPath = '/Volumes/Suffice/Suffice.app/Contents/MacOS/Suffice' } = {}) {
  const calls = { dialog: 0, move: 0, exec: [], sync: [] }
  let handler
  const files = new Map()
  const app = {
    isPackaged: packaged, isInApplicationsFolder: () => inApps, getPath: () => '/ud',
    moveToApplicationsFolder: o => { calls.move++; handler = o.conflictHandler; return true },
  }
  const dialog = { showMessageBox: async () => (calls.dialog++, { response: answer }), showMessageBoxSync: o => void calls.sync.push(o.message) }
  const fs = { writeFile: async (p, v) => void files.set(p, v), readFile: async p => { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p) }, rm: async p => void files.delete(p) }
  const exec = async (...a) => void calls.exec.push(a)
  return { calls, files, installer: createInstaller({ app, dialog, exec, platform, execPath, fs }), handler: t => handler(t) }
}

test('already in Applications: nothing asked, nothing moved', async () => {
  const t = setup({ inApps: true })
  assert.equal(await t.installer.offerMove(), false)
  assert.deepEqual([t.calls.dialog, t.calls.move], [0, 0])
})

test('from a disk image: asks, moves, then the relaunched copy ejects the volume', async () => {
  const t = setup()
  assert.equal(await t.installer.offerMove(), true)
  assert.deepEqual([t.calls.dialog, t.calls.move], [1, 1])
  assert.equal(t.handler('exists'), true)
  assert.equal(t.handler('existsAndRunning'), false)
  assert.equal(t.calls.sync.length, 1)
  const next = setup({ inApps: true }); next.files.set('/ud/eject-volume', t.files.get('/ud/eject-volume'))
  await next.installer.ejectSource()
  assert.deepEqual(next.calls.exec, [['hdiutil', ['detach', '/Volumes/Suffice']]])
  assert.equal(next.files.size, 0)
})

test('Not now: no move and not asked again this launch', async () => {
  const t = setup({ answer: 1 })
  assert.equal(await t.installer.offerMove(), false)
  assert.equal(await t.installer.offerMove(), false)
  assert.deepEqual([t.calls.dialog, t.calls.move, t.files.size], [1, 0, 0])
})

test('unpackaged or non-mac: nothing happens', async () => {
  for (const o of [{ packaged: false }, { platform: 'win32' }]) {
    const t = setup(o)
    assert.equal(await t.installer.offerMove(), false)
    await t.installer.ejectSource()
    assert.deepEqual([t.calls.dialog, t.calls.move, t.calls.exec.length], [0, 0, 0])
  }
})
