// Ports of t3code server/desktop tests (state files, key store, logs, ledger). Each name carries the rival file:line.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccounts } from '../electron/host/accounts.mjs'
import { createHost } from '../electron/host/host.mjs'
import { createThreadMeta } from '../electron/host/thread-meta.mjs'
import { createErrorLog } from '../electron/host/errorlog.mjs'
import { createUsageLedger, USAGE_LIMIT } from '../electron/host/usage.mjs'

const tmp = async t => {
  const d = await mkdtemp(join(tmpdir(), 't3port-'))
  t.after(() => rm(d, { recursive: true, force: true }))
  return d
}
const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(`enc:${s}`), decryptString: b => b.toString().slice(4) }
const KEY = 'sk-test-1234567890abcd'
const accts = async (t, extra = {}) => {
  const dir = await tmp(t)
  const desktopDir = join(dir, 'desktop')
  await mkdir(desktopDir, { recursive: true })
  return { dir, desktopDir, file: join(desktopDir, 'keys.json'), a: createAccounts({ desktopDir, env: { PATH: '' }, home: dir, safeStorage, ...extra }) }
}
const names = async d => (await readdir(d)).sort()
const host = async (t, home, extra = {}) => {
  const h = await createHost({ engine: 'claude', claudePath: '/nonexistent', home, openExternal: () => {}, chooseDirectory: async () => home, emit: () => {}, ...extra })
  t.after(() => h.dispose())
  return h
}

// ---- key store (DesktopConnectionCatalogStore / browser-secret-native) ----
test('t3 DesktopConnectionCatalogStore.test.ts:245: a malformed key file is kept, not replaced by the next save', async t => {
  const { a, file, desktopDir } = await accts(t)
  await writeFile(file, '{ not json')
  await a.setKey('openai', KEY).catch(() => {})
  const bytes = await Promise.all((await names(desktopDir)).map(n => readFile(join(desktopDir, n), 'utf8').catch(() => '')))
  assert.ok(bytes.includes('{ not json'), 'original malformed bytes survive somewhere')
})

test('t3 DesktopConnectionCatalogStore.test.ts:245: removeKey over a malformed key file does not destroy it', async t => {
  const { a, file, desktopDir } = await accts(t)
  await writeFile(file, '{ not json')
  await a.removeKey('openai').catch(() => {})
  const bytes = await Promise.all((await names(desktopDir)).map(n => readFile(join(desktopDir, n), 'utf8').catch(() => '')))
  assert.ok(bytes.includes('{ not json'))
})

test('t3 DesktopConnectionCatalogStore.test.ts:245: a key file holding a JSON array or null still saves and lists the key', async t => {
  for (const body of ['[]', 'null', '"x"', '7']) {
    const { a, file } = await accts(t)
    await writeFile(file, body)
    await a.setKey('openai', KEY).catch(() => {})
    const row = (await a.list()).find(r => r.id === 'key:openai')
    assert.equal(row.connected, true, `body ${body}: saved key must be listed`)
  }
})

test('t3 DesktopConnectionCatalogStore.test.ts:117: saving with secure storage unavailable writes nothing', async t => {
  const { a, file, desktopDir } = await accts(t, { safeStorage: { ...safeStorage, isEncryptionAvailable: () => false } })
  await assert.rejects(a.setKey('openai', KEY), /Secure storage/)
  assert.deepEqual(await names(desktopDir), [])
  assert.equal(await stat(file).catch(() => null), null)
})

test('t3 DesktopConnectionCatalogStore.test.ts:318: a key that cannot be decrypted is reported and the file is untouched', async t => {
  const { a, file } = await accts(t)
  await a.setKey('openai', KEY)
  const before = await readFile(file, 'utf8')
  const broken = createAccounts({ desktopDir: join(file, '..'), env: { PATH: '' }, safeStorage: { ...safeStorage, decryptString: () => { throw new Error('keychain locked') } }, fetch: async () => assert.fail('must not call the network') })
  await assert.rejects(broken.testKey('openai'), /cannot be read/)
  assert.equal(await readFile(file, 'utf8'), before)
})

