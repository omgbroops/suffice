export type TextStep = { kind: 'text'; text: string }
export type ThinkingStep = { kind: 'thinking'; text: string; startedAt: number; endedAt?: number }
export type ToolStep = { kind: 'tool'; id: string; parent?: string; name: string; input: any; status: 'running' | 'done' | 'error'; output?: string; patch?: string; startedAt?: number }
export type ApprovalStep = { kind: 'approval'; id: string; name: string; input: any; state: 'pending' | 'allowed' | 'denied' }
export type NoteStep = { kind: 'note'; text: string; level: 'info' | 'warning' | 'error' }
export type RaceStep = { kind: 'race'; attempts: { state: 'running' | 'won' | 'lost' | 'empty' | 'failed'; startedAt: number; endedAt?: number; changes?: number }[] }
export type Step = TextStep | ThinkingStep | ToolStep | ApprovalStep | NoteStep | RaceStep
export type UserMessage = { id: string; role: 'user'; text: string; at: number }
export type AgentMessage = { id: string; role: 'agent'; model: string; effort: string; mode?: 'balanced' | 'efficient' | 'fast'; cheap?: string; steps: Step[]; done: boolean; error?: string; startedAt: number; endedAt?: number }
export type Transcript = { version: 1; messages: (UserMessage | AgentMessage)[] }
export const OUTPUT_LIMIT: number
export function emptyTranscript(): Transcript
export function resultText(content: unknown): string
export function reduce(t: Transcript, e: any): Transcript
export function fromSessionMessages(messages: any[]): Transcript
export function summarizeCommand(command: string): { verb: string; present: string; kind?: 'look'; meta?: string }
export type StepGroup = { kind: 'group'; id: string; steps: ToolStep[]; verb: string; meta: string; live: boolean }
export function groupSteps(steps: Step[]): (Step | StepGroup)[]
export function patchLines(patch?: string): { t: ' ' | '+' | '-' | '@'; s: string }[]
export function compactDiff(lines: { t: ' ' | '+' | '-' | '@'; s: string }[], keep?: number): { t: ' ' | '+' | '-' | '…'; s: string }[]
export function describeTool(name: string, input?: any): { verb: string; present?: string; kind?: 'look'; meta: string }
export function visibleSteps(steps: Step[]): Step[]
