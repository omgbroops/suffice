// One transcript format for the live view and for what is saved beside each
// harness session. Both sides fold the same run events through `reduce`, so a
// reopened thread renders exactly what streamed.

/** @typedef {{kind:'text', text:string}} TextStep */
/** @typedef {{kind:'thinking', text:string, startedAt:number, endedAt?:number}} ThinkingStep */
/** @typedef {{kind:'tool', id:string, parent?:string, name:string, input:any, status:'running'|'done'|'error', output?:string, patch?:string}} ToolStep */
/** @typedef {{kind:'approval', id:string, name:string, input:any, state:'pending'|'allowed'|'denied'}} ApprovalStep */
/** @typedef {{kind:'note', text:string, level:'info'|'warning'|'error'}} NoteStep */
/** @typedef {{id:string, label:string, hint?:string, model:string, effort:string, status:'running'|'won'|'discarded'|'empty'|'failed'|'stopped', files?:string[], error?:string, startedAt:number, endedAt?:number, transcript:Transcript}} Attempt */
/** @typedef {{kind:'attempts', mode:'efficient'|'fast', attempts:Attempt[], winner?:string, applied?:boolean, files?:string[]}} AttemptsStep */
/** @typedef {TextStep|ThinkingStep|ToolStep|ApprovalStep|NoteStep|AttemptsStep} Step */
/** @typedef {{id:string, role:'user', text:string, at:number}} UserMessage */
/** @typedef {{id:string, role:'agent', model:string, effort:string, mode?:'balanced'|'efficient'|'fast', cheap?:string, steps:Step[], done:boolean, error?:string, startedAt:number, endedAt?:number}} AgentMessage */
/** @typedef {{version:1, messages:(UserMessage|AgentMessage)[]}} Transcript */

export const OUTPUT_LIMIT = 8000

/** @returns {Transcript} */
export const emptyTranscript = () => ({ version: 1, messages: [] })

const lastAgent = t => {
  const m = t.messages.at(-1)
  return m && m.role === 'agent' ? m : null
}

const clip = s => (typeof s === 'string' && s.length > OUTPUT_LIMIT ? `${s.slice(0, OUTPUT_LIMIT)}\n…` : s)

/** Text a tool result carries, joined and clipped. */
export function resultText(content) {
  if (typeof content === 'string') return clip(content)
  if (!Array.isArray(content)) return ''
  return clip(content.filter(c => c?.type === 'text').map(c => c.text).join('\n'))
}

/**
 * Fold one run event into a transcript. Returns a new transcript; the input is
 * not mutated, so React state can hold it directly.
 * @param {Transcript} t
 * @param {any} e
 * @returns {Transcript}
 */
