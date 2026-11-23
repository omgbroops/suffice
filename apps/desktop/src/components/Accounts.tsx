import { useEffect, useState } from 'react'
import { api, type AccountRow, type InitInfo } from '../api'

const STATUS = (r: AccountRow) => (r.connected ? (r.kind === 'key' ? r.detail : 'Signed in') : r.installed ? 'Installed, not signed in' : 'Not installed')

type Row = AccountRow

/** Sign-in and API-key rows, shared by the connect screen and Settings. */
export function AccountsList({ info, onRows }: { info: InitInfo; onRows?: (rows: Row[]) => void }) {
  const [rows, setRows] = useState<Row[]>(info.accounts ?? [])
  const [busy, setBusy] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState('')
  const refresh = async () => {
    setBusy(true)
    try {
      setRows(await api.accounts())
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void refresh()
  }, [])
  useEffect(() => onRows?.(rows), [rows])
  const clis = rows.filter(r => r.kind === 'cli')
  const keys = rows.filter(r => r.kind === 'key')
  const say = (id: string, m: string) => setMsg(x => ({ ...x, [id]: m }))
  const save = async (r: Row) => {
    const v = (drafts[r.id] ?? '').trim()
    if (!v) return
    try {
      await api.setKey(r.id.slice(4), v)
      setDrafts(d => ({ ...d, [r.id]: '' }))
      say(r.id, '')
      await refresh()
    } catch (e) {
      say(r.id, (e as Error).message)
    }
  }
  const test = async (r: Row) => {
    say(r.id, 'Testing…')
    try {
      say(r.id, (await api.testKey(r.id.slice(4))).message)
    } catch (e) {
      say(r.id, (e as Error).message)
    }
  }
  const remove = async (r: Row) => {
    try {
      await api.removeKey(r.id.slice(4))
      say(r.id, '')
      await refresh()
    } catch (e) {
      say(r.id, (e as Error).message)
    }
  }
  const copy = (r: Row) => {
    const cmd = r.howTo.replace(/^Run /, '').replace(/ in a terminal$/, '')
    void navigator.clipboard?.writeText(cmd)
    setCopied(r.id)
  }
  const Dot = ({ on }: { on: boolean }) => <span className={`side-user-dot${on ? '' : ' is-off'}`} aria-hidden />
  return (
    <>
          <div className="menu accounts-list" role="list">
            {clis.map(r => (
              <div className="menu-row" role="listitem" key={r.id}>
                <span>{r.name}</span>
                <span className="menu-status-val">
                  <Dot on={r.connected} />
                  {STATUS(r)}
                  {r.connected ? (
                    <button className="btn" onClick={() => void refresh()} disabled={busy}>Refresh</button>
                  ) : r.installed ? (
                    <button className="btn" onClick={() => copy(r)}>{copied === r.id ? 'Copied' : 'Copy login command'}</button>
                  ) : (
                    <a className="btn" href={r.install} target="_blank" rel="noreferrer">Install</a>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="signin-copy accounts-head">API keys</div>
          <div className="menu accounts-list">
            {keys.map(r => (
              <form
                className="menu-row accounts-key"
                key={r.id}
                onSubmit={e => {
                  e.preventDefault()
                  void save(r)
                }}
              >
                <span>{r.name.replace(' key', '')}</span>
                {r.connected ? (
                  <span className="menu-status-val">
                    <Dot on />
                    {msg[r.id] || r.detail}
                    <button type="button" className="btn" onClick={() => void test(r)}>Test</button>
                    <button type="button" className="btn" onClick={() => void remove(r)}>Remove</button>
                  </span>
                ) : (
                  <span className="menu-status-val">
                    <input type="password" autoComplete="off" spellCheck={false} placeholder={msg[r.id] || 'Paste key'} aria-label={`${r.name}`} value={drafts[r.id] ?? ''} onChange={e => setDrafts(d => ({ ...d, [r.id]: e.target.value }))} />
                    <button className="btn" disabled={!(drafts[r.id] ?? '').trim()}>Add key</button>
                  </span>
                )}
              </form>
            ))}
          </div>
    </>
  )
}
