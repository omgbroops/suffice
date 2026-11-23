export type ArtifactType = 'html' | 'svg' | 'chart' | 'table'
export function readFence(lines: string[], i: number): { info: string; body: string[]; next: number; complete: boolean }
export function classify(info: string, code: string, complete: boolean): { type: ArtifactType; title: string; code: string; complete: boolean } | null
export function buildDoc(spec: { type: string; code: string }, opts?: { dark?: boolean; id?: string }): string
export function artifactUrl(doc: string): string
export const SANDBOX: string
export function slug(title: string): string
export function saveExt(type: string): string