export function reduce(t, e) {
  const messages = t.messages.slice()
  const agent = lastAgent(t)
  const withAgent = fn => {
    if (!agent) return t
    const next = fn({ ...agent, steps: agent.steps.slice() })
    messages[messages.length - 1] = next
    return { ...t, messages }
  }
  const closeThinking = (a, at) => {
    const s = a.steps.at(-1)
    if (s?.kind === 'thinking' && !s.endedAt) a.steps[a.steps.length - 1] = { ...s, endedAt: at }
  }
  const at = e.at ?? Date.now()
  /** Update the Efficient/Fast attempts of the current reply. */
  const withAttempts = fn =>
    withAgent(a => {
      const i = a.steps.findIndex(s => s.kind === 'attempts')
      if (i >= 0) a.steps[i] = fn(a.steps[i])
      return a
    })
  const withAttempt = (aid, fn) => withAttempts(g => ({ ...g, attempts: g.attempts.map(x => (x.id === aid ? fn(x) : x)) }))

  switch (e.type) {
    case 'user':
      messages.push({ id: e.id, role: 'user', text: e.text, at })
      return { ...t, messages }
    case 'agent_start':
      messages.push({ id: e.id, role: 'agent', model: e.model, effort: e.effort, ...(e.mode && e.mode !== 'balanced' ? { mode: e.mode } : {}), ...(e.cheap ? { cheap: e.cheap } : {}), steps: [], done: false, startedAt: at })
      return { ...t, messages }
    case 'text':
      return withAgent(a => {
        closeThinking(a, at)
        const s = a.steps.at(-1)
        if (s?.kind === 'text') a.steps[a.steps.length - 1] = { ...s, text: s.text + e.delta }
        else a.steps.push({ kind: 'text', text: e.delta })
        return a
      })
    case 'thinking':
      return withAgent(a => {
        const s = a.steps.at(-1)
        if (s?.kind === 'thinking' && !s.endedAt) a.steps[a.steps.length - 1] = { ...s, text: s.text + e.delta }
        else a.steps.push({ kind: 'thinking', text: e.delta, startedAt: at })
        return a
      })
    case 'tool':
      return withAgent(a => {
        closeThinking(a, at)
        if (a.steps.some(s => s.kind === 'tool' && s.id === e.id)) return a
        a.steps.push({ kind: 'tool', id: e.id, parent: e.parent || undefined, name: e.name, input: e.input, status: 'running' })
        return a
      })
    case 'tool_result':
      return withAgent(a => {
        const i = a.steps.findIndex(s => s.kind === 'tool' && s.id === e.id)
        if (i < 0) return a
        a.steps[i] = { ...a.steps[i], status: e.isError ? 'error' : 'done', output: clip(e.output), patch: e.patch }
        return a
      })
    case 'note':
      return withAgent(a => {
        closeThinking(a, at)
        a.steps.push({ kind: 'note', text: e.text, level: e.level ?? 'info' })
        return a
      })
    case 'approval':
      return withAgent(a => {
        closeThinking(a, at)
        a.steps.push({ kind: 'approval', id: e.id, name: e.name, input: e.input, state: 'pending' })
        return a
      })
    case 'approval_resolved':
      return withAgent(a => {
        const i = a.steps.findIndex(s => s.kind === 'approval' && s.id === e.id)
        if (i >= 0) a.steps[i] = { ...a.steps[i], state: e.allow ? 'allowed' : 'denied' }
        return a
      })
    case 'attempt_start':
      return withAgent(a => {
        closeThinking(a, at)
        let i = a.steps.findIndex(s => s.kind === 'attempts')
        if (i < 0) i = a.steps.push({ kind: 'attempts', mode: e.mode, attempts: [] }) - 1
        let tr = reduce(emptyTranscript(), { type: 'user', id: `${e.aid}-u`, text: e.prompt, at })
        tr = reduce(tr, { type: 'agent_start', id: `${e.aid}-a`, model: e.model, effort: e.effort, at })
        const attempt = { id: e.aid, label: e.label, ...(e.hint ? { hint: e.hint } : {}), model: e.model, effort: e.effort, status: 'running', startedAt: at, transcript: tr }
        a.steps[i] = { ...a.steps[i], attempts: [...a.steps[i].attempts.filter(x => x.id !== e.aid), attempt] }
        return a
      })
    case 'attempt':
      return withAttempt(e.aid, x => ({ ...x, transcript: reduce(x.transcript, { at, ...e.event }) }))
    case 'attempt_end':
      return withAttempt(e.aid, x => ({
        ...x,
        status: e.status,
        endedAt: at,
        ...(e.files ? { files: e.files } : {}),
        ...(e.error ? { error: e.error } : {}),
        transcript: reduce(x.transcript, { type: 'end', ok: ['won', 'empty'].includes(e.status), error: e.status === 'discarded' ? 'Discarded: another attempt finished first.' : e.status === 'stopped' ? 'Stopped.' : e.error, at }),
      }))
    case 'attempts_result':
      return withAttempts(g => ({ ...g, ...(e.winner ? { winner: e.winner } : {}), applied: !!e.applied, ...(e.files ? { files: e.files } : {}) }))
    case 'end':
      return withAgent(a => {
        closeThinking(a, at)
        a.steps = a.steps.map(s =>
          s.kind === 'tool' && s.status === 'running'
            ? { ...s, status: e.ok ? 'done' : 'error' }
            : s.kind === 'approval' && s.state === 'pending'
              ? { ...s, state: 'denied' }
              : s.kind === 'attempts'
                ? { ...s, attempts: s.attempts.map(x => (x.status === 'running' ? { ...x, status: 'stopped', endedAt: at, transcript: reduce(x.transcript, { type: 'end', ok: false, error: 'Stopped.', at }) } : x)) }
                : s,
        )
        return { ...a, done: true, endedAt: at, ...(e.ok ? {} : { error: e.error || 'The run stopped.' }) }
      })
    default:
      return t
  }
}

