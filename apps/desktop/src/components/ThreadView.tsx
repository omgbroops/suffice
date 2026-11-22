import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { describeTool, patchLines, visibleSteps, type AgentMessage as Agent, type ApprovalStep, type Attempt, type AttemptsStep, type Step, type ToolStep, type Transcript } from '../../shared/transcript.mjs'
import type { Status } from '../data'
import { IconArrowLeft, IconChevronDown } from '../icons'
import { CopyButton, StatusGlyph } from './ui'
import { EFFORT_LABEL } from './ModelPicker'

const duration = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`)

const STATUS_LABEL: Record<Status, string> = { working: 'Working', done: 'Completed', input: 'Needs input', idle: 'Idle' }

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []
  // Links first, so a label in backticks stays inside its link.
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|(`[^`]+`)|(\*\*[^*]+\*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    if (m[1] !== undefined) {
      const label = inline(m[1])
      out.push(/^https?:/.test(m[2]) ? <a key={m.index} href={m[2]} target="_blank" rel="noreferrer">{label}</a> : <span key={m.index} title={m[2]}>{label}</span>)
    } else if (m[3]) out.push(<code key={m.index}>{m[3].slice(1, -1)}</code>)
    else out.push(<strong key={m.index}>{m[4].slice(2, -2)}</strong>)
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
  if (step.kind === 'note') return <Row verb={step.text} error={step.level === 'error'} />
  if (step.kind === 'approval') {
    const { verb, meta } = describeTool(step.name, step.input)
    return <Row verb={step.state === 'denied' ? `Denied: ${verb.toLowerCase()}` : `Allowed: ${verb.toLowerCase()}`} meta={meta} />
  }
  if (step.kind === 'attempts') return null
  return <ToolView step={step} project={project} />
}

function ApprovalCard({ step, onAnswer }: { step: ApprovalStep; onAnswer: (allow: boolean) => void }) {
  const { verb, meta } = describeTool(step.name, step.input)
  const command = step.name === 'bash' || step.name === 'powershell'
  const apply = step.name === 'apply_changes'
  const files: string[] = apply && Array.isArray(step.input?.files) ? step.input.files : []
  const title = apply
    ? `Apply ${files.length} change${files.length === 1 ? '' : 's'} from ${step.input?.from ?? 'the winning attempt'}?`
    : step.name === 'Trust project resources'
      ? 'Trust this project’s Suffice resources?'
      : command
        ? 'Run this command?'
        : `Allow ${verb.toLowerCase()}${meta ? '' : ` (${step.name})`}?`
  const body = apply ? files.map(slash).join('\n') : command ? `$ ${step.input?.command ?? ''}` : step.input?.detail ?? meta
  return (
    <div className="ask-card" role="group" aria-label="Permission request">
      <div className="ask-head">{title}</div>
      {body && <pre className="code ask-code">{body}</pre>}
      <div className="ask-foot">
        <span className="ask-hint">{apply ? 'The attempt ran on a copy; nothing has changed yet' : 'Switch to Full access to skip this'}</span>
        <button className="btn" onClick={() => onAnswer(false)}>{apply ? 'Discard' : 'Deny'}</button>
        <button className="btn btn-primary" onClick={() => onAnswer(true)} autoFocus>{apply ? 'Apply' : 'Allow'}</button>
      </div>
    </div>
  )
}

const ATTEMPT_STATUS: Record<Attempt['status'], string> = { running: 'Working', won: 'Won', discarded: 'Discarded', empty: 'No changes', failed: 'Failed', stopped: 'Stopped' }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const slash = (p: string) => p.replace(/\\/g, '/')

function attemptStatus(a: Attempt) {
  if (a.status === 'won' && a.files?.length) return `Won · ${plural(a.files.length, 'file')}`
  return ATTEMPT_STATUS[a.status]
}

/** Efficient and Fast attempts: one row each, opening the attempt's own thread. */
function AttemptsCard({ group, onOpen }: { group: AttemptsStep; onOpen: (aid: string) => void }) {
  const first = group.attempts[0]
  const winner = group.attempts.find(a => a.id === group.winner)
  const done = group.attempts.every(a => a.status !== 'running')
  return (
    <div className="race">
      <div className="race-head">
        <span className="race-title">{group.mode === 'fast' ? 'Fast' : 'Efficient'}</span>
        <span className="race-sub">
          {group.mode === 'fast' ? `${plural(group.attempts.length, 'attempt')} · ${first?.model ?? ''} · ${EFFORT_LABEL[first?.effort ?? ''] ?? first?.effort ?? ''}` : 'Cheap model first, lead model only on a miss'}
        </span>
      </div>
      {group.attempts.map(a => (
        <button key={a.id} className={`race-row is-${a.status}`} onClick={() => onOpen(a.id)}>
          <span className="race-label">{a.label}</span>
          <span className="race-hint">{group.mode === 'fast' ? a.hint ?? 'No extra guidance' : `${EFFORT_LABEL[a.effort] ?? a.effort}${a.hint ? ` · ${a.hint}` : ''}`}</span>
          <span className={`race-status${a.status === 'running' ? ' is-live' : ''}`}>{attemptStatus(a)}</span>
          <IconChevronDown size={12} className="race-chev" />
        </button>
      ))}
      {done && (
        <div className="race-foot">
          {winner && group.applied
            ? `Applied ${plural(group.files?.length ?? 0, 'change')} from ${winner.label}`
            : winner && group.applied === false
              ? `${winner.label}’s changes were not applied`
              : winner
                ? `Waiting to apply ${winner.label}’s changes`
                : 'No attempt produced changes'}
        </div>
      )}
    </div>
  )
}

