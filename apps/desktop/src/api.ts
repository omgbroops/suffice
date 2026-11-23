import type { Transcript } from '../shared/transcript.mjs'

export type { Transcript }

export type ModelInfo = {
  id: string
  name: string
  contextWindow: number
  cost: { input: number; output: number; cacheRead: number; cacheWrite?: number }
  efforts: string[]
  /** modes this engine can run; absent means all */
  modes?: string[]
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
  /** which agent runs tasks: the user's own Claude Code (default) or OpenAI through the pi harness */
  engine?: 'claude' | 'openai'
  /** project path -> tint name (see PASTELS) */
  projectColors?: Record<string, string>
  projectNames?: Record<string, string>
  /** the model's suggested name per project: the default a cleared rename falls back to */
  projectAutoNames?: Record<string, string>
  projectIcons?: Record<string, string>
  /** prompt behind Notes > Generate notes */
  notesPrompt?: string
  theme?: 'system' | 'light' | 'dark'
  /** false (default): Claude Code ignores the user's ~/.claude CLAUDE.md, settings, hooks, plugins, skills and MCP servers */
  useClaudeConfig?: boolean
  callMe?: string
  customInstructions?: string
  responseStyle?: 'concise' | 'normal' | 'explanatory'
  /** UI only */
  verbosity?: string
  /** extra directories the agent may read and write */
  folderAccess?: string[]
  capabilities?: { web?: boolean; browser?: boolean; computer?: boolean; mcp?: boolean }
  engineAuto?: boolean
  defaultProvider?: string
  profileName?: string
  callMe?: string
  work?: string
  fontSize?: 'small' | 'medium' | 'large'
  reduceMotion?: boolean
  customInstructions?: string
  responseStyle?: 'concise' | 'normal' | 'explanatory'
  useClaudeConfig?: boolean
  verbosity?: 'quiet' | 'normal' | 'verbose'
  folderAccess?: string[]
  capabilities?: { web?: boolean; browser?: boolean; computer?: boolean; mcp?: boolean }
  notify?: { done?: boolean; needsInput?: boolean; sound?: boolean }
  transcriptDays?: 0 | 7 | 30 | 90
  openAtLogin?: boolean
}

export type Usage = {
  total: { runs: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; apiCostUsd: number }
  days: { date: string; runs: number; apiCostUsd: number }[]
  plan: { kind: 'subscription' | 'api'; name: string }
  savedUsd: number
}

export type Mode = 'balanced' | 'efficient' | 'fast'

export type AccountRow = { id: string; name: string; kind: 'cli' | 'key'; installed: boolean; connected: boolean; runnable: boolean; detail: string; howTo: string; install?: string; last4?: string }
export type InitInfo = { accounts?: AccountRow[]; defaultLabel?: string | null; signedIn: boolean; home: string; settings: Settings; projects: string[]; platform: string }
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
  accounts: () => bridge().invoke<AccountRow[]>('accounts:list'),
  setKey: (provider: string, key: string) => bridge().invoke<{ last4: string }>('accounts:key-set', { provider, key }),
  testKey: (provider: string) => bridge().invoke<{ ok: boolean; message: string }>('accounts:key-test', { provider }),
  removeKey: (provider: string) => bridge().invoke('accounts:key-remove', { provider }),
  models: () => bridge().invoke<ModelInfo[]>('models:list'),
  chooseProject: () => bridge().invoke<{ project: string; projects: string[] } | null>('projects:choose'),
  defaultProject: () => bridge().invoke<{ project: string; projects: string[] }>('projects:default'),
  setProject: (path: string) => bridge().invoke<{ project: string; projects: string[] }>('projects:set', { path }),
  threads: (project: string) => bridge().invoke<ThreadSummary[]>('threads:list', { project }),
  pickFiles: (project: string | null) => bridge().invoke<string[]>('files:pick', { project }),
  notes: (project: string) => bridge().invoke<NoteSummary[]>('notes:list', { project }),
  readNote: (project: string, path: string) => bridge().invoke<string>('notes:read', { project, path }),
  nameProject: (project: string) => bridge().invoke<Settings>('projects:name', { project }),
  openThread: (threadId: string, path: string) => bridge().invoke<Transcript>('threads:open', { threadId, path }),
  run: (args: { threadId: string; path?: string; project: string; prompt: string; model: string; effort: string; fast: boolean; mode: Mode; cheapModel: string }) => bridge().invoke<{ threadId: string; effort: string; mode: Mode }>('run:start', args),
  abort: (threadId: string) => bridge().invoke('run:abort', { threadId }),
  guide: (threadId: string, text: string, queue: boolean) => bridge().invoke('run:guide', { threadId, text, queue }),
  answerApproval: (id: string, allow: boolean) => bridge().invoke('approval:answer', { id, allow }),
  updateSettings: (patch: Partial<Settings>) => bridge().invoke<Settings>('settings:update', patch),
  usage: () => bridge().invoke<Usage>('usage:summary'),
  appInfo: () => bridge().invoke<{ version: string; openAtLogin: boolean }>('app:info'),
  clearHistory: () => bridge().invoke('privacy:clear'),
  on: (channel: string, listener: (payload: any) => void) => bridge().on(channel, listener),
}
