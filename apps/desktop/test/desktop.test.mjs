import test from 'node:test'
import assert from 'node:assert/strict'
import { applyLoginItem, clearDirs, createNotifier, pruneOld } from '../electron/host/desktop.mjs'
import { cleanSettingsPatch } from '../electron/host/validate.mjs'

const rig = (notify, focused = false) => {
  const shown = []
  const n = createNotifier({ getSettings: () => ({ notify }), isFocused: () => focused, show: o => shown.push(o) })
  return { shown, n }
}
const ev = event => ['thread:event', { threadId: 't', event }]

test('notify: done and approval show when unfocused', () => {
  const { shown, n } = rig({})
  n(...ev({ type: 'end', ok: true }))
  n(...ev({ type: 'approval' }))
  assert.equal(shown.length, 2)
  assert.equal(shown[0].silent, true)
})
test('notify: respects switches, sound and focus', () => {
  const a = rig({ done: false, needsInput: false })
  a.n(...ev({ type: 'end', ok: true })); a.n(...ev({ type: 'approval' }))
  assert.equal(a.shown.length, 0)
  const b = rig({ sound: true }, true)
  b.n(...ev({ type: 'end', ok: true }))
  assert.equal(b.shown.length, 0)
  const c = rig({ sound: true })
  c.n(...ev({ type: 'end', ok: true }))
  assert.equal(c.shown[0].silent, false)
  c.n('models:changed', null); c.n(...ev({ type: 'tool' }))
  assert.equal(c.shown.length, 1)
})
test('notify: a user stop is not announced', () => {
  const { shown, n } = rig({})
  n(...ev({ type: 'end', ok: false, error: 'Stopped.' }))
  assert.equal(shown.length, 0)
})

const fakeFs = files => {
  const m = new Map(Object.entries(files))
  return {
    m,
    readdir: async (d, o) => { const p = d.endsWith('/') ? d : d + '/'; const out = new Map(); for (const k of m.keys()) if (k.startsWith(p)) { const r = k.slice(p.length).split('/'); out.set(r[0], r.length > 1) } if (!out.size) throw new Error('ENOENT'); if (!o) return [...out.keys()]; return [...out].map(([name, dir]) => ({ name, isDirectory: () => dir })) },
    stat: async p => ({ mtimeMs: m.get(p) }),
    rm: async p => { for (const k of [...m.keys()]) if (k === p || k.startsWith(p + '/')) m.delete(k) },
  }
}
const DAY = 86_400_000
test('prune: removes only files older than N days, 0 keeps all', async () => {
  const now = 100 * DAY
  const fs = fakeFs({ '/t/old.json': now - 40 * DAY, '/t/new.json': now - 2 * DAY, '/s/h/a.json': now - 99 * DAY })
  assert.equal(await pruneOld(['/t', '/s'], 0, { now, fs }), 0)
  assert.equal(fs.m.size, 3)
  assert.equal(await pruneOld(['/t', '/s', '/missing'], 30, { now, fs }), 2)
  assert.deepEqual([...fs.m.keys()], ['/t/new.json'])
})
test('clear: empties dirs', async () => {
  const fs = fakeFs({ '/t/a.json': 1, '/s/h/b.json': 1 })
  await clearDirs(['/t', '/s'], { fs })
  assert.equal(fs.m.size, 0)
})
test('login item: only a boolean is applied', () => {
  const calls = []
  const app = { setLoginItemSettings: o => calls.push(o) }
  applyLoginItem(app, { openAtLogin: true }); applyLoginItem(app, {}); applyLoginItem(app, { openAtLogin: 'yes' })
  assert.deepEqual(calls, [{ openAtLogin: true }])
})
test('validate: new settings keys', () => {
  const ok = { fontSize: 'large', reduceMotion: true, responseStyle: 'concise', verbosity: 'quiet', transcriptDays: 30, folderAccess: ['/a'], capabilities: { web: true }, notify: { done: false }, openAtLogin: true, profileName: 'A', customInstructions: 'x', useClaudeConfig: false }
  assert.deepEqual(cleanSettingsPatch(ok), ok)
  assert.deepEqual(cleanSettingsPatch({ fontSize: 'huge', transcriptDays: 5, folderAccess: [1], notify: { done: 'y' }, capabilities: {} }), {})
})
