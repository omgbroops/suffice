import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { IconChevronDown, IconChevronRight, IconMixer, IconReload } from '../../icons'
import { Dropdown } from '../Dropdown'
import { FileIcon, highlight, languageOf, splitPatch, turnDiffs, type FileDiff } from './code'
import { Empty } from './Empty'

export type TurnEdit = { path: string; patch: string }
type Scope = 'all' | 'turn' | 'unstaged' | 'staged' | 'commit'
const SCOPES: { id: Scope; label: string; note: string; none: string }[] = [
  { id: 'all', label: 'All changes', note: 'Everything not yet committed', none: 'Nothing has changed since the last commit.' },
  { id: 'turn', label: 'Last turn', note: 'What the agent just edited in this thread', none: 'The agent made no edits in its last turn.' },
  { id: 'unstaged', label: 'Unstaged', note: 'Changes not yet added to the next commit', none: 'Every change is staged.' },
  { id: 'staged', label: 'Staged', note: 'Changes added to the next commit', none: 'Nothing is staged.' },
  { id: 'commit', label: 'Last commit', note: 'What the most recent commit changed', none: 'The last commit changed no files.' },
]
const MAX_ROWS = 4000

function Diff({ file, wrap }: { file: FileDiff; wrap: boolean }) {
  const language = languageOf(file.path)
  const rows = file.rows.length > MAX_ROWS ? file.rows.slice(0, MAX_ROWS) : file.rows
  const html = useMemo(() => rows.map(r => (r.t === '@' ? '' : highlight(r.s, language))), [rows, language])
  return (
    <div className={`df${wrap ? ' is-wrap' : ''}`} role="table" aria-label={`Changes to ${file.path}`}>
      <div className="df-rows">
        {rows.map((r, i) =>
          r.t === '@' ? (
            <div key={i} className="df-gap">{r.s || '⋯'}</div>
          ) : (
            <div key={i} className={`df-row${r.t === '+' ? ' is-add' : r.t === '-' ? ' is-del' : ''}`}>
              <span className="df-n">{r.n}</span>
              <code className="hl" dangerouslySetInnerHTML={{ __html: html[i] || ' ' }} />
            </div>
          ),
        )}
      </div>
      {file.rows.length > MAX_ROWS && <p className="rp-note">{file.rows.length - MAX_ROWS} more lines are not shown.</p>}
    </div>
  )
}

