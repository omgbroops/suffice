// Fidelity floors for tools/tui-sim: replays every recorded claude scenario under tmux (private socket, via
// fidelity.mjs, ~5 min) and checks the sim against the recorded screens and transcripts.
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FID = path.resolve(HERE, '../tools/tui-sim/fidelity.mjs')
const REAL = path.join(HERE, 'fixtures/tui-real/claude')
const skip = spawnSync('tmux', ['-V']).status === 0 ? false : 'tmux not found: fidelity needs tmux'
const FLOORS = { exact: 202, different: 1, near: 6, transcripts: 20 }
let res
const frame = (scn, f) => res.results.find((r) => r.scenario === scn)?.frames.find((x) => x.frame === f)
// the recorded row, normalised the way fidelity.mjs normalises both sides
const wantRow = (scn, f, row) => fs.readFileSync(path.join(REAL, scn, 'screens', `${f}.txt`), 'utf8').split('\n').map((l) => l.replace(/\s+/g, ' ').trim())[row] ?? ''

before(() => {
  if (skip) return
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fidtest-')), 'fid.json')
  const r = spawnSync('node', [FID], { env: { ...process.env, FID_OUT: out }, encoding: 'utf8', timeout: 900000 })
  assert.equal(r.status, 0, r.stderr)
  res = JSON.parse(fs.readFileSync(out, 'utf8'))
}, { timeout: 960000 })

test('floors: exact, different, near', { skip }, () => {
  const t = res.totals
  assert.ok(t.exact >= FLOORS.exact, `exact ${t.exact} < ${FLOORS.exact}`)
  assert.ok(t.different <= FLOORS.different, `different ${t.different} > ${FLOORS.different}`)
  assert.ok(t.near <= FLOORS.near, `near ${t.near} > ${FLOORS.near}`)
})

test('floors: transcripts match', { skip }, () => {
  const ok = res.results.filter((r) => r.transcript?.diff === 0).length
  assert.ok(ok >= FLOORS.transcripts, `${ok} of ${res.results.length} transcripts match`)
})

// [scenario, frame, row, text the recorded screen has on that row (the row the sim got wrong before)]
const CLASSES = [
  ['ask-question', '02-trust', 13, '❯ No, exit'],
  ['at-mention', '02-trust', 14, 'Yes, I trust this folder'],
  ['bash-allow', '02-trust', 13, '❯ No, exit'],
  ['bash-deny', '02-trust', 14, 'Yes, I trust this folder'],
  ['edit', '02-trust', 13, '❯ No, exit'],
  ['at-mention', '05-at-picker', 31, '⏸ manual mode on'],
  ['at-mention', '06-cleared', 23, 'Ctrl+Y to paste deleted text'],
  ['bash-deny', '10-dialog', 20, '2. Yes, and always allow access to /tmp/PROJECT/build from'],
  ['bash-fail', '06-working', 8, ''],
  ['bash-fail', '07-working', 9, ''],
  ['bash-fail', '08-working', 11, ''],
  ['bash-fail', '11-idle', 12, "Error: Cannot find module '/tmp/PROJECT/missing.js'"],
  ['ask-question', '07-working', 7, ''],
  ['ask-question', '08-working', 7, ''],
  ['bash-allow', '10-idle', 8, 'Listed 1 directory'],
  ['bash-allow', '10-idle', 10, '⏺ The ls output for the working directory:'],
  ['edit', '10-dialog', 8, 'Read 1 file'],
  ['edit', '10-dialog', 10, '⏺ Update(greet.js)'],
  ['edit', '11-idle', 1, "❯ Fix the typo in greet.js: 'Helo' should be 'Hello'. Use the Edit tool."],
  ['queued', '10-failure', 8, 'Ran 1 shell command'],
  ['queued', '10-failure', 10, '⏺ The command ran and printed first.'],
  ['subagent', '10-idle', 8, '⏺ Agent(Count files in working directory)'],
  ['plan-mode', '10-dialog', 1, '⎿ /plan to preview'],
  ['plan-mode', '12-idle', 0, 'Verification'],
  ['read-search', '10-idle', 0, '▝▝ ▝▝ /tmp/PROJECT'],
  ['todo', '10-idle', 0, '▝▝ ▝▝ /tmp/PROJECT'],
]
for (const [scn, f, row, text] of CLASSES) {
  test(`${scn} ${f} row ${row}`, { skip }, () => {
    assert.equal(wantRow(scn, f, row), text, 'fixture row drifted from the table')
    const x = frame(scn, f)
    assert.ok(x, 'frame missing from the run')
    assert.equal(x.diff, 0, JSON.stringify(x.bad))
  })
}

// spinner glyph phase and the tmux hint rows are the known 1-row near misses; they must not get worse
for (const [scn, f] of [['ask-question', '09-working'], ['background', '06-working'], ['bash-fail', '09-working'], ['interrupt', '11-after-esc'], ['model-switch', '09-cleared'], ['resume', '10-idle']]) {
  test(`${scn} ${f} stays near`, { skip }, () => assert.ok(frame(scn, f).diff <= 1, JSON.stringify(frame(scn, f).bad)))
}
