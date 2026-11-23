// Per-thread metadata. Two halves, one module:
//  - titler: a model-written title (<=6 words) and evolving description, written after each run, never blocking it.
//  - store: pin, unread, manual rename, section, archive (<home>/desktop/threads.json), plus fork and delete (copy/move only).
// Precedence in the host: a manual rename beats the generated title; a manual section beats an auto category.

import { spawn as nodeSpawn } from 'node:child_process'
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, resolve } from 'node:path'
import { childEnv } from './claude-engine.mjs'

export const META_MODEL = 'claude-haiku-5-5'
export const META_PROMPT = `You name chat threads. Reply with JSON only: {"title": string, "description": string}.
title: at most 6 words, sentence case, says what the thread is about. Never copy the user's first message.
description: at most 4 short sentences on what the thread is doing and where it stands now.`

const words = s => String(s).trim().split(/\s+/).filter(Boolean)
const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** The model's reply -> {title, description}, or null when it is unusable. `first` is the first user message. */
export function parseMeta(reply, first = '') {
  if (typeof reply !== 'string') return null
  const m = reply.replace(/```(?:json)?/gi, '').match(/\{[\s\S]*\}/)
  let o
  try { o = JSON.parse(m?.[0] ?? '') } catch { return null }
  if (!o || typeof o.title !== 'string') return null
  const title = words(o.title.replace(/^["'“‘]+|["'”’.]+$/g, '')).slice(0, 6).join(' ')
  if (!title || norm(title) === norm(first)) return null
  const sentences = String(o.description ?? '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) ?? []
  return { title, description: sentences.slice(0, 4).map(s => s.trim()).join(' ') }
}

/** User messages plus each agent turn's final text, newest kept when over `max` chars. */
export function buildInput(transcript, max = 4000) {
  const lines = []
  for (const m of transcript?.messages ?? []) {
    if (m.role === 'user') lines.push(`User: ${m.text}`)
    else if (m.role === 'agent') {
      const t = [...(m.steps ?? [])].reverse().find(s => s.kind === 'text' && s.text)
      if (t) lines.push(`Assistant: ${t.text}`)
    }
  }
  const all = lines.join('\n\n')
  return all.length > max ? all.slice(all.length - max) : all
}

/** One-shot Claude CLI call: no tools, no MCP, no slash commands, nothing saved. Resolves with the reply text. */
export function claudeAsk(claudePath, { spawn = nodeSpawn, env = childEnv(), timeoutMs = 60_000 } = {}) {
  return (system, text) => new Promise((resolve, reject) => {
    const child = spawn(claudePath, ['-p', '--model', META_MODEL, '--effort', 'low', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--system-prompt', system], { env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.stdout.on('data', c => (out += c))
    child.on('error', e => (clearTimeout(timer), reject(e)))
    child.on('close', () => {
      clearTimeout(timer)
      try { resolve(String(JSON.parse(out).result ?? '')) } catch { reject(new Error('No reply.')) }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(text)
  })
}

/**
 * Debounced per-thread refresh. `schedule(id, getInput, first)` waits `ms` of quiet, then asks once;
 * a newer schedule for the same thread replaces the pending one. `done(id, meta)` gets a parsed result.
 */
export function createTitler({ ask, done, ms = 1500 }) {
  const timers = new Map()
  const schedule = (id, getInput, first = '') => {
    clearTimeout(timers.get(id))
    timers.set(id, setTimeout(async () => {
      timers.delete(id)
      try {
        const meta = parseMeta(await ask(META_PROMPT, getInput()), first)
        if (meta) await done(id, meta)
      } catch { /* a failed title leaves the old one; the next run tries again */ }
    }, ms))
  }
  return { schedule, cancel: () => { for (const t of timers.values()) clearTimeout(t); timers.clear() } }
}

// --- per-thread store ---
export const ACTIONS = ['pin', 'unread', 'rename', 'fork', 'section', 'archive', 'delete']
const KEYS = ['pinned', 'unread', 'title', 'section', 'archived']

export function createThreadMeta(file) {
  let cache = null
  let queue = Promise.resolve()
  const load = async () => {
    if (cache) return cache
    try {
      const v = JSON.parse(await readFile(file, 'utf8'))
      cache = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
    } catch {
      cache = {}
    }
    return cache
  }
  /** Merge `patch` into one thread's entry; empty values clear the key. Writes are serialized. */
  const set = (path, patch) => {
    const run = queue.then(async () => {
      const all = await load()
      const next = { ...all[path] }
      for (const k of KEYS) if (k in patch) { if (patch[k] === false || patch[k] === '' || patch[k] == null) delete next[k]; else next[k] = patch[k] }
      if (Object.keys(next).length) all[path] = next
      else delete all[path]
      await mkdir(dirname(file), { recursive: true, mode: 0o700 })
      await writeFile(`${file}.tmp`, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 })
      await rename(`${file}.tmp`, file)
      return all[path] ?? {}
    })
    queue = run.catch(() => {})
    return run
  }
  /** Rows with their saved extras laid over: a manual title wins over the engine's. */
  const overlay = async rows => {
    const all = await load()
    return rows.map(r => {
      const m = all[r.path]
      return m ? { ...r, title: m.title || r.title, pinned: !!m.pinned, unread: !!m.unread, archived: !!m.archived, section: m.section || undefined } : r
    })
  }
  return { set, overlay, get: async path => (await load())[path] ?? {} }
}

/** Move a transcript into the trash folder under a time-stamped name. Never deletes. */
export async function trashFile(path, trashDir) {
  await mkdir(trashDir, { recursive: true, mode: 0o700 })
  const to = resolve(trashDir, `${Date.now()}-${basename(path)}`)
  try {
    await rename(path, to)
  } catch (e) {
    if (e.code !== 'EXDEV') throw e
    await copyFile(path, to)
    await unlink(path)
  }
  return to
}

/** Copy a Claude thread file to a new session id; `forkOf` makes the first run branch from the old history. */
export async function forkClaudeFile(path, id = randomUUID()) {
  const meta = JSON.parse(await readFile(path, 'utf8'))
  const to = resolve(dirname(path), `${id}.claude.json`)
  await writeFile(to, JSON.stringify({ ...meta, sessionId: id, forkOf: meta.sessionId, title: `${meta.title || 'Untitled'} (fork)` }, null, 2) + '\n', { mode: 0o600 })
  return to
}

/** Copy an OpenAI session (.jsonl) under a new id, rewriting the id on its header line. */
export async function forkSessionFile(path, id = randomUUID()) {
  const lines = (await readFile(path, 'utf8')).split('\n')
  try {
    const head = JSON.parse(lines[0])
    if (head?.type === 'session') lines[0] = JSON.stringify({ ...head, id })
  } catch {}
  const to = resolve(dirname(path), `${new Date().toISOString().replace(/[:.]/g, '-')}_${id}.jsonl`)
  await writeFile(to, lines.join('\n'), { mode: 0o600 })
  return to
}

/** Where a project can be opened. Finder is always there; the rest only when installed. */
export function openTargets(platform, exists) {
  const targets = [{ id: 'finder', label: platform === 'darwin' ? 'Finder' : 'File manager' }]
  if (platform !== 'darwin') return targets
  for (const [id, label, app] of [['terminal', 'Terminal', 'Terminal'], ['vscode', 'VS Code', 'Visual Studio Code'], ['cursor', 'Cursor', 'Cursor'], ['zed', 'Zed', 'Zed']]) {
    if (exists(`/Applications/${app}.app`) || (id === 'terminal' && exists('/System/Applications/Utilities/Terminal.app'))) targets.push({ id, label, app })
  }
  return targets
}
