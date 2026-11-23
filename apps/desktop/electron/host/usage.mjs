// Usage ledger: one JSON line per finished run in <home>/desktop/usage.jsonl (mode 0600,
// rotated to usage.jsonl.1 once it reaches 5 MB, one old file kept). apiCostUsd prices every
// run at the provider's per-token API rate even when the engine runs on a subscription, so
// the summary can show what the same usage would have cost on the API.
import { appendFile, chmod, mkdir, readFile, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'

export const USAGE_LIMIT = 5 * 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000
const num = v => (Number.isFinite(v) ? v : 0)

// engines that bill a CLI sign-in rather than a metered API key
const PLAN = {
  claude: { kind: 'subscription', name: 'Claude Code' },
  codex: { kind: 'subscription', name: 'Codex' },
  openai: { kind: 'api', name: 'OpenAI API' },
}

const dayKey = ts => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Per-1M-token prices; cache prices default to the Claude rates when the model table omits them. */
export function prices(cost) {
  if (!cost || !Number.isFinite(cost.input) || !Number.isFinite(cost.output)) return null
  return {
    input: cost.input,
    output: cost.output,
    cacheRead: Number.isFinite(cost.cacheRead) ? cost.cacheRead : 0.1 * cost.input,
    cacheWrite: Number.isFinite(cost.cacheWrite) ? cost.cacheWrite : 1.25 * cost.input,
  }
}

/** What a run with these token counts costs at API rates; null when the model's price is unknown. */
export function apiCostUsd(price, t) {
  if (!price) return null
  return (num(t.inputTokens) * price.input + num(t.outputTokens) * price.output + num(t.cacheReadTokens) * price.cacheRead + num(t.cacheWriteTokens) * price.cacheWrite) / 1e6
}

/**
 * @param {{ desktopDir: string, priceOf: (engine: string, model: string) => object | null | undefined,
 *   activeEngine?: () => string, onError?: (e: any) => void }} deps
 */
export function createUsageLedger({ desktopDir, priceOf, activeEngine, onError }) {
  const path = join(desktopDir, 'usage.jsonl')
  // appends run one after another so a rotation never races a write
  let writes = Promise.resolve()

  async function append(line) {
    await mkdir(desktopDir, { recursive: true, mode: 0o700 })
    if (await stat(path).then(s => s.size >= USAGE_LIMIT, () => false)) await rename(path, `${path}.1`).catch(() => {})
    await appendFile(path, line, { mode: 0o600 })
    await chmod(path, 0o600)
  }

  /** A finished run -> one ledger line. Resolves once written; errors are reported, never thrown. */
  function record({ threadId, project, engine, model, effort, totals, durationMs }) {
    const t = totals ?? {}
    const tokens = {
      inputTokens: num(t.inputTokens ?? t.input),
      outputTokens: num(t.outputTokens ?? t.output),
      cacheReadTokens: num(t.cacheReadTokens ?? t.cacheRead),
      cacheWriteTokens: num(t.cacheWriteTokens ?? t.cacheWrite),
    }
    const entry = {
      ts: Date.now(), threadId, project, engine, model, effort, ...tokens,
      apiCostUsd: apiCostUsd(prices(priceOf?.(engine, model)), tokens),
      durationMs: num(t.durationMs ?? durationMs),
    }
    const reported = t.costUsd ?? t.estimatedApiUsd
    if (Number.isFinite(reported)) entry.reportedCostUsd = reported
    const work = writes.then(() => append(JSON.stringify(entry) + '\n'))
    writes = work.catch(() => {})
    return work.catch(e => void onError?.(e))
  }

  async function entries() {
    const out = []
    for (const file of [`${path}.1`, path]) {
      const text = await readFile(file, 'utf8').catch(() => '')
      for (const line of text.split('\n')) {
        if (!line) continue
        try {
          out.push(JSON.parse(line))
        } catch {} // a half-written or corrupt line is skipped, not fatal
      }
    }
    return out
  }

  /** Totals and per-day rows over the last `days` calendar days (zero-filled), plus the plan. */
  async function summary({ days: n = 7, now = Date.now() } = {}) {
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const first = today.getTime() - (n - 1) * DAY_MS
    const days = Array.from({ length: n }, (_, i) => ({ date: dayKey(first + i * DAY_MS), runs: 0, apiCostUsd: 0 }))
    const index = new Map(days.map((d, i) => [d.date, i]))
    const total = { runs: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCostUsd: 0 }
    let cacheSavings = 0
    for (const e of await entries()) {
      const d = index.get(dayKey(e.ts))
      if (d === undefined) continue
      const day = days[d]
      day.runs += 1
      day.apiCostUsd += num(e.apiCostUsd)
      total.runs += 1
      total.inputTokens += num(e.inputTokens)
      total.outputTokens += num(e.outputTokens)
      total.cacheReadTokens += num(e.cacheReadTokens)
      total.cacheWriteTokens += num(e.cacheWriteTokens)
      total.apiCostUsd += num(e.apiCostUsd)
      const price = prices(priceOf?.(e.engine, e.model))
      if (price) cacheSavings += (num(e.cacheReadTokens) * 0.9 * price.input) / 1e6
    }
    const plan = PLAN[activeEngine?.()] ?? { kind: 'api', name: 'API' }
    return { total, days, plan, savedUsd: plan.kind === 'subscription' ? total.apiCostUsd : cacheSavings }
  }

  /** Settles once every append queued so far has landed; dispose awaits it so nothing writes after teardown. */
  const drain = () => writes

  return { record, summary, path, drain }
}
