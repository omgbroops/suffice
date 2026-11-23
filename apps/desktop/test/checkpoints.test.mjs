import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile, readFile, mkdir, access, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { capture, diff, restore, list, drop } from '../electron/host/checkpoints.mjs'

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const git = (cwd, ...a) => execFileSync('git', a, { cwd, env, encoding: 'utf8' })
const exists = p => access(p).then(() => true, () => false)

async function repo(t, { commit = true, dir = 'r' } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'ckpt-')))
  t.after(() => rm(base, { recursive: true, force: true }))
  const cwd = join(base, dir)
  await mkdir(cwd)
  git(cwd, 'init', '-q')
  if (commit) {
    await writeFile(join(cwd, 'a.txt'), 'a\n')
    await writeFile(join(cwd, 'gone.txt'), 'gone\n')
    await writeFile(join(cwd, '.gitignore'), 'ignored.log\n')
    git(cwd, 'add', '-A'); git(cwd, 'commit', '-qm', 'init')
  }
  return cwd
}
const state = cwd => [git(cwd, 'status', '--porcelain'), git(cwd, 'diff', '--cached'), git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD'), git(cwd, 'stash', 'list')]

test('capture leaves status, index, HEAD, branch, stash untouched', async t => {
  const cwd = await repo(t)
  await writeFile(join(cwd, 'a.txt'), 'changed\n'); git(cwd, 'add', 'a.txt')
  await writeFile(join(cwd, 'new.txt'), 'n\n')
  const head = git(cwd, 'rev-parse', 'HEAD'), before = state(cwd)
  const c = await capture(cwd, 's1', 'one')
  assert.match(c.commit, /^[0-9a-f]{40}$/)
  assert.ok(c.ref.startsWith('refs/suffice/checkpoints/'))
  assert.deepEqual(state(cwd), before)
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), head)
  assert.match(git(cwd, 'ls-tree', '-r', '--name-only', c.commit), /new\.txt/)
})

test('diff: modify, add, delete, untracked, binary, working tree and ref-to-ref', async t => {
  const cwd = await repo(t)
  const c = await capture(cwd, 's', 'base')
  await writeFile(join(cwd, 'a.txt'), 'b\n')
  await writeFile(join(cwd, 'new.txt'), 'new\n')
  await writeFile(join(cwd, 'bin.dat'), Buffer.from([0, 1, 2, 0, 255]))
  git(cwd, 'rm', '-q', 'gone.txt')
  const d = await diff(cwd, c.ref)
  assert.match(d, /^\+b$/m)
  assert.match(d, /^diff --git a\/new\.txt b\/new\.txt/m)
  assert.match(d, /^deleted file mode/m)
  assert.match(d, /Binary files .*differ/)
  const c2 = await capture(cwd, 's', 'two')
  assert.equal(await diff(cwd, c.ref, c2.ref), d)
  assert.equal(await diff(cwd, c2.ref), '')
})

test('diff detects renames', async t => {
  const cwd = await repo(t)
  const c = await capture(cwd, 's', 'base')
  git(cwd, 'mv', 'a.txt', 'renamed.txt')
  assert.match(await diff(cwd, c.ref), /^rename from a\.txt$/m)
})

test('restore round trip: new removed, deleted back, modified reverted, ignored kept, index kept', async t => {
  const cwd = await repo(t)
  await writeFile(join(cwd, 'ignored.log'), 'keep\n')
  const c = await capture(cwd, 's', 'base')
  await writeFile(join(cwd, 'a.txt'), 'modified\n')
  git(cwd, 'rm', '-q', 'gone.txt')
  await mkdir(join(cwd, 'sub')); await writeFile(join(cwd, 'sub', 'new.txt'), 'x\n')
  await writeFile(join(cwd, 'top.txt'), 'x\n')
  await writeFile(join(cwd, 'ignored.log'), 'edited-ignored\n')
  git(cwd, 'add', 'top.txt')
  const idx = git(cwd, 'diff', '--cached')
  assert.equal(await restore(cwd, c.ref), true)
  assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'a\n')
  assert.equal(await readFile(join(cwd, 'gone.txt'), 'utf8'), 'gone\n')
  assert.equal(await exists(join(cwd, 'sub', 'new.txt')), false)
  assert.equal(await exists(join(cwd, 'top.txt')), false)
  assert.equal(await readFile(join(cwd, 'ignored.log'), 'utf8'), 'edited-ignored\n')
  assert.equal(git(cwd, 'diff', '--cached'), idx)
  assert.match(git(cwd, 'diff', '--cached', '--name-only'), /top\.txt/)
})

test('restore puts back the working tree even when the snapshot had unstaged edits', async t => {
  const cwd = await repo(t)
  await writeFile(join(cwd, 'a.txt'), 'wip\n')
  const c = await capture(cwd, 's', 'wip')
  await writeFile(join(cwd, 'a.txt'), 'later\n')
  await restore(cwd, c.ref)
  assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'wip\n')
})

test('repo with no commits yet', async t => {
  const cwd = await repo(t, { commit: false })
  await writeFile(join(cwd, 'x.txt'), '1\n')
  const c = await capture(cwd, 's', 'empty')
  assert.ok(c)
  await writeFile(join(cwd, 'y.txt'), '2\n'); await writeFile(join(cwd, 'x.txt'), '9\n')
  assert.match(await diff(cwd, c.ref), /^\+2$/m)
  await restore(cwd, c.ref)
  assert.equal(await exists(join(cwd, 'y.txt')), false)
  assert.equal(await readFile(join(cwd, 'x.txt'), 'utf8'), '1\n')
})

test('non-git folder returns null', async t => {
  const base = await mkdtemp(join(tmpdir(), 'ckpt-ng-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  assert.equal(await capture(base, 's', 'n'), null)
})

test('path with spaces and unicode file names', async t => {
  const cwd = await repo(t, { dir: 'my proj é' })
  const c = await capture(cwd, 's', 'base')
  await writeFile(join(cwd, 'naïve file ✓.txt'), 'u\n')
  assert.match(await diff(cwd, c.ref), /naïve file ✓\.txt/)
  await restore(cwd, c.ref)
  assert.equal(await exists(join(cwd, 'naïve file ✓.txt')), false)
})

test('scopes are isolated; list and drop', async t => {
  const cwd = await repo(t)
  await capture(cwd, 'A', 'one'); await capture(cwd, 'A', 'two'); await capture(cwd, 'B', 'one')
  assert.deepEqual((await list(cwd, 'A')).map(c => c.name).sort(), ['one', 'two'])
  assert.deepEqual((await list(cwd, 'B')).map(c => c.name), ['one'])
  assert.equal(await drop(cwd, 'A', 'one'), 1)
  assert.deepEqual((await list(cwd, 'A')).map(c => c.name), ['two'])
  await drop(cwd, 'A')
  assert.deepEqual(await list(cwd, 'A'), [])
  assert.equal((await list(cwd, 'B')).length, 1)
})
