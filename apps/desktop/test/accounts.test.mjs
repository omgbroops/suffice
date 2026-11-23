import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { ORDER, createAccounts, parsers, pick } from '../electron/host/accounts.mjs'
import { createHost } from '../electron/host/host.mjs'
import { cleanSettingsPatch } from '../electron/host/validate.mjs'

const tmp = () => mkdtemp(join(tmpdir(), 'suffice-acct-'))
/** A PATH dir holding empty executables for `names`, and an execFile fake answering by binary name. */
async function world(replies) {
  const dir = await tmp()
  const bin = join(dir, 'bin')
  await mkdir(bin)
  for (const n of Object.keys(replies)) {
    await writeFile(join(bin, n), '#!/bin/sh\n')
    await chmod(join(bin, n), 0o755)
  }
  const calls = []
  const execFile = (path, args, opts, cb) => {
    calls.push({ name: basename(path), args, env: opts.env, timeout: opts.timeout })
    const r = replies[basename(path)]
    if (r === 'hang') return cb(Object.assign(new Error('killed'), { killed: true, signal: 'SIGTERM' }), '', '')
    cb(r.code ? Object.assign(new Error('exit'), { code: r.code }) : null, r.out ?? '', r.err ?? '')
  }
  return { dir, calls, execFile, env: { PATH: bin, HOME: dir, USER: 'u', ANTHROPIC_API_KEY: 'sk-secret' }, home: dir }
}
const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(`enc:${s}`), decryptString: b => b.toString().slice(4) }
const make = async (replies, extra = {}) => {
  const w = await world(replies)
  const accounts = createAccounts({ desktopDir: join(w.dir, 'desktop'), env: w.env, home: w.home, execFile: w.execFile, safeStorage, loadEngine: async () => { throw new Error('missing') }, ...extra })
  return { ...w, accounts }
}

test('parsers read each CLI format and never echo secrets', () => {
  assert.deepEqual(parsers.claude('{"loggedIn":true,"subscriptionType":"max","email":"a@b.c"}'), { connected: true, detail: 'Signed in (Max)' })
  assert.equal(parsers.claude('{"loggedIn":false}').connected, false)
  assert.equal(parsers.claude('garbage').connected, false)
  assert.deepEqual(parsers.codex('Logged in using ChatGPT\n'), { connected: true, detail: 'Signed in' })
  assert.equal(parsers.codex('Logged in using an API key - sk-abc***').detail, 'Signed in with an API key')
  assert.equal(parsers.codex('Not logged in').connected, false)
  assert.equal(parsers.cursor('\x1b[32m✓ Logged in as me@x.io\x1b[0m').connected, true)
  assert.equal(parsers.cursor('Not logged in').connected, false)
  assert.equal(parsers.cursor('Logged in as me@x.io').detail, 'Signed in')
  const oc = parsers.opencode('┌  Credentials ~/.local/share/opencode/auth.json\n│\n●  Anthropic oauth\n●  OpenAI api\n│\n└  2 credentials')
  assert.deepEqual(oc, { connected: true, detail: 'Signed in' })
  assert.equal(parsers.opencode('└  0 credentials').connected, false)
})

test('detection: installed, not installed and timed out, all with the stripped env', async () => {
  const w = await make({ claude: { out: '{"loggedIn":true,"subscriptionType":"pro"}' }, codex: 'hang', opencode: { out: 'Not logged in', code: 1 } })
  const rows = await w.accounts.list()
  const by = Object.fromEntries(rows.map(r => [r.id, r]))
  assert.equal(by.claude.connected, true)
  assert.equal(by.claude.runnable, true)
  assert.equal(by.codex.installed, true)
  assert.equal(by.codex.connected, false)
  assert.equal(by.codex.detail, 'Timed out')
  assert.equal(by.cursor.installed, false)
  assert.equal(by.cursor.detail, 'Not installed')
  assert.equal(by.opencode.installed, true)
  assert.equal(by.opencode.connected, false)
  for (const r of rows) for (const f of ['id', 'name', 'kind', 'installed', 'connected', 'detail', 'howTo']) assert.ok(f in r)
  assert.ok(w.calls.every(c => c.timeout === 10_000 && c.env.ANTHROPIC_API_KEY === undefined && c.env.USER === 'u'))
  assert.deepEqual(w.calls.find(c => c.name === 'opencode').args, ['auth', 'list'])
  assert.deepEqual(w.calls.find(c => c.name === 'codex').args, ['login', 'status'])
})

