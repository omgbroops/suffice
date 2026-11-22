// Pure logic for the Notes view: explorer tree, local-graph neighbourhood, default generation prompt.

/** Nested folder tree from note paths: folders first (A-Z), then notes (A-Z). */
export function buildTree(paths) {
  const root = { name: '', path: '', folders: [], notes: [] }
  for (const p of paths) {
    const parts = p.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join('/')
      let next = node.folders.find(f => f.path === path)
      if (!next) node.folders.push((next = { name: parts[i], path, folders: [], notes: [] }))
      node = next
    }
    node.notes.push(p)
  }
  const by = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
  const sort = n => { n.folders.sort((a, b) => by(a.name, b.name)); n.notes.sort((a, b) => by(a.split('/').pop(), b.split('/').pop())); n.folders.forEach(sort) }
  sort(root)
  return root
}

/** The open note, its links (ring 1) and theirs (ring 2). Hubs over `hub` links are not expanded; rings are capped. */
export function neighbourhood(notes, current, { ring1 = 14, ring2 = 18, hub = 12 } = {}) {
  const adj = new Map()
  const add = (a, b) => (adj.get(a) ?? adj.set(a, new Set()).get(a)).add(b)
  for (const n of notes) for (const l of n.links) (add(n.path, l), add(l, n.path))
  const deg = p => adj.get(p)?.size ?? 0
  const title = new Map(notes.map(n => [n.path, n.title]))
  const byTitle = (a, b) => (title.get(a) ?? a).localeCompare(title.get(b) ?? b)
  if (!adj.has(current) && !title.has(current)) return { nodes: [], edges: [] }
  const r1 = [...(adj.get(current) ?? [])].sort((a, b) => deg(b) - deg(a) || byTitle(a, b)).slice(0, ring1)
  const seen = new Set([current, ...r1])
  const nodes = [{ path: current, ring: 0, deg: deg(current) }, ...r1.map(path => ({ path, ring: 1, deg: deg(path) }))]
  const edges = r1.map(p => [current, p])
  let count = 0
  for (const p of r1) {
    if (deg(p) > hub) continue
    for (const k of [...adj.get(p)].filter(k => !seen.has(k)).sort(byTitle).slice(0, 3)) {
      if (count >= ring2) break
      seen.add(k); count++
      nodes.push({ path: k, ring: 2, deg: deg(k) })
      edges.push([p, k])
    }
  }
  // links among nodes already shown (ring 1 to ring 1, ring 2 back to ring 1)
  const have = new Set(edges.map(e => e.join('>')))
  for (const a of seen) for (const b of adj.get(a) ?? []) if (a < b && seen.has(b) && a !== current && b !== current && !have.has(`${a}>${b}`) && !have.has(`${b}>${a}`)) edges.push([a, b])
  return { nodes, edges }
}

export const DEFAULT_NOTES_PROMPT = `Read this repository and write its notes as markdown files in a notes/ folder at the project root. Create the folder if it does not exist.

Before writing, list notes/ and read every note already there. Update an existing note in place instead of creating a duplicate; never delete a note you did not create.

Write:
- notes/Index.md: one line on what the project is, then a [[wikilink]] to every other note, grouped as Modules, Decisions and Runbook.
- One note per real module, service or concept. Name each after the thing itself (for example notes/Queue worker.md). Say what it does, what it depends on, and who calls it.
- One note per decision you can find evidence for (in code comments, commit messages, docs or config). State the decision and the reason it was made. If the reason is not written down anywhere, say "reason not recorded".
- notes/Runbook.md: how to install, run, test and deploy, taken only from scripts, Makefiles, CI files and docs that exist. Give the exact commands.

Rules:
- Link related notes with [[wikilinks]] using the note's file name without .md. Every note links to at least one other note.
- Cite the file path (and function or section name) behind each claim, in backticks.
- Do not invent facts. If something is unclear or missing, write "unknown" or leave it out.
- Keep each note short: a title heading, then under 40 lines.
- Write only inside notes/. Do not change code, config or any file outside notes/.

When finished, list the notes you created and the ones you updated.`
