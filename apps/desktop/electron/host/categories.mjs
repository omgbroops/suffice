// Auto-categories inside a project: threads with close titles or descriptions share a 2-3 word label.

export const MIN_THREADS = 4
const STOP = new Set('a an and are as at be by for from how in into is it its of on or that the this to up what with your my our new add fix make use using about'.split(' '))
const tokens = t => new Set(`${t.title ?? ''} ${t.description ?? ''}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2 && !STOP.has(w)))
const sim = (a, b) => {
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n / (a.size + b.size - n || 1)
}

/** threads: [{path, title, description}] -> clusters of 2+ paths (single-link, Jaccard >= 0.2). Fewer than MIN_THREADS -> none. */
export function cluster(threads, min = 0.2) {
  if (threads.length < MIN_THREADS) return []
  const sets = threads.map(tokens)
  const group = threads.map((_, i) => i)
  const find = i => (group[i] === i ? i : (group[i] = find(group[i])))
  for (let i = 0; i < threads.length; i++)
    for (let j = i + 1; j < threads.length; j++) if (sim(sets[i], sets[j]) >= min) group[find(j)] = find(i)
  const by = new Map()
  threads.forEach((t, i) => by.set(find(i), [...(by.get(find(i)) ?? []), t.path]))
  return [...by.values()].filter(g => g.length >= 2)
}

export const LABEL_PROMPT = 'Reply with a 2 to 3 word label, sentence case, no punctuation, that names what these chat threads have in common.'
export const cleanLabel = s => {
  const w = String(s ?? '').replace(/["'.`*]/g, '').trim().split(/\s+/).filter(Boolean)
  return w.length >= 1 && w.length <= 3 ? w.join(' ') : null
}

/**
 * state: {n, labels: {path: label}} from the last pass. Recomputes only when there are more threads than `n`
 * (once per new thread). `manual` {path: label} always wins. Returns the new state, or `state` when nothing changed.
 */
export async function categorize(threads, state, ask) {
  if (threads.length < MIN_THREADS || threads.length <= (state?.n ?? 0)) return state
  const byPath = new Map(threads.map(t => [t.path, t]))
  const labels = {}
  for (const g of cluster(threads)) {
    const text = g.map(p => `${byPath.get(p).title}: ${byPath.get(p).description ?? ''}`).join('\n')
    const label = cleanLabel(await ask(LABEL_PROMPT, text).catch(() => null))
    if (label) for (const p of g) labels[p] = label
  }
  return { n: threads.length, labels }
}
