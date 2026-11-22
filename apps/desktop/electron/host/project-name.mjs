// A short display name for a project, suggested by the model from what the folder holds.
// Used as the default the rename box falls back to; the folder name stays the fallback when this returns null.
import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'

const head = async (path, n) => { try { return (await readFile(path, 'utf8')).slice(0, n) } catch { return '' } }

/** What the model sees: folder name, top-level entries, README start, package/Cargo name and description. */
export async function projectContext(project) {
  let entries = []
  try { entries = (await readdir(project)).filter(e => !e.startsWith('.')).slice(0, 30) } catch {}
  const readme = entries.find(e => /^readme(\.md|\.txt)?$/i.test(e))
  let pkg = ''
  try { const p = JSON.parse(await head(join(project, 'package.json'), 20000)); pkg = [p.name, p.description].filter(Boolean).join(' — ') } catch {}
  const cargo = (await head(join(project, 'Cargo.toml'), 2000)).match(/^name\s*=\s*"([^"]+)"/m)?.[1] ?? ''
  return [
    `Folder: ${basename(project)}`,
    entries.length ? `Top-level: ${entries.join(', ')}` : '',
    pkg ? `package.json: ${pkg}` : '',
    cargo ? `Cargo.toml name: ${cargo}` : '',
    readme ? `README start:\n${await head(join(project, readme), 1200)}` : '',
  ].filter(Boolean).join('\n')
}

export const NAME_PROMPT =
  'Name this software project for a sidebar. Reply with the name only: 1 to 3 words, Title Case, no quotes, no punctuation at the ends, at most 28 characters. Prefer the product name the README or package uses; otherwise describe what it is.'

/** First line of the reply, cleaned; null when nothing usable came back. */
export function cleanName(reply) {
  const line = String(reply ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? ''
  const name = line.replace(/^(name|project)\s*:\s*/i, '').replace(/^["'`*#\s]+|["'`*.\s]+$/g, '').replace(/\s+/g, ' ')
  if (!name || name.length > 28 || name.split(' ').length > 4 || /[\x00-\x1f]/.test(name)) return null
  return name
}

/** ask(systemPrompt, text) -> reply text. Errors and unusable replies give null. */
export async function suggestName(project, ask) {
  try { return cleanName(await ask(NAME_PROMPT, await projectContext(project))) } catch { return null }
}
