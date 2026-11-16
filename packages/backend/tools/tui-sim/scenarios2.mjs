/*
 * Second batch of tui-sim scenarios, defined as code (no recorded fixtures: screens are plain inline frames and
 * transcript lines are built here). `node scenarios2.mjs` writes scenarios/<name>.json for sim.mjs.
 * A scenario with `unverified: true` has screen text and/or transcript record shapes not checked against a real
 * Claude Code recording: frames are kept plain and nothing decorative is invented.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SID = '00000000-0000-4000-8000-000000000001'
const ROWS = 32
const base = { uuid: '@uuid', timestamp: '', sessionId: SID, cwd: '/tmp/PROJECT' }
let n = 0
const id = (p) => `${p}_${String(++n).padStart(4, '0')}`
const msg = (content) => ({ type: 'assistant', ...base, message: { id: id('msg'), role: 'assistant', model: 'claude-sonnet-5-5', content } })

// transcript line builders
export const U = (text, extra = {}) => ({ type: 'user', ...base, message: { role: 'user', content: text }, ...extra })
export const A = (text) => msg([{ type: 'text', text }])
export const TU = (name, input, tid) => msg([{ type: 'tool_use', id: tid, name, input }])
export const TUs = (calls) => msg(calls.map(([name, input, tid]) => ({ type: 'tool_use', id: tid, name, input })))
export const TR = (tid, text, { error = false, tur } = {}) => ({ type: 'user', ...base, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: text, ...(error ? { is_error: true } : {}) }] }, ...(tur ? { toolUseResult: tur } : {}) })
export const SYS = (subtype, extra = {}) => ({ type: 'system', subtype, ...base, ...extra })
export const ATT = (attachment) => ({ type: 'attachment', ...base, attachment })
export const MODE = (permissionMode) => ({ type: 'permission-mode', permissionMode, sessionId: SID })

const rule = (cols) => '─'.repeat(cols)
function frame(lines, cols) {
  const rows = Array(ROWS).fill('')
  lines.slice(-21).forEach((l, i) => { rows[i] = l.slice(0, cols) })
  rows[22] = rule(cols); rows[23] = '❯ '; rows[24] = rule(cols)
  rows[26] = '  Sonnet 5.5 (medium) | USER:PROJECT'
  rows[27] = '  ⏸ manual mode on'
  return { rows }
}

/** steps: [{ screen: [lines appended to the running screen], t: [transcript lines], work: seconds, cols }] */
function scenario(name, { unverified = false, cols = 120 } = {}, steps) {
  let shown = [' ▝▝   ▝▝   /tmp/PROJECT', '']
  const beats = steps.map((s, i) => {
    if (s.reset) shown = []
    shown = [...shown, ...(s.screen ?? [])]
    const b = { screen: frame(shown, s.cols ?? cols) }
    if (s.work) b.working = { seconds: s.work, cont: i > 0 && !!steps[i - 1].work }
    else if (i > 0 && steps[i - 1].work) b.working = false
    if (s.t?.length) b.transcript = s.t
    return b
  })
  beats.push({ wait: 0.2, working: false })
  return { name, ...(unverified ? { unverified: true } : {}), beats }
}
const ask = (t) => [`❯ ${t}`, '']
const say = (t) => [`⏺ ${t}`, '']
const tool = (head, out) => [`⏺ ${head}`, ...(out ? [`  ⎿  ${out}`] : []), '']

const T = {}
const todo = (items) => ({ todos: items.map(([content, status]) => ({ content, status, activeForm: content })) })

export const SCENARIOS = []
const add = (...a) => SCENARIOS.push(scenario(...a))

n = 0
{ const c = 'toolu_hb'
  add('hook-block', { unverified: true }, [
    { screen: ask('Run rm -rf build'), t: [U('Run rm -rf build')] },
    { screen: tool('Bash(rm -rf build)', 'PreToolUse:Bash hook blocking error: blocked by policy'), t: [TU('Bash', { command: 'rm -rf build' }, c), ATT({ type: 'hook_success', hookEvent: 'PreToolUse', exitCode: 2 }), TR(c, "PreToolUse:Bash hook blocking error: blocked by policy. The user doesn't want to proceed with this tool use.", { error: true })], work: 0.2 },
    { screen: say('The hook blocked that command, so I did not run it.'), t: [A('The hook blocked that command, so I did not run it.')] } ]) }
