import { useState, type ReactNode } from 'react'
import type { Settings } from '../api'
import { IconCheck, IconEye, IconFolder, IconLockOpen, IconPlus, IconShield } from '../icons'
import { Dropdown } from './Dropdown'
import { ProjectEmblem } from './Sidebar'

export const baseName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path

/** "C:\Users\me\…\project": the start and the folder name, the middle elided. */
export function shortPath(path: string, max = 34) {
  if (path.length <= max) return path
  const name = baseName(path)
  const head = path.slice(0, Math.max(6, max - name.length - 1))
  return `${head}…${name}`
}

type Mode = Settings['approval']

export const MODES: { id: Mode; label: string; note: string; icon: ReactNode }[] = [
  { id: 'every', label: 'Supervised', note: 'Ask before every action, reads included', icon: <IconEye size={14} /> },
  { id: 'ask', label: 'Auto', note: 'Reads run freely; asks before edits and commands', icon: <IconShield size={14} /> },
  { id: 'never', label: 'Full access', note: 'Run everything without asking', icon: <IconLockOpen size={14} /> },
]

export function PermissionPicker({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const current = MODES.find(m => m.id === value) ?? MODES[1]
  return (
    <Dropdown
      width={280}
      trigger={({ open, toggle, ref }) => (
        <button ref={ref} className={`ghost-btn${open ? ' is-open' : ''}${value === 'never' ? ' is-on' : ''}`} onClick={toggle} aria-haspopup="menu" aria-expanded={open} title="Permissions">
          {current.icon}
          {current.label}
        </button>
      )}
    >
      {close => (
        <div className="dd-list">
          {MODES.map(m => (
            <button
              key={m.id}
              role="menuitemradio"
              aria-checked={m.id === value}
              className={`dd-row dd-row-tall${m.id === value ? ' is-selected' : ''}`}
              onClick={() => {
                onChange(m.id)
                close()
              }}
            >
              <span className="dd-icon">{m.icon}</span>
              <span className="dd-text">
                <span className="dd-title">{m.label}</span>
                <span className="dd-note">{m.note}</span>
              </span>
              {m.id === value && <IconCheck size={13} className="dd-check" />}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

function ProjectList({ project, projects, onPick, onAdd, close }: { project: string | null; projects: string[]; onPick: (p: string) => void; onAdd: () => void; close: () => void }) {
  const [q, setQ] = useState('')
  const list = projects.filter(p => p.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="dd-list">
      <input className="dd-search" autoFocus placeholder="Search projects" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && list[0]) { onPick(list[0]); close() } }} />
      {list.map(p => (
        <button key={p} role="menuitemradio" aria-checked={p === project} className={`dd-row${p === project ? ' is-selected' : ''}`} title={p} onClick={() => { onPick(p); close() }}>
          <ProjectEmblem path={p} />
          <span className="dd-title dd-grow">{baseName(p)}</span>
          {p === project && <IconCheck size={13} className="dd-check" />}
        </button>
      ))}
      {!list.length && <div className="dd-empty">No projects match</div>}
      <div className="dd-rule" />
      <button className="dd-row" onClick={() => { close(); onAdd() }}>
        <span className="dd-icon"><IconPlus size={14} /></span>
        <span className="dd-title">Add folder…</span>
      </button>
    </div>
  )
}

export function ProjectPicker({ project, projects, onPick, onAdd }: { project: string | null; projects: string[]; onPick: (p: string) => void; onAdd: () => void }) {
  return (
    <Dropdown
      width={260}
      trigger={({ open, toggle, ref }) => (
        <button ref={ref} className={`ghost-btn${open ? ' is-open' : ''}`} onClick={toggle} aria-haspopup="menu" aria-expanded={open} title={project ?? 'Choose a project'}>
          <IconFolder size={14} />
          {project ? baseName(project) : 'Choose a project'}
        </button>
      )}
    >
      {close => <ProjectList project={project} projects={projects} onPick={onPick} onAdd={onAdd} close={close} />}
    </Dropdown>
  )
}
