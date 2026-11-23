// Shared runner for the Codex / Cursor / OpenCode adapters: one child process per run, JSONL on stdout,
// same run/guide/abort/dispose surface and push() events as claude-engine.mjs. None of these CLIs can take a
// mid-run message or ask the host about an approval in headless mode, so guide() is always false and
// each adapter maps the app's approval setting to a non-interactive mode instead (see its comments).

import { spawn as nodeSpawn, execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { childEnv } from './claude-engine.mjs'

const GRACE_MS = 3000

export function findOnPath(name, override, env = process.env) {
  const dirs = [...(env.PATH ?? '').split(delimiter), join(homedir(), '.local', 'bin')].filter(Boolean)
  for (const c of override ? [override] : dirs.map(d => join(d, name))) {
    try { accessSync(c, constants.X_OK); return c } catch {}
  }
  return null
}

/** Runs `<path> <args>`; parse(out, code) -> { loggedIn, ... }. Never touches credentials. */
export function cliStatus(path, args, parse, env = childEnv()) {
  return new Promise(resolve => {
    if (!path) return resolve({ loggedIn: false, missing: true })
    execFile(path, args, { env, timeout: 15_000 }, (err, out, errOut) => {
      try { resolve(parse(`${out}${errOut}`, err ? (err.code ?? 1) : 0)) } catch { resolve({ loggedIn: false }) }
    })
  })
}

/**
 * @param {{ push, spawn?, label: string, installHint: string, pathKey: string,
 *   build(opts): { args: string[], env?: object, stdin?: string },
 *   parser(): { line(m, h): void, outcome(): { error?: string, totals?: object, sessionId?: string } } }} cfg
 * parser.line(m, h) gets each JSON line plus h = { push(event) }.
 */
export function createCliEngine({ push, spawn = nodeSpawn, label, installHint, pathKey, build, parser }) {
  const runs = new Map()

  function run(opts) {
    const { threadId, project } = opts
    return new Promise((resolve, reject) => {
      const { args, env = {}, stdin } = build(opts)
      const child = spawn(opts[pathKey], args, { cwd: project, env: { ...childEnv(), ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
      const state = { child, aborted: false, killTimer: null }
      runs.set(threadId, state)
      const p = parser()
      const h = { push: e => push(threadId, e) }
      let buffer = '', stderr = '', settled = false
      const finish = (fn, v) => {
        if (settled) return
        settled = true
        clearTimeout(state.killTimer)
        if (runs.get(threadId) === state) runs.delete(threadId)
        fn(v)
      }
      state.interrupt = () => {
        state.aborted = true
        child.kill('SIGTERM')
        state.killTimer ??= setTimeout(() => child.kill('SIGKILL'), GRACE_MS)
      }
      child.stdout.on('data', chunk => {
        buffer += chunk
        let i
        while ((i = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, i).trim()
          buffer = buffer.slice(i + 1)
          if (!line) continue
          let m
          try { m = JSON.parse(line) } catch { continue } // a non-JSON line is not ours to act on
          p.line(m, h)
        }
      })
      child.stderr.on('data', c => (stderr = (stderr + c).slice(-2000)))
      child.stdin.on('error', () => {})
      child.on('error', e => finish(reject, new Error(e.code === 'ENOENT' ? installHint : e.message)))
      child.on('close', code => {
        if (state.aborted) return finish(reject, new Error('Task stopped: cancelled'))
        const { error, totals, sessionId } = p.outcome()
        if (error) return finish(reject, new Error(error))
        if (code !== 0 || !totals) return finish(reject, new Error(stderr.trim().split('\n').pop() || `${label} exited with code ${code}.`))
        finish(resolve, { ...totals, sessionId })
      })
      child.stdin.end(stdin ?? '')
    })
  }

  return {
    run,
    guide: () => false, // shortcut: no headless CLI here accepts mid-run input, queue the text as the next turn instead
    abort(threadId) {
      const r = runs.get(threadId)
      if (!r) return false
      r.interrupt()
      return true
    },
    dispose() {
      for (const r of runs.values()) { r.aborted = true; r.child.kill('SIGTERM') }
    },
  }
}
