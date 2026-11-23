// Connected accounts: which coding agents / API keys this Mac can use. Detection only RUNS each CLI's own
// status command; credential files are never read or copied. API keys live encrypted (safeStorage) in keys.json.
import { execFile as nodeExecFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { childEnv } from './claude-engine.mjs'

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g
const clean = s => String(s ?? '').replace(ANSI, '')
const DOCS = { claude: 'https://docs.claude.com/en/docs/claude-code/setup', codex: 'https://developers.openai.com/codex/cli', cursor: 'https://cursor.com/docs/cli', opencode: 'https://opencode.ai/docs/cli' }

/** Pure parsers: status text -> {connected, detail}. detail never carries an email, token or path. */
export const parsers = {
  claude(out) {
    try {
      const s = JSON.parse(out)
      if (!s.loggedIn) return { connected: false, detail: 'Not signed in' }
      const plan = typeof s.subscriptionType === 'string' && s.subscriptionType ? ` (${s.subscriptionType[0].toUpperCase()}${s.subscriptionType.slice(1)})` : ''
      return { connected: true, detail: `Signed in${plan}` }
    } catch {
      return { connected: false, detail: 'Not signed in' }
    }
  },
  codex(out) {
    const t = clean(out)
    if (/not logged in/i.test(t)) return { connected: false, detail: 'Not signed in' }
    if (/logged in/i.test(t)) return { connected: true, detail: /api key/i.test(t) ? 'Signed in with an API key' : 'Signed in' }
    return { connected: false, detail: 'Not signed in' }
  },
  // shortcut: cursor-agent's and opencode's status output is not documented, so these read the obvious words; check against real output.
  cursor(out) {
    const t = clean(out)
    if (/not (logged|signed) in|unauthenticated/i.test(t)) return { connected: false, detail: 'Not signed in' }
    if (/logged in|signed in|authenticated/i.test(t)) return { connected: true, detail: 'Signed in' }
    return { connected: false, detail: 'Not signed in' }
  },
  opencode(out) {
    const t = clean(out)
    const n = /(\d+)\s+credentials?/i.exec(t)
    const count = n ? Number(n[1]) : (t.match(/●/g) ?? []).length
    return count > 0 ? { connected: true, detail: 'Signed in' } : { connected: false, detail: 'Not signed in' }
  },
}

export const CLI = [
  { id: 'claude', name: 'Claude Code', bin: 'claude', args: ['auth', 'status'], install: DOCS.claude, login: 'claude', logout: 'claude auth logout', engineFile: null },
  { id: 'codex', name: 'Codex', bin: 'codex', args: ['login', 'status'], install: DOCS.codex, login: 'codex login', logout: 'codex logout', engineFile: './codex-engine.mjs' },
  { id: 'cursor', name: 'Cursor', bin: 'cursor-agent', args: ['status'], install: DOCS.cursor, login: 'cursor-agent login', logout: 'cursor-agent logout', engineFile: './cursor-engine.mjs' },
  { id: 'opencode', name: 'OpenCode', bin: 'opencode', args: ['auth', 'list'], install: DOCS.opencode, login: 'opencode auth login', logout: 'opencode auth logout', engineFile: './opencode-engine.mjs' },
]

export const KEYS = [
  { id: 'anthropic', name: 'Anthropic', url: 'https://api.anthropic.com/v1/models', headers: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }) },
  { id: 'openai', name: 'OpenAI', url: 'https://api.openai.com/v1/models', headers: k => ({ authorization: `Bearer ${k}` }) },
  { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/auth/key', headers: k => ({ authorization: `Bearer ${k}` }) },
  { id: 'google', name: 'Google', url: 'https://generativelanguage.googleapis.com/v1beta/models', headers: k => ({ 'x-goog-api-key': k }) },
]
export const KEY_IDS = KEYS.map(k => k.id)
/** Autodetect priority: first connected wins. Key providers are `key:<id>`. */
export const ORDER = ['claude', 'codex', 'cursor', 'opencode', ...KEY_IDS.map(id => `key:${id}`)]

/** What a provider sets when it becomes the default; model unset means the engine picks. */
export const DEFAULTS = { claude: { engine: 'claude', model: 'claude-opus-5-5', efforts: { 'claude-opus-5-5': 'high' }, label: 'Claude Code · Opus 5.5' } }
export const label = id => DEFAULTS[id]?.label ?? [...CLI, ...KEYS.map(k => ({ ...k, id: `key:${k.id}`, name: `${k.name} key` }))].find(p => p.id === id)?.name ?? id