add('hook-context', { unverified: true }, [
  { screen: ask('What branch policy applies?'), t: [U('What branch policy applies?')] },
  { screen: ['  UserPromptSubmit hook added context', ''], t: [ATT({ type: 'hook_success', hookEvent: 'UserPromptSubmit', exitCode: 0 }), ATT({ type: 'hook_additional_context', content: ['Branch policy: squash merge only'] })] },
  { screen: say('Squash merge only, per the hook context.'), t: [A('Squash merge only, per the hook context.')] } ])
{ const c = 'toolu_mcp1'
  add('mcp-tool-call', { unverified: true }, [
    { screen: ask('Read the spec doc'), t: [U('Read the spec doc')] },
    { screen: tool('docs - read_doc (MCP)(id: "spec")', 'Spec v2: three sections'), t: [TU('mcp__docs__read_doc', { id: 'spec' }, c), TR(c, 'Spec v2: three sections')], work: 0.2 },
    { screen: say('The spec has three sections.'), t: [A('The spec has three sections.')] } ]) }
{ const c = 'toolu_mcp2'
  add('mcp-tool-error', { unverified: true }, [
    { screen: ask('Read the missing doc'), t: [U('Read the missing doc')] },
    { screen: tool('docs - read_doc (MCP)(id: "nope")', 'Error: document not found'), t: [TU('mcp__docs__read_doc', { id: 'nope' }, c), TR(c, 'Error: document not found', { error: true })], work: 0.2 },
    { screen: say('That document does not exist.'), t: [A('That document does not exist.')] } ]) }
{ const c = 'toolu_skill'
  // real 2.1.325 run: Skill result is a launch ack, followed by a command_permissions attachment
  add('skill-invoke', { unverified: false }, [
    { screen: ask('Use the Skill tool to invoke the skill named hello.'), t: [U('Use the Skill tool to invoke the skill named hello.')] },
    { screen: tool('Skill(hello)', 'Successfully loaded skill'), t: [TU('Skill', { skill: 'hello' }, c), TR(c, 'Launching skill: hello', { tur: { success: true, commandName: 'hello' } }), ATT({ type: 'command_permissions', allowedTools: [] })], work: 0.2 },
    { screen: say('bonjour'), t: [A('bonjour')] } ]) }
{ const c = 'toolu_plan'
  // real 2.1.325 run: permission-mode plan precedes the prompt; the approval dialog is a 3-option screen; approving with option 1 writes permission-mode auto
  const PL = { plan: '# Add a comment line to util.js', planFilePath: '/p/.claude/plans/plan.md' }
  add('plan-mode-enter-exit', {}, [
    { screen: ['  ⏸ plan mode on (shift+tab to cycle) · ← for agents', ''], t: [MODE('plan')] },
    { screen: ask('Plan a tiny change: add one comment line at the top of util.js'), t: [U('Plan a tiny change: add one comment line at the top of util.js')] },
    { screen: ['  Claude has written up a plan and is ready to execute. Would you like to proceed?', '  ❯ 1. Yes, and use auto mode', '    2. Yes, manually approve edits', '    3. Tell Claude what to change', ''], t: [TU('ExitPlanMode', PL, c)], work: 0.2 },
    { screen: ['  ⏵⏵ auto mode on (shift+tab to cycle)', ''], t: [TR(c, 'User has approved your plan.', { tur: { ...PL, isAgent: false, filePath: PL.planFilePath } }), MODE('auto')] },
    { screen: say('I added the comment line to util.js.'), t: [A('I added the comment line to util.js.')] } ]) }
add('compaction', { unverified: true }, [
  { screen: ask('Keep going'), t: [U('Keep going')] },
  { screen: ['✻ Conversation compacted', ''], t: [SYS('compact_boundary', { compactMetadata: { trigger: 'auto', preTokens: 180000, postTokens: 9000 } })] },
  { screen: say('Continuing after the compact.'), t: [A('Continuing after the compact.')] } ])
add('context-nearly-full', { unverified: true }, [
  { screen: ask('Next file'), t: [U('Next file')] },
  { screen: ['  Context low (4% remaining) · Run /compact to compact & continue', ''], t: [SYS('informational', { content: 'Context low (4% remaining) · Run /compact to compact & continue' })] },
  { screen: say('Reading the next file.'), t: [A('Reading the next file.')] } ])