test('a CLI is runnable only when its engine file loads', async () => {
  const w = await make({ codex: { out: 'Logged in using ChatGPT' } })
  assert.equal((await w.accounts.list()).find(r => r.id === 'codex').runnable, false)
  const w2 = await make({ codex: { out: 'Logged in using ChatGPT' } }, { loadEngine: async () => ({}) })
  assert.equal((await w2.accounts.list()).find(r => r.id === 'codex').runnable, true)
})

test('pick follows the fixed order', () => {
  const row = (id, connected) => ({ id, connected })
  const ids = ORDER.map(id => row(id, true))
  assert.equal(pick(ids).id, 'claude')
  assert.equal(pick(ids.filter(r => r.id !== 'claude')).id, 'codex')
  assert.equal(pick([row('key:google', true), row('key:openai', true), row('opencode', true)]).id, 'opencode')
  assert.equal(pick([row('key:google', true), row('key:openai', true)]).id, 'key:openai')
  assert.equal(pick([row('claude', false)]), null)
})

test('key storage round-trips encrypted, mode 0600, and only last4 reaches callers', async () => {
  const w = await make({})
  const out = await w.accounts.setKey('openai', 'sk-test-1234567890abcd')
  assert.deepEqual(out, { last4: 'abcd' })
  const file = join(w.dir, 'desktop', 'keys.json')
  assert.equal((await stat(file)).mode & 0o777, 0o600)
  assert.ok(!(await readFile(file, 'utf8')).includes('sk-test'))
  const rows = await w.accounts.list()
  assert.ok(!JSON.stringify(rows).includes('sk-test'))
  const row = rows.find(r => r.id === 'key:openai')
  assert.equal(row.connected, true)
  assert.equal(row.detail, 'Saved, ends in ...abcd')
  await w.accounts.removeKey('openai')
  assert.equal((await w.accounts.list()).find(r => r.id === 'key:openai').connected, false)
  await assert.rejects(w.accounts.setKey('nope', 'sk-test-1234567890abcd'), /Unknown provider/)
  await assert.rejects(w.accounts.setKey('openai', 'short'), /API key/)
  const none = createAccounts({ desktopDir: join(w.dir, 'd2'), env: w.env, home: w.home, execFile: w.execFile, safeStorage: { ...safeStorage, isEncryptionAvailable: () => false } })
  await assert.rejects(none.setKey('openai', 'sk-test-1234567890abcd'), /Secure storage/)
})

test('testKey makes one request with the right header and never returns the key', async () => {
  const seen = []
  const fetch = async (url, init) => (seen.push({ url, headers: init.headers }), { ok: seen.length === 1, status: 401 })
  const w = await make({}, { fetch })
  await assert.rejects(w.accounts.testKey('anthropic'), /No key/)
  await w.accounts.setKey('anthropic', 'sk-ant-1234567890wxyz')
  const r = await w.accounts.testKey('anthropic')
  assert.deepEqual(r, { ok: true, message: 'Key works' })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].url, 'https://api.anthropic.com/v1/models')
  assert.equal(seen[0].headers['x-api-key'], 'sk-ant-1234567890wxyz')
  const bad = await w.accounts.testKey('anthropic')
  assert.deepEqual(bad, { ok: false, message: 'Key was rejected' })
  assert.ok(!JSON.stringify([r, bad]).includes('sk-ant'))
})

const openaiHome = async (accounts, extra = {}) => {
  const home = await tmp()
  const host = await createHost({ home, accounts, emit: () => {}, openExternal: () => {}, chooseDirectory: async () => home, claudePath: null, ...extra })
  return { home, host }
}
const fakeAccounts = rows => ({ list: async () => rows, pick, label: id => id, setKey: async () => ({ last4: 'abcd' }) })

test('autodetect picks the first connected account once and marks it automatic', async () => {
  const rows = ORDER.map(id => ({ id, connected: id === 'codex' || id === 'key:openai' }))
  const { host, home } = await openaiHome(fakeAccounts(rows))
  const info = await host.init()
  assert.equal(info.settings.engineAuto, true)
  assert.equal(info.settings.defaultProvider, 'codex')
  assert.equal(info.signedIn, true)
  const saved = JSON.parse(await readFile(join(home, 'desktop', 'settings.json'), 'utf8'))
  assert.equal(saved.engineAuto, true)
})

