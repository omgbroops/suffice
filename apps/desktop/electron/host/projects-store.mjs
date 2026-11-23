// <home>/desktop/projects.json: [{id, name, folders: string[], cats?}]. A project is one or more folders;
// the first is the cwd and the key threads are stored under, the rest are passed as --add-dir.

import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'

/** First load: one project per recent folder, named from the model's suggestion if there is one, else the folder. */
export function migrate(recent, autoNames = {}) {
  return recent.map(f => ({ id: randomUUID(), name: autoNames[f] || basename(f), folders: [f] }))
}

/** Saved list, plus a project for any recent folder it does not cover yet. */
export function sync(saved, recent, autoNames = {}) {
  const have = new Set(saved.flatMap(p => p.folders))
  return [...saved, ...migrate(recent.filter(f => !have.has(f)), autoNames)]
}

export const addFolder = (projects, id, folder) =>
  projects.map(p => (p.id === id && !p.folders.includes(folder) ? { ...p, folders: [...p.folders, folder] } : p))

/** shortcut: no UI to remove a folder, only the first-folder rule is enforced here; add one when asked. */
export const removeFolder = (projects, id, folder) =>
  projects.map(p => (p.id === id && p.folders[0] !== folder ? { ...p, folders: p.folders.filter(f => f !== folder) } : p))

export const extraFolders = (projects, cwd) => projects.find(p => p.folders[0] === cwd)?.folders.slice(1) ?? []
