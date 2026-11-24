/// <reference types="vite/client" />
import hljs from 'highlight.js/lib/common'

// File type icons from Material Icon Theme (MIT), see src/assets/filetypes/NOTICE.md.
const urls = import.meta.glob('../../assets/filetypes/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const ICON: Record<string, string> = Object.fromEntries(Object.entries(urls).map(([path, url]) => [path.split('/').pop()!.replace(/\.svg$/, ''), url]))

const BY_NAME: Record<string, string> = {
  'package.json': 'nodejs', 'package-lock.json': 'nodejs', 'bun.lock': 'bun', 'bun.lockb': 'bun', 'bunfig.toml': 'bun', 'tsconfig.json': 'tsconfig', 'jsconfig.json': 'tsconfig',
  'readme.md': 'readme', readme: 'readme', license: 'license', 'license.md': 'license', 'license.txt': 'license', dockerfile: 'docker', '.dockerignore': 'docker',
  '.gitignore': 'git', '.gitattributes': 'git', '.gitmodules': 'git', '.npmrc': 'npm', '.prettierrc': 'prettier', '.eslintrc': 'eslint', '.env': 'tune', '.env.example': 'tune',
  'pnpm-lock.yaml': 'lock', 'yarn.lock': 'lock', 'cargo.lock': 'lock',
}
const BY_EXT: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', mts: 'typescript', cts: 'typescript', jsx: 'react', tsx: 'react_ts',
  json: 'json', jsonc: 'json', md: 'markdown', mdx: 'markdown', css: 'css', scss: 'sass', sass: 'sass', html: 'html', htm: 'html', xml: 'xml', svg: 'svg',
  py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', rb: 'ruby', php: 'php', swift: 'swift', lua: 'lua', c: 'c', h: 'h', cpp: 'cpp', cc: 'cpp', hpp: 'h',
  yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'settings', conf: 'settings', cfg: 'settings', lock: 'lock', sh: 'console', bash: 'console', zsh: 'console', fish: 'console', ps1: 'powershell',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', ico: 'image', icns: 'image', mp4: 'video', mov: 'video', webm: 'video', mp3: 'audio', wav: 'audio',
  woff: 'font', woff2: 'font', ttf: 'font', otf: 'font', pdf: 'pdf', zip: 'zip', gz: 'zip', tgz: 'zip', dmg: 'zip', sql: 'database', db: 'database', sqlite: 'database',
  vue: 'vue', svelte: 'svelte', txt: 'document', log: 'document', csv: 'document',
}
const ext = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '')

export function iconFor(name: string, dir = false, open = false) {
  if (dir) return ICON[open ? 'folder-open' : 'folder']
  const base = name.toLowerCase()
  const key = BY_NAME[base] ?? (/^vite\.config\./.test(base) ? 'vite' : /^\.?eslint/.test(base) ? 'eslint' : /^\.?prettier/.test(base) ? 'prettier' : /^\.env\./.test(base) ? 'tune' : BY_EXT[ext(base)])
  return ICON[key ?? 'file'] ?? ICON.file
}

export function FileIcon({ name, dir, open, size = 15 }: { name: string; dir?: boolean; open?: boolean; size?: number }) {
  return <img className="ft-icon" src={iconFor(name, dir, open)} width={size} height={size} alt="" draggable={false} />
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const ALIAS: Record<string, string> = { mjs: 'javascript', cjs: 'javascript', mts: 'typescript', cts: 'typescript', jsonc: 'json', mdx: 'markdown', zsh: 'bash', fish: 'bash', htm: 'xml', svg: 'xml', vue: 'xml', svelte: 'xml' }
export function languageOf(path: string) {
  const e = ext(path.split('/').pop() ?? '')
  const lang = ALIAS[e] ?? e
  return lang && hljs.getLanguage(lang) ? lang : ''
}

/** Highlighted HTML for a piece of code; plain escaped text when the language is unknown or the text is very large. */
export function highlight(text: string, language: string) {
  if (!language || text.length > 300_000) return escape(text)
  try { return hljs.highlight(text, { language, ignoreIllegals: true }).value } catch { return escape(text) }
}

export type DiffRow = { t: ' ' | '+' | '-' | '@'; n: number; s: string }
export type FileDiff = { path: string; dir: string; name: string; status: '' | 'Added' | 'Deleted' | 'Renamed'; add: number; del: number; binary: boolean; rows: DiffRow[] }

/** Hunk lines with their line numbers: the new file's for context and additions, the old file's for removals. */
export function hunkRows(body: string): DiffRow[] {
  const rows: DiffRow[] = []
  let o = 0, n = 0
  for (const line of body.split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(line)
    if (h) {
      o = +h[1]; n = +h[2]
      if (rows.length || Math.max(o, n) > 1) rows.push({ t: '@', n: 0, s: h[3] })
    } else if (line[0] === '+') rows.push({ t: '+', n: n++, s: line.slice(1) })
    else if (line[0] === '-') rows.push({ t: '-', n: o++, s: line.slice(1) })
    else if (line[0] === ' ' || (line === '' && (o || n))) { rows.push({ t: ' ', n: n++, s: line.slice(1) }); o++ }
  }
  while (rows.length && rows[rows.length - 1].t === ' ' && rows[rows.length - 1].s === '' ) rows.pop()
  return rows
}

function fileDiff(path: string, rows: DiffRow[], status: FileDiff['status'] = '', binary = false): FileDiff {
  const cut = path.lastIndexOf('/')
  return { path, dir: cut >= 0 ? path.slice(0, cut + 1) : '', name: path.slice(cut + 1), status, binary, rows, add: rows.filter(r => r.t === '+').length, del: rows.filter(r => r.t === '-').length }
}

/** Splits `git diff` output into one entry per file. */
export function splitPatch(patch: string): FileDiff[] {
  return patch.split(/^(?=diff --git )/m).filter(p => p.startsWith('diff --git ')).map(part => {
    const added = /^\+\+\+ b\/(.+)$/m.exec(part)?.[1]
    const path = added ?? /^--- a\/(.+)$/m.exec(part)?.[1] ?? /^diff --git a\/(.+?) b\//.exec(part)?.[1] ?? ''
    const at = part.search(/^@@/m)
    const status = /^new file mode/m.test(part) ? 'Added' : /^deleted file mode/m.test(part) ? 'Deleted' : /^rename from/m.test(part) ? 'Renamed' : ''
    return fileDiff(path, at >= 0 ? hunkRows(part.slice(at)) : [], status, /^Binary files /m.test(part))
  })
}

/** The edits one agent turn made, grouped by file (several edits to a file read as one diff). */
export function turnDiffs(edits: { path: string; patch: string }[], project: string): FileDiff[] {
  const byPath = new Map<string, DiffRow[]>()
  const root = project.replace(/\\/g, '/').replace(/\/$/, '') + '/'
  for (const e of edits) {
    const full = e.path.replace(/\\/g, '/')
    const path = full.startsWith(root) ? full.slice(root.length) : full
    const at = e.patch.search(/^@@/m)
    const rows = hunkRows(at >= 0 ? e.patch.slice(at) : e.patch)
    const have = byPath.get(path)
    if (have) have.push({ t: '@', n: 0, s: '' }, ...rows.filter((r, i) => !(i === 0 && r.t === '@')))
    else byPath.set(path, rows)
  }
  return [...byPath].map(([path, rows]) => fileDiff(path, rows))
}
