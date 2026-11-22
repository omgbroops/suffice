/** Last path segment: a project's folder name. */
export const baseName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path

/** The name shown for a project: the saved display name, else the folder name. A blank name means "use the folder". */
export const displayName = (names: Record<string, string> | undefined, path: string) => names?.[path]?.trim() || baseName(path)

/** Threads under their project, newest first; `other` holds threads whose project is not in the list. */
export function threadsByProject<T extends { project: string; modified: number }>(threads: T[], projects: string[]) {
  const byProject = new Map<string, T[]>(projects.map(p => [p, []]))
  const other: T[] = []
  for (const t of [...threads].sort((a, b) => b.modified - a.modified)) (byProject.get(t.project) ?? other).push(t)
  return { byProject, other }
}
