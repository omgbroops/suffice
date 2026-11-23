export type SimNode = { x: number; y: number; vx: number; vy: number; fx: number | null; fy: number | null }
export type Forces = { center: number; repel: number; link: number; distance: number }
export type Sim = {
  nodes: Map<string, SimNode>
  links: { s: SimNode; t: SimNode; bias: number; k: number }[]
  alpha: number
  alphaTarget: number
}
export const nodeSize: (weight: number) => number
export const nodeScale: (scale: number) => number
export const textAlpha: (scale: number) => number
export const FADE: number
export const ease: (from: number, to: number, k?: number) => number
export const OBSIDIAN_FORCES: Forces
export function createSim(ids: string[], links: [string, string][], prev?: Sim | null): Sim
export function tick(sim: Sim, forces?: Forces): number
