import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SECTIONS, type Prefs, type Row } from '../../shared/prefs.mjs'
import { api, type About, type ModelInfo, type Resources } from '../api'
import { IconCheck, IconChevronDown, IconSearch } from '../icons'
import { Dropdown } from './Dropdown'
import { ProviderIcon } from './ProviderIcon'
import { baseName } from './Pickers'

type Props = {
  prefs: Prefs
  models: ModelInfo[]
  section: string
  archived: { path: string; title: string; project: string }[]
  onSection: (id: string) => void
  onChange: (patch: Prefs) => void
  onSignOut: () => void
  onNotice: (text: string) => void
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button className={`mp-switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

function Select({ value, options, labels, onChange, label, disabled }: { value: string; options: string[]; labels?: Record<string, string>; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  return (
    <Dropdown
      width={220}
      align="right"
      maxHeight={320}
      trigger={({ open, toggle, ref }) => (
        <button ref={ref} className={`set-select${open ? ' is-open' : ''}`} onClick={toggle} aria-label={label} aria-expanded={open} disabled={disabled}>
          {labels?.[value] ?? value}
          <IconChevronDown size={12} />
        </button>
      )}
    >
      {close => (
        <div className="dd-list">
          {options.map(o => (
            <button
              key={o}
              className={`dd-row${o === value ? ' is-selected' : ''}`}
              onClick={() => {
                onChange(o)
                close()
              }}
            >
              <span className="dd-title dd-grow">{labels?.[o] ?? o}</span>
              {o === value && <IconCheck size={13} className="dd-check" />}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

function Line({ label, detail, children, soon }: { label: ReactNode; detail?: ReactNode; children?: ReactNode; soon?: boolean }) {
  return (
    <div className={`set-row${soon ? ' is-soon' : ''}`}>
      <div className="set-copy">
        <div className="set-label">{label}</div>
        {detail && <div className="set-detail">{detail}</div>}
      </div>
      <div className="set-control">{soon ? <span className="set-soon">Not available yet</span> : children}</div>
    </div>
  )
}

function ModelList({ models, prefs, onChange }: { models: ModelInfo[]; prefs: Prefs; onChange: (p: Prefs) => void }) {
  const [q, setQ] = useState('')
  const hidden = new Set<string>(prefs['disabled-models'] ?? [])
  const shown = models.filter(m => `${m.name} ${m.id}`.toLowerCase().includes(q.trim().toLowerCase()))
  const set = (ids: string[], on: boolean) => {
    const next = new Set(hidden)
    for (const id of ids) on ? next.delete(id) : next.add(id)
    onChange({ 'disabled-models': [...next] })
  }
  return (
    <>
      <div className="set-row set-tools">
        <label className="set-search">
          <IconSearch size={13} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter models" spellCheck={false} />
        </label>
        <button className="btn" onClick={() => set(shown.map(m => m.id), true)}>Show all</button>
        <button className="btn" onClick={() => set(shown.map(m => m.id), false)}>Hide all</button>
      </div>
      {shown.map(m => (
        <Line key={m.id} label={<span className="set-model"><ProviderIcon id={m.id} />{m.name}</span>} detail={m.id}>
          <Switch on={!hidden.has(m.id)} onChange={on => set([m.id], on)} label={`Show ${m.name}`} />
        </Line>
      ))}
    </>
  )
}

const RESOURCE_COPY: Record<string, { empty: string; folder: string; note?: string; toggles: boolean }> = {
  mcps: { empty: 'No MCP servers in mcp.json.', folder: 'Open mcp.json', note: 'Servers from ~/.suffice/mcp.json. Changes apply to new sessions.', toggles: true },
  skills: { empty: 'No skills found.', folder: 'Open folder', note: 'Skills from ~/.suffice/skills and the paths in settings.json.', toggles: true },
  templates: { empty: 'No prompt templates found.', folder: 'Open folder', note: 'Markdown files in ~/.suffice/prompts.', toggles: true },
  extensions: { empty: 'No extensions installed.', folder: 'Open folder', note: 'Extensions run code with the agent’s permissions.', toggles: false },
}

function ResourceList({ kind, onNotice }: { kind: keyof Resources; onNotice: (t: string) => void }) {
  const [data, setData] = useState<Resources | null>(null)
  useEffect(() => {
    api.resources().then(setData).catch(e => onNotice(e.message))
  }, [])
  const copy = RESOURCE_COPY[kind]
  const list = (data?.[kind] ?? []) as Resources['skills']
  return (
    <>
      <Line label={<span className="set-detail">{copy.note}</span>}>
        <button className="btn" onClick={() => void api.openResources(kind).catch(e => onNotice(e.message))}>{copy.folder}</button>
      </Line>
      {!data && <div className="set-empty">Loading</div>}
      {data && !list.length && <div className="set-empty">{copy.empty}</div>}
      {list.map(r => (
        <Line key={`${r.name}:${r.path ?? ''}`} label={r.name} detail={<span className="pii">{r.detail}</span>}>
          {copy.toggles && (
            <Switch
              on={r.enabled !== false}
              label={r.name}
              onChange={on =>
                void api
                  .toggleResource(kind, r.name, on)
                  .then(setData)
                  .catch(e => onNotice(e.message))
              }
            />
          )}
        </Line>
      ))}
    </>
  )
}

function AboutRows() {
  const [about, setAbout] = useState<About | null>(null)
  useEffect(() => void api.about().then(setAbout).catch(() => {}), [])
  if (!about) return null
  return (
    <>
      <Line label="Desktop app">{about.version}</Line>
      <Line label="Electron">{about.electron ?? '—'}</Line>
      <Line label="Node">{about.node}</Line>
      <Line label="Data folder"><span className="pii">{about.home}</span></Line>
    </>
  )
}

export function SettingsPage(p: Props) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const modelLabels = useMemo(() => Object.fromEntries(p.models.map(m => [m.id, m.name])), [p.models])

  // Searching shows every matching row, from every section.
  const sections = useMemo(() => {
    if (!query) return SECTIONS.filter(s => s.id === p.section)
    return SECTIONS.map(s => ({ ...s, groups: s.groups.map(g => ({ ...g, rows: g.rows.filter(r => 'label' in r && `${s.title} ${g.title} ${r.label}`.toLowerCase().includes(query)) })).filter(g => g.rows.length) })).filter(s => s.groups.length)
  }, [query, p.section])

  const row = (r: Row, i: number) => {
    switch (r.kind) {
      case 'toggle':
        return (
          <Line key={r.id} label={r.label} detail={r.detail} soon={r.soon}>
            <Switch on={!!p.prefs[r.id]} onChange={v => p.onChange({ [r.id]: v })} label={r.label} />
          </Line>
        )
      case 'select': {
        const options = r.id === 'default-model' ? ['Last used', ...p.models.map(m => m.id)] : r.options
        return (
          <Line key={r.id} label={r.label} detail={r.detail} soon={r.soon}>
            <Select value={p.prefs[r.id] ?? r.value} options={options} labels={r.id === 'default-model' ? modelLabels : undefined} onChange={v => p.onChange({ [r.id]: v })} label={r.label} />
          </Line>
        )
      }
      case 'segment':
        return (
          <Line key={r.id} label={r.label} detail={r.detail}>
            <div className="seg set-seg">
              {r.options.map(o => (
                <button key={o} className={`seg-opt${(p.prefs[r.id] ?? r.value) === o ? ' is-active' : ''}`} onClick={() => p.onChange({ [r.id]: o })}>
                  {o}
                </button>
              ))}
            </div>
          </Line>
        )
      case 'keys':
        return (
          <Line key={i} label={r.label}>
            <span className="set-keys">{r.value.split(' ').map(k => <kbd key={k}>{k}</kbd>)}</span>
          </Line>
        )
      case 'action':
        return (
          <Line key={r.id} label={r.label} detail={r.detail} soon={r.soon}>
            <button
              className="btn"
              onClick={() =>
                void api
                  .exportSessions()
                  .then(done => done && p.onNotice(`Exported ${done.count} session${done.count === 1 ? '' : 's'}.`))
                  .catch(e => p.onNotice(e.message))
              }
            >
              {r.value}
            </button>
          </Line>
        )
      case 'models':
        return <ModelList key="models" models={p.models} prefs={p.prefs} onChange={p.onChange} />
      case 'resources':
        return <ResourceList key={r.id} kind={r.id as keyof Resources} onNotice={p.onNotice} />
      case 'providers':
        return (
          <Fragmentless key="providers">
            <Line label={<span className="set-model"><ProviderIcon id="gpt" />OpenAI</span>} detail="ChatGPT account, signed in on this device">
              <button className="btn" onClick={p.onSignOut}>Sign out</button>
            </Line>
            <Line label="Other providers" detail="API keys for Anthropic, Google and others" soon />
          </Fragmentless>
        )
      case 'archived':
        return p.archived.length ? (
          <Fragmentless key="archived">
            {p.archived.map(t => (
              <Line key={t.path} label={t.title} detail={<span className="pii">{baseName(t.project)}</span>}>
                <button className="btn" onClick={() => p.onChange({ archived: (p.prefs.archived ?? []).filter((x: string) => x !== t.path) })}>Unarchive</button>
              </Line>
            ))}
          </Fragmentless>
        ) : (
          <div key="archived" className="set-empty">No archived threads. Archive one from its row in the sidebar.</div>
        )
      case 'about':
        return <AboutRows key="about" />
    }
  }

  return (
    <div className="settings">
      <nav className="set-nav" aria-label="Settings sections">
        <label className="set-search">
          <IconSearch size={13} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search settings" spellCheck={false} />
        </label>
        {SECTIONS.map(s => (
          <button key={s.id} className={`set-nav-item${!query && s.id === p.section ? ' is-active' : ''}`} onClick={() => (setQ(''), p.onSection(s.id))}>
            {s.title}
          </button>
        ))}
      </nav>
      <div className="set-scroll">
        <div className="set-col">
          {sections.length === 0 && <div className="set-empty">No settings match “{q}”</div>}
          {sections.map(s => (
            <section key={s.id}>
              <h1 className="set-title">{s.title}</h1>
              {s.groups.map(g => (
                <div key={g.title} className="set-group">
                  <div className="set-group-title">{g.title}</div>
                  <div className="set-card">{g.rows.map(row)}</div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

const Fragmentless = ({ children }: { children: ReactNode }) => <>{children}</>
