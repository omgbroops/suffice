// Replays each recorded scenario's steps.json against sim.mjs under tmux (unique socket), compares
// normalised screens (.txt) and the transcript type/tool sequence, writes FIDELITY.json and prints a table.
// Run: node tools/tui-sim/fidelity.mjs [scenario ...]   (sequential, ~5 min total)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.resolve(HERE, '../../test/fixtures/tui-real/claude')
const SIM = path.join(HERE, 'sim.mjs')
const SID = '00000000-0000-4000-8000-000000000001'
const SOCK = `tuisim-fid-${process.pid}`
const SPEED = Number(process.env.FID_SPEED) || 1 // >1 outruns the harness's own tmux latency and mis-times frames
const KEYS = { down: 'Down', up: 'Up', enter: 'Enter', esc: 'Escape', 'shift-tab': 'BTab', 'ctrl-u': 'C-u', slash: '/' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tmux = (...a) => spawnSync('tmux', ['-f', '/dev/null', '-L', SOCK, ...a], { encoding: 'utf8' })

export const norm = (t, cwd) => t.split('\n').map((l) => l
  .replaceAll(cwd, '/tmp/PROJECT')
  .replace(/^([·✢✳✶✻✽] )\S+….*$/, '$1SPIN')
  .replace(/^(✻ )\S+ for \d+s.*$/, '$1DONE')
  .replace(/\d+m? ?\d*s\b/g, 'Ns').replace(/\b\d\d:\d\d\b/g, 'HH:MM').replace(/\d+(\.\d+)?k? tokens/g, 'N tokens')
  .replace(/\s+/g, ' ').trim()).join('\n').replace(/\n+$/, '')

const seq = (lines) => lines.filter((o) => o.type !== 'last-prompt').map((o) => [o.type, o.subtype, o.type === 'assistant' || o.type === 'user' ? [].concat(o.message?.content || []).map((c) => c.name || c.type).join(',') : ''].filter(Boolean).join(':'))
const readJsonl = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] } }
const findJsonl = (d) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true, recursive: true }) : []) if (e.isFile() && e.name === `${SID}.jsonl`) return path.join(e.parentPath, e.name) }

function start(scn, cwd, tdir, resume) {
  const cmd = ['node', SIM, '--scenario', scn, '--speed', SPEED, '--transcript-dir', tdir, '--cwd', cwd, '--session-id', SID, '--real-trust', '1', ...(resume ? ['--resume', SID] : [])].map((x) => `'${x}'`).join(' ')
  tmux('kill-session', '-t', 'f')
  const r = tmux('new-session', '-d', '-s', 'f', '-x', '120', '-y', '32', cmd)
  if (r.status) throw new Error(`tmux: ${r.stderr}`)
}
const capture = () => tmux('capture-pane', '-p', '-t', 'f').stdout

