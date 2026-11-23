import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { api, type GitHubProfile, type InitInfo, type ScreenStatus, type Settings } from '../api'
import { AccountsList } from './Accounts'
import { Segmented } from './ui'
import { IconCheck, IconGitHub } from '../icons'

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
  const [gh, setGh] = useState<{ installed: boolean; login: string | null; avatar: string; known?: boolean }>({ installed: true, login: null, avatar: '' })
  const [code, setCode] = useState<string | null>(null)
  const [profile, setProfile] = useState<GitHubProfile | null>(null)
  const [ghError, setGhError] = useState('')
  // a step change slides the copy out and the next one in, from the side it is heading to
  const go = (n: number) => {
    const root = document.documentElement
    root.dataset.introDir = n < step ? 'back' : 'fwd'
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return setStep(n)
    document.startViewTransition(() => flushSync(() => setStep(n)))
  }

  useEffect(() => {
    document.documentElement.classList.add('is-intro')
    api.init().then(i => {
      setInfo(i)
      setCallMe(i.settings.callMe ?? '')
      setStyle(i.settings.responseStyle ?? 'normal')
      setTheme(i.settings.theme ?? 'system')
    }, () => {})
    api.githubStatus().then(g => setGh({ ...g, known: true }), () => setGh(g => ({ ...g, known: true })))
  }, [])

  useEffect(() => {
    if (gh.login) api.githubProfile().then(setProfile, () => {})
  }, [gh.login])

  // gh finishes the device flow on its own; watch for the account while the code is up
  useEffect(() => {
    if (!code) return
    const t = setInterval(() => api.githubStatus().then(g => {
      setGh({ ...g, known: true })
      if (g.login) (setCode(null), go(1))
      else if (!g.waiting) (setCode(null), setGhError('GitHub sign-in stopped. Try again.'))
    }, () => {}), 1500)
    return () => clearInterval(t)
  }, [code])
  const signIn = async () => {
    if (!gh.known) return
    if (gh.login) return go(1)
    setGhError('')
    try {
      const r = await api.githubLogin()
      if (!r.installed) setGhError('Install GitHub CLI first, then sign in.')
      else setCode(r.code)
    } catch (e) {
      setGhError((e as Error).message)
    }
  }
  const cancelSignIn = () => (setCode(null), void api.githubCancel().catch(() => {}))

  // macOS has no event for these grants; poll while the step is open
  useEffect(() => {
    if (step !== 2) return
    const tick = () => api.screenStatus().then(setScreen, () => {})
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [step])

  const first = (info?.settings.profileName ?? '').trim().split(/\s+/)[0] ?? ''
  const holder = info?.settings.profileName?.trim() || profile?.name || gh.login || 'You'
  const avatar = profile?.avatar || gh.avatar
  const days = profile?.days ?? Array<number>(182).fill(0)
  const peak = Math.max(1, ...days)
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
    if (step === 0) return void signIn()
    if (step === 2 && both && info) await api.updateSettings({ capabilities: { ...info.settings.capabilities, browser: true, computer: true } }).catch(() => {})
    if (step === STEPS.length - 1) return void finish()
    go(step + 1)
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

  const label = step === STEPS.length - 1 ? 'Start' : 'Continue'
  return (
    <div className="intro">
      <div className="intro-card">
        <div className="intro-steps" aria-hidden>{STEPS.map((n, i) => <i key={n} className={i <= step ? 'is-on' : undefined} />)}</div>
        <section className="intro-copy" key={step}>
          {step === 0 && (
            <>
              <h1 className="intro-hello">Welcome to Suffice{first ? `, ${first}` : ''}.</h1>
              <div className="intro-auth">
                {code ? (
                  <>
                    <div className="intro-code" aria-label="GitHub code">{code}</div>
                    <div className="intro-auth-row">
                      <button className="intro-link" onClick={() => window.open('https://github.com/login/device')}>Open GitHub</button>
                      <button className="intro-link" onClick={cancelSignIn}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <button className="btn btn-primary intro-gh" onClick={() => void signIn()} disabled={!gh.known}>
                      <IconGitHub size={16} />{gh.login ? `Continue as ${gh.login}` : gh.known ? 'Sign in with GitHub' : 'GitHub'}<kbd>↩</kbd>
                    </button>
                    <button className="intro-link" onClick={() => go(1)}>Continue without an account</button>
                  </>
                )}
                {ghError && <p className="intro-error">{ghError}</p>}
              </div>
            </>
          )}
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
          {step > 0 && <footer className="intro-foot">
            <button className="btn btn-primary intro-go" onClick={() => void next()} disabled={!canNext || busy}>
              {label} <kbd>↩</kbd>
            </button>
            {step === 2 && !both && <button className="intro-link" onClick={() => go(3)}>Skip for now</button>}
            <button className="intro-link intro-back" onClick={() => go(step - 1)}>Back</button>
          </footer>}
        </section>
        <aside className="intro-stage" aria-hidden>
          {step === 0 ? (
            <div className={`intro-pass${profile ? ' is-live' : ''}`} key="pass" style={{ viewTransitionName: 'intro-hero-0' }}>
              <div className="intro-pass-grid">
                {days.map((c, i) => <i key={i} data-l={c ? Math.min(4, Math.ceil((4 * c) / peak)) : 0} style={{ animationDelay: `${Math.floor(i / 7) * 14}ms` }} />)}
              </div>
              <div className="intro-pass-body">
                <div className="intro-pass-name">
                  {avatar && <img src={avatar} alt="" />}
                  <span><b>{holder}</b>{profile && profile.name && <small>@{profile.login}</small>}</span>
                </div>
                <div className="intro-pass-meta">{profile ? `${profile.total.toLocaleString()} contributions this year · ${profile.repos} repos · since ${profile.since}` : info?.defaultLabel ?? ''}</div>
                <div className="intro-pass-foot"><span className="logo">[suffice]</span><span>{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
              </div>
            </div>
          ) : (
          <div className="intro-mock" key={step} style={{ viewTransitionName: `intro-hero-${step}` }}>
            <div className="intro-mock-bar"><i /><i /><i /></div>
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
                <div><span className="shimmer">Reading the page</span></div>
              </div>
            )}
            {step === 3 && (
              <div className="intro-mock-chat">
                <div className="intro-mock-you">Why did parse() crash?</div>
                <div className="intro-mock-reply">{callMe.trim() ? `${callMe.trim()}, ${REPLY[style][0].toLowerCase()}${REPLY[style].slice(1)}` : REPLY[style]}</div>
              </div>
            )}
          </div>
          )}
        </aside>
      </div>
    </div>
  )
}
