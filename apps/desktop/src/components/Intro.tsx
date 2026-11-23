import { useEffect, useState } from 'react'
import { api, type InitInfo, type ScreenStatus, type Settings } from '../api'
import { AccountsList } from './Accounts'
import { Segmented } from './ui'
import { IconCheck } from '../icons'

type Style = NonNullable<Settings['responseStyle']>
const STEPS = ['Welcome', 'Models', 'Screen', 'You'] as const

const REPLY: Record<Style, string> = {
  concise: 'Fixed. The null check was missing in parse().',
  normal: 'Fixed the crash: parse() read a field before checking it was set. I added the check and a test.',
  explanatory: 'The crash came from parse() reading a field before checking it was set, which happens when the file is empty. I added the check, plus a test with an empty file so it stays fixed.',
}

/** First-run setup: a card floating over the desktop, one choice per step. */
export function Intro() {
  const [step, setStep] = useState(0)
  const [info, setInfo] = useState<InitInfo | null>(null)
  const [connected, setConnected] = useState(false)
  const [keys, setKeys] = useState(false)
  const [screen, setScreen] = useState<ScreenStatus>({ accessibility: false, screen: false })
  const [callMe, setCallMe] = useState('')
  const [style, setStyle] = useState<Style>('normal')
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('is-intro')
    api.init().then(i => {
      setInfo(i)
      setCallMe(i.settings.callMe ?? '')
      setStyle(i.settings.responseStyle ?? 'normal')
      setTheme(i.settings.theme ?? 'system')
    }, () => {})
  }, [])

  // macOS has no event for these grants; poll while the step is open
  useEffect(() => {
    if (step !== 2) return
    const tick = () => api.screenStatus().then(setScreen, () => {})
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [step])

  const both = screen.accessibility && screen.screen
  const canNext = step !== 1 || connected
  const finish = async () => {
    if (!info || busy) return
    setBusy(true)
    try {
      await api.updateSettings({ callMe: callMe.trim(), responseStyle: style, theme })
      await api.introDone()
    } finally {
      setBusy(false)
    }
  }
  const next = async () => {
    if (!canNext) return
    if (step === 2 && both && info) await api.updateSettings({ capabilities: { ...info.settings.capabilities, browser: true, computer: true } }).catch(() => {})
    if (step === STEPS.length - 1) return void finish()
    setStep(s => s + 1)
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !(e.target instanceof HTMLButtonElement)) (e.preventDefault(), void next())
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  })
  const pickTheme = (t: typeof theme) => {
    setTheme(t)
    void api.updateSettings({ theme: t }).catch(() => {})
  }

  const label = step === 0 ? "Let's go" : step === STEPS.length - 1 ? 'Start' : 'Continue'
  return (
    <div className="intro">
      <div className="intro-card">
        <div className="intro-progress" aria-hidden><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        <section className="intro-copy" key={step}>
          {step === 0 && <h1 className="intro-hello">Welcome</h1>}
          {step === 1 && info && (
            <>
              <h1>Connect your models</h1>
              <p className="intro-lede">We checked your Mac for these.</p>
              <div className="intro-accounts">
                <AccountsList info={info} keys={keys} onRows={rows => setConnected(rows.some(r => r.connected))} />
              </div>
              {!keys && <button className="intro-link" onClick={() => setKeys(true)}>Use an API key instead</button>}
            </>
          )}
          {step === 2 && (
            <>
              <h1>Let Suffice use your screen</h1>
              <div className="intro-grants">
                {([['accessibility', 'Accessibility'], ['screen', 'Screen Recording']] as const).map(([k, name]) => (
                  <div className="intro-grant" key={k}>
                    <b>{name}</b>
                    {screen[k] ? <span className="intro-ok"><IconCheck size={13} /> Allowed</span> : <button className="btn" onClick={() => void api.screenRequest(k).then(setScreen, () => {})}>Allow</button>}
                  </div>
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h1>Make it yours</h1>
              <p className="intro-lede">Change any of this later in Settings.</p>
              <label className="intro-field">
                <span>What should it call you?</span>
                <input value={callMe} onChange={e => setCallMe(e.target.value)} placeholder="Your name" maxLength={100} autoFocus />
              </label>
              <div className="intro-field">
                <span>How should it answer?</span>
                <Segmented options={[{ v: 'concise', label: 'Concise' }, { v: 'normal', label: 'Normal' }, { v: 'explanatory', label: 'Explanatory' }]} value={style} onChange={setStyle} />
              </div>
              <div className="intro-field">
                <span>Theme</span>
                <Segmented options={[{ v: 'system', label: 'System' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }]} value={theme} onChange={pickTheme} />
              </div>
            </>
          )}
          <footer className="intro-foot">
            <button className="btn btn-primary intro-go" onClick={() => void next()} disabled={!canNext || busy}>
              {label} <kbd>↩</kbd>
            </button>
            {step === 2 && !both && <button className="intro-link" onClick={() => setStep(3)}>Skip for now</button>}
            {step > 0 && <button className="intro-link intro-back" onClick={() => setStep(s => s - 1)}>Back</button>}
          </footer>
        </section>
        <aside className="intro-stage" aria-hidden key={`s${step}`}>
          <div className="intro-mock">
            <div className="intro-mock-bar"><i /><i /><i /></div>
            {step === 0 && (
              <div className="intro-mock-home">
                <span className="logo">[suffice]</span>
                <div className="intro-mock-composer">Fix the failing test in parse.ts</div>
              </div>
            )}
            {step === 1 && (
              <div className="intro-mock-pick">
                <div className="intro-mock-row is-on">Claude Code · Opus 5.5</div>
                <div className="intro-mock-row">Claude Code · Sonnet 5.5</div>
                <div className="intro-mock-row">Claude Code · Haiku 5.5</div>
              </div>
            )}
            {step === 2 && (
              <div className="intro-mock-steps">
                <div>Opened Safari</div>
                <div>Clicked “Sign in”</div>
                <div>Typed the email</div>
                <div className="is-live">Reading the page</div>
              </div>
            )}
            {step === 3 && (
              <div className="intro-mock-chat">
                <div className="intro-mock-you">Why did parse() crash?</div>
                <div className="intro-mock-reply">{callMe.trim() ? `${callMe.trim()}, ${REPLY[style][0].toLowerCase()}${REPLY[style].slice(1)}` : REPLY[style]}</div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