test('t3 DesktopConnectionCatalogStore.test.ts:341: decrypt failure on one key does not hide the other saved keys from list()', async t => {
  const { a, desktopDir } = await accts(t)
  await a.setKey('openai', KEY)
  await a.setKey('google', 'AIza-test-key-0000')
  const broken = createAccounts({ desktopDir, env: { PATH: '' }, home: desktopDir, safeStorage: { ...safeStorage, decryptString: () => { throw new Error('x') } } })
  const rows = await broken.list()
  assert.deepEqual(rows.filter(r => r.kind === 'key' && r.connected).map(r => r.id).sort(), ['key:google', 'key:openai'])
})

test('t3 browser-secret-native.test.ts:74: the exact secret bytes reach the provider header, trimmed, never the reply', async t => {
  let seen
  const { a } = await accts(t, { fetch: async (url, o) => ((seen = { url, headers: o.headers }), { ok: true, status: 200 }) })
  await a.setKey('openai', `  ${KEY}\n`)
  const out = await a.testKey('openai')
  assert.equal(seen.headers.authorization, `Bearer ${KEY}`)
  assert.deepEqual(out, { ok: true, message: 'Key works' })
  assert.ok(!JSON.stringify(out).includes(KEY))
})

test('t3 browser-secret-native.test.ts:94: non-string, empty and whitespace-containing secrets are rejected and nothing is written', async t => {
  const { a, desktopDir } = await accts(t)
  for (const bad of [undefined, null, 12345678, {}, [], '', '        ', 'sk test 12345678', 'x'.repeat(501)]) {
    await assert.rejects(a.setKey('openai', bad), /API key/, String(bad))
  }
  for (const id of [undefined, '', '__proto__', 'constructor', 'key:openai']) await assert.rejects(a.setKey(id, KEY), /Unknown provider/, String(id))
  assert.deepEqual(await names(desktopDir), [])
})

test('t3 DesktopConnectionCatalogStore.test.ts:117: a save leaves no temp file and the key file is 0600', async t => {
  const { a, desktopDir, file } = await accts(t)
  await a.setKey('openai', KEY)
  await a.removeKey('google')
  assert.deepEqual(await names(desktopDir), ['keys.json'])
  assert.equal((await stat(file)).mode & 0o777, 0o600)
})

test('t3 serverSettings.test.ts:346: a symlinked key file is never written through', async t => {
  const { a, file, dir } = await accts(t)
  const victim = join(dir, 'victim.txt')
  await writeFile(victim, 'precious')
  await symlink(victim, file)
  await a.setKey('openai', KEY).catch(() => {})
  assert.equal(await readFile(victim, 'utf8'), 'precious')
})

test('t3 PairingGrantStore.test.ts:90: parallel saves of different keys all land (no lost update)', async t => {
  const { a } = await accts(t)
  await Promise.all([a.setKey('openai', KEY), a.setKey('google', 'AIza-test-key-0000'), a.setKey('anthropic', 'sk-ant-test-0000000'), a.setKey('openrouter', 'sk-or-test-0000000')])
  assert.equal((await a.list()).filter(r => r.kind === 'key' && r.connected).length, 4)
})

// ---- settings file (serverSettings.test.ts) ----
test('t3 serverSettings.test.ts:346: a symlinked settings file is never written through', async t => {
  const home = await tmp(t)
  await mkdir(join(home, 'desktop'), { recursive: true })
  const victim = join(home, 'victim.json')
  await writeFile(victim, '{"approval":"never"}')
  await symlink(victim, join(home, 'desktop', 'settings.json'))
  const h = await host(t, home)
  await h.updateSettings({ approval: 'every' })
  assert.equal(await readFile(victim, 'utf8'), '{"approval":"never"}')
})

test('t3 serverSettings.test.ts:410: settings persist across a restart and the file is 0600 with no temp left', async t => {
  const home = await tmp(t)
  const h = await host(t, home)
  await h.updateSettings({ approval: 'every' })
  await h.dispose()
  const h2 = await host(t, home)
  assert.equal((await h2.getSettings?.() ?? await h2.updateSettings({})).approval, 'every')
  const files = await names(join(home, 'desktop'))
  assert.ok(!files.some(f => f.endsWith('.tmp')), files.join())
  assert.equal((await stat(join(home, 'desktop', 'settings.json'))).mode & 0o777, 0o600)
})

