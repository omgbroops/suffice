import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { describeTool, patchLines, visibleSteps, type AgentMessage as Agent, type ApprovalStep, type Step, type ToolStep, type Transcript } from '../../shared/transcript.mjs'
import type { Status } from '../data'
import { IconChevronDown } from '../icons'
import { CopyButton, StatusGlyph } from './ui'
import { EFFORT_LABEL } from './ModelPicker'

const duration = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`)

const STATUS_LABEL: Record<Status, string> = { working: 'Working', done: 'Completed', input: 'Needs input', idle: 'Idle' }

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\((https?:[^)\s]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    if (m[1]) out.push(<code key={m.index}>{m[1].slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={m.index}>{m[2].slice(2, -2)}</strong>)
    else out.push(<a key={m.index} href={m[4]} target="_blank" rel="noreferrer">{m[3].slice(1, m[3].indexOf(']'))}</a>)
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

/** Enough markdown for agent replies: paragraphs, lists, headings, fences, inline code, bold, links. */
export function Prose({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^```/.test(line)) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++])
      i++
      blocks.push(<pre key={blocks.length} className="code prose-code">{body.join('\n')}</pre>)
    } else if (/^#{1,4}\s/.test(line)) {
      blocks.push(<p key={blocks.length} className="prose-h">{inline(line.replace(/^#+\s/, ''))}</p>)
      i++
    } else if (/^\s*([-*]|\d+[.)])\s/.test(line)) {
      const ordered = /^\s*\d/.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+[.)])\s/, ''))
      const List = ordered ? 'ol' : 'ul'
      blocks.push(<List key={blocks.length}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</List>)
    } else if (!line.trim()) i++
    else {
      const para: string[] = []
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\s*([-*]|\d+[.)])\s)/.test(lines[i])) para.push(lines[i++])
      blocks.push(<p key={blocks.length}>{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p)}</Fragment>)}</p>)
    }
  }
  return <div className="prose">{blocks}</div>
}

function Row({ verb, meta, stat, children, defaultOpen = false, live, error }: { verb: string; meta?: string; stat?: ReactNode; children?: ReactNode; defaultOpen?: boolean; live?: boolean; error?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`step${open ? ' is-open' : ''}${error ? ' is-error' : ''}`}>
      <button className={`step-row${live ? ' is-live' : ''}`} onClick={() => children && setOpen(o => !o)} aria-expanded={children ? open : undefined} disabled={!children}>
        <span className="step-verb">{verb}</span>
        {meta && <span className="step-meta">{meta}</span>}
        {stat}
        {children && <IconChevronDown size={12} className="step-chev" />}
      </button>
      {open && children && <div className="step-body">{children}</div>}
    </div>
  )
}

function ToolView({ step, project }: { step: ToolStep; project: string }) {
  const { verb, meta } = describeTool(step.name, step.input)
  const live = step.status === 'running'
  const error = step.status === 'error'
  const rel = meta.startsWith(project.replace(/\\/g, '/')) ? meta.slice(project.length + 1) : meta
  if (step.patch) {
    const lines = patchLines(step.patch)
    return (
      <Row
        verb={verb}
        meta={rel}
        live={live}
        error={error}
        stat={
          <span className="diffstat">
            <span className="add">+{lines.filter(d => d.t === '+').length}</span>
            <span className="del">−{lines.filter(d => d.t === '-').length}</span>
          </span>
        }
      >
        <div className="detail">
          <pre className="code diff">
            {lines.map((d, i) => (
              <div key={i} className={`dl dl-${d.t === '+' ? 'add' : d.t === '-' ? 'del' : d.t === '@' ? 'hunk' : 'ctx'}`}>
                {d.t !== '@' && <span className="dl-sign">{d.t}</span>}
                {d.s}
              </div>
            ))}
          </pre>
        </div>
      </Row>
    )
  }
  const command = step.name === 'bash' || step.name === 'powershell'
  const code = step.name === 'codemode' && typeof step.input?.code === 'string' ? step.input.code : null
  const body = command ? `$ ${step.input?.command ?? ''}${step.output ? `\n${step.output}` : ''}` : code ? `${code}${step.output ? `\n\n${step.output}` : ''}` : step.output
  return (
    <Row verb={verb} meta={rel} live={live} error={error}>
      {body && (
        <div className="detail">
          {command && <div className="detail-head"><span className="detail-title">Command in {project.split(/[\\/]/).pop()}</span></div>}
          <pre className="code">{body}</pre>
        </div>
      )}
    </Row>
  )
}

