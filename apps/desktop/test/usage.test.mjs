import test from 'node:test'
import assert from 'node:assert/strict'
import { appendFile, chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUsageLedger, apiCostUsd, prices, USAGE_LIMIT } from '../electron/host/usage.mjs'
import { createHost } from '../electron/host/host.mjs'

const DAY_MS = 24 * 60 * 60 * 1000
const close = (a, b) => Math.abs(a - b) < 1e-9
const dkey = ts => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const lines = async path => (await readFile(path, 'utf8')).trim().split('\n').filter(l => l.startsWith('{')).map(JSON.parse)

const MODELS = [{ id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', reasoning: true, contextWindow: 272000, cost: { input: 2, output: 10, cacheRead: 0.1 }, thinkingLevelMap: { off: null, low: 'low', medium: 'medium' } }]
const fakeRuntime = () => ({
  isUsingSubscription: () => false,
  hasConfiguredAuth: () => true,
  getModels: () => MODELS,
  getModel: (_p, id) => MODELS.find(m => m.id === id),
  logout: async () => {},
})

// A fake `claude`: answers `auth status`, then speaks enough stream-json to finish one run.
const FAKE_CLAUDE = `#!/usr/bin/env node
const argv = process.argv.slice(2)
if (argv[0] === 'auth') {
  console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' }))
  process.exit(0)
}
let buf = ''
process.stdin.on('data', c => {
  buf += c
  let i
  while ((i = buf.indexOf('\\n')) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1)
    if (m.type === 'user') {
      process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok', num_turns: 2, duration_ms: 5, total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } }) + '\\n')
    }
  }
})
process.stdin.on('end', () => process.exit(0))
`

test('pricing: apiCostUsd uses the model table with Claude cache fallbacks', () => {
  // haiku: input .1, output .5 -> cacheRead .01, cacheWrite .125 per 1M
  const p = prices({ input: 0.1, output: 0.5 })
  assert.ok(close(apiCostUsd(p, { inputTokens: 10, outputTokens: 20, cacheReadTokens: 3, cacheWriteTokens: 4 }), (10 * 0.1 + 20 * 0.5 + 3 * 0.01 + 4 * 0.125) / 1e6))
  // explicit cache prices in the table win over the fallbacks
  const q = prices({ input: 2, output: 10, cacheRead: 0.1, cacheWrite: 1 })
  assert.ok(close(apiCostUsd(q, { inputTokens: 10, outputTokens: 20, cacheReadTokens: 3, cacheWriteTokens: 4 }), (20 + 200 + 0.3 + 4) / 1e6))
  assert.equal(apiCostUsd(null, { inputTokens: 10 }), null)
  assert.equal(prices({}), null)
})

test('a finished openai run appends one priced 0600 ledger line; failed runs append nothing', async () => {
  const home = await mkdtemp(join(tmpdir(), 'suffice-usage-'))
  try {
    let changed = 0
    const finished = new Promise(r => {
      const i = setInterval(() => changed >= 2 && (clearInterval(i), r()), 5)
    })
    const agent = totals => ({
      session: { model: MODELS[0], setModel: async () => {}, setThinkingLevel: () => {}, subscribe: () => {} },
      totals,
      sessionPath: () => join(home, 'sessions', 'fake.jsonl'),
      abort: () => {},
      dispose: async () => {},
      run: async () => {},
    })
    const bad = { ...agent({}), run: async () => { throw new Error('blew up') } }
    const agents = [agent({ modelCalls: 2, input: 10, output: 20, cacheRead: 3, cacheWrite: 4, estimatedApiUsd: 0.007 }), bad]
    const host = await createHost({ engine: 'openai', home, runtime: fakeRuntime(), createSession: async () => agents.shift(), openExternal: () => {}, chooseDirectory: async () => home, emit: c => c === 'threads:changed' && changed++ })
    await host.run({ threadId: 'ok', project: home, prompt: 'go', model: 'gpt-6.1-sol', effort: 'low' })
    await host.run({ threadId: 'no', project: home, prompt: 'go', model: 'gpt-6.1-sol', effort: 'low' })
    await finished
    await host.dispose()
    const path = join(home, 'desktop', 'usage.jsonl')
    const [entry] = await lines(path)
    assert.equal(entry.threadId, 'ok')
    assert.equal(entry.project, home)
    assert.equal(entry.engine, 'openai')
    assert.equal(entry.model, 'gpt-6.1-sol')
    assert.equal(entry.effort, 'low')
    assert.ok(Number.isFinite(entry.ts))
    assert.equal(entry.inputTokens, 10)
    assert.equal(entry.outputTokens, 20)
    assert.equal(entry.cacheReadTokens, 3)
    assert.equal(entry.cacheWriteTokens, 4)
    // gpt-6.1-sol: input 2, output 10, cacheRead .1, cacheWrite falls back to 1.25 x input = 2.5
    assert.ok(close(entry.apiCostUsd, (10 * 2 + 20 * 10 + 3 * 0.1 + 4 * 2.5) / 1e6))
    assert.equal(entry.reportedCostUsd, 0.007)
    assert.ok(entry.durationMs >= 0)
    assert.equal((await stat(path)).mode & 0o777, 0o600)
    const s = await host.usageSummary({})
    assert.equal(s.total.runs, 1)
    assert.equal(s.plan.kind, 'api')
    assert.ok(close(s.savedUsd, (3 * 0.9 * 2) / 1e6)) // api plan: cache savings
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a finished claude run records reportedCostUsd and the subscription summary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-claude-'))
  const home = await mkdtemp(join(tmpdir(), 'suffice-usage-'))
  try {
    const bin = join(dir, 'claude')
    await writeFile(bin, FAKE_CLAUDE)
    await chmod(bin, 0o755)
    let done
    const finished = new Promise(r => (done = r))
    const host = await createHost({ home, claudePath: bin, openExternal: () => {}, chooseDirectory: async () => home, emit: c => c === 'threads:changed' && done() })
    await host.run({ threadId: 't1', project: home, prompt: 'write it', model: 'claude-haiku-5-5', effort: 'low', mode: 'balanced' })
    await finished
    await host.dispose()
    const [entry] = await lines(join(home, 'desktop', 'usage.jsonl'))
    assert.equal(entry.engine, 'claude')
    assert.equal(entry.model, 'claude-haiku-5-5')
    assert.equal(entry.reportedCostUsd, 0.01)
    assert.equal(entry.durationMs, 5)
    assert.ok(close(entry.apiCostUsd, (10 * 0.1 + 20 * 0.5 + 3 * 0.01 + 4 * 0.125) / 1e6))
    const s = await host.usageSummary({})
    assert.deepEqual(s.plan, { kind: 'subscription', name: 'Claude Code' })
    assert.equal(s.total.runs, 1)
    assert.ok(close(s.savedUsd, s.total.apiCostUsd)) // subscription: what the tokens would have cost
    assert.equal(s.days.length, 7)
    const today = s.days.at(-1)
    assert.equal(today.date, dkey(Date.now()))
    assert.equal(today.runs, 1)
    assert.ok(close(today.apiCostUsd, entry.apiCostUsd))
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('the ledger repairs a loose mode, rotates at 5 MB and keeps exactly one old file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-usage-'))
  try {
    const ledger = createUsageLedger({ desktopDir: dir, priceOf: () => ({ input: 2, output: 10 }), activeEngine: () => 'openai' })
    const rec = threadId => ledger.record({ threadId, project: '/p', engine: 'openai', model: 'm', totals: { input: 1, output: 1 } })
    const seed = JSON.stringify({ ts: 1, engine: 'openai', model: 'm', inputTokens: 1, apiCostUsd: 1 }) + '\n'
    // a file that already exists with a loose mode is tightened on the next append
    await writeFile(ledger.path, seed)
    await chmod(ledger.path, 0o644)
    await rec('a')
    assert.equal((await stat(ledger.path)).mode & 0o777, 0o600)
    await appendFile(ledger.path, 'x'.repeat(USAGE_LIMIT))
    await rec('b')
    assert.deepEqual((await readdir(dir)).sort(), ['usage.jsonl', 'usage.jsonl.1'])
    assert.deepEqual((await lines(ledger.path)).map(e => e.threadId), ['b'])
    assert.deepEqual((await lines(`${ledger.path}.1`)).map(e => e.threadId), [undefined, 'a'])
    await rec('c')
    // a second rotation replaces the old file: the seed and a are gone, b and c are kept
    await appendFile(ledger.path, 'x'.repeat(USAGE_LIMIT))
    await rec('d')
    assert.deepEqual((await lines(ledger.path)).map(e => e.threadId), ['d'])
    assert.deepEqual((await lines(`${ledger.path}.1`)).map(e => e.threadId), ['b', 'c'])
    const s = await ledger.summary({})
    assert.equal(s.total.runs, 3) // b, c and d: rotated entries still count
    assert.equal((await stat(ledger.path)).mode & 0o777, 0o600)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('summary zero-fills the window, drops older runs and prices cache savings per plan kind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-usage-'))
  try {
    const NOW = new Date('2026-11-22T12:00:00').getTime()
    const seed = [
      { ts: NOW - 3_600_000, threadId: 'e1', engine: 'openai', model: 'gpt-x', inputTokens: 100, outputTokens: 200, cacheReadTokens: 1_000_000, cacheWriteTokens: 0, apiCostUsd: 0.5, durationMs: 1 },
      { ts: NOW - 26 * 3_600_000, threadId: 'e2', engine: 'openai', model: 'gpt-x', inputTokens: 5, outputTokens: 5, cacheReadTokens: 500_000, cacheWriteTokens: 0, apiCostUsd: 0.25, durationMs: 1 },
      { ts: NOW - 10 * DAY_MS, threadId: 'e3', engine: 'openai', model: 'gpt-x', inputTokens: 9, outputTokens: 9, cacheReadTokens: 9, cacheWriteTokens: 9, apiCostUsd: 9, durationMs: 1 },
      { ts: NOW - 7_200_000, threadId: 'e4', engine: 'openai', model: 'unknown', inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheWriteTokens: 1, apiCostUsd: null, durationMs: 1 },
    ]
    await writeFile(join(dir, 'usage.jsonl'), seed.map(e => JSON.stringify(e) + '\n').join('') + 'not json\n')
    const priceOf = (_e, m) => (m === 'gpt-x' ? { input: 2, output: 10, cacheRead: 0.1 } : null)
    const api = createUsageLedger({ desktopDir: dir, priceOf, activeEngine: () => 'openai' })
    const s = await api.summary({ days: 7, now: NOW })
    assert.equal(s.days.length, 7)
    assert.equal(s.days.at(-1).date, dkey(NOW))
    assert.deepEqual(s.days.map(d => d.date), [...s.days.map(d => d.date)].sort())
    const today = s.days.find(d => d.date === dkey(NOW))
    const yesterday = s.days.find(d => d.date === dkey(NOW - 26 * 3_600_000))
    assert.equal(today.runs, 2)
    assert.ok(close(today.apiCostUsd, 0.5))
    assert.equal(yesterday.runs, 1)
    assert.ok(close(yesterday.apiCostUsd, 0.25))
    assert.ok(s.days.filter(d => d.runs === 0).length >= 4, 'zero-filled days stay')
    assert.equal(s.total.runs, 3) // the 10-day-old run is outside the window
    assert.equal(s.total.inputTokens, 106)
    assert.equal(s.total.outputTokens, 206)
    assert.equal(s.total.cacheReadTokens, 1_500_001)
    assert.equal(s.total.cacheWriteTokens, 1)
    assert.ok(close(s.total.apiCostUsd, 0.75))
    assert.deepEqual(s.plan, { kind: 'api', name: 'OpenAI API' })
    assert.ok(close(s.savedUsd, (1_000_000 * 0.9 * 2 + 500_000 * 0.9 * 2) / 1e6)) // unknown model adds nothing
    const sub = createUsageLedger({ desktopDir: dir, priceOf, activeEngine: () => 'claude' })
    const s2 = await sub.summary({ days: 7, now: NOW })
    assert.deepEqual(s2.plan, { kind: 'subscription', name: 'Claude Code' })
    assert.ok(close(s2.savedUsd, s2.total.apiCostUsd))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('usage:summary rejects bad days and bad args', async () => {
  const home = await mkdtemp(join(tmpdir(), 'suffice-usage-'))
  try {
    const host = await createHost({ engine: 'openai', home, runtime: fakeRuntime(), openExternal: () => {}, chooseDirectory: async () => home, emit: () => {} })
    for (const bad of [{ days: 0 }, { days: 91 }, { days: 1.5 }, { days: '7' }, { days: NaN }, 'x'])
      assert.throws(() => host.usageSummary(bad), /Invalid/, JSON.stringify(bad))
    for (const good of [{}, null, { days: 1 }, { days: 90 }]) {
      const s = await host.usageSummary(good)
      assert.equal(s.days.length, good?.days ?? 7)
      assert.equal(s.total.runs, 0)
    }
    await host.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