test('t3 serverSettings.test.ts:495: a failed settings write rejects, and the next save still works', async t => {
  const home = await tmp(t)
  const h = await host(t, home)
  const p = join(home, 'desktop', 'settings.json')
  await mkdir(join(p, 'blocker'), { recursive: true }) // a non-empty directory where the file goes: rename must fail
  await assert.rejects(h.updateSettings({ approval: 'every' }))
  await rm(p, { recursive: true })
  await h.updateSettings({ approval: 'never' })
  assert.equal(JSON.parse(await readFile(p, 'utf8')).approval, 'never')
})

test('t3 serverSettings.test.ts:453: a settings file holding null, an array or a string starts with defaults and the next save writes an object', async t => {
  for (const body of ['null', '[1,2]', '"text"']) {
    const home = await tmp(t)
    await mkdir(join(home, 'desktop'), { recursive: true })
    await writeFile(join(home, 'desktop', 'settings.json'), body)
    const h = await host(t, home)
    await h.updateSettings({ approval: 'every' })
    assert.equal(JSON.parse(await readFile(join(home, 'desktop', 'settings.json'), 'utf8')).approval, 'every', body)
  }
})

test('t3 serverSettings.test.ts:667: updateSettings deep-merges nothing it should not: unknown keys and a wrong-typed approval are dropped', async t => {
  const home = await tmp(t)
  const h = await host(t, home)
  const s = await h.updateSettings({ approval: 'every', evil: 'x', __proto__: { polluted: 1 } })
  assert.equal(s.evil, undefined)
  assert.equal({}.polluted, undefined)
  const bad = await h.updateSettings({ approval: { nested: true } })
  assert.equal(bad.approval, 'every')
})

// ---- thread store (serverRuntimeState / state files) ----
test('t3 serverRuntimeState.test.ts:174: thread metadata persists across a restart', async t => {
  const dir = await tmp(t)
  const f = join(dir, 'desktop', 'threads.json')
  await createThreadMeta(f).set('/p/a', { pinned: true, title: 'Mine' })
  const again = createThreadMeta(f)
  assert.deepEqual(await again.get('/p/a'), { pinned: true, title: 'Mine' })
})

test('t3 DesktopConnectionCatalogStore.test.ts:245: a malformed threads.json is kept aside, not overwritten by the next write', async t => {
  const dir = await tmp(t)
  const f = join(dir, 'threads.json')
  await writeFile(f, '{ broken')
  await createThreadMeta(f).set('/p/a', { pinned: true })
  const all = await Promise.all((await names(dir)).map(n => readFile(join(dir, n), 'utf8')))
  assert.ok(all.includes('{ broken'), 'malformed bytes still on disk')
})

test('t3 serverRuntimeState.test.ts:155: a failed write does not leave the failed change visible to readers', async t => {
  const dir = await tmp(t)
  const f = join(dir, 'threads.json')
  const m = createThreadMeta(f)
  await m.set('/p/a', { pinned: true })
  await mkdir(`${f}.tmp`) // the temp path is a directory: the write fails
  await assert.rejects(m.set('/p/b', { pinned: true }))
  assert.deepEqual(await m.get('/p/b'), {}, 'memory must match disk after a failed save')
  await rm(`${f}.tmp`, { recursive: true })
  await m.set('/p/c', { unread: true })
  const disk = JSON.parse(await readFile(f, 'utf8'))
  assert.equal(disk['/p/b'], undefined)
  assert.ok(disk['/p/a'] && disk['/p/c'])
})

test('t3 serverRuntimeState.test.ts:155: racing writes to one thread from two stores on the same file keep both threads', async t => {
  const dir = await tmp(t)
  const f = join(dir, 'threads.json')
  await Promise.all([createThreadMeta(f).set('/p/a', { pinned: true }), createThreadMeta(f).set('/p/b', { pinned: true })])
  const disk = JSON.parse(await readFile(f, 'utf8'))
  assert.ok(disk['/p/a'] && disk['/p/b'], `both survive: ${JSON.stringify(disk)}`)
})

test('t3 serverSettings.test.ts:453: a threads.json holding an array reads as empty and is replaced by an object on write', async t => {
  const dir = await tmp(t)
  const f = join(dir, 'threads.json')
  await writeFile(f, '[1,2]')
  const m = createThreadMeta(f)
  assert.deepEqual(await m.get('/p/a'), {})
  await m.set('/p/a', { pinned: true })
  assert.deepEqual(JSON.parse(await readFile(f, 'utf8')), { '/p/a': { pinned: true } })
})

