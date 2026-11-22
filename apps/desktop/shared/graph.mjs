// Obsidian's graph view, rebuilt from the rules in its app bundle (Obsidian.app obsidian.asar, read 2026-11-22).
// Drawing rules come from app.js. Physics comes from sim.js's d3 fallback (the wasm path takes the same arguments):
// forceX + forceY (center), forceLink (d3's 1/min(degree) strength x link force), forceManyBody (-repel^3,
// distanceMin 30), forceCollide (radius 60, strength 0.5), velocity decay 0.4, in that order.

/** node radius in graph units: max(8, min(3 * sqrt(links + 1), 30)) */
export const nodeSize = weight => Math.max(8, Math.min(3 * Math.sqrt(weight + 1), 30))
/** nodes and labels shrink slower than the zoom: nodeScale = sqrt(1 / scale) */
export const nodeScale = scale => Math.sqrt(1 / scale)
/** labels fade out between zoom 1 and zoom 0.5 */
export const textAlpha = scale => Math.min(1, Math.max(0, Math.log2(scale) + 1))
/** alpha of every node and link not touching the hovered node */
export const FADE = 0.2
/** per-frame easing Obsidian uses for alpha, colour and label motion */
export const ease = (from, to, k = 0.9) => from * k + to * (1 - k)
export const OBSIDIAN_FORCES = { center: 0.1, repel: 10, link: 1, distance: 250 }

const DECAY = 1 - Math.pow(0.001, 1 / 300)

/** A simulation over `ids`; nodes already placed in `prev` keep their place. */
export function createSim(ids, links, prev) {
  const nodes = new Map()
  ids.forEach((id, i) => {
    const old = prev?.nodes.get(id)
    // d3's phyllotaxis start: an even spiral, no randomness
    const r = 10 * Math.sqrt(0.5 + i), a = i * Math.PI * (3 - Math.sqrt(5))
    nodes.set(id, old ? { ...old, fx: null, fy: null } : { x: r * Math.cos(a), y: r * Math.sin(a), vx: 0, vy: 0, fx: null, fy: null })
  })
  const count = new Map()
  const kept = links.filter(([s, t]) => s !== t && nodes.has(s) && nodes.has(t))
  for (const [s, t] of kept) (count.set(s, (count.get(s) ?? 0) + 1), count.set(t, (count.get(t) ?? 0) + 1))
  return {
    nodes,
    links: kept.map(([s, t]) => ({
      s: nodes.get(s), t: nodes.get(t),
      bias: count.get(s) / (count.get(s) + count.get(t)),
      // d3's default link strength: hubs pull each neighbour weakly
      k: 1 / Math.min(count.get(s), count.get(t)),
    })),
    alpha: 1,
    alphaTarget: 0,
  }
}

const COLLIDE_R = 60, COLLIDE_K = 0.5, MIN_D2 = 30 * 30

/** One d3-force tick in Obsidian's order: center (x, y), links, repel, collide; then velocity decay 0.4. */
// shortcut: repel and collide are exact O(n^2) (d3 uses a quadtree); fine to ~1500 notes, add a quadtree past that
export function tick(sim, { center, repel, link, distance } = OBSIDIAN_FORCES) {
  const a = (sim.alpha += (sim.alphaTarget - sim.alpha) * DECAY)
  const list = [...sim.nodes.values()]
  for (const p of list) (p.vx -= p.x * center * a), (p.vy -= p.y * center * a)
  for (const { s, t, bias, k } of sim.links) {
    let x = t.x + t.vx - s.x - s.vx, y = t.y + t.vy - s.y - s.vy
    const l0 = Math.hypot(x, y) || 1e-3, l = ((l0 - distance) / l0) * a * link * k
    x *= l; y *= l
    t.vx -= x * bias; t.vy -= y * bias; s.vx += x * (1 - bias); s.vy += y * (1 - bias)
  }
  const strength = -Math.max(1, Math.pow(repel, 3))
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const p = list[i], q = list[j]
      let dx = q.x - p.x, dy = q.y - p.y
      if (!dx && !dy) (dx = (i - j) * 1e-3, dy = 1e-3)
      let d2 = dx * dx + dy * dy
      if (d2 < MIN_D2) d2 = Math.sqrt(MIN_D2 * d2)
      // each node moves away from the other (d3: node.v += (other - node) * strength * alpha / d^2)
      const w = (strength * a) / d2
      p.vx += dx * w; p.vy += dy * w; q.vx -= dx * w; q.vy -= dy * w
    }
  // collide: no node centre comes within 2 * 60 of another; not scaled by alpha, as in d3
  const R2 = (2 * COLLIDE_R) ** 2
  for (let i = 0; i < list.length; i++) {
    const p = list[i], px = p.x + p.vx, py = p.y + p.vy
    for (let j = i + 1; j < list.length; j++) {
      const q = list[j]
      let dx = px - q.x - q.vx, dy = py - q.y - q.vy, d2 = dx * dx + dy * dy
      if (d2 >= R2) continue
      if (!dx && !dy) (dx = 1e-3, d2 = 1e-6)
      const d = Math.sqrt(d2), l = ((2 * COLLIDE_R - d) / d) * COLLIDE_K * 0.5
      p.vx += dx * l; p.vy += dy * l; q.vx -= dx * l; q.vy -= dy * l
    }
  }
  for (const p of list) {
    if (p.fx != null) (p.x = p.fx, p.y = p.fy, p.vx = p.vy = 0)
    else (p.vx *= 0.6, p.vy *= 0.6, p.x += p.vx, p.y += p.vy)
  }
  return a
}