export function findBin(name, env = process.env, home = homedir()) {
  const dirs = [...(env.PATH ?? '').split(delimiter), join(home, '.local', 'bin'), '/opt/homebrew/bin', join(home, '.opencode', 'bin')].filter(Boolean)
  for (const d of dirs) {
    try {
      accessSync(join(d, name), constants.X_OK)
      return join(d, name)
    } catch {}
  }
  return null
}

/** First connected provider in ORDER, or null. */
export const pick = rows => ORDER.map(id => rows.find(r => r.id === id)).find(r => r?.connected) ?? null

export function createAccounts({ desktopDir, env = process.env, execFile = nodeExecFile, safeStorage, fetch = globalThis.fetch, loadEngine = f => import(f), home = homedir() }) {
  const keysPath = join(desktopDir, 'keys.json')
  const readKeys = async () => {
    try { return JSON.parse(await readFile(keysPath, 'utf8')) } catch { return {} }
  }
  const writeKeys = async data => {
    await mkdir(dirname(keysPath), { recursive: true })
    const tmp = `${keysPath}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(data), { mode: 0o600 })
    await chmod(tmp, 0o600)
    await rename(tmp, keysPath)
  }
  const keyId = id => {
    if (!KEY_IDS.includes(id)) throw new Error('Unknown provider.')
    return id
  }

  const run = (bin, args) =>
    new Promise(resolve => {
      execFile(bin, args, { env: childEnv(env), timeout: 10_000 }, (err, stdout, stderr) => {
        if (err?.killed || err?.signal) return resolve({ timedOut: true })
        resolve({ out: `${stdout ?? ''}\n${stderr ?? ''}` })
      })
    })

  async function runnable(p) {
    if (!p.engineFile) return true
    try { await loadEngine(p.engineFile); return true } catch { return false }
  }

  async function detectCli(p) {
    const base = { id: p.id, name: p.name, kind: 'cli', installed: false, connected: false, runnable: false, detail: 'Not installed', howTo: `Install: ${p.install}`, install: p.install }
    const bin = findBin(p.bin, env, home)
    if (!bin) return base
    const r = await run(bin, p.args)
    const parsed = r.timedOut ? { connected: false, detail: 'Timed out' } : parsers[p.id](r.out)
    return { ...base, installed: true, ...parsed, runnable: parsed.connected && (await runnable(p)), howTo: parsed.connected ? `Sign out: ${p.logout}` : `Run ${p.login} in a terminal` }
  }

  async function list() {
    const keys = await readKeys()
    const cli = await Promise.all(CLI.map(detectCli))
    const key = KEYS.map(k => {
      const saved = keys[k.id]
      return { id: `key:${k.id}`, name: `${k.name} key`, kind: 'key', installed: true, connected: !!saved, runnable: false, detail: saved ? `Saved, ends in ...${saved.last4}` : 'No key', howTo: saved ? 'Remove to sign out' : 'Paste an API key', last4: saved?.last4 }
    })
    return [...cli, ...key]
  }

  async function setKey(id, value) {
    keyId(id)
    if (typeof value !== 'string' || value.trim().length < 8 || value.length > 500 || /\s/.test(value.trim())) throw new Error('That does not look like an API key.')
    if (!safeStorage?.isEncryptionAvailable()) throw new Error('Secure storage is not available on this Mac.')
    const v = value.trim()
    const keys = await readKeys()
    keys[id] = { enc: safeStorage.encryptString(v).toString('base64'), last4: v.slice(-4) }
    await writeKeys(keys)
    return { last4: keys[id].last4 }
  }

  async function removeKey(id) {
    keyId(id)
    const keys = await readKeys()
    delete keys[id]
    await writeKeys(keys)
    return { last4: null }
  }

  /** One cheap GET, only when the owner asks. The reply never contains the key. */
  async function testKey(id) {
    const k = KEYS.find(x => x.id === keyId(id))
    const saved = (await readKeys())[id]
    if (!saved) throw new Error('No key saved.')
    let key
    try { key = safeStorage.decryptString(Buffer.from(saved.enc, 'base64')) } catch { throw new Error('The saved key cannot be read. Add it again.') }
    try {
      const res = await fetch(k.url, { headers: k.headers(key), signal: AbortSignal.timeout(10_000) })
      return res.ok ? { ok: true, message: 'Key works' } : { ok: false, message: res.status === 401 || res.status === 403 ? 'Key was rejected' : `Check failed (${res.status})` }
    } catch {
      return { ok: false, message: 'Could not reach the service' }
    }
  }

  return { list, setKey, removeKey, testKey, pick, label }
}
