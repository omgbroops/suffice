import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { IconArrowUp, IconFolder, IconLaptop, IconPlus, IconShield, IconStop } from '../icons'

type Props = {
  placeholder?: string
  tip?: boolean
  working?: boolean
  autoFocus?: boolean
  disabled?: string
  project: string | null
  onProject: () => void
  bypass: boolean
  onBypass: (b: boolean) => void
  model: ReactNode
  onSend: (text: string) => void
  onStop?: () => void
}

const MAX = 260
export const baseName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path

export function Composer(p: Props) {
  const [text, setText] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = '0px'
    const h = Math.min(el.scrollHeight, MAX)
    el.style.height = `${h}px`
    el.style.overflowY = h === MAX ? 'auto' : 'hidden'
  }, [text])

  const canSend = text.trim().length > 0 && !p.working && !p.disabled
  const send = () => {
    if (!canSend) return
    p.onSend(text.trim())
    setText('')
  }

  return (
    <div className="composer-wrap">
      <div className={`composer${p.tip ? ' is-tall' : ''}`} onMouseDown={e => e.target === e.currentTarget && (e.preventDefault(), ta.current?.focus())}>
        <div className="composer-input">
          <textarea
            ref={ta}
            rows={1}
            value={text}
            autoFocus={p.autoFocus}
            placeholder={p.tip ? '' : p.placeholder}
            aria-label="Message"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
          />
          {p.tip && !text && (
            <div className="composer-tip" aria-hidden>
              Tip: Change the model and capabilities (<kbd>Ctrl</kbd><kbd>/</kbd>)
            </div>
          )}
        </div>
        <div className="composer-row">
          <button className="icon-btn" aria-label="Attach" title="Attachments are not wired up yet" disabled>
            <IconPlus size={15} />
          </button>
          <button
            className={`ghost-btn${p.bypass ? ' is-on' : ''}`}
            aria-pressed={p.bypass}
            onClick={() => p.onBypass(!p.bypass)}
            title={p.bypass ? 'Edits and commands run without asking' : 'Ask before edits and commands'}
          >
            <IconShield size={14} />
            Bypass permissions
          </button>
          <div className="spacer" />
          {p.model}
          {p.working ? (
            <button className="send-btn is-stop" onClick={p.onStop} aria-label="Stop">
              <IconStop size={13} />
            </button>
          ) : (
            <button className="send-btn" disabled={!canSend} onClick={send} aria-label="Send" title={p.disabled}>
              <IconArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="composer-foot">
        <span className="foot-btn is-static">
          <IconLaptop size={14} />
          Local
        </span>
        <button className="foot-btn" onClick={p.onProject} title={p.project ?? 'Choose a project'}>
          <IconFolder size={14} />
          {p.project ? baseName(p.project) : 'Choose a project'}
        </button>
      </div>
    </div>
  )
}