test('autodetect gives Claude Code Opus 5.5 at high effort', async () => {
  const rows = ORDER.map(id => ({ id, connected: true }))
  const { host } = await openaiHome(fakeAccounts(rows))
  const { settings } = await host.init()
  assert.equal(settings.engine, 'claude')
  assert.equal(settings.model, 'claude-opus-5-5')
  assert.equal(settings.efforts['claude-opus-5-5'], 'high')
})

test('nothing connected leaves settings alone and not signed in', async () => {
  const { host } = await openaiHome(fakeAccounts(ORDER.map(id => ({ id, connected: false }))))
  const info = await host.init()
  assert.equal(info.signedIn, false)
  assert.equal(info.settings.engineAuto, undefined)
})

test('a manual engine choice is never overwritten by autodetect', async () => {
  const rows = ORDER.map(id => ({ id, connected: true }))
  const a = await tmp()
  await mkdir(join(a, 'desktop'), { recursive: true })
  await writeFile(join(a, 'desktop', 'settings.json'), JSON.stringify({ engine: 'openai', model: 'gpt-4o' }))
  const host = await createHost({ home: a, accounts: fakeAccounts(rows), engine: undefined, runtime: { isUsingSubscription: () => true, hasConfiguredAuth: () => true, getModels: () => [], getModel: () => null, logout: async () => {} }, emit: () => {}, openExternal: () => {}, chooseDirectory: async () => a })
  const { settings } = await host.init()
  assert.equal(settings.engine, 'openai')
  assert.equal(settings.model, 'gpt-4o')
  assert.equal(settings.engineAuto, undefined)
  // and choosing in the app after an automatic pick turns the automatic flag off
  const { host: h2 } = await openaiHome(fakeAccounts(rows))
  await h2.init()
  assert.equal((await h2.updateSettings({ engine: 'claude' })).engineAuto, false)
})

test('the effective model always belongs to the active engine', async () => {
  const { host } = await openaiHome(fakeAccounts([]))
  const { settings } = await host.init()
  assert.equal(settings.engine, 'claude')
  assert.equal(settings.model, 'claude-opus-5-5')
  assert.ok(host.models().some(m => m.id === settings.model))
  assert.equal((await host.updateSettings({ model: 'gpt-6.1-sol' })).model, 'claude-opus-5-5')
  assert.equal((await host.updateSettings({ model: 'claude-haiku-5-5' })).model, 'claude-haiku-5-5')
})

test('IPC validation for the account channels', async () => {
  const seen = []
  const accounts = { ...fakeAccounts([]), setKey: async (p, k) => (seen.push([p, k]), { last4: k.slice(-4) }), testKey: async () => ({ ok: true }), removeKey: async () => ({}) }
  const { host } = await openaiHome(accounts)
  assert.deepEqual(await host.setKey({ provider: 'openai', key: 'sk-12345678abcd' }), { last4: 'abcd' })
  for (const bad of [{}, { provider: 'openai' }, { provider: 5, key: 'x' }, { provider: 'openai', key: 'a'.repeat(501) }, { provider: 'openai', key: 'a\0b' }, null]) await assert.rejects(async () => host.setKey(bad), /Invalid|Cannot/)
  await assert.rejects(async () => host.testKey({}), /Invalid/)
  await assert.rejects(async () => host.removeKey({ provider: '' }), /Invalid/)
  assert.equal(seen.length, 1)
  const off = await openaiHome(null)
  await assert.rejects(async () => off.host.setKey({ provider: 'openai', key: 'sk-12345678abcd' }), /not available/)
})

test('settings patches may set engineAuto but only as a boolean', () => {
  assert.deepEqual(cleanSettingsPatch({ engineAuto: false }), { engineAuto: false })
  assert.deepEqual(cleanSettingsPatch({ engineAuto: 'yes' }), {})
})

test('init and list output never contain a saved key', async () => {
  const w = await make({ claude: { out: '{"loggedIn":true}' } })
  await w.accounts.setKey('openrouter', 'sk-or-SECRETSECRET9999')
  const { host } = await openaiHome(w.accounts)
  const info = await host.init()
  const all = JSON.stringify([info, await host.accountsList()])
  assert.ok(!all.includes('SECRETSECRET'))
  assert.ok(all.includes('...9999'))
})
