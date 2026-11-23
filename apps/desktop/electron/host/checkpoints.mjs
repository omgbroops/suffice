// Git checkpoints: snapshot the working tree under refs/suffice/checkpoints/<scope>/<name>
// without touching the user's index, HEAD, branch, stash or files.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyFile, mkdtemp, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

const run = promisify(execFile)
const PREFIX = 'refs/suffice/checkpoints'
const ident = {
  GIT_AUTHOR_NAME: 'Suffice', GIT_AUTHOR_EMAIL: 'suffice@localhost',
  GIT_COMMITTER_NAME: 'Suffice', GIT_COMMITTER_EMAIL: 'suffice@localhost',
}

const defaultGit = async (cwd, args, env) => {
  const { stdout } = await run('git', args, {
    cwd, env: { ...ident, ...process.env, ...env }, maxBuffer: 256 * 1024 * 1024,
  })
  return stdout
}

const scopeDir = (scope) => `${PREFIX}/${Buffer.from(String(scope)).toString('base64url')}`

async function root(cwd, git) {
  try {
    if ((await git(cwd, ['rev-parse', '--is-inside-work-tree'])).trim() !== 'true') return null
    return (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
  } catch { return null }
}

const hasHead = (cwd, git) => git(cwd, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']).then(() => true, () => false)

// Runs fn(env) with a scratch index seeded from HEAD, then `add -A` (respects .gitignore).
async function withScratch(cwd, git, fn, seed = 'HEAD') {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-idx-'))
  const env = { GIT_INDEX_FILE: join(dir, 'index') }
  try {
    if (seed === 'HEAD') { if (await hasHead(cwd, git)) await git(cwd, ['read-tree', 'HEAD'], env) }
    else await git(cwd, ['read-tree', seed], env)
    return await fn(env)
  } finally { await rm(dir, { recursive: true, force: true }) }
}

// Seeds the scratch index from a copy of the user's index, so `add -A` reuses its stat cache
// instead of rehashing every file (t3code does the same); add -A then makes it match the work tree.
async function workTree(cwd, git) {
  return withScratch(cwd, git, async (env) => {
    const p = (await git(cwd, ['rev-parse', '--git-path', 'index'])).trim()
    await copyFile(isAbsolute(p) ? p : join(cwd, p), env.GIT_INDEX_FILE).catch(() => {})
    await git(cwd, ['add', '-A'], env)
    return (await git(cwd, ['write-tree'], env)).trim()
  })
}

export async function capture(cwd, scope, name, git = defaultGit) {
  const top = await root(cwd, git)
  if (!top) return null
  const tree = await workTree(top, git)
  const parent = (await hasHead(top, git)) ? ['-p', 'HEAD'] : []
  const commit = (await git(top, ['commit-tree', tree, ...parent, '-m', `suffice checkpoint ${name}`])).trim()
  const ref = `${scopeDir(scope)}/${name}`
  await git(top, ['update-ref', ref, commit])
  return { ref, commit }
}

export async function diff(cwd, fromRef, toRef, git = defaultGit) {
  const top = await root(cwd, git)
  if (!top) return null
  const to = toRef ? `${toRef}^{tree}` : await workTree(top, git)
  return git(top, ['-c', 'core.quotepath=false', 'diff', '--no-ext-diff', '--no-color', '-M', `${fromRef}^{tree}`, to])
}

export async function restore(cwd, ref, git = defaultGit) {
  const top = await root(cwd, git)
  if (!top) return false
  const snap = (await git(top, ['rev-parse', `${ref}^{tree}`])).trim()
  const cur = await workTree(top, git)
  const added = (await git(top, ['diff-tree', '-r', '-z', '--no-renames', '--name-only', '--diff-filter=A', snap, cur])).split('\0').filter(Boolean)
  // Write snapshot files via a scratch index so the user's index stays as it was.
  await withScratch(top, git, (env) => git(top, ['checkout-index', '-a', '-f'], env), snap)
  for (const f of added) await unlink(join(top, f)).catch(() => {})
  return true
}

export async function list(cwd, scope, git = defaultGit) {
  const top = await root(cwd, git)
  if (!top) return []
  const out = await git(top, ['for-each-ref', '--format=%(refname) %(objectname)', `${scopeDir(scope)}/`])
  return out.split('\n').filter(Boolean).map((l) => {
    const [ref, commit] = l.split(' ')
    return { ref, commit, name: ref.slice(scopeDir(scope).length + 1) }
  })
}

export async function drop(cwd, scope, name, git = defaultGit) {
  const top = await root(cwd, git)
  if (!top) return 0
  const refs = (await list(top, scope, git)).filter((c) => name === undefined || c.name === name)
  for (const c of refs) await git(top, ['update-ref', '-d', c.ref])
  return refs.length
}