export function Changes({ project, turn }: { project: string; turn?: TurnEdit[] }) {
  const [scope, setScope] = useState<Scope>('all')
  const [wrap, setWrap] = useState(true)
  const [noSpace, setNoSpace] = useState(false)
  const [state, setState] = useState<{ git: boolean; files: FileDiff[]; truncated?: boolean } | null>(null)
  const [error, setError] = useState('')
  const [shut, setShut] = useState<Set<string>>(new Set())
  const fromGit = scope !== 'turn'
  const load = useCallback(() => {
    if (!fromGit) return
    api.changes(project, scope as Exclude<Scope, 'turn'>, noSpace).then(r => (setError(''), setState({ git: r.git, files: splitPatch(r.patch), truncated: r.truncated })), e => setError(e instanceof Error ? e.message : String(e)))
  }, [project, scope, noSpace, fromGit])
  useEffect(() => {
    load()
    const off = api.on('threads:changed', load)
    window.addEventListener('focus', load)
    return () => { off(); window.removeEventListener('focus', load) }
  }, [load])

  const turnFiles = useMemo(() => turnDiffs(turn ?? [], project), [turn, project])
  const files = fromGit ? state?.files ?? [] : turnFiles
  const info = SCOPES.find(s => s.id === scope)!
  const add = files.reduce((n, f) => n + f.add, 0), del = files.reduce((n, f) => n + f.del, 0)
  const allShut = files.length > 0 && files.every(f => shut.has(f.path))

  let body
  if (fromGit && error) body = <Empty title="Changes could not be read" hint={error} action={<button className="btn" onClick={load}>Try again</button>} />
  else if (fromGit && !state) body = null
  else if (fromGit && !state!.git) body = <Empty title="This folder is not a git repository" hint="Last turn still shows what the agent edited." />
  else if (!files.length) body = <Empty title="No changes" hint={info.none} />
  else
    body = (
      <div className="rp-scroll">
        {files.map(f => {
          const open = !shut.has(f.path)
          return (
            <section key={f.path} className="rp-file">
              <button className="rp-file-head" aria-expanded={open} onClick={() => setShut(s => { const n = new Set(s); n.has(f.path) ? n.delete(f.path) : n.add(f.path); return n })}>
                <IconChevronRight size={11} className={`rp-chev${open ? ' is-open' : ''}`} />
                <FileIcon name={f.name} />
                <span className="rp-file-name">{f.name}</span>
                <span className="rp-file-dir" title={f.path}>{f.dir}</span>
                {f.status && <span className="rp-file-status">{f.status}</span>}
                <span className="diffstat"><span className="add">+{f.add}</span><span className="del">−{f.del}</span></span>
              </button>
              {open && (f.binary ? <p className="rp-note">Binary file</p> : f.rows.length ? <Diff file={f} wrap={wrap} /> : <p className="rp-note">No line changes</p>)}
            </section>
          )
        })}
        {fromGit && state?.truncated && <p className="rp-note">Some changes are not shown because the diff is very large.</p>}
      </div>
    )

  return (
    <>
      <div className="rp-bar">
        <Dropdown
          width={264}
          trigger={({ open, toggle, ref }) => (
            <button ref={ref} className={`ghost-btn rp-scope${open ? ' is-open' : ''}`} onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
              {info.label}
              <IconChevronDown size={12} />
            </button>
          )}
        >
          {close => (
            <div className="dd-list">
              {SCOPES.filter(s => s.id !== 'turn' || turn).map(s => (
                <button key={s.id} role="menuitemradio" aria-checked={s.id === scope} className={`dd-row dd-row-tall${s.id === scope ? ' is-selected' : ''}`} onClick={() => { setScope(s.id); setShut(new Set()); close() }}>
                  <span className="dd-text">
                    <span className="dd-title">{s.label}</span>
                    <span className="dd-note">{s.note}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Dropdown>
        <div className="spacer" />
        {files.length > 0 && (
          <span className="rp-count">
            {files.length} {files.length === 1 ? 'file' : 'files'}
            <span className="diffstat"><span className="add">+{add}</span><span className="del">−{del}</span></span>
          </span>
        )}
        <Dropdown
          width={220}
          align="right"
          trigger={({ open, toggle, ref }) => (
            <button ref={ref} className={`icon-btn sm${open ? ' is-open' : ''}`} onClick={toggle} aria-label="View options" title="View options" aria-haspopup="menu" aria-expanded={open}><IconMixer size={13} /></button>
          )}
        >
          {close => (
            <div className="dd-list">
              <button className="dd-row" role="menuitemcheckbox" aria-checked={wrap} onClick={() => setWrap(w => !w)}>
                <span className="dd-title dd-grow">Wrap lines</span>
                <span className={`dd-box${wrap ? ' is-on' : ''}`} />
              </button>
              <button className="dd-row" role="menuitemcheckbox" aria-checked={noSpace} disabled={!fromGit} onClick={() => setNoSpace(v => !v)}>
                <span className="dd-title dd-grow">Hide whitespace changes</span>
                <span className={`dd-box${noSpace ? ' is-on' : ''}`} />
              </button>
              <button className="dd-row" disabled={!files.length} onClick={() => { setShut(allShut ? new Set() : new Set(files.map(f => f.path))); close() }}>
                <span className="dd-title">{allShut ? 'Expand all files' : 'Collapse all files'}</span>
              </button>
            </div>
          )}
        </Dropdown>
        <button className="icon-btn sm" onClick={load} disabled={!fromGit} aria-label="Refresh changes" title="Refresh"><IconReload size={12} /></button>
      </div>
      {body}
    </>
  )
}
