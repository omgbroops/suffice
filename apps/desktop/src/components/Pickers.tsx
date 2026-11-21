import type { ReactNode } from 'react'
import type { Settings } from '../api'
import { IconCheck, IconEye, IconFolder, IconLockOpen, IconPlus, IconShield } from '../icons'
import { Dropdown } from './Dropdown'

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

function Box({ on }: { on: boolean }) {
  return <span className={`dd-box${on ? ' is-on' : ''}`} aria-hidden>{on && <IconCheck size={11} />}</span>
}

export function ProjectPicker({ project, projects, onPick, onAdd }: { project: string | null; projects: string[]; onPick: (p: string) => void; onAdd: () => void }) {
  const recent = projects.filter(p => p !== project)
  return (
    <Dropdown
      width={440}
      trigger={({ open, toggle, ref }) => (
        <button ref={ref} className={`ghost-btn${open ? ' is-open' : ''}`} onClick={toggle} aria-haspopup="menu" aria-expanded={open} title={project ?? 'Choose a project'}>
          <IconFolder size={14} />
          {project ? baseName(project) : 'Choose a project'}
        </button>
      )}
    >
      {close => {
        const pick = (p: string) => {
          onPick(p)
          close()
        }
        const row = (p: string, on: boolean) => (
          <button key={p} role="menuitemradio" aria-checked={on} className={`dd-row${on ? ' is-selected' : ''}`} onClick={() => pick(p)} title={p}>
            <span className="dd-icon"><IconFolder size={14} /></span>
            <span className="dd-title">{baseName(p)}</span>
            <span className="dd-path">{shortPath(p)}</span>
            <Box on={on} />
          </button>
        )
        return (
          <div className="dd-list">
            {project && row(project, true)}
            {recent.length > 0 && <div className="dd-section">Recent</div>}
            {recent.map(p => row(p, false))}
            <div className="dd-rule" />
            <button
              className="dd-row"
              onClick={() => {
                close()
                onAdd()
              }}
            >
              <span className="dd-icon"><IconPlus size={14} /></span>
              <span className="dd-title">Add folder…</span>
            </button>
          </div>
        )
      }}
    </Dropdown>
  )
}
