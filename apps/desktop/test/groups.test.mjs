import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const src = await readFile(new URL('../src/components/groups.ts', import.meta.url), 'utf8')
const { groupThreads } = await import('data:text/javascript,' + encodeURIComponent(stripTypeScriptTypes(src, { mode: 'transform' })))

test('threads fall into date buckets; running ones stay in theirs (no In progress group)', () => {
  const now = new Date(2026, 10, 22, 15).getTime(), H = 3_600_000
  const list = [
    { id: 'today', modified: now - 2 * H },
    { id: 'week', modified: now - 3 * 24 * H },
    { id: 'month', modified: now - 20 * 24 * H },
    { id: 'run', modified: now - 40 * 24 * H, live: true },
    { id: 'old', modified: now - 90 * 24 * H },
  ]
  assert.deepEqual(groupThreads(list, now).map(([l, items]) => [l, items.map(t => t.id)]), [['Today', ['today']], ['Last week', ['week']], ['Last month', ['month']], ['Older', ['run', 'old']]])
  assert.deepEqual(groupThreads([], now), [])
})
