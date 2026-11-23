// Trust boundary: everything the renderer sends is checked here before it reaches the host.
import { resolve } from 'node:path'
import { inside } from './notes.mjs'

export const str = (v, name, { optional = false, max = 100_000 } = {}) => {
  if (optional && (v === undefined || v === null)) return undefined
  if (typeof v !== 'string' || !v || v.length > max || v.includes('\0')) throw new Error(`Invalid ${name}.`)
  return v
}
export const bool = (v, name) => {
  if (typeof v !== 'boolean') throw new Error(`Invalid ${name}.`)
  return v
}
export const oneOf = (v, list, name) => {
  if (!list.includes(v)) throw new Error(`Invalid ${name}.`)
  return v
}
export const object = (v, name) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`Invalid ${name}.`)
  return v
}

/** A session path is acceptable when it sits inside `dir` or is one the host already knows. */
export function sessionPath(path, dirs, known = []) {
  const p = resolve(str(path, 'path'))
  if (known.includes(p) || dirs.some(d => inside(d, p))) return p
  throw new Error('That session is not in this project.')
}

const isMap = (v, ok) => v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(ok)
const isStr = v => typeof v === 'string'
const isBool = v => typeof v === 'boolean'
const SETTINGS = {
  project: v => v === null || isStr(v),
  model: isStr,
  efforts: v => isMap(v, isStr),
  fast: v => isMap(v, x => typeof x === 'boolean'),
  approval: v => ['ask', 'every', 'never'].includes(v),
  recentModels: v => Array.isArray(v) && v.every(isStr),
  mode: v => ['balanced', 'efficient', 'fast'].includes(v),
  engine: v => ['claude', 'openai'].includes(v),
  cheapModel: isStr,
  engineAuto: v => typeof v === 'boolean',
  projectColors: v => isMap(v, isStr),
  projectNames: v => isMap(v, isStr),
  projectAutoNames: v => isMap(v, isStr),
  projectIcons: v => isMap(v, isStr),
  notesPrompt: isStr,
  useClaudeConfig: v => typeof v === 'boolean',
  callMe: v => isStr(v) && v.length <= 200,
  customInstructions: v => isStr(v) && v.length <= 20_000,
  responseStyle: v => ['concise', 'normal', 'explanatory'].includes(v),
  verbosity: isStr, // UI only; never sent to the model
  folderAccess: v => Array.isArray(v) && v.length <= 100 && v.every(x => isStr(x) && x && !x.includes('\0')),
  capabilities: v => isMap(v, x => typeof x === 'boolean') && Object.keys(v).every(k => ['web', 'browser', 'computer', 'mcp'].includes(k)),
  theme: v => ['system', 'light', 'dark'].includes(v),
  profileName: v => isStr(v) && v.length <= 100,
  callMe: v => isStr(v) && v.length <= 100,
  work: v => isStr(v) && v.length <= 100,
  fontSize: v => ['small', 'medium', 'large'].includes(v),
  reduceMotion: isBool,
  customInstructions: v => isStr(v) && v.length <= 20_000,
  responseStyle: v => ['concise', 'normal', 'explanatory'].includes(v),
  useClaudeConfig: isBool,
  verbosity: v => ['quiet', 'normal', 'verbose'].includes(v),
  folderAccess: v => Array.isArray(v) && v.length <= 200 && v.every(x => isStr(x) && x && x.length <= 4096 && !x.includes('\0')),
  capabilities: v => isMap(v, isBool) && ['web', 'browser', 'computer', 'mcp'].some(k => k in v),
  notify: v => isMap(v, isBool),
  transcriptDays: v => [0, 7, 30, 90].includes(v),
  openAtLogin: isBool,
}
/** Known keys with well-typed values only; anything else is dropped. */
export function cleanSettingsPatch(patch) {
  object(patch, 'settings')
  return Object.fromEntries(Object.entries(patch).filter(([k, v]) => Object.hasOwn(SETTINGS, k) && SETTINGS[k](v)))
}
