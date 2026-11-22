const DAY = 86_400_000

/**
 * Sidebar thread groups: In progress (running or waiting on you) first, then
 * Today / Last week / Last month / Older, newest first; empty groups dropped.
 */
export function groupThreads<T extends { modified: number }>(list: T[], live: (t: T) => boolean = () => false, now = Date.now()) {
  const midnight = new Date(now).setHours(0, 0, 0, 0)
  const groups: [string, T[]][] = [['In progress', []], ['Today', []], ['Last week', []], ['Last month', []], ['Older', []]]
  for (const t of list) groups[live(t) ? 0 : t.modified >= midnight ? 1 : t.modified >= now - 7 * DAY ? 2 : t.modified >= now - 30 * DAY ? 3 : 4][1].push(t)
  return groups.filter(([, items]) => items.length)
}
