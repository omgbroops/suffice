// The user-level resources the harness loads from the Suffice home: MCP
// servers (mcp.json), skills, prompt templates and extensions. Skills and
// templates are switched off through resource-state.json, which the harness
// reads when a session starts; MCP servers through their `enabled` field.

import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

async function json(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT' || e instanceof SyntaxError) return fallback
    throw e
  }
}

async function save(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  await rename(temporary, path)
}

const entries = dir => readdir(dir, { withFileTypes: true }).catch(() => [])

/** `name:` and `description:` from a Markdown file's front matter. */
function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const field = k => m && new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(m[1])?.[1].trim().replace(/^["']|["']$/g, '')
  return { name: field('name'), description: field('description') }
}

async function skillAt(dir) {
  try {
    const meta = frontMatter(await readFile(join(dir, 'SKILL.md'), 'utf8'))
    return { name: meta.name || basename(dir), detail: meta.description || dir, path: dir }
  } catch {
    return null
  }
}

async function skills(home, extra) {
  const found = []
  for (const e of await entries(resolve(home, 'skills'))) if (e.isDirectory() || e.isSymbolicLink()) found.push(await skillAt(resolve(home, 'skills', e.name)))
  for (const path of extra) found.push((await skillAt(path)) ?? null)
  return found.filter(Boolean)
}

async function templates(home, extra) {
  const dirs = [resolve(home, 'prompts'), ...extra]
  const found = []
  for (const dir of dirs)
    for (const e of await entries(dir))
      if (e.isFile() && extname(e.name) === '.md') {
        const path = join(dir, e.name)
        const meta = frontMatter(await readFile(path, 'utf8').catch(() => ''))
        found.push({ name: basename(e.name, '.md'), detail: meta.description || path, path })
      }
  return found
}

async function extensions(home, settings) {
  const found = []
  for (const e of await entries(resolve(home, 'extensions'))) found.push({ name: e.name, detail: resolve(home, 'extensions', e.name), path: resolve(home, 'extensions', e.name) })
  for (const path of settings.extensions ?? []) if (typeof path === 'string') found.push({ name: basename(path), detail: path, path })
  for (const pkg of settings.packages ?? []) {
    const source = typeof pkg === 'string' ? pkg : pkg?.source
    if (source) found.push({ name: source, detail: 'Installed package', path: null })
  }
  return found
}

export async function listResources(home) {
  const [state, settings, mcp] = await Promise.all([json(resolve(home, 'resource-state.json'), {}), json(resolve(home, 'settings.json'), {}), json(resolve(home, 'mcp.json'), {})])
  const strings = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : [])
  const on = (kind, name) => state[kind]?.[name] !== false
  return {
    mcps: Object.entries(mcp.mcpServers ?? {}).map(([name, c]) => ({ name, detail: c?.url ?? [c?.command, ...(c?.args ?? [])].filter(Boolean).join(' '), enabled: c?.enabled !== false })),
    skills: (await skills(home, strings(settings.skills))).map(s => ({ ...s, enabled: on('skills', s.name) })),
    templates: (await templates(home, strings(settings.prompts))).map(t => ({ ...t, enabled: on('templates', t.name) })),
    extensions: await extensions(home, settings),
    folders: { mcps: resolve(home, 'mcp.json'), skills: resolve(home, 'skills'), templates: resolve(home, 'prompts'), extensions: resolve(home, 'extensions') },
  }
}

/** Turn one resource on or off. New sessions pick the change up. */
export async function toggleResource(home, { kind, name, enabled }) {
  if (kind === 'mcps') {
    const path = resolve(home, 'mcp.json')
    const mcp = await json(path, {})
    const server = mcp.mcpServers?.[name]
    if (!server) throw new Error(`No MCP server named ${name}.`)
    if (enabled) delete server.enabled
    else server.enabled = false
    await save(path, mcp)
  } else if (kind === 'skills' || kind === 'templates') {
    const path = resolve(home, 'resource-state.json')
    const state = await json(path, {})
    state[kind] = { ...state[kind] }
    if (enabled) delete state[kind][name]
    else state[kind][name] = false
    await save(path, state)
  } else throw new Error('This resource cannot be switched off here.')
  return listResources(home)
}