function StepView({ step, project, live }: { step: Step; project: string; live: boolean }) {
  if (step.kind === 'text') return <div className="step-text"><Prose text={step.text} /></div>
  if (step.kind === 'thinking') {
    const secs = Math.max(1, Math.round(((step.endedAt ?? Date.now()) - step.startedAt) / 1000))
    return (
      <Row verb={step.endedAt ? `Thought for ${secs}s` : 'Thinking'} live={live && !step.endedAt}>
        {step.text.trim() && <div className="thinking-text"><Prose text={step.text} /></div>}
      </Row>
    )
  }
  if (step.kind === 'approval') {
    const { verb, meta } = describeTool(step.name, step.input)
    return <Row verb={step.state === 'denied' ? `Denied: ${verb.toLowerCase()}` : `Allowed: ${verb.toLowerCase()}`} meta={meta} />
  }
  return <ToolView step={step} project={project} />
}

function ApprovalCard({ step, onAnswer }: { step: ApprovalStep; onAnswer: (allow: boolean) => void }) {
  const { verb, meta } = describeTool(step.name, step.input)
  const command = step.name === 'bash' || step.name === 'powershell'
  const title = step.name === 'Trust project resources' ? 'Trust this project’s Suffice resources?' : command ? 'Run this command?' : `Allow ${verb.toLowerCase()}${meta ? '' : ` (${step.name})`}?`
  const body = command ? `$ ${step.input?.command ?? ''}` : step.input?.detail ?? meta
  return (
    <div className="ask-card" role="group" aria-label="Permission request">
      <div className="ask-head">{title}</div>
      {body && <pre className="code ask-code">{body}</pre>}
      <div className="ask-foot">
        <span className="ask-hint">Turn on Bypass permissions to skip this</span>
        <button className="btn" onClick={() => onAnswer(false)}>Deny</button>
        <button className="btn btn-primary" onClick={() => onAnswer(true)} autoFocus>Allow</button>
      </div>
    </div>
  )
}

function AgentMessageView({ msg, project, onApproval }: { msg: Agent; project: string; onApproval: (id: string, allow: boolean) => void }) {
  const steps = visibleSteps(msg.steps)
  const last = steps.at(-1)
  const pendingApprovals = steps.filter((s): s is ApprovalStep => s.kind === 'approval' && s.state === 'pending')
  const final = last?.kind === 'text' ? last : undefined
  const work = steps.filter(s => s !== final && !(s.kind === 'approval' && s.state === 'pending'))
  const [open, setOpen] = useState(!msg.done)
  const live = !msg.done
  const secs = Math.max(1, Math.round(((msg.endedAt ?? Date.now()) - msg.startedAt) / 1000))
  return (
    <div className="msg-agent">
      {work.length > 0 && (
        <div className={`work${open ? ' is-open' : ''}`}>
          <button className="work-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
            <IconChevronDown size={12} className="work-chev" />
            <span className={live && !pendingApprovals.length ? 'is-live' : undefined}>{live ? (pendingApprovals.length ? 'Waiting for you' : 'Working') : `Worked for ${duration(secs)}`}</span>
          </button>
          {open && (
            <div className="work-body">
              {work.map((s, i) => (
                <StepView key={s.kind === 'tool' || s.kind === 'approval' ? s.id : i} step={s} project={project} live={live && i === work.length - 1} />
              ))}
            </div>
          )}
        </div>
      )}
      {live && steps.length === 0 && <div className="pending">Thinking</div>}
      {pendingApprovals.map(s => <ApprovalCard key={s.id} step={s} onAnswer={allow => onApproval(s.id, allow)} />)}
      {final && <Prose text={final.text} />}
      {msg.error && <div className="msg-error">{msg.error}</div>}
      {msg.done && (
        <div className="msg-foot">
          {final && <CopyButton text={final.text} />}
          <span className="meta">
            {msg.model}
            {msg.effort && msg.effort !== 'off' ? ` · ${EFFORT_LABEL[msg.effort] ?? msg.effort}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

export function ThreadView({
  title,
  status,
  transcript,
  project,
  composer,
  onApproval,
}: {
  title: string
  status: Status
  transcript: Transcript | undefined
  project: string
  composer: ReactNode
  onApproval: (id: string, allow: boolean) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useLayoutEffect(() => {
    stick.current = true
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [title, !!transcript])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const obs = new MutationObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    obs.observe(el, { childList: true, subtree: true, characterData: true })
    return () => obs.disconnect()
  }, [])

  return (
    <div className="thread">
      <header className="thread-head">
        <StatusGlyph status={status} />
        <span className="thread-title">{title}</span>
        <span className="thread-status">{STATUS_LABEL[status]}</span>
      </header>
      <div
        className="thread-scroll"
        ref={scroller}
        onScroll={e => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
      >
        <div className="thread-col">
          {!transcript && <div className="pending">Loading</div>}
          {transcript?.messages.map(m =>
            m.role === 'user' ? (
              <div key={m.id} className="msg-user">
                <div className="bubble">{m.text}</div>
              </div>
            ) : (
              <AgentMessageView key={m.id} msg={m} project={project} onApproval={onApproval} />
            ),
          )}
        </div>
      </div>
      <div className="thread-composer">
        <div className="thread-col">{composer}</div>
      </div>
    </div>
  )
}
