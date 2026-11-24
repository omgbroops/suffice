import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { api } from '../../api'
import { Empty } from './Empty'

// the terminal takes its colours from the app's tokens, so it follows the theme
const theme = () => {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return { background: v('--panel'), foreground: v('--text'), cursor: v('--text'), cursorAccent: v('--panel'), selectionBackground: `rgba(${v('--wash')}, 0.22)` }
}

/** One shell in the project folder. It stays mounted while its tab exists, so the session survives switching tabs. */
export function Term({ project, hidden, onTitle }: { project: string; hidden: boolean; onTitle: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [error, setError] = useState('')
  const [ended, setEnded] = useState(false)
  const [run, setRun] = useState(0)

  useEffect(() => {
    const el = box.current!
    const term = new Terminal({ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: 12, lineHeight: 1.25, cursorBlink: true, theme: theme(), scrollback: 5000 })
    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)
    term.open(el)
    try { fit.fit() } catch {}
    let id = '', gone = false
    const offData = api.on('terminal:data', (p: { id: string; data: string }) => { if (p.id === id) term.write(p.data) })
    const offExit = api.on('terminal:exit', (p: { id: string }) => { if (p.id === id) setEnded(true) })
    api.terminalOpen(project, term.cols, term.rows).then(
      opened => {
        if (gone) return void api.terminalClose(opened).catch(() => {})
        id = opened
        term.focus()
      },
      e => setError(e instanceof Error ? e.message : String(e)),
    )
    const typed = term.onData(data => { if (id) void api.terminalWrite(id, data).catch(() => {}) })
    const sized = term.onResize(({ cols, rows }) => { if (id) void api.terminalResize(id, cols, rows).catch(() => {}) })
    const titled = term.onTitleChange(t => onTitle(t.slice(0, 40)))
    const resize = new ResizeObserver(() => { if (el.clientWidth && el.clientHeight) try { fit.fit() } catch {} })
    resize.observe(el)
    const scheme = matchMedia('(prefers-color-scheme: dark)')
    const recolor = () => (term.options.theme = theme())
    scheme.addEventListener('change', recolor)
    return () => {
      gone = true
      offData(); offExit(); typed.dispose(); sized.dispose(); titled.dispose()
      resize.disconnect()
      scheme.removeEventListener('change', recolor)
      if (id) void api.terminalClose(id).catch(() => {})
      term.dispose()
    }
  }, [project, run])

  useEffect(() => { if (!hidden) try { fitRef.current?.fit() } catch {} }, [hidden])

  return (
    <div className={`rp-layer rp-term${hidden ? ' is-hidden' : ''}`}>
      {error ? <Empty title="The terminal could not start" hint={error} action={<button className="btn" onClick={() => (setError(''), setRun(n => n + 1))}>Try again</button>} /> : <div className="rp-term-box" ref={box} />}
      {ended && !error && (
        <div className="rp-term-ended">
          <span>The shell exited</span>
          <button className="btn" onClick={() => (setEnded(false), setRun(n => n + 1))}>Start a new one</button>
        </div>
      )}
    </div>
  )
}
