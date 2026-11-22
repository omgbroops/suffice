import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
  onSend: (text: string) => void
  onStop?: () => void
  /** While working: Enter steers the run, queue=true (Cmd/Ctrl+Enter) waits for it to finish. */
  onGuide?: (text: string, queue: boolean) => void
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
  const send = (queue = false) => {
    if (p.working && p.onGuide && text.trim() && !p.disabled) {
      p.onGuide(text.trim(), queue)
      setText('')
      return
    }
    if (!canSend) return
    p.onSend(text.trim())
    setText('')
  }

  return (
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
              send(e.metaKey || e.ctrlKey)
            }
          }}
        />
        {p.tip && !text && (
          <div className="composer-tip" aria-hidden>
            Tip: Change the model and capabilities (<kbd>{/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'}</kbd><kbd>/</kbd>)
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
        {p.working ? (
          <button className="send-btn is-stop" onClick={p.onStop} aria-label="Stop">
            <IconStop size={13} />
          </button>
        ) : (
          <button className="send-btn" disabled={!canSend} onClick={() => send()} aria-label="Send" title={p.disabled}>
            <IconArrowUp size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
