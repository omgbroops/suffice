import test from 'node:test'
import assert from 'node:assert/strict'
import { compactDiff, describeTool, groupSteps, summarizeCommand, emptyTranscript, fromSessionMessages, patchLines, reduce, visibleSteps } from '../shared/transcript.mjs'

const fold = events => events.reduce(reduce, emptyTranscript())

test('streams text, thinking and tools into one agent message', () => {
  const t = fold([
    { type: 'user', id: 'u', text: 'fix it', at: 1 },
    { type: 'agent_start', id: 'a', model: 'GPT', effort: 'low', at: 2 },
    { type: 'thinking', delta: 'Look ', at: 3 },
    { type: 'thinking', delta: 'first', at: 4 },
    { type: 'text', delta: 'Reading', at: 5 },
    { type: 'tool', id: 'c', name: 'codemode', input: { code: 'x' }, at: 6 },
    { type: 'tool', id: 'r', parent: 'c', name: 'read', input: { path: 'a.js' }, at: 7 },
    { type: 'tool_result', id: 'r', isError: false, output: 'ok', at: 8 },
    { type: 'text', delta: 'Done', at: 9 },
    { type: 'text', delta: '.', at: 10 },
    { type: 'end', ok: true, at: 11 },
  ])
  const [user, agent] = t.messages
  assert.equal(user.text, 'fix it')
  assert.deepEqual(agent.steps.map(s => s.kind), ['thinking', 'text', 'tool', 'tool', 'text'])
  assert.equal(agent.steps[0].text, 'Look first')
  assert.equal(agent.steps[0].endedAt, 5)
  assert.equal(agent.steps[3].status, 'done')
  assert.equal(agent.steps[2].startedAt, 6, 'tool timers count from the tool event, not from when the row mounts')
  assert.equal(agent.steps.at(-1).text, 'Done.')
  assert.equal(agent.done, true)
  assert.deepEqual(visibleSteps(agent.steps).map(s => s.kind === 'tool' ? s.name : s.kind), ['thinking', 'text', 'read', 'text'])
})

test('a failed run closes running tools and pending approvals', () => {
  const t = fold([
    { type: 'user', id: 'u', text: 'x' },
    { type: 'agent_start', id: 'a', model: 'm', effort: 'low' },
    { type: 'tool', id: 't', name: 'bash', input: { command: 'ls' } },
    { type: 'approval', id: 'p', name: 'edit', input: { path: 'a' } },
    { type: 'end', ok: false, error: 'Stopped.' },
  ])
  const agent = t.messages[1]
  assert.equal(agent.error, 'Stopped.')
  assert.equal(agent.steps[0].status, 'error')
  assert.equal(agent.steps[1].state, 'denied')
})

test('reduce does not mutate its input', () => {
  const a = fold([{ type: 'user', id: 'u', text: 'x' }, { type: 'agent_start', id: 'a', model: 'm', effort: '' }])
  const frozen = JSON.stringify(a)
  reduce(a, { type: 'text', delta: 'hi' })
  assert.equal(JSON.stringify(a), frozen)
})