// ---- logs / ledger (stdioErrors, DesktopStartupRecovery) ----
test('t3 stdioErrors.test.ts:10: logging into an unwritable location is swallowed, never thrown', async t => {
  const dir = await tmp(t)
  await writeFile(join(dir, 'desktop'), 'a file where the log dir should be')
  const log = createErrorLog(dir)
  await log.write('x', new Error('boom')) // must resolve
  await log.write('x', 'second still fine')
})

test('t3 stdioErrors.test.ts:19: unserialisable and exotic error values are logged without throwing', async t => {
  const dir = await tmp(t)
  const log = createErrorLog(dir)
  const cyc = {}
  cyc.self = cyc
  for (const v of [cyc, undefined, null, 12, Symbol.for('s'), 10n]) await log.write('src', v)
  const text = await readFile(log.file, 'utf8')
  assert.equal(text.trim().split('\n').length, 6)
})

test('t3 DesktopStartupRecovery.test.ts:64: a ledger write failure is reported once through onError and later runs still record', async t => {
  const dir = await tmp(t)
  const errors = []
  const desktopDir = join(dir, 'd')
  await writeFile(desktopDir, 'blocker') // a file where the dir should be
  const l = createUsageLedger({ desktopDir, priceOf: () => null, onError: e => errors.push(e) })
  await l.record({ threadId: 't', project: '/p', engine: 'claude', model: 'm', effort: 'low', totals: { inputTokens: 1 } })
  assert.equal(errors.length, 1)
  await rm(desktopDir)
  await l.record({ threadId: 't', project: '/p', engine: 'claude', model: 'm', effort: 'low', totals: { inputTokens: 2 } })
  assert.equal((await l.summary({ days: 1 })).total.runs, 1)
})

test('t3 DesktopStartupRecovery.test.ts:42: 40 concurrent records produce 40 whole lines and survive a restart', async t => {
  const dir = await tmp(t)
  const mk = () => createUsageLedger({ desktopDir: dir, priceOf: () => null })
  const l = mk()
  await Promise.all(Array.from({ length: 40 }, (_, i) => l.record({ threadId: `t${i}`, project: '/p', engine: 'claude', model: 'm', effort: 'low', totals: { inputTokens: 1 } })))
  const lines = (await readFile(l.path, 'utf8')).trim().split('\n')
  assert.equal(lines.length, 40)
  lines.forEach(x => JSON.parse(x))
  assert.equal((await mk().summary({ days: 1 })).total.runs, 40)
})

test('t3 DesktopStartupRecovery.test.ts:97: a truncated last ledger line is skipped and the rest still count', async t => {
  const dir = await tmp(t)
  const l = createUsageLedger({ desktopDir: dir, priceOf: () => null })
  await l.record({ threadId: 't', project: '/p', engine: 'claude', model: 'm', effort: 'low', totals: { inputTokens: 5 } })
  await writeFile(l.path, (await readFile(l.path, 'utf8')) + '{"ts":1,"inputTok')
  const s = await l.summary({ days: 1 })
  assert.equal(s.total.runs, 1)
  assert.equal(s.total.inputTokens, 5)
})

test('t3 DesktopStartupRecovery.test.ts:97: a ledger at the size limit rotates once and both files still count', async t => {
  const dir = await tmp(t)
  const l = createUsageLedger({ desktopDir: dir, priceOf: () => null })
  await l.record({ threadId: 'a', project: '/p', engine: 'claude', model: 'm', effort: 'low', totals: { inputTokens: 1 } })
  await writeFile(l.path, (await readFile(l.path, 'utf8')) + ' '.repeat(USAGE_LIMIT))
  await l.record({ threadId: 'b', project: '/p', engine: 'claude', model: 'm', effort: 'low', totals: { inputTokens: 1 } })
  assert.deepEqual((await names(dir)).filter(n => n.startsWith('usage')), ['usage.jsonl', 'usage.jsonl.1'])
  assert.equal((await l.summary({ days: 1 })).total.runs, 2)
})
