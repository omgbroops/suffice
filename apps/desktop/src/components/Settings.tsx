import { useEffect, Fragment, useMemo, useState, type ReactNode } from 'react'
import { api, type InitInfo, type ModelInfo, type Settings, type Usage } from '../api'
import { Segmented } from './ui'
import { AccountsList } from './Accounts'
import { IconArrowLeft, IconBarChart, IconBell, IconClose, IconCode, IconComponent, IconCube, IconLock, IconMonitor, IconPerson, IconSearch, IconSliders } from '../icons'

type Patch = (p: Partial<Settings>) => void

const SECTIONS = ['Account', 'Usage', 'Appearance', 'Your Suffice', 'Capabilities', 'Notifications', 'Privacy', 'Code', 'Desktop app'] as const
const NAV_ICON = { Account: IconPerson, Usage: IconBarChart, Appearance: IconSliders, 'Your Suffice': IconComponent, Capabilities: IconCube, Notifications: IconBell, Privacy: IconLock, Code: IconCode, 'Desktop app': IconMonitor }
const RULE_BEFORE = new Set(['Appearance', 'Code', 'Desktop app'])
type Section = (typeof SECTIONS)[number]

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}><i /></button>
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="set-row"><span className="set-label">{label}</span><div className="set-ctl">{children}</div></div>
)

