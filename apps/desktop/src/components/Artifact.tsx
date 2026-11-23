import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SANDBOX, artifactUrl, buildDoc, saveExt, slug } from '../../shared/artifacts.mjs'
import { api } from '../api'
import { CopyButton, Segmented } from './ui'

/** Provided by the thread: artifacts only render inside one (they need a project to save into and a pane to open over). */
export const ArtifactCtx = createContext<{ project: string; pane: HTMLElement | null } | null>(null)

export type ArtifactSpec = { type: 'html' | 'svg' | 'chart' | 'table'; title: string; code: string; complete: boolean }

const HEIGHT_CAP = 560
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function useDark() {
  const [dark, setDark] = useState(() => darkQuery().matches)
  useEffect(() => {
    const q = darkQuery()
    const on = () => setDark(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return dark
}

function Body({ spec, fill, mode }: { spec: ArtifactSpec; fill?: boolean; mode: 'preview' | 'code' }) {
  const dark = useDark()
  const built = useMemo(() => {
    if (!spec.complete) return { error: '' }
    try {
      const id = `${spec.code.length}-${Math.random().toString(36).slice(2, 8)}`
      const src = artifactUrl(buildDoc(spec, { dark, id }))
      return { src, id }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Could not draw this.' }
    }
  }, [spec.code, spec.type, spec.complete, dark])
  if (mode === 'code' || (spec.complete && 'error' in built))
    return (
      <>
        {'error' in built && built.error && <p className="artifact-note">Could not draw this: {built.error}</p>}
        <pre className="code artifact-code">{spec.code}</pre>
      </>
    )
  if (!spec.complete) return <div className="artifact-skeleton" aria-label="Drawing"><i /><i /><i /></div>
  return <FrameById spec={spec} built={built as { src: string; id: string }} fill={fill} />
}

/** The sandboxed document. Its id travels inside it, so two artifacts never share a height; the height follows content up to the cap, or fills the pane. */
function FrameById({ spec, built, fill }: { spec: ArtifactSpec; built: { src: string; id: string }; fill?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [h, setH] = useState(120)
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || e.data?.suffice_artifact !== built.id) return
      if (typeof e.data.h === 'number' && e.data.h > 0) setH(Math.min(Math.ceil(e.data.h), HEIGHT_CAP))
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [built.id])
  return <iframe ref={ref} className="artifact-frame" title={spec.title} sandbox={SANDBOX} src={built.src} style={fill ? undefined : { height: h }} />
}

export function ArtifactCard({ spec }: { spec: ArtifactSpec }) {
  const ctx = useContext(ArtifactCtx)
  const [mode, setMode] = useState<'preview' | 'code'>('preview')
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState('')
  const label = useId()
  const content = useMemo(() => {
    if (spec.type === 'html' || spec.type === 'svg') return spec.code
    try { return buildDoc(spec) } catch { return spec.code }
  }, [spec])
  const save = () => {
    if (!ctx) return
    api.saveArtifact(ctx.project, `${slug(spec.title)}.${saveExt(spec.type)}`, content).then(p => setSaved(p ? `Saved ${p}` : ''), e => setSaved(e instanceof Error ? e.message : 'Could not save'))
  }
  const tools = (close?: boolean) => (
    <div className="artifact-tools">
      {spec.complete && <Segmented options={[{ v: 'preview', label: 'Preview' }, { v: 'code', label: 'Code' }]} value={mode} onChange={setMode} />}
      {spec.complete && <CopyButton text={spec.code} />}
      {spec.complete && ctx && <button className="btn artifact-btn" onClick={save}>Save</button>}
      {close ? <button className="btn artifact-btn" onClick={() => setOpen(false)}>Close</button> : spec.complete && ctx?.pane && <button className="btn artifact-btn" onClick={() => setOpen(true)}>Open</button>}
    </div>
  )
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open])
  return (
    <section className="artifact" aria-labelledby={label}>
      <header className="artifact-head">
        <span className="artifact-title" id={label}>{spec.title}</span>
        {saved && <span className="artifact-saved">{saved}</span>}
        {tools()}
      </header>
      <div className="artifact-body"><Body spec={spec} mode={mode} /></div>
      {open && ctx?.pane && createPortal(
        <div className="artifact-full" role="dialog" aria-label={spec.title}>
          <header className="artifact-head">
            <span className="artifact-title">{spec.title}</span>
            {saved && <span className="artifact-saved">{saved}</span>}
            {tools(true)}
          </header>
          <div className="artifact-body is-full"><Body spec={spec} mode={mode} fill /></div>
        </div>,
        ctx.pane,
      )}
    </section>
  )
}
