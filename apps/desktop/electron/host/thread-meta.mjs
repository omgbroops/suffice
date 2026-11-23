// Per-thread extras the engines know nothing about: pin, unread, rename, section, archive.
// Stored in <home>/desktop/threads.json keyed by the thread's session path.
// Fork and delete live here too: they only copy or move files, never hard delete.

import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, resolve } from 'node:path'

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