add('rate-limit-wait', { unverified: true }, [
  { screen: ask('Summarize the repo'), t: [U('Summarize the repo')] },
  { screen: ['  Usage limit reached · resets at 3pm', ''], t: [{ ...A('Usage limit reached. Your limit will reset at 3pm.'), isApiErrorMessage: true }] },
  { screen: say('Back after the reset: here is the summary.'), t: [A('Back after the reset: here is the summary.')] } ])
add('api-error-retry', { unverified: true }, [
  { screen: ask('Say hi'), t: [U('Say hi')] },
  { screen: ['  API Error: 529 overloaded · retrying in 2s (attempt 1/3)', ''], t: [SYS('api_error', { error: { message: 'API Error: 529 overloaded_error' } })] },
  { screen: ['  API Error: 429 · retrying in 4s (attempt 2/3)', ''], t: [SYS('api_error', { error: { message: 'API Error: 429 too many requests' } })] },
  { screen: say('Hi.'), t: [A('Hi.')] } ])
{ const a = 'toolu_wt1', b = 'toolu_wt2'
  add('worktree-enter-exit', { unverified: true }, [
    { screen: ask('Work in a worktree'), t: [U('Work in a worktree')] },
    { screen: tool('EnterWorktree', 'Created worktree at /tmp/PROJECT/.claude/worktrees/w1'), t: [TU('EnterWorktree', { name: 'w1' }, a), TR(a, 'Created worktree at /tmp/PROJECT/.claude/worktrees/w1')], work: 0.2 },
    { screen: tool('ExitWorktree', 'Returned to /tmp/PROJECT'), t: [TU('ExitWorktree', { action: 'keep' }, b), TR(b, 'Returned to /tmp/PROJECT')], work: 0.2 },
    { screen: say('Worktree entered and left.'), t: [A('Worktree entered and left.')] } ]) }
{ const a = 'toolu_bg1', b = 'toolu_bg2', c = 'toolu_bg3'
  // real 2.1.325 run: no BashOutput/KillShell; the model read the output file with Read and stopped the task with TaskStop {task_id}
  add('background-shell', {}, [
    { screen: ask('Run sleep 40 in the background, then stop it'), t: [U('Run sleep 40 in the background, then stop it')] },
    { screen: tool('Bash(sleep 40)', 'Running in the background'), t: [TU('Bash', { command: 'sleep 40', description: 'Sleep 40 seconds in background', run_in_background: true }, a), TR(a, 'Command running in background with ID: bg1', { tur: { stdout: '', stderr: '', interrupted: false, isImage: false, noOutputExpected: false, backgroundTaskId: 'bg1' } })], work: 0.2 },
    { screen: ['  Read 1 file', ''], t: [TU('Read', { file_path: '/tmp/bg1.output' }, b), TR(b, '<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>')], work: 0.2 },
    { screen: tool('Stop Task', 'sleep 40 · stopped'), t: [TU('TaskStop', { task_id: 'bg1' }, c), TR(c, '{"message":"Successfully stopped task: bg1 (sleep 40)","task_id":"bg1","task_type":"local_bash","command":"sleep 40"}', { tur: { message: 'Successfully stopped task: bg1 (sleep 40)', task_id: 'bg1', task_type: 'local_bash', command: 'sleep 40' } })], work: 0.2 },
    { screen: say('The sleep task was started, read and stopped.'), t: [A('The sleep task was started, read and stopped.')] } ]) }
{ const c = 'toolu_wake'
  add('scheduled-wakeup', { unverified: true }, [
    { screen: ask('Check the build in 20 minutes'), t: [U('Check the build in 20 minutes')] },
    { screen: tool('ScheduleWakeup(1200s)', 'Scheduled'), t: [TU('ScheduleWakeup', { delaySeconds: 1200, reason: 'check build', prompt: 'check the build' }, c), TR(c, 'Scheduled wakeup in 1200s')], work: 0.2 },
    { screen: ask('check the build'), t: [U('check the build')] },
    { screen: say('The build passed.'), t: [A('The build passed.')] } ]) }
{ const ids = ['toolu_pa1', 'toolu_pa2', 'toolu_pa3'], words = ['one', 'two', 'three']
  const P = 'Launch 3 Task subagents in parallel, in one message. They reply one, two, three. Wait, then list.'
  const launch = ids.flatMap((t, i) => [TU('Agent', { description: `Reply with the word ${words[i]}`, prompt: `Reply with exactly one word: ${words[i]}. No other text, no tools.`, subagent_type: 'general-purpose', model: 'haiku' }, t),
    TR(t, [{ type: 'text', text: `Async agent launched (agentId pa${i + 1})` }], { tur: { isAsync: true, status: 'async_launched', agentId: `pa${i + 1}`, description: `Reply with the word ${words[i]}`, resolvedModel: 'claude-haiku-5-5', canReadOutputFile: true, canContinueAgent: true } })])
  // completion notices: user records with string content and origin task-notification (the recording scrubbed their text, so the wording is not verified)
  const notice = (i) => U(`<task-notification>agent pa${i + 1} completed: ${words[i]}</task-notification>`, { origin: { kind: 'task-notification', producer: 'session-task', runId: `run-pa${i + 1}` }, promptSource: 'system', turnOrigin: 'task_notification' })
  add('parallel-subagents-3', {}, [
    { screen: ask(P), t: [U(P)] },
    { screen: [], t: launch, work: 0.3 },
    { screen: [], t: [A('Three agents are running in the background, one per word.'), ...ids.map((_, i) => notice(i))], work: 0.3 },
    { screen: ['⏺ All three agents have finished:', '', '  1. one', '  2. two', '  3. three', ''], t: [A('All three agents have finished: 1. one 2. two 3. three')] } ]) }
{ const tid = 'toolu_ns1'
  const side = (o) => ({ ...o, isSidechain: true })
  add('nested-subagent-3-levels', { unverified: true }, [
    { screen: ask('Delegate three levels deep'), t: [U('Delegate three levels deep')] },
    { screen: ['⏺ agent level 1 running', ''], t: [TU('Task', { subagent_type: 'general-purpose', description: 'level 1', prompt: 'Spawn level 2' }, tid),
      side(TU('Task', { subagent_type: 'general-purpose', description: 'level 2', prompt: 'Spawn level 3' }, 'toolu_ns2')),
      side(TU('Task', { subagent_type: 'general-purpose', description: 'level 3', prompt: 'Report' }, 'toolu_ns3')),
      side(TR('toolu_ns3', 'level 3 done', { tur: { agentId: 'ns3' } })), side(TR('toolu_ns2', 'level 2 done', { tur: { agentId: 'ns2' } }))], work: 0.3 },
    { screen: ['⏺ agent level 1 finished', ''], t: [TR(tid, 'level 1 done', { tur: { agentId: 'ns1' } })] },
    { screen: say('Three levels done.'), t: [A('Three levels done.')] } ]) }
{ const c = 'toolu_ms'
  // real (claude 2.1.325): tool_result is a plain string, toolUseResult has questions + answers + annotations; screen shows "User answered Claude's questions:" then "⎿  · <question> → <answers>"
  const q = 'Which toppings do you want? Pick one or more.'
  const opts = ['Cheese', 'Olives', 'Ham'].map((l) => ({ label: l, description: `Add ${l.toLowerCase()}` }))
  add('multi-select-question', {}, [
    { screen: ask('Pick toppings'), t: [U('Pick toppings')] },
    { screen: ['⏺ User answered Claude\'s questions:', `  ⎿  · ${q} → Cheese, Olives`, ''], t: [TU('AskUserQuestion', { questions: [{ question: q, header: 'Toppings', multiSelect: true, options: opts }] }, c), TR(c, `Your questions have been answered: "${q}"="Cheese, Olives". You can now continue with these answers in mind.`, { tur: { questions: [{ question: q, header: 'Toppings', options: opts, multiSelect: true }], answers: { [q]: 'Cheese, Olives' }, annotations: {} } })], work: 0.2 },
    { screen: say('Your toppings: Cheese and Olives.'), t: [A('Your toppings: Cheese and Olives.')] } ]) }
