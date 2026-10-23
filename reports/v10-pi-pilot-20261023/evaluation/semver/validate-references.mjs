import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))
const runs = []
fs.mkdirSync(path.join(here, 'validation-logs'), { recursive: true })
for (const task of ['build-metadata', 'prerelease-subset']) {
  for (const implementation of ['baseline', task]) {
    const workspace = path.join(here, 'references', implementation)
    const args = [path.join(here, 'grade-semver.mjs'), task, workspace]
    const startedAt = new Date().toISOString()
    const started = performance.now()
    const result = spawnSync(process.execPath, args, { cwd: here, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
    const stem = `${task}-${implementation === 'baseline' ? 'baseline' : 'reference'}`
    fs.writeFileSync(path.join(here, 'validation-logs', `${stem}.stdout.log`), result.stdout || '')
    fs.writeFileSync(path.join(here, 'validation-logs', `${stem}.stderr.log`), result.stderr || '')
    const summaryLine = (result.stdout || '').trim().split('\n').at(-1)
    let summary = null
    try { summary = JSON.parse(summaryLine) } catch {}
    runs.push({ task, implementation, command: [process.execPath, ...args], cwd: here,
      startedAt, completedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started),
      exit: result.status, signal: result.signal, error: result.error?.message || null,
      expectedExit: implementation === 'baseline' ? 1 : 0,
      stdoutLog: `validation-logs/${stem}.stdout.log`, stderrLog: `validation-logs/${stem}.stderr.log`, summary })
    console.log(JSON.stringify(runs.at(-1), null, 2))
  }
}
const success = runs.every(run => run.exit === run.expectedExit && !run.error && run.summary &&
  (run.implementation === 'baseline' ? run.summary.failed > 0 : run.summary.failed === 0))
fs.writeFileSync(path.join(here, 'validation.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), node: process.version, platform: process.platform,
  success, actorSourcesInspected: false, runs,
}, null, 2) + '\n')
process.exitCode = success ? 0 : 1
