export type TreeNode = { name: string; path: string; folders: TreeNode[]; notes: string[] }
export function buildTree(paths: string[]): TreeNode
export function neighbourhood(
  notes: { path: string; title: string; links: string[] }[],
  current: string,
  opts?: { ring1?: number; ring2?: number; hub?: number },
): { nodes: { path: string; ring: 0 | 1 | 2; deg: number }[]; edges: [string, string][] }
export const DEFAULT_NOTES_PROMPT: string
