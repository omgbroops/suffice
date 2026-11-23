// A thread's title and evolving description, written by a cheap model after each run.
// Never blocks a run: the host calls `schedule` and moves on.

import { spawn as nodeSpawn } from 'node:child_process'
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
