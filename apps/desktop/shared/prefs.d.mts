export type Row =
  | { kind: 'toggle'; id: string; label: string; value: boolean; detail?: string; soon?: boolean }
  | { kind: 'select' | 'segment'; id: string; label: string; value: string; options: string[]; detail?: string; soon?: boolean }
  | { kind: 'keys'; label: string; value: string }
  | { kind: 'action'; id: string; label: string; value: string; detail?: string; soon?: boolean }
  | { kind: 'models' | 'resources' | 'archived'; id: string }
  | { kind: 'providers' | 'about' }
export type Group = { title: string; rows: Row[] }
export type Section = { id: string; title: string; groups: Group[] }
export type Prefs = Record<string, any>
export const SECTIONS: Section[]
export const PREF_DEFAULTS: Prefs
export function cleanPrefs(input: unknown): Prefs
export function fromOldDesktop(old: unknown): Prefs