// real (claude 2.1.325): attachment record {type:'file', filename, content:{type:'text', file:{filePath, content, numLines, startLine, totalLines}}, displayPath}; screen "⎿  Read greet.js (6 lines)"
const GREET = "// greeting helper\nfunction greet(name) {\n  return 'Helo, ' + name;\n}\nmodule.exports = { greet };\n"
add('at-file-mention', {}, [
  { screen: ask('Explain @greet.js in one sentence.'), t: [U('Explain @greet.js in one sentence.'), ATT({ type: 'file', filename: '/tmp/PROJECT/greet.js', content: { type: 'text', file: { filePath: '/tmp/PROJECT/greet.js', content: GREET, numLines: 6, startLine: 1, totalLines: 6 } }, displayPath: 'greet.js' })] },
  { screen: ['  ⎿  Read greet.js (6 lines)', ''], t: [], work: 0.2 },
  { screen: say('greet.js exports a greet(name) function that returns "Helo, " + name.'), t: [A('greet.js exports a greet(name) function that returns "Helo, " + name.')] } ])
add('image-attachment', { unverified: true }, [
  { screen: ask('[Image #1] What is this?'), t: [{ type: 'user', ...base, message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }, { type: 'text', text: 'What is this?' }] } }] },
  { screen: say('A blank image.'), t: [A('A blank image.')] } ])