async function run(scn) {
  const { steps } = JSON.parse(fs.readFileSync(path.join(FIX, scn, 'steps.json'), 'utf8'))
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuisim-fid-'))
  const cwd = fs.mkdtempSync('/tmp/f') // 12 chars, same width as /tmp/PROJECT, so wrapped and truncated lines match
  const tdir = path.join(root, 'tr')
  const frames = []
  let t0 = Date.now(), t0s = 0
  start(scn, cwd, tdir, false)
  for (const s of steps) {
    if (s.type === 'start') { if (s.resume) { start(scn, cwd, tdir, true) } ; t0 = Date.now(); t0s = s.t; continue }
    // absolute schedule: per-step poll latency must not accumulate into a late frame (a snap polls from 60 ms early)
    const wait = () => { const d = t0 + (s.t - t0s) / SPEED - Date.now() - (s.type === 'snap' ? 60 : 0); if (d > 8200) t0 -= d - 8200; return sleep(Math.min(Math.max(0, d), 8200)) } // idle gaps clamp to 8.2 s, the longest hold a scenario beat has
    if (s.type === 'snap') {
      const want = norm(fs.readFileSync(path.join(FIX, scn, 'screens', `${s.file}.txt`), 'utf8'), '/tmp/PROJECT')
      await wait()
      let got, wl, diff = Infinity, cur
      const nx = steps[steps.indexOf(s) + 1] // a miss must not eat the next frame's time
      const act = nx && nx.type !== 'snap' && nx.t - s.t < 200 // a key sent right after the snap answers this very frame: wait for it
      const end = act ? Date.now() + 3000 : nx ? Math.min(Date.now() + 4000, Math.max(Date.now() + 200, t0 + (nx.t - t0s) / SPEED - 40)) : Date.now() + 14000
      do {
        cur = norm(capture(), cwd)
        wl = want.split('\n'); const gl = cur.split('\n')
        const d = Array.from({ length: Math.max(wl.length, gl.length) }, (_, i) => (wl[i] ?? '') !== (gl[i] ?? '')).filter(Boolean).length
        if (d < diff) { diff = d; got = cur } // report the closest capture in the window, not the last
      } while (diff && Date.now() < end && (await sleep(30), true))
      const gl = got.split('\n')
      const bad = []
      for (let i = 0; i < Math.max(wl.length, gl.length) && bad.length < 3; i++) if ((wl[i] ?? '') !== (gl[i] ?? '')) bad.push({ row: i, want: wl[i] ?? '', got: gl[i] ?? '' })
      if (process.env.FID_DUMP && diff > 2) fs.appendFileSync(process.env.FID_DUMP, `## ${scn} ${s.file}\nWANT\n${want}\nGOT\n${got}\n`)
      frames.push({ frame: s.file, diff, bad })
    } else {
      await wait()
      if (s.type === 'bytes') { if (KEYS[s.label]) tmux('send-keys', '-t', 'f', KEYS[s.label]); else frames.push({ frame: `?key ${s.label}`, diff: 99, bad: [] }) }
      else if (s.type === 'send') { tmux('send-keys', '-t', 'f', '-l', s.text); await sleep(150); if (s.enter) tmux('send-keys', '-t', 'f', 'Enter') }
    }
  }
  const want = seq(readJsonl(path.join(FIX, scn, 'transcript.jsonl')))
  let got = []
  for (let i = 0; i < 40; i++) { await sleep(250); got = seq(readJsonl(findJsonl(tdir) ?? '')); if (got.length >= want.length) break } // late final beat
  const tDiff = Array.from({ length: Math.max(want.length, got.length) }, (_, i) => want[i] !== got[i]).filter(Boolean).length
  tmux('kill-session', '-t', 'f')
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(cwd, { recursive: true, force: true })
  return { scenario: scn, frames, transcript: { want: want.length, got: got.length, diff: tDiff } }
}

const only = process.argv.slice(2)
const names = fs.readdirSync(FIX).filter((d) => fs.existsSync(path.join(FIX, d, 'steps.json')) && (!only.length || only.includes(d)))
if (spawnSync('tmux', ['-V']).status) { console.error('fidelity: tmux not found'); process.exit(2) }
const results = []
try { for (const n of names) { try { results.push(await run(n)) } catch (e) { results.push({ scenario: n, error: String(e.message) }) } } }
finally { tmux('kill-server') }

const cls = (d) => (d === 0 ? 'exact' : d <= 2 ? 'near' : 'different')
const tot = { exact: 0, near: 0, different: 0 }
const all = []
console.log('scenario'.padEnd(16), 'frames', 'exact near diff', 'transcript(want/got/diff)')
for (const r of results) {
  if (r.error) { console.log(r.scenario.padEnd(16), 'ERROR', r.error); continue }
  const c = { exact: 0, near: 0, different: 0 }
  for (const f of r.frames) { c[cls(f.diff)]++; tot[cls(f.diff)]++; all.push({ scenario: r.scenario, ...f }) }
  console.log(r.scenario.padEnd(16), String(r.frames.length).padEnd(6), `${c.exact} ${c.near} ${c.different}`.padEnd(15), `${r.transcript.want}/${r.transcript.got}/${r.transcript.diff}`)
}
const worst = all.sort((a, b) => b.diff - a.diff).slice(0, 5)
console.log('frames:', tot, '\nworst 5:'); for (const w of worst) console.log(` ${w.scenario}/${w.frame} diff=${w.diff}`, JSON.stringify(w.bad[0] ?? ''))
fs.writeFileSync(process.env.FID_OUT || path.join(HERE, 'FIDELITY.json'), JSON.stringify({ speed: SPEED, totals: tot, worst, results }, null, 1) + '\n')
