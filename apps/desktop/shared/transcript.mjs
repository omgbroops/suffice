// One transcript format for the live view and for what is saved beside each
// harness session. Both sides fold the same run events through `reduce`, so a
// reopened thread renders exactly what streamed.

/** @typedef {{kind:'text', text:string}} TextStep */
/** @typedef {{kind:'thinking', text:string, startedAt:number, endedAt?:number}} ThinkingStep */
/** @typedef {{kind:'tool', id:string, parent?:string, name:string, input:any, status:'running'|'done'|'error', output?:string, patch?:string, startedAt?:number}} ToolStep */
/** @typedef {{kind:'approval', id:string, name:string, input:any, state:'pending'|'allowed'|'denied'}} ApprovalStep */
/** @typedef {{kind:'note', text:string, level:'info'|'warning'|'error'}} NoteStep */
/** @typedef {{kind:'race', attempts:{state:'running'|'won'|'lost'|'empty'|'failed', startedAt:number, endedAt?:number, changes?:number}[]}} RaceStep */
/** @typedef {TextStep|ThinkingStep|ToolStep|ApprovalStep|NoteStep|RaceStep} Step */
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
        a.steps.push({ kind: 'tool', id: e.id, parent: e.parent || undefined, name: e.name, input: e.input, status: 'running', startedAt: at })
        return a
      })
    case 'tool_update':
      return withAgent(a => {
        const i = a.steps.findIndex(s => s.kind === 'tool' && s.id === e.id && s.status === 'running')
        if (i < 0) return a
        a.steps[i] = { ...a.steps[i], output: clip(e.output) }
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
    case 'race':
      return withAgent(a => {
        if (a.done) return a // a stopped race can still report late
        closeThinking(a, at)
        let i = a.steps.findIndex(s => s.kind === 'race')
        if (i < 0) i = a.steps.push({ kind: 'race', attempts: [] }) - 1
        const attempts = a.steps[i].attempts.slice()
        const prev = attempts[e.attempt]
        attempts[e.attempt] = e.state === 'running' ? { state: 'running', startedAt: at } : { ...prev, startedAt: prev?.startedAt ?? at, state: e.state, endedAt: at, ...(e.changes != null ? { changes: e.changes } : {}) }
        a.steps[i] = { ...a.steps[i], attempts }
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
    case 'end':
      return withAgent(a => {
        closeThinking(a, at)
        a.steps = a.steps.map(s =>
          s.kind === 'tool' && s.status === 'running'
            ? { ...s, status: e.ok ? 'done' : 'error' }
            : s.kind === 'approval' && s.state === 'pending'
              ? { ...s, state: 'denied' }
              : s.kind === 'race'
                ? { ...s, attempts: s.attempts.map(r => (r?.state === 'running' ? { ...r, state: 'lost', endedAt: at } : r)) }
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
    .filter(l => l !== '' && !/^(---|\+\+\+|diff |index |\\ No newline)/.test(l))
    .map(l => (l.startsWith('@@') ? { t: '@', s: l } : { t: l[0] === '+' ? '+' : l[0] === '-' ? '-' : ' ', s: l.slice(1) }))
}

/**
 * Diff as shown in a thread: hunk headers become gaps and unchanged runs keep `keep` lines
 * next to each change; the rest folds into one '…' row (s = lines hidden, or '' across hunks).
 */
export function compactDiff(lines, keep = 2) {
  const out = []
  let run = []
  let changed = false
  const fold = s => {
    const last = out[out.length - 1]
    if (last?.t === '…') last.s = ''
    else out.push({ t: '…', s })
  }
  const flush = atChange => {
    const head = changed ? keep : 0
    const tail = atChange ? keep : 0
    if (run.length <= head + tail + 1) out.push(...run)
    else {
      out.push(...run.slice(0, head))
      fold(`${run.length - head - tail}`)
      out.push(...run.slice(run.length - tail))
    }
    run = []
  }
  for (const l of lines) {
    if (l.t === ' ') run.push(l)
    else if (l.t === '@') {
      flush(false)
      if (out.length) fold('')
      changed = false
    } else {
      flush(true)
      out.push(l)
      changed = true
    }
  }
  flush(false)
  return out
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
      // say what the command is for; the command itself is in the row's detail. Claude Code writes its own
      // one-line description of each command: that names the real work, so it wins over parsing the command
      if (str(input.description).trim()) return { verb: str(input.description).trim(), present: str(input.description).trim(), meta: '' }
      return { meta: '', ...summarizeCommand(str(input.command)) }
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

// [test, past, present, kind]; kind 'look' marks read-only exploration, which groups with reads and searches
const COMMANDS = [
  [/\b(vitest|jest|mocha|pytest|rspec|phpunit|ava|tap)\b|\b(cargo|go|deno|bun|dotnet|mix|swift) test\b|^(npm|pnpm|yarn|bun)( run)? test\b|\btest(:[\w-]+)?$/, 'Ran tests', 'Running tests'],
  [/^(npm|pnpm|yarn|bun) (i|install|add|ci)\b|^pip3? install|^(brew|apt(-get)?|cargo) (install|add)\b|^poetry (add|install)|^uv (add|pip|sync)/, 'Installed dependencies', 'Installing dependencies'],
  [/\b(eslint|ruff|clippy|golangci-lint|stylelint|biome lint)\b|^(npm|pnpm|yarn|bun)( run)? lint\b/, 'Checked for lint', 'Checking for lint'],
  [/\b(prettier|black|gofmt|rustfmt|biome format)\b|\bcargo fmt\b|^(npm|pnpm|yarn|bun)( run)? (format|fmt)\b/, 'Formatted code', 'Formatting code'],
  [/\btsc\b|\b(cargo|go|swift|dotnet) build\b|^make\b|\b(vite|next|webpack|esbuild|rollup)\b.*\bbuild\b|^(npm|pnpm|yarn|bun)( run)? build\b/, 'Built the project', 'Building the project'],
  [/^(npm|pnpm|yarn|bun)( run)? (dev|start|serve|preview)\b/, 'Started the app', 'Starting the app'],
  [/^git (status|diff|log|show|blame)\b/, 'Checked changes', 'Checking changes', 'look'],
  [/^git commit\b/, 'Committed', 'Committing'],
  [/^git (checkout|switch|branch)\b/, 'Switched branches', 'Switching branches'],
  [/^git (push|pull|fetch)\b/, 'Synced with the remote', 'Syncing with the remote'],
  [/^(rg|grep|ag|ack|git grep)\b/, 'Searched code', 'Searching code', 'look'],
  [/^git\b/, 'Used git', 'Using git'],
  [/^(cat|head|tail|less|bat|wc|nl)\b|^sed -n\b/, 'Read files', 'Reading files', 'look'],
  [/^(ls|tree|find|fd|du|pwd|stat)\b/, 'Listed files', 'Listing files', 'look'],
  [/^(mkdir|mv|cp|rm|touch|chmod|ln|rmdir)\b/, 'Moved files around', 'Moving files around'],
  [/^(curl|wget|http)\b/, 'Fetched a URL', 'Fetching a URL'],
  [/^(python3?|node|deno|ruby|bun|tsx|ts-node)\s+\S+\.(py|m?js|ts|rb)\b/, 'Ran a script', 'Running a script'],
]

/** A plain description of a shell command, from its first real step (cd, env and sudo prefixes skipped). */
export function summarizeCommand(command) {
  // split on && || ; | and newlines, but not inside quotes (rg "a|b" is one step)
  const quoted = []
  // heredoc bodies are file contents, not steps
  command = command.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, '')
  const masked = command.replace(/'[^']*'|"[^"]*"/g, q => `\0${quoted.push(q) - 1}\0`)
  const steps = masked.split(/\n|&&|\|\||;|\|/).map(s => s.replace(/\0(\d+)\0/g, (_, i) => quoted[i]).trim().replace(/^(sudo|time|env)\s+/, '').replace(/^([A-Z_][A-Z0-9_]*=\S*\s+)+/, '').replace(/^npx\s+/, ''))
  const at = steps.findIndex(s => s && !/^(cd|export|set|source|\.)\b/.test(s))
  // mkdir x && cat > t.py && python3 t.py ran a script: setup steps (file moves, looks) never name a chain
  // when a later step does real work
  const work = steps.slice(at + 1).filter(s => s && !/^(cd|export|set|source|\.)\b/.test(s)).map(one).find(r => r.kind !== 'look' && r.verb !== 'Moved files around' && !(r.verb === 'Ran' && /^(echo|printf|true|cat)$/.test(r.meta ?? '')))
  const first0 = one(steps[at] ?? '')
  const first = work && (first0.kind === 'look' || first0.verb === 'Moved files around') ? work : first0
  // cat x | grep y and git log | rg fix are searches: a later search step names the work
  if (first.kind === 'look') for (const s of steps.slice(at + 1)) { const r = one(s); if (r.verb === 'Searched code') return r }
  return first
}

function one(main) {
  // the one argument worth showing: what was searched, read, listed or run
  const words = (main.match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map(w => w.replace(/^(['"])(.*)\1$/, '$2'))
  const args = words.slice(words[0] === 'git' ? 2 : 1).filter(w => !w.startsWith('-'))
  for (const [re, verb, present, kind] of COMMANDS) {
    if (!re.test(main)) continue
    const meta = verb === 'Searched code' ? args[0] : verb === 'Read files' ? args.at(-1) : verb === 'Listed files' ? args[0] : verb === 'Ran a script' ? args[0] : undefined
    return { verb, present, ...(kind ? { kind } : {}), ...(meta ? { meta } : {}) }
  }
  // unknown command: name the program, never the whole line
  const prog = (words[0] ?? '').split('/').pop()
  return prog ? { verb: 'Ran', present: 'Running', meta: prog } : { verb: 'Ran a command', present: 'Running a command' }
}

const LOOK = new Set(['read', 'grep', 'search', 'find', 'glob', 'ls', 'list', 'symbols', 'symbol_read', 'symbol_references'])
const isLook = s => s.kind === 'tool' && (LOOK.has(s.name) || ((s.name === 'bash' || s.name === 'powershell') && summarizeCommand(str(s.input?.command)).kind === 'look'))

/**
 * Runs of two or more read-only exploration steps become one group; everything else passes through.
 * The group's label counts distinct files read and searches made.
 */
export function groupSteps(steps) {
  const out = []
  let run = []
  const flush = () => {
    if (run.length > 1) {
      // a shell cat/head/sed -n counts as a file read, like the read tool
      const reads = run.filter(s => s.name === 'read' || summarizeCommand(str(s.input?.command)).verb === 'Read files')
      const files = new Set(reads.map(s => str(s.input?.path) || str(s.input?.file) || str(s.input?.command)))
      // listings and git looks are neither reads nor searches, so they count as checks
      const searches = run.filter(s => !reads.includes(s) && (['grep', 'search', 'find', 'glob'].includes(s.name) || summarizeCommand(str(s.input?.command)).verb === 'Searched code')).length
      const checks = run.length - reads.length - searches
      const n = (k, one, many) => k && `${k} ${k === 1 ? one : many}`
      const parts = [n(files.size, 'file', 'files'), n(searches, 'search', 'searches'), n(checks, 'check', 'checks')].filter(Boolean)
      const live = run.some(s => s.status === 'running')
      out.push({ kind: 'group', id: run[0].id, steps: run, verb: live ? 'Investigating' : 'Investigated', meta: parts.join(', '), live })
    } else out.push(...run)
    run = []
  }
  for (const s of steps) {
    if (isLook(s)) run.push(s)
    else (flush(), out.push(s))
  }
  flush()
  return out
}

/** Steps worth showing: codemode wrappers with nested calls are left out, as is session naming. */
export function visibleSteps(steps) {
  const parents = new Set(steps.filter(s => s.kind === 'tool' && s.parent).map(s => s.parent))
  return steps.filter(s => !(s.kind === 'tool' && ((s.name === 'codemode' && parents.has(s.id)) || s.name === 'set_session_title')))
}
