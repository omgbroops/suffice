import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { IconArrowUp, IconPlus, IconStop } from '../icons'

type Props = {
  placeholder?: string
  tip?: boolean
  working?: boolean
  autoFocus?: boolean
  disabled?: string
  permissions: ReactNode
  project: ReactNode
  model: ReactNode
  /** The new-session layout: a one-line box with the pickers on a bar beneath it. */
  line?: boolean
  env?: ReactNode
  onSend: (text: string) => void
  onStop?: () => void
}

const MAX = 260

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

  const focus = (e: MouseEvent) => e.target === e.currentTarget && (e.preventDefault(), ta.current?.focus())
  const textarea = (
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
  )
  const action = p.working ? (
    <button className="send-btn is-stop" onClick={p.onStop} aria-label="Stop">
      <IconStop size={13} />
    </button>
  ) : (
    <button className="send-btn" disabled={!canSend} onClick={send} aria-label="Send" title={p.disabled}>
      <IconArrowUp size={15} />
    </button>
  )

  if (p.line)
    return (
      <div className="composer-stack">
        <div className="composer is-line" onMouseDown={focus}>
          <button className="icon-btn" aria-label="Attach" title="Attachments are not wired up yet" disabled>
            <IconPlus size={15} />
          </button>
          <div className="composer-input">{textarea}</div>
          {action}
        </div>
        <div className="composer-bar">
          {p.env}
          {p.project}
          {p.permissions}
          <div className="spacer" />
          {p.model}
        </div>
      </div>
    )

  return (
    <div className={`composer${p.tip ? ' is-tall' : ''}`} onMouseDown={focus}>
      <div className="composer-input">
        {textarea}
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
        {p.permissions}
        {p.project}
        <div className="spacer" />
        {p.model}
        {action}
      </div>
    </div>
  )
}