// real 2.1.325 run: after a resize to 50 cols the whole screen reflows (long lines wrap) and the footer rows are cut with an ellipsis
add('resize-narrow', { unverified: false }, [
  { screen: ask('Say hello.'), t: [U('Say hello.')] },
  { screen: say('Hello, USER. What do you want to work on?'), t: [A('Hello, USER. What do you want to work on?')] },
  { reset: true, cols: 50, screen: ['❯ Say hello.', '⏺ Hello, USER. What do you want to work on?', '', '❯ Say it again.', ''], t: [U('Say it again.')] },
  { cols: 50, screen: say('Hello, USER. What do you want to work on?'), t: [A('Hello, USER. What do you want to work on?')] } ])
{ const c = 'toolu_int'
  add('interrupt-during-tool', { unverified: true }, [
    { screen: ask('Run sleep 60'), t: [U('Run sleep 60')] },
    { screen: ['  ⎿  Interrupted · What should Claude do instead?', ''], t: [TU('Bash', { command: 'sleep 60' }, c), TR(c, '[Request interrupted by user for tool use]', { error: true }), U('[Request interrupted by user for tool use]')], work: 0.3 } ]) }
{ const c = 'toolu_big', full = Array.from({ length: 400 }, (_, i) => i + 1).join('\n')
  // real 2.1.325 run: the full stdout is in the record; the screen collapses it to one row
  add('long-output-truncated', { unverified: false }, [
    { screen: ask('Run exactly: seq 1 400'), t: [U('Run exactly: seq 1 400')] },
    { screen: ['  Ran 1 shell command', ''], t: [TU('Bash', { command: 'seq 1 400', description: 'Print numbers 1 through 400' }, c), TR(c, full, { tur: { stdout: full, stderr: '', interrupted: false, isImage: false, noOutputExpected: false } })], work: 0.2 },
    { screen: say('Ran seq 1 400; it printed 1 through 400, one per line, with no errors.'), t: [A('Ran seq 1 400; it printed 1 through 400, one per line, with no errors.')] } ]) }
{ const a = 'toolu_td1', b = 'toolu_td2', d = 'toolu_td3'
  add('todo-list-updates', { unverified: false }, [
    { screen: ask('Plan and do three steps'), t: [U('Plan and do three steps')] },
    { screen: ['⏺ Update Todos', '  ☐ one', '  ☐ two', '  ☐ three', ''], t: [TU('TodoWrite', todo([['one', 'in_progress'], ['two', 'pending'], ['three', 'pending']]), a), TR(a, 'Todos have been modified successfully')], work: 0.2 },
    { screen: ['⏺ Update Todos', '  ☒ one', '  ☐ two', '  ☐ three', ''], t: [TU('TodoWrite', todo([['one', 'completed'], ['two', 'in_progress'], ['three', 'pending']]), b), TR(b, 'Todos have been modified successfully')], work: 0.2 },
    { screen: ['⏺ Update Todos', '  ☒ one', '  ☒ two', '  ☒ three', ''], t: [TU('TodoWrite', todo([['one', 'completed'], ['two', 'completed'], ['three', 'completed']]), d), TR(d, 'Todos have been modified successfully')], work: 0.2 },
    { screen: say('All three done.'), t: [A('All three done.')] } ]) }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const s of SCENARIOS) fs.writeFileSync(path.join(HERE, 'scenarios', `${s.name}.json`), JSON.stringify(s, null, 1) + '\n')
  console.log(`wrote ${SCENARIOS.length} scenarios`)
}
