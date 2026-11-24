import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../../api'
import { IconCheck, IconChevronRight, IconCopy, IconFolder, IconSearch } from '../../icons'
import { FileIcon, highlight, languageOf } from './code'
import { Empty } from './Empty'
import { dragResize, setVar } from '../resize'

type Entry = { name: string; dir: boolean }
type Open = { path: string; text: string; skipped?: string }
const MAX_HITS = 200

function Preview({ file }: { file: Open }) {
  const html = useMemo(() => highlight(file.text, languageOf(file.path)), [file])
  const lines = useMemo(() => file.text.replace(/\n$/, '').split('\n').length, [file])
  if (file.skipped) return <Empty title={file.skipped === 'binary' ? 'This file is not text' : 'This file is too large to show'} />
  return (
    <div className="src">
      <pre className="src-n" aria-hidden>{Array.from({ length: lines }, (_, i) => i + 1).join('\n')}</pre>
      <pre className="src-code"><code className="hl" dangerouslySetInnerHTML={{ __html: html }} /></pre>
    </div>
  )
}

export function Files({ project, hidden, onFile }: { project: string; hidden: boolean; onFile: (path: string) => void }) {
  const [dirs, setDirs] = useState<Record<string, Entry[]>>({})
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [file, setFile] = useState<Open | null>(null)
  const [tree, setTree] = useState(true)
  const [query, setQuery] = useState('')
  const [all, setAll] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))
  const load = useCallback((dir: string) => api.listDir(project, dir).then(list => setDirs(d => ({ ...d, [dir]: list })), fail), [project])
  useEffect(() => { setDirs({}); setOpen(new Set()); setFile(null); setAll(null); setQuery(''); setError(''); onFile(''); void load('') }, [load])
  // the whole file list is only fetched once someone filters
  useEffect(() => { if (query && !all) api.listFiles(project).then(setAll, fail) }, [query, all, project])

  const show = (path: string) => api.readFile(project, path).then(r => (setFile({ path, ...r }), onFile(path)), fail)
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q && all ? all.filter(p => p.toLowerCase().includes(q)).slice(0, MAX_HITS) : null
  }, [query, all])

  if (error) return <div className={`rp-layer${hidden ? ' is-hidden' : ''}`}><Empty title="Files could not be read" hint={error} action={<button className="btn" onClick={() => (setError(''), void load(''))}>Try again</button>} /></div>
  const rows = (dir: string, depth: number): ReactNode =>
    (dirs[dir] ?? []).map(e => {
      const path = dir ? `${dir}/${e.name}` : e.name
      const isOpen = open.has(path)
      return (
        <div key={path}>
          <button
            className={`rp-row${file?.path === path ? ' is-active' : ''}`}
            style={{ paddingLeft: 6 + depth * 14 }}
            aria-expanded={e.dir ? isOpen : undefined}
            onClick={() => {
              if (!e.dir) return void show(path)
              setOpen(s => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n })
              if (!dirs[path]) void load(path)
            }}
          >
            {e.dir ? <IconChevronRight size={11} className={`rp-chev${isOpen ? ' is-open' : ''}`} /> : <span className="rp-chev-gap" />}
            <FileIcon name={e.name} dir={e.dir} open={isOpen} />
            <span className="rp-row-name">{e.name}</span>
          </button>
          {e.dir && isOpen && rows(path, depth + 1)}
        </div>
      )
    })
  const crumbs = file?.path.split('/') ?? []
  return (
    <div className={`rp-layer${hidden ? ' is-hidden' : ''}`}>
      <div className="rp-bar">
        {file ? (
          <span className="rp-crumbs" title={file.path}>
            {crumbs.map((c, i) => <span key={i} className={i === crumbs.length - 1 ? 'is-last' : ''}>{c}</span>)}
          </span>
        ) : <span className="rp-crumbs"><span>{project.split(/[\\/]/).pop()}</span></span>}
        <div className="spacer" />
        {file && !file.skipped && (
          <button className="icon-btn sm" aria-label="Copy file contents" title="Copy" onClick={() => { setCopied(true); navigator.clipboard.writeText(file.text).catch(() => {}); window.setTimeout(() => setCopied(false), 1400) }}>
            {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
          </button>
        )}
        <button className={`icon-btn sm${tree ? ' is-open' : ''}`} aria-pressed={tree} aria-label="File tree" title="File tree" onClick={() => setTree(t => !t)}><IconFolder size={13} /></button>
      </div>
      <div className="fs">
        <div className="fs-view">{file ? <Preview file={file} /> : <Empty title="No file open" hint={tree ? 'Pick a file from the tree.' : 'Open the file tree to pick one.'} />}</div>
        {tree && (
          <div className="fs-tree">
            <div className="rs" onPointerDown={e => dragResize(e, { key: 'suffice.treeW', start: e.currentTarget.parentElement!.offsetWidth, min: 160, max: 480, sign: -1, apply: px => setVar('--tree-w', px) })} />
            <label className="fs-filter">
              <IconSearch size={13} />
              <input value={query} placeholder="Filter files" aria-label="Filter files" spellCheck={false} onChange={e => setQuery(e.target.value)} />
            </label>
            <div className="fs-list">
              {hits ? (
                hits.length ? hits.map(p => (
                  <button key={p} className={`rp-row${file?.path === p ? ' is-active' : ''}`} title={p} onClick={() => void show(p)}>
                    <FileIcon name={p.split('/').pop()!} />
                    <span className="rp-row-name">{p.split('/').pop()}</span>
                    <span className="rp-row-dir">{p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''}</span>
                  </button>
                )) : <p className="rp-note">No files match</p>
              ) : query && !all ? null : dirs[''] && !dirs[''].length ? <p className="rp-note">This folder is empty</p> : rows('', 0)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
