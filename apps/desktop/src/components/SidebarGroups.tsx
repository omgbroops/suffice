/** Threads inside one project, grouped under their auto-category. Uncategorised threads lead, ungrouped. */
export function groupByCategory<T extends { category?: string }>(threads: T[]): { label?: string; threads: T[] }[] {
  const plain = threads.filter(t => !t.category)
  const labels = [...new Set(threads.map(t => t.category).filter((c): c is string => !!c))]
  return [...(plain.length ? [{ threads: plain }] : []), ...labels.map(label => ({ label, threads: threads.filter(t => t.category === label) }))]
}