/**
 * A transcript for a session that has no saved transcript (one started by the
 * CLI, say): user text, assistant text and top-level tool calls from the
 * harness's own message history.
 */
export function fromSessionMessages(messages) {
  let t = emptyTranscript()
  let n = 0
  let last
  const id = () => `h${n++}`
  for (const m of messages ?? []) {
    const at = typeof m.timestamp === 'number' ? m.timestamp : last
    if (m.role === 'user') {
      const text = typeof m.content === 'string' ? m.content : (m.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n')
      if (lastAgent(t) && !lastAgent(t).done) t = reduce(t, { type: 'end', ok: true, at: last })
      t = reduce(t, { type: 'user', id: id(), text, at })
    } else if (m.role === 'assistant') {
      if (!lastAgent(t)) t = reduce(t, { type: 'agent_start', id: id(), model: m.model ?? '', effort: '', at: m.timestamp })
      for (const c of m.content ?? []) {
        if (c.type === 'text' && c.text) t = reduce(t, { type: 'text', delta: (lastAgent(t).steps.at(-1)?.kind === 'text' ? '\n\n' : '') + c.text })
        else if (c.type === 'thinking' && c.thinking) t = reduce(t, { type: 'thinking', delta: c.thinking })
        else if (c.type === 'toolCall') t = reduce(t, { type: 'tool', id: c.id, name: c.name, input: c.arguments })
      }
    } else if (m.role === 'toolResult') {
      t = reduce(t, { type: 'tool_result', at, id: m.toolCallId, isError: m.isError, output: resultText(m.content), patch: m.details?.patch })
    }
    last = at
  }
  if (lastAgent(t) && !lastAgent(t).done) t = reduce(t, { type: 'end', ok: true, at: last })
  return t
}

/** Parse a unified patch into display lines. */
export function patchLines(patch) {
  if (!patch) return []
  return patch
    .split('\n')
    .filter(l => !/^(---|\+\+\+|diff |index |\\ No newline)/.test(l))
    .map(l => (l.startsWith('@@') ? { t: '@', s: l } : { t: l[0] === '+' ? '+' : l[0] === '-' ? '-' : ' ', s: l.slice(1) }))
}

const str = v => (typeof v === 'string' ? v : '')

/** How a tool call reads in the thread: a verb and what it touched. */
export function describeTool(name, input = {}) {
  const path = str(input.path) || str(input.file)
  const short = p => p.replace(/\\/g, '/')
  switch (name) {
    case 'read':
      return { verb: 'Read', meta: short(path) + (input.offset ? ` #L${input.offset}${input.limit ? `-${input.offset + input.limit}` : ''}` : '') }
    case 'edit':
      return { verb: 'Edited', meta: short(path) }
    case 'write':
      return { verb: 'Wrote', meta: short(path) }
    case 'bash':
    case 'powershell':
      return { verb: 'Ran', meta: str(input.command).split('\n')[0] }
    case 'grep':
    case 'search':
      return { verb: 'Searched', meta: str(input.pattern) || str(input.query) }
    case 'find':
    case 'glob':
      return { verb: 'Found', meta: str(input.pattern) }
    case 'ls':
    case 'list':
      return { verb: 'Listed', meta: short(path) || '.' }
    case 'symbols':
    case 'symbol_read':
    case 'symbol_references':
      return { verb: 'Looked up', meta: str(input.name) || str(input.symbol) || short(path) }
    case 'web_search':
      return { verb: 'Searched the web', meta: str(input.query) }
    case 'fetch_content':
    case 'get_search_content':
      return { verb: 'Fetched', meta: str(input.url) }
    case 'codemode':
      return { verb: 'Ran code', meta: '' }
    default:
      return { verb: name.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), meta: '' }
  }
}

/** Steps worth showing: codemode wrappers with nested calls are left out, as is session naming. */
export function visibleSteps(steps) {
  const parents = new Set(steps.filter(s => s.kind === 'tool' && s.parent).map(s => s.parent))
  return steps.filter(s => !(s.kind === 'tool' && ((s.name === 'codemode' && parents.has(s.id)) || s.name === 'set_session_title')))
}
