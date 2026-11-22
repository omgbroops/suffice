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
  /** Picks files; they are inserted at the cursor as @mentions the agent can read. */
  onAttach?: () => Promise<string[]>
  /** Keeps the unsent text when the composer unmounts (switching tabs or views) and restores it on return. */
  draftKey?: string
}

const MAX = 260
const drafts = new Map<string, string>()

export function Composer(p: Props) {
  const [text, setTextRaw] = useState(() => (p.draftKey && drafts.get(p.draftKey)) || '')
  const setText = (t: string) => {
    setTextRaw(t)
    if (p.draftKey) t ? drafts.set(p.draftKey, t) : drafts.delete(p.draftKey)
  }
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
        <button
          className="icon-btn"
          aria-label="Mention files"
          title="Mention files"
          disabled={!p.onAttach}
          onClick={async () => {
            const el = ta.current
            const paths = (await p.onAttach?.().catch(() => [])) ?? []
            if (!paths.length || !el) return
            // read the box after the dialog closes, so nothing typed or cleared meanwhile is lost
            const cur = el.value, at = el.selectionStart ?? cur.length
            const tokens = paths.map(f => (/\s/.test(f) ? `@"${f}"` : `@${f}`)).join(' ')
            const before = cur.slice(0, at), after = cur.slice(at)
            const next = `${before}${before && !/\s$/.test(before) ? ' ' : ''}${tokens} ${after.replace(/^\s+/, '')}`
            setText(next)
            requestAnimationFrame(() => {
              const pos = next.length - after.replace(/^\s+/, '').length
              el?.focus()
              el?.setSelectionRange(pos, pos)
            })
          }}
        >
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
