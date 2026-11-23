// Shared harness for the codex/cursor/opencode adapter tests: writes a fake CLI, drives an engine, logs argv/env/stdin.
import { mkdtemp, writeFile, readFile, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const PRELUDE = `#!/usr/bin/env node
const fs = require('fs')
const argv = process.argv.slice(2)
const scenario = process.env.FAKE_SCENARIO
let stdin = ''
const out = o => process.stdout.write(JSON.stringify(o) + '\\n')
const log = () => process.env.FAKE_LOG && fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ argv, stdin, cwd: process.cwd(), env: Object.keys(process.env).filter(k => /API_KEY|AUTH_TOKEN/.test(k)), perm: process.env.OPENCODE_PERMISSION }) + '\\n')
`

export async function runFake(FAKE, name, makeEngine, pathKey, scenario, extra = {}, env = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-fake-'))
  const bin = join(dir, name)
  await writeFile(bin, FAKE)
  await chmod(bin, 0o755)
  const log = join(dir, 'log.jsonl')
  const saved = { FAKE_SCENARIO: process.env.FAKE_SCENARIO, FAKE_LOG: process.env.FAKE_LOG }
  process.env.FAKE_SCENARIO = scenario
  process.env.FAKE_LOG = log
  Object.assign(process.env, env)
  const events = []
  const engine = makeEngine({ push: (_t, e) => events.push(e) })
  const args = { threadId: 't', [pathKey]: bin, project: dir, prompt: 'hi', model: 'm', effort: 'low', approval: 'ask', sessionId: 'sid-1', resume: false, onApproval: async () => true, ...extra }
  const calls = async () => (await readFile(log, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
  const cleanup = async () => {
    for (const k of Object.keys(env)) delete process.env[k]
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v)
    engine.dispose()
    await rm(dir, { recursive: true, force: true })
  }
  return { dir, bin, events, engine, args, calls, cleanup }
}

export const after = (argv, flag) => argv[argv.indexOf(flag) + 1]
export const BAD_ENV = { ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'o', CURSOR_API_KEY: 'c', ANTHROPIC_AUTH_TOKEN: 't' }
