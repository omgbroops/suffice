const DAY = 86_400_000

/**
 * Sidebar thread groups: Today / Last week / Last month / Older, newest first; empty groups dropped.
 * No In progress group (Abhay 11-20: remove it); a running thread shows its spinner in place.
 */
export function groupThreads<T extends { modified: number }>(list: T[], now = Date.now()) {
  const midnight = new Date(now).setHours(0, 0, 0, 0)
  const groups: [string, T[]][] = [['Today', []], ['Last week', []], ['Last month', []], ['Older', []]]
  for (const t of list) groups[t.modified >= midnight ? 0 : t.modified >= now - 7 * DAY ? 1 : t.modified >= now - 30 * DAY ? 2 : 3][1].push(t)
  return groups.filter(([, items]) => items.length)
}
