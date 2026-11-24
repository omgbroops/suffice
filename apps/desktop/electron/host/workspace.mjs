// What the right panel reads from a project folder: its uncommitted changes, its file tree, and one file's text.
// Every path is resolved (symlinks included) and must stay inside the project.
import { execFile } from 'node:child_process'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { findBin } from './accounts.mjs'
import { inside } from './notes.mjs'

const MAX_PATCH = 2 << 20
const MAX_FILE = 512 << 10
const MAX_UNTRACKED = 40
const MAX_ENTRIES = 600
const MAX_FILES = 8000

// `git diff --no-index` exits 1 when files differ, so output counts even when the exit code is not 0
const git = (cwd, args) => new Promise(res => execFile(findBin('git') ?? 'git', args, { cwd, timeout: 15000, maxBuffer: 16 << 20 }, (err, out) => res(err && !out ? null : String(out))))

async function within(project, path = '') {
  if (typeof path !== 'string' || path.length > 4000) throw new Error('Invalid path.')
  const base = await realpath(project)
  const file = await realpath(resolve(base, path))
  if (file !== base && !inside(base, file)) throw new Error('That path is outside the project.')
  return file
}

const isText = buf => !buf.subarray(0, 8000).includes(0)

/** Uncommitted work against HEAD as one unified patch; untracked text files are appended as additions. */
const SCOPES = ['all', 'staged', 'unstaged', 'commit']

/**
 * A unified patch for one scope: 'all' is uncommitted work against HEAD (untracked text files appended as additions),
 * 'staged' and 'unstaged' are its two halves, 'commit' is the last commit.
 */
export async function changes(project, { scope = 'all', ignoreWhitespace = false } = {}) {
  if (!SCOPES.includes(scope)) throw new Error('Unknown scope.')
  const root = await within(project)
  if ((await git(root, ['rev-parse', '--is-inside-work-tree']))?.trim() !== 'true') return { git: false, patch: '' }
  const args = ['--no-color', '--no-ext-diff', '-M', ...(ignoreWhitespace ? ['-w'] : [])]
  if (scope === 'commit') return { git: true, patch: ((await git(root, ['show', '--format=', ...args, 'HEAD'])) ?? '').slice(0, MAX_PATCH) }
  if (scope === 'staged') return { git: true, patch: ((await git(root, ['diff', '--cached', ...args])) ?? '').slice(0, MAX_PATCH) }
  let patch = (scope === 'all' ? await git(root, ['diff', 'HEAD', ...args]) : null) ?? (await git(root, ['diff', ...args])) ?? ''
  const untracked = ((await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])) ?? '').split('\0').filter(Boolean)
  for (const name of untracked.slice(0, MAX_UNTRACKED)) {
    if (patch.length > MAX_PATCH) break
    try {
      const file = await within(root, name)
      const info = await stat(file)
      if (!info.isFile()) continue
      const head = `diff --git a/${name} b/${name}\nnew file mode 100644\n--- /dev/null\n+++ b/${name}\n`
      const buf = info.size <= MAX_FILE ? await readFile(file) : null
      if (!buf || !isText(buf)) { patch += `${head}Binary files differ\n`; continue }
      const lines = buf.toString('utf8').replace(/\n$/, '').split('\n')
      patch += `${head}@@ -0,0 +1,${lines.length} @@\n${lines.map(l => '+' + l).join('\n')}\n`
    } catch {} // a file that vanished or cannot be read is left out
  }
  return { git: true, patch: patch.slice(0, MAX_PATCH), truncated: patch.length > MAX_PATCH || untracked.length > MAX_UNTRACKED }
}

/** One folder's entries, folders first; `.git` is left out. */
export async function list(project, dir = '') {
  const entries = await readdir(await within(project, dir), { withFileTypes: true })
  return entries
    .filter(e => e.name !== '.git' && (e.isDirectory() || e.isFile()))
    .map(e => ({ name: e.name, dir: e.isDirectory() }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
    .slice(0, MAX_ENTRIES)
}

/** Every file path in the project for the filter box: git's own list (tracked and untracked, ignores applied), else a bounded walk. */
export async function files(project) {
  const root = await within(project)
  const listed = await git(root, ['ls-files', '-co', '--exclude-standard', '-z'])
  if (listed !== null) return listed.split('\0').filter(Boolean).slice(0, MAX_FILES)
  const out = []
  const walk = async (dir, depth) => {
    if (out.length >= MAX_FILES || depth > 8) return
    for (const e of await readdir(resolve(root, dir), { withFileTypes: true }).catch(() => [])) {
      if (e.name === '.git' || e.name === 'node_modules') continue
      const path = dir ? `${dir}/${e.name}` : e.name
      if (e.isDirectory()) await walk(path, depth + 1)
      else if (e.isFile() && out.push(path) >= MAX_FILES) return
    }
  }
  await walk('', 0)
  return out
}

/** One file's text, or why it is not shown. */
export async function read(project, path) {
  const file = await within(project, path)
  const info = await stat(file)
  if (!info.isFile()) throw new Error('Not a file.')
  if (info.size > MAX_FILE) return { text: '', skipped: 'too-big' }
  const buf = await readFile(file)
  return isText(buf) ? { text: buf.toString('utf8') } : { text: '', skipped: 'binary' }
}