const money = (n: number) => (n > 0 && n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`)
const tok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))

function UsageRows({ rows }: { rows: (l: string, c: ReactNode) => ReactNode }) {
  const [u, setU] = useState<Usage | null | undefined>(undefined)
  useEffect(() => {
    void (async () => {
      try {
        const v = await api.usage()
        setU(v?.total?.runs ? v : null)
      } catch {
        setU(null)
      }
    })()
  }, [])
  if (u === undefined) return null
  if (!u) return <div className="set-empty">No runs yet</div>
  const days = u.days.slice(-7)
  const max = Math.max(...days.map(d => d.apiCostUsd), 0.0001)
  const saved = u.plan.kind === 'subscription' ? u.total.apiCostUsd : u.savedUsd
  return (
    <>
      {rows('Runs this week', u.total.runs)}
      {rows('Tokens', `${tok(u.total.inputTokens + u.total.cacheReadTokens + u.total.cacheWriteTokens)} in, ${tok(u.total.outputTokens)} out`)}
      {rows('API-equivalent cost', money(u.total.apiCostUsd))}
      {rows('Saved', money(saved))}
      <div className="set-bars" aria-label="Last 7 days">
        {days.map(d => <span key={d.date} title={`${d.date} ${money(d.apiCostUsd)}`} style={{ height: `${Math.max(4, (d.apiCostUsd / max) * 100)}%` }} />)}
      </div>
    </>
  )
}

export function SettingsPage({ platform, info, settings, models, patch, onClose }: { platform: string; info: InitInfo; settings: Settings; models: ModelInfo[]; patch: Patch; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sec, setSec] = useState<Section>('Account')
  const [confirm, setConfirm] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [version, setVersion] = useState('')
  const [login, setLogin] = useState(!!settings.openAtLogin)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  useEffect(() => {
    void (async () => { try { const i = await api.appInfo(); setVersion(i.version); setLogin(i.openAtLogin) } catch {} })()
  }, [])

  const cap = settings.capabilities ?? {}
  const note = settings.notify ?? {}
  const folders = settings.folderAccess ?? []
  const model = models.find(m => m.id === settings.model)
  const efforts = model?.efforts ?? []
  const addFolder = async () => {
    const prev = settings.project
    try {
      const r = await api.chooseProject()
      if (!r) return
      if (!folders.includes(r.project)) patch({ folderAccess: [...folders, r.project] })
      if (prev && prev !== r.project) patch({ project: prev })
    } catch {}
  }
  const text = (key: 'profileName' | 'callMe') => <input className="set-input" value={settings[key] ?? ''} onChange={e => patch({ [key]: e.target.value })} />
  const sw = (label: string, on: boolean, set: (v: boolean) => void) => [label, <Switch key={label} label={label} on={on} onChange={set} />] as const

  const rows: Record<Section, (readonly [string, ReactNode])[]> = {
    Account: [
      ['Name', text('profileName')],
      ['Call me', text('callMe')],
      ['Work', (
        <select className="set-input" value={settings.work ?? ''} onChange={e => patch({ work: e.target.value })}>
          <option value="">Not set</option>
          {['Engineering', 'Design', 'Product', 'Research', 'Writing', 'Student', 'Other'].map(w => <option key={w}>{w}</option>)}
        </select>
      )],
    ],
    Usage: [],
    Appearance: [
      ['Theme', <Segmented value={settings.theme ?? 'system'} onChange={theme => patch({ theme })} options={[{ v: 'system', label: 'System' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }]} />],
      ['Font size', <Segmented value={settings.fontSize ?? 'medium'} onChange={fontSize => patch({ fontSize })} options={[{ v: 'small', label: 'Small' }, { v: 'medium', label: 'Medium' }, { v: 'large', label: 'Large' }]} />],
      sw('Reduce motion', !!settings.reduceMotion, reduceMotion => patch({ reduceMotion })),
    ],
    'Your Suffice': [
      ['Custom instructions', <textarea className="set-input set-area" rows={4} value={settings.customInstructions ?? ''} onChange={e => patch({ customInstructions: e.target.value })} />],
      ['Response style', <Segmented value={settings.responseStyle ?? 'normal'} onChange={responseStyle => patch({ responseStyle })} options={[{ v: 'concise', label: 'Concise' }, { v: 'normal', label: 'Normal' }, { v: 'explanatory', label: 'Explanatory' }]} />],
      sw('Use Claude config', !!settings.useClaudeConfig, useClaudeConfig => patch({ useClaudeConfig })),
    ],
    Code: [
      ['Approval', <Segmented value={settings.approval} onChange={approval => patch({ approval })} options={[{ v: 'ask', label: 'Ask' }, { v: 'every', label: 'Every edit' }, { v: 'never', label: 'Never' }]} />],
      ['Verbosity', <Segmented value={settings.verbosity ?? 'normal'} onChange={verbosity => patch({ verbosity })} options={[{ v: 'quiet', label: 'Quiet' }, { v: 'normal', label: 'Normal' }, { v: 'verbose', label: 'Verbose' }]} />],
      ['Default model', (
        <select className="set-input" value={settings.model} onChange={e => patch({ model: e.target.value })}>
          {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )],
      ...(efforts.length ? [['Effort', (
        <select className="set-input" value={settings.efforts[settings.model] ?? ''} onChange={e => patch({ efforts: { ...settings.efforts, [settings.model]: e.target.value } })}>
          <option value="">Default</option>
          {efforts.map(f => <option key={f}>{f}</option>)}
        </select>
      )] as const] : []),
      ['Folder access', (
        <div className="set-folders">
          {folders.map(f => (
            <div key={f} className="set-folder"><span title={f}>{f}</span><button className="icon-btn" aria-label={`Remove ${f}`} onClick={() => patch({ folderAccess: folders.filter(x => x !== f) })}><IconClose /></button></div>
          ))}
          <button className="btn" onClick={() => void addFolder()}>Add folder</button>
        </div>
      )],
    ],
    Capabilities: [
      sw('Web', cap.web !== false, web => patch({ capabilities: { ...cap, web } })),
      sw('Browser', cap.browser === true, browser => patch({ capabilities: { ...cap, browser } })),
      sw('Computer', cap.computer === true, computer => patch({ capabilities: { ...cap, computer } })),
      sw('MCP', cap.mcp !== false, mcp => patch({ capabilities: { ...cap, mcp } })),
    ],
    Notifications: [
      sw('Task done', note.done !== false, done => patch({ notify: { ...note, done } })),
      sw('Needs input', note.needsInput !== false, needsInput => patch({ notify: { ...note, needsInput } })),
      sw('Sound', note.sound === true, sound => patch({ notify: { ...note, sound } })),
    ],
    Privacy: [
      ['Keep history', <Segmented value={String(settings.transcriptDays ?? 0) as '0' | '7' | '30' | '90'} onChange={v => patch({ transcriptDays: Number(v) as 0 | 7 | 30 | 90 })} options={[{ v: '0', label: 'Forever' }, { v: '7', label: '7 days' }, { v: '30', label: '30 days' }, { v: '90', label: '90 days' }]} />],
      ['Local history', confirm ? (
        <span className="set-confirm">Delete all transcripts and sessions?
          <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void (async () => { try { await api.clearHistory(); setCleared(true) } catch {} setConfirm(false) })()}>Delete</button>
        </span>
      ) : <button className="btn" onClick={() => (setCleared(false), setConfirm(true))}>{cleared ? 'Cleared' : 'Clear all local history'}</button>],
    ],
    'Desktop app': [
      ['Version', <span className="set-val">{version || '-'}</span>],
      sw('Open at login', login, openAtLogin => (setLogin(openAtLogin), patch({ openAtLogin }))),
    ],
  }

  const needle = q.trim().toLowerCase()
  const match = (l: string) => l.toLowerCase().includes(needle)
  const visible = useMemo(() => (needle ? SECTIONS.filter(s => rows[s].some(r => match(r[0])) || (s === 'Usage' && match('usage'))) : [sec]), [needle, sec, rows])
  const line = (l: string, c: ReactNode) => <Row key={l} label={l}>{c}</Row>

  return (
    <div className="app is-bare">
      <header className={`titlebar is-${platform}`}><span className="logo titlebar-logo">[suffice]</span></header>
      <main className="set">
        <nav className="set-nav">
          <button className="set-back" onClick={onClose}><IconArrowLeft /> Settings</button>
          <label className="set-search"><IconSearch /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" aria-label="Search settings" /></label>
          {SECTIONS.map(s => { const I = NAV_ICON[s]; return <Fragment key={s}>{RULE_BEFORE.has(s) && <i className="set-nav-rule" />}<button className={`set-nav-item${!needle && s === sec ? ' is-active' : ''}`} onClick={() => (setQ(''), setSec(s))}><I />{s}</button></Fragment> })}
        </nav>
        <div className="set-pane">
          {visible.map(s => (
            <section key={s}>
              <h2 className="set-title">{s}</h2>
              {s === 'Usage' && <UsageRows rows={line} />}
              {rows[s].filter(r => !needle || match(r[0])).map(r => line(r[0], r[1]))}
              {s === 'Account' && !needle && <div className="set-accounts"><AccountsList info={info} /></div>}
              {s === 'Privacy' && !needle && <div className="set-note">Nothing is sent anywhere except to the model provider you connected.</div>}
            </section>
          ))}
          {needle && !visible.length && <div className="set-empty">No matches</div>}
        </div>
      </main>
    </div>
  )
}
