// Fails (exit 1, file:line) when a relative import/export in apps/desktop/{src,electron,shared}
// points at a missing file or names an export the target does not have.
// shortcut: regex scan, not a parser; `export *` targets are not followed (named imports through them are accepted).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const roots = ['src', 'electron', 'shared'].map(d => join(root, 'apps/desktop', d))
const SRC = /\.(mjs|cjs|js|ts|tsx|jsx)$/

function walk(d) {
  return readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(join(d, e.name))) : SRC.test(e.name) && !/\.d\.m?ts$/.test(e.name) ? [join(d, e.name)] : [])
}
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')

function resolveSpec(from, spec) {
  const base = resolve(dirname(from), spec)
  const tries = [base, ...['.ts', '.tsx', '.mjs', '.js', '.cjs'].map(e => base + e), ...['index.ts', 'index.tsx', 'index.mjs', 'index.js'].map(f => join(base, f))]
  return tries.find(p => existsSync(p) && statSync(p).isFile())
}

const cache = new Map()
function exportsOf(file) {
  if (cache.has(file)) return cache.get(file)
  // a sibling .d.mts/.d.ts declares the types; count its exports too
  const dts = file.replace(/\.(m?)(js|ts)$/, '.d.$1ts')
  const t = strip(readFileSync(file, 'utf8') + (dts !== file && existsSync(dts) ? '\n' + readFileSync(dts, 'utf8') : '')), names = new Set()
  let star = false
  for (const m of t.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|type|interface|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of t.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/g))
    for (const p of m[1].split(',')) { const n = p.trim().split(/\s+as\s+/).pop(); if (n) names.add(n) }
  if (/export\s*\*\s*(?!as)/.test(t)) star = true
  for (const m of t.matchAll(/export\s*\*\s*as\s+([\w$]+)/g)) names.add(m[1])
  if (/export\s+default\b/.test(t)) names.add('default')
  if (/\bmodule\.exports\b|\bexports\./.test(t)) star = true // CommonJS: names unknowable
  const r = { names, star }
  cache.set(file, r)
  return r
}

const errors = []
const line = (t, i) => t.slice(0, i).split('\n').length
for (const file of roots.filter(existsSync).flatMap(walk)) {
  const text = strip(readFileSync(file, 'utf8'))
  const rel = relative(root, file)
  const specs = [
    ...[...text.matchAll(/\b(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"](\.[^'"]*)['"]/g)].map(m => ({ i: m.index, clause: m[2], spec: m[3] })),
    ...[...text.matchAll(/\bimport\s*['"](\.[^'"]*)['"]/g)].map(m => ({ i: m.index, clause: '', spec: m[1] })),
    ...[...text.matchAll(/\bimport\(\s*['"](\.[^'"]*)['"]\s*\)/g)].map(m => ({ i: m.index, clause: '', spec: m[1] })),
  ]
  for (const { i, clause, spec } of specs) {
    const at = `${rel}:${line(text, i)}`
    const bare = spec.split(/[?#]/)[0]
    if (!SRC.test(bare) && /\.[a-z0-9]+$/i.test(bare) && !/\.(mjs|cjs|js|ts|tsx|jsx)$/.test(bare)) {
      if (!existsSync(resolve(dirname(file), bare))) errors.push(`${at}: missing file ${spec}`)
      continue
    }
    const target = resolveSpec(file, bare)
    if (!target) { errors.push(`${at}: cannot resolve ${spec}`); continue }
    const named = /\{([^}]*)\}/.exec(clause)
    if (!named || !SRC.test(target)) continue
    const { names, star } = exportsOf(target)
    if (star) continue
    for (const p of named[1].split(',')) {
      const n = p.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
      if (n && !names.has(n)) errors.push(`${at}: '${n}' is not exported by ${spec}`)
    }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log('check-imports: ok')
