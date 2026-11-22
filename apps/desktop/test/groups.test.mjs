import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const src = await readFile(new URL('../src/components/groups.ts', import.meta.url), 'utf8')
const { groupThreads } = await import('data:text/javascript,' + encodeURIComponent(stripTypeScriptTypes(src, { mode: 'transform' })))

test('running threads lead in their own group; the rest fall into date buckets', () => {
  const now = new Date(2026, 10, 22, 15).getTime(), H = 3_600_000
  const list = [
    { id: 'run', modified: now - 40 * 24 * H, live: true },
    { id: 'today', modified: now - 2 * H },
    { id: 'week', modified: now - 3 * 24 * H },
    { id: 'month', modified: now - 20 * 24 * H },
    { id: 'old', modified: now - 90 * 24 * H },
  ]
  const g = groupThreads(list, t => !!t.live, now)
  assert.deepEqual(g.map(([l, items]) => [l, items.map(t => t.id)]), [['In progress', ['run']], ['Today', ['today']], ['Last week', ['week']], ['Last month', ['month']], ['Older', ['old']]])
  // with nothing live the group is dropped, and the running thread falls back to its date
  assert.deepEqual(groupThreads(list, () => false, now).map(([l]) => l), ['Today', 'Last week', 'Last month', 'Older'])
  assert.deepEqual(groupThreads(list, () => false, now).at(-1)[1].map(t => t.id), ['run', 'old'])
})
