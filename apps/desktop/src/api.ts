import type { Transcript } from '../shared/transcript.mjs'

export type { Transcript }

export type ModelInfo = {
  id: string
  name: string
  contextWindow: number
  cost: { input: number; output: number; cacheRead: number }
  efforts: string[]
}

export type Settings = {
  project: string | null
  model: string
  efforts: Record<string, string>
  fast: Record<string, boolean>
  approval: 'ask' | 'every' | 'never'
  recentModels: string[]
  mode: Mode
  cheapModel: string
  /** project path -> tint name (see PASTELS) */
  projectColors?: Record<string, string>
  projectNames?: Record<string, string>
  projectIcons?: Record<string, string>
  /** prompt behind Notes > Generate notes */
  notesPrompt?: string
  theme?: 'system' | 'light' | 'dark'
}

export type Mode = 'balanced' | 'efficient' | 'fast'

export type InitInfo = { signedIn: boolean; home: string; settings: Settings; projects: string[]; platform: string }
export type NoteSummary = { path: string; title: string; modified: number; links: string[] }
export type ThreadSummary = { path: string; title: string; modified: number; running: boolean }
export type AuthEvent =
  | { type: 'url'; url: string }
  | { type: 'progress'; message: string }
  | { type: 'prompt'; id: string; message: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

type Bridge = {
  platform: string
  invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
  on(channel: string, listener: (payload: any) => void): () => void
}

declare global {
  interface Window {
    suffice: Bridge
  }
}

const bridge = () => window.suffice

export const api = {
  platform: () => bridge().platform,
  init: () => bridge().invoke<InitInfo>('app:init'),
  gitIdentity: () => bridge().invoke<{ name: string; avatar: string }>('git:identity'),
  login: () => bridge().invoke<{ ok: boolean; error?: string }>('auth:login'),
  answerLogin: (id: string, value: string) => bridge().invoke('auth:answer', { id, value }),
  cancelLogin: () => bridge().invoke('auth:cancel'),
  logout: () => bridge().invoke<{ signedIn: boolean }>('auth:logout'),
  models: () => bridge().invoke<ModelInfo[]>('models:list'),
  chooseProject: () => bridge().invoke<{ project: string; projects: string[] } | null>('projects:choose'),
  setProject: (path: string) => bridge().invoke<{ project: string; projects: string[] }>('projects:set', { path }),
  threads: (project: string) => bridge().invoke<ThreadSummary[]>('threads:list', { project }),
  pickFiles: (project: string | null) => bridge().invoke<string[]>('files:pick', { project }),
  notes: (project: string) => bridge().invoke<NoteSummary[]>('notes:list', { project }),
  readNote: (project: string, path: string) => bridge().invoke<string>('notes:read', { project, path }),
  openThread: (threadId: string, path: string) => bridge().invoke<Transcript>('threads:open', { threadId, path }),
  run: (args: { threadId: string; path?: string; project: string; prompt: string; model: string; effort: string; fast: boolean; mode: Mode; cheapModel: string }) => bridge().invoke<{ threadId: string; effort: string; mode: Mode }>('run:start', args),
  abort: (threadId: string) => bridge().invoke('run:abort', { threadId }),
  guide: (threadId: string, text: string, queue: boolean) => bridge().invoke('run:guide', { threadId, text, queue }),
  answerApproval: (id: string, allow: boolean) => bridge().invoke('approval:answer', { id, allow }),
  updateSettings: (patch: Partial<Settings>) => bridge().invoke<Settings>('settings:update', patch),
  on: (channel: string, listener: (payload: any) => void) => bridge().on(channel, listener),
}
