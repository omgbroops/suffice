// Local-only error log: <home>/desktop/logs/app.log, ~1 MB, one rotated copy. Secrets are redacted.
import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const MAX = 1024 * 1024
const SECRETS = [
  [/\bsk-[A-Za-z0-9_-]{6,}/g, '[redacted]'],
  [/\bBearer\s+[\w.~+/=-]+/gi, 'Bearer [redacted]'],
  [/((?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[redacted]'],
  [/[A-Za-z0-9+/_-]{40,}={0,2}/g, '[redacted]'],
]
export const redact = s => SECRETS.reduce((t, [re, to]) => t.replace(re, to), String(s))

export function createErrorLog(home, max = MAX) {
  const dir = resolve(home, 'desktop', 'logs')
  const file = resolve(dir, 'app.log')
  let chain = Promise.resolve()
  const write = (source, error) => {
    const text = error instanceof Error ? error.stack || error.message : typeof error === 'string' ? error : JSON.stringify(error) ?? String(error)
    const line = `${new Date().toISOString()} [${redact(String(source).slice(0, 40))}] ${redact(text).slice(0, 8000)}\n`
    return (chain = chain.then(async () => {
      await mkdir(dir, { recursive: true, mode: 0o700 })
      const size = await stat(file).then(s => s.size, () => 0)
      if (size + line.length > max) await rename(file, `${file}.1`)
      await appendFile(file, line, { mode: 0o600 })
    }).catch(() => {})) // logging must never throw
  }
  return { write, file }
}