test('rebuilds a transcript from harness session messages', () => {
  const t = fromSessionMessages([
    { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    { role: 'assistant', model: 'gpt', content: [{ type: 'thinking', thinking: 'hm' }, { type: 'toolCall', id: '1', name: 'read', arguments: { path: 'x' } }] },
    { role: 'toolResult', toolCallId: '1', isError: false, content: [{ type: 'text', text: 'file' }] },
    { role: 'assistant', model: 'gpt', content: [{ type: 'text', text: 'Hi' }] },
  ])
  assert.equal(t.messages.length, 2)
  const agent = t.messages[1]
  assert.deepEqual(agent.steps.map(s => s.kind), ['thinking', 'tool', 'text'])
  assert.equal(agent.steps[1].output, 'file')
  assert.equal(agent.done, true)
})

test('describes tools and parses patches', () => {
  assert.deepEqual(describeTool('bash', { command: 'npm test\nmore' }), { verb: 'Ran tests', present: 'Running tests', meta: '' })
  assert.deepEqual(describeTool('read', { path: String.raw`C:\a\b.js`, offset: 10, limit: 5 }), { verb: 'Read', meta: 'C:/a/b.js #L10-15' })
  assert.deepEqual(patchLines('--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n same').map(l => l.t), ['@', '-', '+', ' '])
})

test('fast-race lanes track each attempt and settle on end', () => {
  let t = emptyTranscript()
  for (const e of [
    { type: 'user', id: 'u', text: 'go', at: 1 },
    { type: 'agent_start', id: 'a', model: 'm', effort: 'low', mode: 'fast', at: 1 },
    { type: 'race', attempt: 0, state: 'running', at: 2 },
    { type: 'race', attempt: 1, state: 'running', at: 3 },
    { type: 'race', attempt: 2, state: 'running', at: 3 },
    { type: 'race', attempt: 1, state: 'won', changes: 2, at: 9 },
    { type: 'race', attempt: 0, state: 'lost', at: 10 },
    { type: 'end', ok: true, at: 11 },
  ]) t = reduce(t, e)
  const steps = t.messages[1].steps.filter(s => s.kind === 'race')
  assert.equal(steps.length, 1)
  const [a0, a1, a2] = steps[0].attempts
  assert.deepEqual([a0.state, a1.state, a2.state], ['lost', 'won', 'lost'])
  assert.equal(a1.changes, 2)
  assert.equal(a1.startedAt, 3)
  assert.equal(a1.endedAt, 9)
  assert.equal(a2.endedAt, 11)
})

test('race events after the run ended are ignored', () => {
  const t = fold([
    { type: 'agent_start', id: 'a', model: 'm', effort: 'low', at: 1 },
    { type: 'race', attempt: 0, state: 'running', at: 2 },
    { type: 'end', ok: false, error: 'stopped', at: 3 },
    { type: 'race', attempt: 1, state: 'running', at: 4 },
  ])
  const race = t.messages[0].steps.find(s => s.kind === 'race')
  assert.equal(race.attempts[0].state, 'lost')
  assert.equal(race.attempts[1], undefined)
})

test('compactDiff keeps two lines around changes and folds the rest', () => {
  const ctx = n => Array.from({ length: n }, (_, i) => ` c${i}`)
  const patch = ['--- a', '+++ b', '@@ -1,20 +1,20 @@', ...ctx(6), '-old', '+new', ...ctx(7), '@@ -40,3 +40,3 @@', ' x', '-a', '+b', ''].join('\n')
  const out = compactDiff(patchLines(patch))
  assert.deepEqual(out.map(l => l.t + l.s), ['…4', ' c4', ' c5', '-old', '+new', ' c0', ' c1', '…', ' x', '-a', '+b'])
  // a short run between two changes is never folded
  assert.deepEqual(compactDiff(patchLines('@@ -1 +1 @@\n-a\n x\n y\n z\n+b')).map(l => l.t), ['-', ' ', ' ', ' ', '+'])
})

test('tool_update fills a running tool and never revives a finished one', () => {
  let t = emptyTranscript()
  for (const e of [{ type: 'user', id: 'u', text: 'go' }, { type: 'agent_start', id: 'a' }, { type: 'tool', id: 'b', name: 'bash', input: { command: 'npm test' } }, { type: 'tool_update', id: 'b', output: '1 passing' }]) t = reduce(t, { ...e, at: 1 })
  const step = () => t.messages.at(-1).steps.find(s => s.id === 'b')
  assert.equal(step().output, '1 passing')
  assert.equal(step().status, 'running')
  t = reduce(t, { type: 'tool_result', id: 'b', output: 'done', at: 2 })
  t = reduce(t, { type: 'tool_update', id: 'b', output: 'late', at: 3 })
  assert.equal(step().output, 'done')
})

test('summarizeCommand says what a command is for', () => {
  const v = c => summarizeCommand(c).verb
  assert.equal(v('cd api && npm test -- --reporter=dot'), 'Ran tests')
  assert.equal(v('CI=1 pnpm run test:unit'), 'Ran tests')
  assert.equal(v('cargo test -p core'), 'Ran tests')
  assert.equal(v('npx vitest run src/retry.test.ts'), 'Ran tests')
  assert.equal(v('npm i zod'), 'Installed dependencies')
  assert.equal(v('npm run lint'), 'Checked for lint')
  assert.equal(v('npx tsc --noEmit'), 'Built the project')
  assert.equal(v('git status --short'), 'Checked changes')
  assert.equal(v('git commit -m x'), 'Committed')
  assert.equal(v('rg -n "withRetry" src'), 'Searched code')
  assert.equal(v("sed -n '1,40p' src/retry.ts"), 'Read files')
  assert.equal(v('ls -la'), 'Listed files')
  assert.equal(v('python3 scripts/seed.py'), 'Ran a script')
  assert.equal(v('./deploy.sh --prod'), 'Ran')
  const m = c => summarizeCommand(c).meta
  assert.equal(m('./deploy.sh --prod'), 'deploy.sh')
  assert.equal(m('rg -n "withRetry" src'), 'withRetry')
  assert.equal(m("git grep -n 'retry cap'"), 'retry cap')
  assert.equal(m("sed -n '1,40p' src/retry.ts"), 'src/retry.ts')
  assert.equal(m('python3 scripts/seed.py --n 3'), 'scripts/seed.py')
  assert.equal(m('npm test'), undefined)
  assert.equal(summarizeCommand('').verb, 'Ran a command')
  assert.deepEqual(summarizeCommand('cat src/retry.ts | grep -n backoff'), { verb: 'Searched code', present: 'Searching code', kind: 'look', meta: 'backoff' })
  assert.equal(m('rg -n "retry|backoff" src | head -20'), 'retry|backoff')
  assert.equal(v('git log --oneline | rg fix'), 'Searched code')
  assert.equal(v('ls | wc -l'), 'Listed files')
  assert.equal(v('npm test | tail -5'), 'Ran tests')
  assert.equal(summarizeCommand('npm test').present, 'Running tests')
})

test('groupSteps folds runs of reads and searches into one line', () => {
  const t = (id, name, input, status = 'done') => ({ kind: 'tool', id, name, input, status })
  const steps = [
    t('1', 'read', { path: 'a.ts' }), t('2', 'grep', { pattern: 'x' }), t('3', 'read', { path: 'b.ts' }), t('4', 'read', { path: 'a.ts' }),
    t('5', 'bash', { command: 'npm test' }),
    t('6', 'bash', { command: 'git diff' }), t('7', 'bash', { command: 'cat c.ts' }, 'running'),
    t('9', 'edit', { path: 'a.ts' }), t('8', 'read', { path: 'lonely.ts' }),
  ]
  const g = groupSteps(steps)
  assert.deepEqual(g.map(s => s.kind === 'group' ? `${s.verb}: ${s.meta} [${s.steps.map(x => x.id)}]` : s.id), [
    'Investigated: 2 files, 1 search [1,2,3,4]', '5', 'Investigating: 1 file, 1 check [6,7]', '9', '8',
  ])
})

test('a shell step is named by the real work: Claude Code description first, then the chain step that ran something', async () => {
  const { describeTool, summarizeCommand } = await import('../shared/transcript.mjs')
  assert.equal(describeTool('bash', { command: 'mkdir -p x && python3 x/t.py', description: 'Run Dijkstra tests' }).verb, 'Run Dijkstra tests')
  const r = summarizeCommand("mkdir -p ~/d && cat > ~/d/t.py << 'PY'\nimport a; b | c\nPY\ncd ~/d && python3 t.py")
  assert.equal(r.verb, 'Ran a script'); assert.equal(r.meta, 't.py')
  assert.equal(summarizeCommand('mkdir -p a && mv b a').verb, 'Moved files around')
})
