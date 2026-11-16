// Tests for tools/tui-sim/sim.mjs, driven under tmux on a private socket (never the app's).
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SIM = path.resolve(HERE, '../tools/tui-sim/sim.mjs')
const REAL = path.join(HERE, 'fixtures/tui-real/claude')
const FIXT = path.join(HERE, 'fixtures/tui-sim')
const SOCK = `tuisim-test-${process.pid}`
const SID = '00000000-0000-4000-8000-000000000001'
const haveTmux = spawnSync('tmux', ['-V']).status === 0
const skip = haveTmux ? false : 'tmux not found: tui-sim tests need tmux'
const tmux = (...a) => spawnSync('tmux', ['-f', '/dev/null', '-L', SOCK, ...a], { encoding: 'utf8' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
after(() => { if (haveTmux) tmux('kill-server') })

const prompts = (scn) => JSON.parse(fs.readFileSync(path.join(REAL, scn, 'steps.json'), 'utf8')).steps.filter((s) => s.type === 'send').map((s) => s.text)
const seq = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((o) => o.type !== 'last-prompt')
  .map((o) => [o.type, o.subtype, ...(o.type === 'assistant' || o.type === 'user' ? [].concat(o.message?.content || []).map((c) => c.name || c.type) : [])].filter(Boolean).join(':'))

let n = 0
function launch(scn, { resume, reuse, extra = [] } = {}) {
  const root = reuse?.root ?? fs.mkdtempSync(path.join(os.tmpdir(), 'tuisim-t-'))
  const cwd = path.join(fs.realpathSync(root), 'PROJECT'); fs.mkdirSync(cwd, { recursive: true })
  const tdir = path.join(root, 'tr'); const log = path.join(root, 'frames.log')
  const s = `s${++n}`
  const args = ['node', SIM, '--scenario', scn, '--speed', '20', '--transcript-dir', tdir, '--cwd', cwd, '--session-id', SID, '--frames-log', log, ...(resume ? ['--resume', SID] : []), ...extra]
  const r = tmux('new-session', '-d', '-s', s, '-x', '120', '-y', '32', args.map((x) => `'${x}'`).join(' ') + '; echo EXIT=$?; sleep 30')
  assert.equal(r.status, 0, r.stderr)
  const api = {
    root, tdir, log,
    screen: () => tmux('capture-pane', '-p', '-t', s).stdout,
    async wait(re, ms = 8000) {
      const end = Date.now() + ms
      while (Date.now() < end) { if (re.test(api.screen())) return; await sleep(80) }
      assert.fail(`timeout waiting for ${re}; screen:\n${api.screen()}`)
    },
    key: (k) => tmux('send-keys', '-t', s, k),
    async type(t) { tmux('send-keys', '-t', s, '-l', t); await sleep(120); tmux('send-keys', '-t', s, 'Enter') },
    transcript() { if (!fs.existsSync(tdir)) return null; const f = fs.readdirSync(tdir, { recursive: true, withFileTypes: true }).find((e) => e.isFile() && e.name === `${SID}.jsonl`); return f ? seq(path.join(f.parentPath, f.name)) : null },
    async trust() { await api.wait(/trust/i); api.key('Down'); await sleep(150); api.key('Enter'); await api.wait(/Try "|❯ /) },
    kill: () => tmux('kill-session', '-t', s),
    end() { tmux('kill-session', '-t', s); fs.rmSync(root, { recursive: true, force: true }) },
  }
  return api
}

// scenario, dialog title, option fragments. Transcript must be a non-empty prefix of the recording's type/tool sequence.
const DIALOGS = [
  ['bash-allow', null, []], // ls is auto-allowed in the recording: no dialog, full sequence
  ['edit', /Edit file/, ['1. Yes', '2. Yes, and switch to accept edits', '3. No']],
  ['subagent', null, []],
  ['plan-mode', /Ready to code\?/, ['1. Yes, and use auto mode', '2. Yes, manually approve edits', '3. Tell Claude what to change']],
  ['ask-question', /Which color do you prefer/, ['1. Red', '2. Blue', '3. Type something.', '4. Chat about this']],
]

for (const [scn, title, opts] of DIALOGS) {
  test(`dialog ${scn}`, { skip }, async () => {
    const t = launch(scn)
    try {
      await t.trust()
      await t.type(prompts(scn)[0])
      if (title) {
        await t.wait(title, 15000)
        const sc = t.screen()
        for (const o of opts) assert.ok(sc.includes(o), `missing option "${o}"\n${sc}`)
        assert.match(sc, /^\s*❯ 1\./m, 'selected marker on option 1')
      } else await t.wait(scn === 'subagent' ? /Backgrounded agent/ : /Crunched for/, 15000)
      await sleep(400)
      const got = t.transcript() ?? []
      const want = seq(path.join(REAL, scn, 'transcript.jsonl'))
      assert.ok(got.length > 0, 'transcript written')
      assert.deepEqual(got, want.slice(0, got.length), 'transcript is a prefix of the recorded sequence')
      if (scn === 'bash-allow') assert.equal(got.length, want.length, 'full sequence written')
    } finally { t.end() }
  })
}

test('dialog navigation: Down, digit, Esc', { skip }, async () => {
  const t = launch('bash-deny')
  try {
    await t.trust(); await t.type(prompts('bash-deny')[0])
    await t.wait(/Do you want to proceed\?/, 15000)
    assert.match(t.screen(), /^\s*❯ 1\./m)
    t.key('Down'); await t.wait(/^\s*❯ 2\./m)
    t.key('3'); await t.wait(/Interrupted|What should Claude do instead/) // a digit confirms, like the real CLI
    assert.doesNotMatch(t.screen(), /Do you want to proceed\?/)
  } finally { t.end() }
})

test('Shift+Tab cycles the footer', { skip }, async () => {
  const t = launch('mode-cycle')
  try {
    await t.trust()
    const foot = () => (t.screen().match(/^\s*(⏸|⏵⏵|⏹)[^\n]*$/m) ?? [''])[0].trim()
    await t.wait(/manual mode on|⏸/)
    const seen = [foot()]
    for (let i = 0; i < 5; i++) { t.key('BTab'); await sleep(250); seen.push(foot()) }
    assert.ok(new Set(seen).size >= 4, `footer cycled: ${JSON.stringify(seen)}`)
    assert.ok(seen.some((x) => /accept edits on/.test(x)))
  } finally { t.end() }
})

test('interrupt: screen and transcript', { skip }, async () => {
  const t = launch('interrupt')
  try {
    await t.trust(); await t.type(prompts('interrupt')[0])
    await t.wait(/Do you want to proceed\?/, 15000)
    t.key('Enter'); await sleep(400); t.key('Escape')
    await t.wait(/Interrupted · What should Claude do instead\?/)
    await sleep(400)
    const got = t.transcript()
    const want = seq(path.join(REAL, 'interrupt', 'transcript.jsonl'))
    assert.deepEqual(got, want)
  } finally { t.end() }
})

test('--resume restores the session', { skip }, async () => {
  const t = launch('resume')
  let r
  try {
    await t.trust(); await t.type(prompts('resume')[0])
    await t.wait(/Cooked for|✻ \S+ for \d+s/, 15000); await sleep(500)
    const first = t.transcript()
    t.kill()
    r = launch('resume', { resume: true, reuse: t })
    await r.wait(/Say ok\./, 10000)
    await r.wait(/✻ Cooked for/, 10000); await sleep(500)
    assert.deepEqual(r.transcript().slice(0, first.length), first, 'existing transcript kept')
    assert.ok(r.transcript().length > first.length, 'resume appended a line')
  } finally { r?.kill(); t.end() }
})

test('trust "No, exit" exits non-zero and writes no transcript', { skip }, async () => {
  const t = launch(path.join(FIXT, 'trust-then-ready.json'))
  try {
    await t.wait(/trust/i)
    assert.match(t.screen(), /❯ 1\. No, exit|❯ No, exit/)
    t.key('Enter')
    await t.wait(/EXIT=[1-9]/)
    assert.equal(t.transcript(), null)
  } finally { t.end() }
})

test('deterministic: two runs give identical transcript and frames', { skip }, async () => {
  const out = []
  for (let i = 0; i < 2; i++) {
    const t = launch('bash-allow', { extra: ['--cwd', path.join(fs.realpathSync(os.tmpdir()), 'tuisim-det')] }) // screens embed cwd, so pin it
    try {
      await t.trust(); await t.type(prompts('bash-allow')[0])
      await t.wait(/Crunched for/, 15000); await sleep(500)
      const f = fs.readdirSync(t.tdir, { recursive: true, withFileTypes: true }).find((e) => e.isFile() && e.name === `${SID}.jsonl`)
      out.push([fs.readFileSync(path.join(f.parentPath, f.name), 'utf8').replaceAll(t.root, 'ROOT'), fs.readFileSync(t.log, 'utf8').replaceAll(t.root, 'ROOT')])
    } finally { t.end() }
  }
  assert.equal(out[0][0], out[1][0], 'transcripts identical')
  assert.equal(out[0][1], out[1][1], 'frames logs identical')
  assert.ok(out[0][0].length > 100 && out[0][1].length > 100)
})
