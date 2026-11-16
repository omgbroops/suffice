// Runs each scenarios2 scenario through sim.mjs (no tmux, no input needed) and checks the mapped items.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClaudeMapper } from '../src/tui/claude.mjs'
import { itemProblem } from '../src/tui/model.mjs'
import { SCENARIOS } from '../tools/tui-sim/scenarios2.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SIM = path.resolve(HERE, '../tools/tui-sim/sim.mjs')
const SID = '00000000-0000-4000-8000-000000000001'

// expected item kinds in order (usage excluded) + extra checks on the deduped items
const EXPECT = {
  'hook-block': [['user', 'tool', 'notice', 'assistant'], (it) => { assert.equal(it[1].status, 'denied'); assert.equal(it[2].level, 'warn') }],
  'hook-context': [['user', 'assistant']],
  'mcp-tool-call': [['user', 'tool', 'assistant'], (it) => { assert.equal(it[1].category, 'mcp'); assert.equal(it[1].status, 'ok') }],
  'mcp-tool-error': [['user', 'tool', 'assistant'], (it) => { assert.equal(it[1].category, 'mcp'); assert.equal(it[1].status, 'error') }],
  'skill-invoke': [['user', 'tool', 'assistant'], (it) => { assert.equal(it[1].name, 'Skill'); assert.equal(it[1].input.skill, 'hello'); assert.equal(it[1].status, 'ok') }],
  'plan-mode-enter-exit': [['user', 'tool', 'notice', 'assistant'], (it) => { assert.equal(it[1].name, 'ExitPlanMode'); assert.equal(it[2].code, 'mode_changed'); assert.match(JSON.stringify(it[2]), /auto/i) }],
  'compaction': [['user', 'notice', 'assistant'], (it) => assert.equal(it[1].code, 'compacted')],
  'context-nearly-full': [['user', 'notice', 'assistant'], (it) => assert.match(it[1].text, /Context low/)],
  'rate-limit-wait': [['user', 'notice', 'assistant'], (it) => assert.equal(it[1].code, 'rate_limit')],
  'api-error-retry': [['user', 'notice', 'notice', 'assistant'], (it) => assert.deepEqual([it[1].code, it[2].code], ['error', 'rate_limit'])],
  'worktree-enter-exit': [['user', 'tool', 'tool', 'assistant'], (it) => assert.deepEqual([it[1].name, it[2].name], ['EnterWorktree', 'ExitWorktree'])],
  'background-shell': [['user', 'tool', 'tool', 'tool', 'assistant'], (it) => { assert.equal(it[1].category, 'shell'); assert.deepEqual(it.slice(1, 4).map((x) => x.status), ['background', 'ok', 'ok']); assert.equal(it[3].name, 'TaskStop') }],
  'scheduled-wakeup': [['user', 'tool', 'user', 'assistant'], (it) => assert.equal(it[1].name, 'ScheduleWakeup')],
  // real shape (claude 2.1.325): tool is Agent, launch ack is async_launched, completion notices are origin task-notification user records (no user item)
  'parallel-subagents-3': [['user', 'subagent', 'subagent', 'subagent', 'assistant', 'assistant'], (it) => { assert.deepEqual(it.slice(1, 4).map((x) => x.status), ['ok', 'ok', 'ok']); assert.match(it[5].text, /three agents/i) }],
  'nested-subagent-3-levels': [['user', 'subagent', 'assistant'], (it) => assert.equal(it[1].status, 'ok')],
  'multi-select-question': [['user', 'tool', 'assistant'], (it) => { assert.equal(it[1].name, 'AskUserQuestion'); assert.equal(it[1].input.questions[0].multiSelect, true); assert.equal(it[1].output.answer, 'Cheese, Olives') }],
  'at-file-mention': [['user', 'assistant'], (it) => { assert.equal(it[0].attachments?.[0]?.type, 'file'); assert.match(JSON.stringify(it[0].attachments[0]), /greet\.js/) }],
  'image-attachment': [['user', 'assistant'], (it) => assert.equal(it[0].attachments?.[0]?.type, 'image')],
  'resize-narrow': [['user', 'assistant', 'user', 'assistant']],
  'interrupt-during-tool': [['user', 'tool', 'notice'], (it) => { assert.equal(it[1].status, 'error'); assert.equal(it[2].code, 'interrupted') }],
  'long-output-truncated': [['user', 'tool', 'assistant'], (it) => { assert.equal(it[1].status, 'ok'); assert.match(JSON.stringify(it[1].output), /399/) }],
  'todo-list-updates': [['user', 'todo', 'todo', 'todo', 'assistant'], (it) => assert.deepEqual(it[3].items.map((x) => x.status), ['done', 'done', 'done'])],
}

function run(s) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuisim-s2-'))
  const cwd = path.join(fs.realpathSync(root), 'PROJECT'); fs.mkdirSync(cwd, { recursive: true })
  const tdir = path.join(root, 'tr')
  const r = spawnSync('node', [SIM, '--scenario', s.name, '--speed', '50', '--transcript-dir', tdir, '--cwd', cwd, '--session-id', SID, '--exit-when-done'], { encoding: 'utf8', timeout: 60000 })
  const f = fs.existsSync(tdir) && fs.readdirSync(tdir, { recursive: true, withFileTypes: true }).find((e) => e.isFile() && e.name === `${SID}.jsonl`)
  const lines = f ? fs.readFileSync(path.join(f.parentPath, f.name), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
  const mm = createClaudeMapper(); const st = mm.newState(); const em = []
  for (const o of lines) em.push(...(mm.mapLine(o, st) ?? []))
  const items = [...new Map(em.map((i) => [i.id, i])).values()].filter((i) => i.kind !== 'usage')
  fs.rmSync(root, { recursive: true, force: true })
  return { r, lines, items }
}

test('scenario JSON on disk matches the generator', () => {
  for (const s of SCENARIOS) {
    const f = path.resolve(HERE, '../tools/tui-sim/scenarios', `${s.name}.json`)
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), JSON.parse(JSON.stringify(s)), `${s.name}.json is stale: run node tools/tui-sim/scenarios2.mjs`)
  }
})

assert.deepEqual(SCENARIOS.map((s) => s.name).sort(), Object.keys(EXPECT).sort())

for (const s of SCENARIOS) {
  let res
  const get = () => (res ??= run(s))
  const [kinds, extra] = EXPECT[s.name]
  test(`${s.name}: runs to completion`, () => {
    const { r, lines } = get()
    assert.equal(r.status, 0, r.stderr)
    assert.ok(lines.length > 0, 'transcript written')
  })
  test(`${s.name}: every mapped item is valid`, () => {
    const { items } = get()
    assert.ok(items.length > 0)
    for (const it of items) assert.equal(itemProblem(it), null, JSON.stringify(it))
  })
  test(`${s.name}: item kinds in order${s.unverified ? ' (unverified screens)' : ''}`, () => {
    const { items } = get()
    assert.deepEqual(items.map((i) => i.kind), kinds)
    extra?.(items)
  })
}