function AgentMessageView({ msg, project, onApproval, onOpenAttempt }: { msg: Agent; project: string; onApproval: (id: string, allow: boolean) => void; onOpenAttempt?: (aid: string) => void }) {
  const all = visibleSteps(msg.steps)
  const groups = all.filter((s): s is AttemptsStep => s.kind === 'attempts')
  const steps = all.filter(s => s.kind !== 'attempts')
  const last = steps.at(-1)
  const pendingApprovals = steps.filter((s): s is ApprovalStep => s.kind === 'approval' && s.state === 'pending')
  // Efficient and Fast runs report through notes; the last one is the result.
  const final = last?.kind === 'text' || (last?.kind === 'note' && msg.done) ? last : undefined
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
      {groups.map((g, i) => <AttemptsCard key={i} group={g} onOpen={aid => onOpenAttempt?.(aid)} />)}
      {live && all.length === 0 && <div className="pending">Thinking</div>}
      {pendingApprovals.map(s => <ApprovalCard key={s.id} step={s} onAnswer={allow => onApproval(s.id, allow)} />)}
      {final && (final.kind === 'note' ? <div className={`msg-note${final.level === 'error' ? ' is-error' : ''}`}>{final.text}</div> : <Prose text={final.text} />)}
      {msg.error && <div className="msg-error">{msg.error}</div>}
      {msg.done && (
        <div className="msg-foot">
          {final?.kind === 'text' && <CopyButton text={final.text} />}
          <span className="meta">
            {msg.mode === 'efficient' ? `Efficient · ${msg.cheap ?? 'cheap'} → ${msg.model}` : msg.mode === 'fast' ? `Fast · ${msg.model} ×3` : msg.model}
            {msg.mode !== 'fast' && msg.effort && msg.effort !== 'off' ? ` · ${EFFORT_LABEL[msg.effort] ?? msg.effort}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

function Messages({ transcript, project, onApproval, onOpenAttempt }: { transcript: Transcript; project: string; onApproval: (id: string, allow: boolean) => void; onOpenAttempt?: (msgId: string, aid: string) => void }) {
  return (
    <>
      {transcript.messages.map(m =>
        m.role === 'user' ? (
          <div key={m.id} className="msg-user">
            <div className="bubble">{m.text}</div>
          </div>
        ) : (
          <AgentMessageView key={m.id} msg={m} project={project} onApproval={onApproval} onOpenAttempt={onOpenAttempt && (aid => onOpenAttempt(m.id, aid))} />
        ),
      )}
    </>
  )
}

function findAttempt(t: Transcript | undefined, at: { msg: string; aid: string } | null) {
  if (!t || !at) return null
  const m = t.messages.find(x => x.id === at.msg)
  if (m?.role !== 'agent') return null
  for (const s of m.steps) if (s.kind === 'attempts') for (const a of s.attempts) if (a.id === at.aid) return a
  return null
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
  const [sub, setSub] = useState<{ msg: string; aid: string } | null>(null)
  const attempt = findAttempt(transcript, sub)

  useLayoutEffect(() => {
    stick.current = true
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [title, !!transcript, attempt?.id])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const obs = new MutationObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    obs.observe(el, { childList: true, subtree: true, characterData: true })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!attempt) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.dd, .mp')) setSub(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [!!attempt])

  return (
    <div className="thread">
      {attempt ? (
        <header className="thread-head">
          <button className="crumb-back" onClick={() => setSub(null)} title="Back to the thread (Esc)">
            <IconArrowLeft size={13} />
            <span className="thread-title">{title}</span>
          </button>
          <span className="crumb-sep">/</span>
          <span className="crumb-here">{attempt.label}</span>
          <span className="thread-status">{attemptStatus(attempt)}</span>
        </header>
      ) : (
        <header className="thread-head">
          <StatusGlyph status={status} />
          <span className="thread-title">{title}</span>
          <span className="thread-status">{STATUS_LABEL[status]}</span>
        </header>
      )}
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
          {attempt ? (
            <>
              <div className="attempt-note">
                {attempt.model} · {EFFORT_LABEL[attempt.effort] ?? attempt.effort} · ran on a copy of the project
                {attempt.files?.length ? ` · changed ${attempt.files.map(slash).join(', ')}` : ''}
              </div>
              <Messages transcript={attempt.transcript} project={project} onApproval={onApproval} />
            </>
          ) : (
            transcript && <Messages transcript={transcript} project={project} onApproval={onApproval} onOpenAttempt={(msg, aid) => setSub({ msg, aid })} />
          )}
        </div>
      </div>
      <div className="thread-composer">
        <div className="thread-col">
          {attempt ? (
            <button className="attempt-back" onClick={() => setSub(null)}>
              <IconArrowLeft size={13} />
              Back to the thread
            </button>
          ) : (
            composer
          )}
        </div>
      </div>
    </div>
  )
}
