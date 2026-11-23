// Markdown notes inside a project folder: titles, [[wikilinks]] and relative .md links, read-only.
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep, posix } from 'node:path'

const SKIP = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor', '__pycache__'])
const MAX_FILES = 2000
const MAX_DIRS = 5000
const MAX_BYTES = 512 * 1024
const NOTE = /\.(md|markdown)$/i

const stem = p => posix.basename(p).replace(NOTE, '')

export function titleOf(text, path) {
  const h = /^#\s+(.+)$/m.exec(text)
  return (h ? h[1] : stem(path)).trim()
}

/** Raw link targets: [[Name]], [[Name|alias]], [[Name#heading]] and [label](relative.md). Code is ignored. */
export function linksOf(text) {
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  const out = []
  for (const m of prose.matchAll(/\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g)) if (m[1].trim()) out.push({ wiki: m[1].trim() })
  for (const m of prose.matchAll(/\]\(([^)\s]+?\.(?:md|markdown))(?:#[^)]*)?\)/gi)) {
    if (/^[a-z]+:/i.test(m[1])) continue
    try { out.push({ rel: decodeURI(m[1]) }) } catch { out.push({ rel: m[1] }) } // bad % escapes just never resolve
  }
  return out
}

/** Resolves raw links against the note set: wikilinks by path or file name (case-insensitive), relative links by path. */
export function resolveLinks(notes) {
  const byPath = new Map(notes.map(n => [n.path.toLowerCase(), n.path]))
  const byName = new Map()
  for (const n of notes) if (!byName.has(stem(n.path).toLowerCase())) byName.set(stem(n.path).toLowerCase(), n.path)
  return notes.map(({ raw, ...n }) => {
    const links = new Set()
    for (const l of raw) {
      const hit = l.wiki
        ? byPath.get(l.wiki.toLowerCase()) ?? byPath.get(`${l.wiki}.md`.toLowerCase()) ?? byName.get(posix.basename(l.wiki).toLowerCase())
        : byPath.get(posix.normalize(posix.join(posix.dirname(n.path), l.rel)).toLowerCase())
      if (hit && hit !== n.path) links.add(hit)
    }
    return { ...n, links: [...links] }
  })
}

export async function scanNotes(root) {
  const files = []
  let dirs = 0
  async function walk(dir, depth) {
    // bounded by notes found and by folders visited, so a huge tree with few notes stops too
    if (files.length >= MAX_FILES || depth > 8 || ++dirs > MAX_DIRS) return
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (files.length >= MAX_FILES) return
      if (e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      // .app/.framework bundles are programs, not notes
      if (e.isDirectory()) { if (!SKIP.has(e.name) && !/\.(app|framework|bundle|xcarchive|photoslibrary)$/i.test(e.name)) await walk(p, depth + 1) }
      else if (e.isFile() && NOTE.test(e.name)) files.push(p)
    }
  }
  await walk(root, 0)
  const notes = []
  for (const f of files) {
    const s = await stat(f).catch(() => null)
    if (!s || s.size > MAX_BYTES) continue
    const text = await readFile(f, 'utf8').catch(() => null)
    if (text == null) continue
    const path = relative(root, f).split(sep).join('/')
    notes.push({ path, title: titleOf(text, path), modified: s.mtimeMs, raw: linksOf(text) })
  }
  return resolveLinks(notes)
}

/** True when file is strictly inside base (both already realpath'd); works when base is a filesystem root. */
export function inside(base, file) {
  const rel = relative(base, file)
  return !!rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}

/** Reads one note; the resolved file must stay inside the project (symlinks included) and be markdown. */
export async function readNote(root, path) {
  if (typeof path !== 'string' || !NOTE.test(path)) throw new Error('Not a markdown note.')
  const base = await realpath(root)
  const file = await realpath(resolve(base, path))
  if (!inside(base, file)) throw new Error('That note is outside the project.')
  const s = await stat(file)
  if (s.size > MAX_BYTES) throw new Error('That note is too large to open.')
  return readFile(file, 'utf8')
}
