import test from 'node:test'
import assert from 'node:assert/strict'
import { baseName, displayName, threadsByProject } from '../src/components/groups.ts'

test('threads nest under their project, newest first; unknown projects fall to other', () => {
  const list = [
    { id: 'a', project: '/p/one', modified: 1 },
    { id: 'b', project: '/p/two', modified: 5 },
    { id: 'c', project: '/p/one', modified: 9 },
    { id: 'd', project: '/gone', modified: 3 },
  ]
  const { byProject, other } = threadsByProject(list, ['/p/one', '/p/two', '/p/empty'])
  assert.deepEqual(byProject.get('/p/one').map(t => t.id), ['c', 'a'])
  assert.deepEqual(byProject.get('/p/two').map(t => t.id), ['b'])
  assert.deepEqual(byProject.get('/p/empty'), [])
  assert.deepEqual(other.map(t => t.id), ['d'])
  assert.deepEqual(threadsByProject([], []).other, [])
})

test('display name falls back to the folder name when unset or blank', () => {
  assert.equal(baseName('/a/b/site/'), 'site')
  assert.equal(displayName(undefined, '/a/b/site'), 'site')
  assert.equal(displayName({ '/a/b/site': 'Marketing' }, '/a/b/site'), 'Marketing')
  assert.equal(displayName({ '/a/b/site': '  ' }, '/a/b/site'), 'site')
  assert.equal(displayName({ '/other': 'x' }, '/a/b/site'), 'site')
})
