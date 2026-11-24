// Runs the agent through the user's own Devin CLI (their Devin sign-in): `devin -p <prompt>`.
// Sources: the Devin CLI docs shipped with Devin.app (share/devin/docs/reference/commands.mdx, models.mdx):
//  - `--print [PROMPT]` / `-p`: "Print response and exit (non-interactive mode)". It cannot show the workspace trust
//    prompt, so scripts pass `--respect-workspace-trust false`.
//  - `--model <MODEL>`: short names `opus`, `sonnet`, `swe`, `codex`, `gemini` resolve to the latest in that family.
//  - `--permission-mode normal|accept-edits|smart|dangerous`, `--continue` (most recent session in the directory).
//  - `devin auth status` prints "Not logged in." when signed out.
// Checked (devin 3000.14, 2026-11-23): print mode writes the reply as plain text on stdout and exits 0. There is no
// event stream, so tool steps are not shown. ASSUMED: a follow-up turn can use `--continue`, which resumes the newest
// Devin session in the project folder: that is this thread's unless Devin was also used there in between.

import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { childEnv } from './claude-engine.mjs'
import { cliStatus, createCliEngine, findOnPath } from './cli-engine.mjs'

export const INSTALL_HINT = 'Devin CLI is not installed. Install it (devin.ai), then run `devin auth login` once in a terminal.'
export const LOGIN_HINT = 'Run `devin auth login` once in a terminal to sign in, then come back.'
// ids carry a prefix so no Devin model shares an id with another agent's; the CLI gets the name without it.
// Fallback only: the list shown is the CLI's own (devinModelList below). These short names always resolve to the
// latest model in their family, so they work before the list has loaded or when the CLI is signed out.
export const DEVIN_MODELS = [
  { id: 'devin/opus', name: 'Opus' },
  { id: 'devin/sonnet', name: 'Sonnet' },
  { id: 'devin/swe', name: 'SWE' },
  { id: 'devin/codex', name: 'Codex' },
  { id: 'devin/gemini', name: 'Gemini' },
]
// Run from a terminal inside the Devin app, the CLI inherits ACP_BACKEND and reports "Not logged in": drop it.
export const devinEnv = (base = childEnv()) => { const env = { ...base }; delete env.ACP_BACKEND; return env }

const LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const price = (summary, word) => Number(new RegExp(`\\$([\\d.]+) / 1M ${word}`).exec(summary ?? '')?.[1] ?? 0)
// family id -> { effort: model_uid }, from the last list read; build() turns the picked effort into the variant to run
let variants = new Map()

/**
 * The models `devin models list --format json` reports for the signed-in account, one per family, or null when signed out.
 * Shape (devin 3000.14, read 2026-11-23): { families: [{ family_label, slug, variants: [{ model_uid, label,
 * max_context_tokens, cost_summary: "$4 / 1M Input · $0.2 / 1M Cached input · $20 / 1M Output" }] }] }.
 * A variant whose uid ends in an effort word is that family at that effort; the others (Lightning and so on) are left out.
 */
export function devinModelList(path, env = devinEnv()) {
  return new Promise(resolve => {
    if (!path) return resolve(null)
    execFile(path, ['models', 'list', '--format', 'json'], { env, timeout: 15_000, maxBuffer: 8 << 20 }, (err, out) => {
      if (err) return resolve(null)
      try {
        const next = new Map()
        const list = JSON.parse(String(out)).families.filter(f => typeof f?.slug === 'string' && Array.isArray(f.variants) && f.variants.length).map(f => {
          const byEffort = {}
          for (const v of f.variants) {
            const level = LEVELS.find(l => String(v.model_uid).endsWith(`-${l}`))
            if (level) byEffort[level] ??= v.model_uid
          }
          const efforts = LEVELS.filter(l => byEffort[l])
          const lead = f.variants.find(v => v.model_uid === byEffort.medium) ?? f.variants[0]
          const id = `devin/${f.slug}`
          next.set(id, byEffort)
          return {
            id, name: String(f.family_label ?? f.slug).slice(0, 80), efforts,
            contextWindow: Number(lead.max_context_tokens) || 0,
            cost: { input: price(lead.cost_summary, 'Input'), output: price(lead.cost_summary, 'Output'), cacheRead: price(lead.cost_summary, 'Cached input') },
          }
        })
        if (!list.length) return resolve(null)
        variants = next
        resolve(list)
      } catch { resolve(null) }
    })
  })
}
export const DEVIN_EFFORTS = [] // print mode has no effort flag
export const PERMISSION = { ask: 'normal', every: 'normal', never: 'dangerous' }

// the desktop app bundles the CLI without putting it on PATH
const BUNDLED = '/Applications/Devin.app/Contents/Resources/app/extensions/windsurf/devin/bin/devin'
export function findDevin(override, env) {
  const found = findOnPath('devin', override, env)
  if (found || override || process.platform !== 'darwin') return found
  try { accessSync(BUNDLED, constants.X_OK); return BUNDLED } catch { return null }
}

export const devinStatus = (path, env) =>
  cliStatus(path, ['auth', 'status'], (out, code) => ({ loggedIn: code === 0 && !/not logged in/i.test(out), detail: out.trim().split('\n')[0] }), env ?? devinEnv())

function build({ prompt, model, effort, approval, resume }) {
  const name = model && (variants.get(model)?.[effort] ?? model.replace(/^devin\//, ''))
  const args = ['--respect-workspace-trust', 'false', '--permission-mode', PERMISSION[approval] ?? PERMISSION.ask,
    ...(name ? ['--model', name] : []), ...(resume ? ['--continue'] : []), '-p', prompt]
  return { args, env: { ACP_BACKEND: undefined } }
}

function parser() {
  const t0 = Date.now()
  let wrote = false
  return {
    line() {},
    // plain text: each stdout line is part of the reply
    raw(line, h) {
      h.push({ type: 'text', delta: `${wrote ? '\n' : ''}${line}` })
      wrote = true
    },
    // only a turn that answered is worth resuming: a failed first turn must not make the next one `--continue` some other session
    outcome: () => ({ sessionId: wrote ? 'continue' : undefined, totals: wrote ? { modelCalls: 1, durationMs: Date.now() - t0 } : undefined }),
  }
}

export const createDevinEngine = ({ push, spawn }) =>
  createCliEngine({ push, spawn, label: 'Devin', installHint: INSTALL_HINT, pathKey: 'devinPath', build, parser })
