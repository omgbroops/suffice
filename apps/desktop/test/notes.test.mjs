import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inside, linksOf, readNote, scanNotes } from '../electron/host/notes.mjs'

test('links: wikilinks with alias and heading, relative md links, nothing from code or the web', () => {
  const raw = linksOf('See [[Queue worker|the worker]] and [[retry#backoff]].\n[spec](../docs/spec.md) [site](https://x.dev/a.md)\n```\n[[not a link]]\n```\n`[[nor this]]`')
  assert.deepEqual(raw, [{ wiki: 'Queue worker' }, { wiki: 'retry' }, { rel: '../docs/spec.md' }])
})

test('scan resolves links by name and path, skips hidden and vendored folders', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sfx-notes-')))
  try {
    await mkdir(join(root, 'docs'))
    await mkdir(join(root, 'node_modules'))
    await mkdir(join(root, '.git'))
    await writeFile(join(root, 'README.md'), '# Harbor\nStart at [[Queue worker]] and [the spec](docs/spec.md). [[Missing]]')
    await writeFile(join(root, 'docs/Queue worker.md'), 'Retries use [[spec]]; back to [[README]].')
    await writeFile(join(root, 'docs/spec.md'), '# Spec\nNo links.')
    await writeFile(join(root, 'node_modules/x.md'), '[[README]]')
    await writeFile(join(root, '.git/y.md'), '[[README]]')
    const notes = await scanNotes(root)
    const by = Object.fromEntries(notes.map(n => [n.path, n]))
    assert.deepEqual(Object.keys(by).sort(), ['README.md', 'docs/Queue worker.md', 'docs/spec.md'])
    assert.equal(by['README.md'].title, 'Harbor')
    assert.equal(by['docs/Queue worker.md'].title, 'Queue worker')
    assert.deepEqual(by['README.md'].links.sort(), ['docs/Queue worker.md', 'docs/spec.md'])
    assert.deepEqual(by['docs/Queue worker.md'].links.sort(), ['README.md', 'docs/spec.md'])
    assert.deepEqual(by['docs/spec.md'].links, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('readNote refuses paths and symlinks that leave the project, and non-markdown files', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sfx-notes-')))
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'sfx-notes-out-')))
  try {
    await writeFile(join(root, 'a.md'), 'hello')
    await writeFile(join(root, 'secret.txt'), 'no')
    await writeFile(join(outside, 'b.md'), 'outside')
    await symlink(join(outside, 'b.md'), join(root, 'link.md'))
    assert.equal(await readNote(root, 'a.md'), 'hello')
    await assert.rejects(readNote(root, '../' + outside.split('/').pop() + '/b.md'), /outside the project/)
    await assert.rejects(readNote(root, 'link.md'), /outside the project/)
    await assert.rejects(readNote(root, 'secret.txt'), /Not a markdown note/)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('containment holds when the project is the filesystem root', () => {
  // the old startsWith(base + sep) check rejected everything under '/'
  assert.equal(inside('/', '/notes/a.md'), true)
  assert.equal(inside('/proj', '/proj/a.md'), true)
  assert.equal(inside('/proj', '/proj2/a.md'), false)
  assert.equal(inside('/proj', '/proj'), false)
  assert.equal(inside('/proj', '/proj/..notes.md'), true)
})
