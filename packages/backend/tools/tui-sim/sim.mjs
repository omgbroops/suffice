#!/usr/bin/env node
/*
 * tui-sim: a scripted stand-in for the Claude Code TUI. It paints real ANSI
 * (120x32, row-diff redraws), takes raw keys, and appends a Claude-format
 * JSONL transcript as screen events happen. No model, no network.
 *
 * Run one scenario by hand (in a terminal, 120x32 or larger):
 *   node packages/backend/tools/tui-sim/sim.mjs --scenario bash-deny
 *   flags: --scenario <name|path.json>  --speed N  --transcript-dir D  --session-id ID
 *          --cwd DIR  --seed N  --resume <id>  --frames-log F  --exit-when-done
 *          [transcript-file]   (positional: write the transcript exactly there)
 *   env fallback: SIM_SCENARIO=<name>
 *
 * Register as the agent for the desktop app capture run (no app edits needed;
 * apps/desktop/electron/sessions-ipc.mjs already reads these):
 *   SUFFICE_TEST_CLAUDE_AGENT=<abs>/packages/backend/tools/tui-sim/sim.mjs \
 *   SUFFICE_SESSIONS_SOCKET=<unique-tmux-socket> \
 *   SIM_SCENARIO=long-session  (optional SIM_SPEED not read; pass --speed via SUFFICE_TEST_NODE wrapper if needed)
 * The app launches `node sim.mjs <dataDir>/fakeclaude-transcript.jsonl`; the
 * positional path is where the transcript lines go. SUFFICE_TEST_AGENT works too.
 *
 * Time is virtual (seeded, no wall clock written): same scenario + seed + speed
 * gives a byte-identical transcript and the same screen sequence.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.resolve(HERE, '../../test/fixtures/tui-real/claude')
const COLS = 120, ROWS = 32
const ESC = '\x1b'
const PURPLE = `${ESC}[38;5;141m`, GREY = `${ESC}[38;5;145m`, DIM = `${ESC}[38;5;59m`, OFF = `${ESC}[39m`
const plain = (s) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
const isRule = (p) => p.length > 10 && /^─+$/.test(p)

// ---- args
const argv = process.argv.slice(2)
const A = {}
let positional
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--exit-when-done') A.exit = true
  else if (a.startsWith('--')) A[a.slice(2)] = argv[++i]
  else positional ??= a
}
const scnArg = A.scenario ?? process.env.SIM_SCENARIO
if (!scnArg) { console.error('tui-sim: need --scenario <name|path> or SIM_SCENARIO'); process.exit(2) }
const speed = Number(A.speed ?? 1) || 1
const seed = Number(A.seed ?? 1) >>> 0
const cwd = A.cwd ?? process.cwd()
const scnPath = scnArg.includes('/') || scnArg.endsWith('.json') ? scnArg : path.join(HERE, 'scenarios', `${scnArg}.json`)
let scenario
try { scenario = JSON.parse(fs.readFileSync(scnPath, 'utf8')) } catch (e) { console.error(`tui-sim: cannot load scenario ${scnPath}: ${e.message}`); process.exit(2) }

// ---- seeded PRNGs (screen and transcript streams are independent)
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const rngT = mulberry(seed), rngS = mulberry(seed + 1)
const hex = (r, n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('')
const uuid = () => `${hex(rngT, 8)}-${hex(rngT, 4)}-4${hex(rngT, 3)}-8${hex(rngT, 3)}-${hex(rngT, 12)}`
const sessionId = A.resume ?? A['session-id'] ?? uuid()

// ---- transcript
const slug = cwd.replace(/[^a-zA-Z0-9]/g, '-')
const tfile = positional ? path.resolve(positional) : path.join(A['transcript-dir'] ?? path.join(os.tmpdir(), 'tui-sim'), slug, `${sessionId}.jsonl`)
const subDir = path.join(tfile.replace(/\.jsonl$/, ''), 'subagents')
let k = 0
if (A.resume) {
  if (!fs.existsSync(tfile)) { console.error(`tui-sim: --resume ${A.resume}: no transcript at ${tfile}`); process.exit(1) }
  k = fs.readFileSync(tfile, 'utf8').split('\n').filter(Boolean).length
}
const T0 = Date.UTC(2026, 0, 1)
const UUID_RE = /00000000-0000-4000-8000-0000000000\d\d/g
const memo = new Map()
const recCache = new Map()
const recLines = (rec) => {
  if (!recCache.has(rec)) recCache.set(rec, fs.readFileSync(path.join(FIX, rec, 'transcript.jsonl'), 'utf8').split('\n').filter(Boolean))
  return recCache.get(rec)
}
function restamp(text, { map, fresh } = {}) {
  text = text.replaceAll('/tmp/PROJECT', JSON.stringify(cwd).slice(1, -1))
  text = text.replace(UUID_RE, (m) => {
    if (m.endsWith('01')) return sessionId
    const key = `${fresh ?? ''}|${m}`
    if (!memo.has(key)) memo.set(key, uuid())
    return memo.get(key)
  })
  text = text.replace(/@big\((\d+)\)/g, (_, n) => Array.from({ length: +n }, (_, i) => `line ${i + 1} The quick brown fox jumps over the lazy dog 0123456789`).join('\\n'))
  text = text.replace(/"@uuid"/g, () => JSON.stringify(uuid()))
  for (const [a, b] of Object.entries(map ?? {})) text = text.replaceAll(a, b)
  if (fresh) text = text.replace(/\b(toolu_|msg_)\w+/g, (m, p) => {
    const key = `${fresh}|${m}`
    if (!memo.has(key)) memo.set(key, p + hex(rngT, 20))
    return memo.get(key)
  })
  return text
}
function stampLine(text) {
  let o
  try { o = JSON.parse(text) } catch { return text }
  if (o && typeof o === 'object' && 'timestamp' in o) o.timestamp = new Date(T0 + k * 1000).toISOString()
  return JSON.stringify(o)
}
const expand = (specs) => {
  const out = []
  for (const s of specs ?? []) {
    if (typeof s === 'string') out.push(restamp(s))
    else if (s.rec) for (const l of recLines(s.rec).slice(s.from ?? 0, s.to)) out.push(restamp(l, s))
    else out.push(restamp(JSON.stringify(s)))
  }
  return out
}
function appendTo(file, lines) {
  if (!lines.length) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  let buf = ''
  for (const l of lines) { buf += stampLine(l) + '\n'; k++ }
  fs.appendFileSync(file, buf)
}
const writeTranscript = (specs) => appendTo(tfile, expand(specs))
function writeSubagents(list) {
  for (const s of list ?? []) {
    const metaFile = path.join(subDir, `agent-${s.id}.meta.json`)
    if (!fs.existsSync(metaFile)) {
      let meta = {}
      try { meta = JSON.parse(restamp(fs.readFileSync(path.join(FIX, s.rec, 'subagents', s.file.replace(/\.jsonl$/, '.meta.json')), 'utf8'), s)) } catch {}
      fs.mkdirSync(subDir, { recursive: true })
      fs.writeFileSync(metaFile, JSON.stringify({ ...meta, ...(s.meta ?? {}) }))
    }
    const src = fs.readFileSync(path.join(FIX, s.rec, 'subagents', s.file), 'utf8').split('\n').filter(Boolean)
    appendTo(path.join(subDir, `agent-${s.id}.jsonl`), src.slice(s.from ?? 0, s.to).map((l) => restamp(l, s)))
  }
}

// ---- virtual-time scheduler
let vnow = 0, seq = 0, armed = null
const timers = []
function arm() {
  if (armed) { clearTimeout(armed); armed = null }
  const head = timers[0]
  if (!head) return
  armed = setTimeout(() => {
    armed = null
    const t = timers.shift()
    vnow = Math.max(vnow, t.due)
    if (!t.dead) t.fn()
    arm()
  }, Math.max(0, (head.due - vnow) / speed))
}
function at(delay, fn) {
  const t = { due: vnow + Math.max(0, delay), seq: seq++, fn, dead: false }
  let i = timers.length
  while (i > 0 && (timers[i - 1].due > t.due)) i--
  timers.splice(i, 0, t)
  if (i === 0) arm(); else if (!armed) arm()
  return t
}
let sleepWake = null
const sleepI = (ms) => new Promise((res) => {
  const t = at(ms, () => { sleepWake = null; res('done') })
  sleepWake = { t, res }
})

// ---- frames
const frameCache = new Map()
function loadFrame(spec) {
  if (spec && typeof spec === 'object') {
    if (spec.rows) return Array.from({ length: ROWS }, (_, i) => spec.rows[i] ?? '')
    const rows = loadFrame(spec.ref)
    for (const [r, v] of Object.entries(spec.set ?? {})) rows[Number(r)] = v
    return rows
  }
  if (!frameCache.has(spec)) {
    const [scn, name] = spec.split('/')
    const raw = fs.readFileSync(path.join(FIX, scn, 'screens', `${name}.ansi`), 'utf8').split('\n')
    frameCache.set(spec, Array.from({ length: ROWS }, (_, i) => raw[i] ?? ''))
  }
  return frameCache.get(spec).map((r) => r.replaceAll('/tmp/PROJECT', cwd).replaceAll('00000000-0000-4000-8000-000000000001', sessionId))
}
const menuCache = {}
function menuRows(kind) {
  if (menuCache[kind]) return menuCache[kind]
  const rows = loadFrame(kind === 'slash' ? 'model-switch/08-slash-menu' : 'at-mention/05-at-picker')
  const pl = rows.map(plain)
  const start = pl.findIndex((p) => (kind === 'slash' ? /^\s+❯ \/\w/ : /^\s+\+ /).test(p))
  let end = pl.findIndex((p, i) => i > start && isRule(p))
  if (end < 0) end = rows.length
  return (menuCache[kind] = start < 0 ? [] : rows.slice(start, end))
}

// ---- state
let base = Array(ROWS).fill('')
let input = ''
let work = null // {start, vbase, verbs, tokens, gl, gen, tickMs}
let spinGen = 0
let queue = []
let modeTouched = false, modeIdx = 0
let dlg = null // {kind, opts:[{row,...}], sel, resolve}
let inputWaiter = null
let curInterrupt = null
let skipping = false
let finished = false
let last = null
const framesLog = A['frames-log'] ? fs.openSync(A['frames-log'], 'w') : null
const GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽']
const VERBS = ['Germinating', 'Churning', 'Pondering', 'Cogitating', 'Simmering', 'Noodling', 'Ruminating', 'Brewing']
const MODES = ['⏸ manual mode on', '⏵⏵ accept edits on (shift+tab to cycle)', '⏸ plan mode on (shift+tab to cycle)', '⏵⏵ auto mode on (shift+tab to cycle)']
const MODE_RE = /(⏸|⏵⏵) (?:manual mode on|accept edits on|plan mode on|auto mode on)(?: \(shift\+tab to cycle\))?/
const WK = ' | wk 00% used · 00% left · used 0.00%/h · can use 0.00%/h (↺ 0d 00h)'
const frameMode = (rows) => {
  for (const r of rows) { const m = plain(r).match(MODE_RE); if (m) return m[0].includes('manual') ? 0 : m[0].includes('accept') ? 1 : m[0].includes('plan') ? 2 : 3 }
  return -1
}

function compose() {
  const rows = base.slice()
  const pl = rows.map(plain)
  let top = -1
  for (let i = pl.length - 3; i >= 0; i--) if (isRule(pl[i]) && pl[i + 1].startsWith('❯') && isRule(pl[i + 2])) { top = i; break }
  if (top >= 0) {
    const isSlash = /^\/\S*$/.test(input), isAt = /(^|\s)@\S*$/.test(input)
    if (isSlash || isAt) {
      const m = menuRows(isSlash ? 'slash' : 'at')
      const s = top - m.length
      if (s >= 0) m.forEach((r, i) => { rows[s + i] = r })
    }
    if (input) rows[top + 1] = `${GREY}❯ ${OFF}${input}`
    let sp = pl.findIndex((p) => /^\s*[·✢✳✶✻✽] \S+…/.test(p))
    if (work) {
      if (sp < 0) sp = pl[top - 2].trim() === '' ? top - 2 : top - 1
      const lead = (pl[sp].match(/^\s*/) ?? [''])[0]
      const secs = Math.floor((vnow - work.start) / 1000)
      const verb = work.verbs[(work.vbase + Math.floor(secs / 4)) % work.verbs.length]
      rows[sp] = `${lead}${PURPLE}${GLYPHS[work.gl % GLYPHS.length]} ${verb}…${OFF}` + (secs >= 1 ? ` ${GREY}(${secs}s · ↓ ${work.tokens} tokens)${OFF}` : '')
    }
    if (queue.length && sp >= 0) {
      let r = sp + 1
      for (const q of queue) { while (r < top && plain(rows[r]).trim() !== '') r++; if (r >= top) break; rows[r++] = `  ${DIM}❯ ${q}${OFF}` }
    }
  }
  if (modeTouched) {
    const mi = modeIdx
    rows.forEach((r, i) => {
      if (MODE_RE.test(plain(r))) rows[i] = r.replace(MODE_RE, MODES[mi])
      if (/(Haiku|Sonnet) 5\.5 \(medium\) \|/.test(plain(r))) rows[i] = r.replace(/(Haiku|Sonnet) 5\.5 \(medium\)/, `${mi === 2 ? 'Sonnet' : 'Haiku'} 5.5 (medium)`)
      if (/^\s*[◐○]{10} 0% 000K\s*$/.test(plain(r))) rows[i] = r + `${GREY}${WK}${OFF}`
    })
  }
  return rows
}
function paint() {
  const rows = compose()
  let out = ''
  if (!last) out += `${ESC}[?25l${ESC}[?7l${ESC}[2J${ESC}[H`
  let changed = !last
  for (let i = 0; i < ROWS; i++) if (!last || rows[i] !== last[i]) { out += `${ESC}[${i + 1};1H${ESC}[0m${ESC}[2K${rows[i]}${ESC}[0m`; changed = true }
  if (!changed) return
  last = rows
  process.stdout.write(out)
  if (framesLog) fs.writeSync(framesLog, `${vnow}\t${crypto.createHash('sha1').update(rows.join('\n')).digest('hex').slice(0, 12)}\n`)
}
function setBase(spec) { base = loadFrame(spec); if (!modeTouched) modeIdx = Math.max(0, frameMode(base)); paint() }

// ---- working spinner
function startWork(w) {
  if (w.cont && work) { paint(); return }
  stopWork()
  const verbs = w.verbs?.length ? w.verbs : VERBS
  const gen = ++spinGen
  work = { start: vnow, verbs, vbase: Math.floor(rngS() * verbs.length), tokens: w.tokens ?? 0, gl: 0 }
  const tick = () => {
    if (gen !== spinGen || !work) return
    work.gl++; work.tokens += 5 + Math.floor(rngS() * 31)
    paint(); at(w.tickMs ?? 120, tick)
  }
  at(w.tickMs ?? 120, tick)
  paint()
}
function stopWork() { spinGen++; work = null }

// ---- dialogs
const OPT_RE = /^(\s*)(❯ )?(\d+\.)(\s+)(.*)$/
const TRUST_RE = /^(\s*)(❯ )?()()(No, exit|Yes, I trust.*)$/
function parseOpts(re) {
  const opts = []
  let expect = 1
  base.forEach((row, i) => {
    const m = plain(row).match(re)
    if (!m) return
    if (m[3]) { const n = parseInt(m[3]); if (n === 1) { opts.length = 0; expect = 1 } if (n !== expect) return; expect++ }
    const ws = m[1].length
    opts.push({ i, sel: !!m[2], lead: ' '.repeat(m[2] ? ws : Math.max(0, ws - 2)), num: m[3], sep: m[4], text: m[5] })
  })
  return opts
}
function drawOpts(d) {
  d.opts.forEach((o, n) => {
    base[o.i] = n === d.sel
      ? `${o.lead}${PURPLE}❯${OFF} ${o.num ? GREY + o.num + o.sep : ''}${PURPLE}${o.text}${OFF}`
      : `${o.lead}  ${o.num}${o.sep}${o.text}`
  })
  paint()
}
async function runDialog(spec) {
  stopWork()
  const kind = spec.kind ?? 'perm'
  const d = { kind, opts: kind === 'modal' ? [] : parseOpts(spec.optRe ? new RegExp(spec.optRe) : kind === 'trust' ? TRUST_RE : OPT_RE), sel: 0 }
  const rec = d.opts.findIndex((o) => o.sel)
  d.sel = Math.max(0, Math.min(d.opts.length - 1, spec.default ?? (rec >= 0 ? rec : 0)))
  if (d.opts.length) drawOpts(d)
  dlg = d
  const choice = await new Promise((res) => { d.resolve = res })
  dlg = null
  const oc = spec.onChoose ?? {}
  let beats = oc[String(choice)]
  if (beats === undefined && choice === 'esc') beats = oc.esc ?? (kind === 'perm' || kind === 'picker' ? oc[String(d.opts.length - 1)] : undefined)
  await runBeats(beats ?? [])
}

// ---- beats
async function interrupted(beats) {
  stopWork()
  if (beats) { skipping = false; await runBeats(beats) }
  else {
    const pl = base.map(plain)
    const sp = pl.findIndex((p) => /^\s*[·✢✳✶✻✽] \S+…/.test(p))
    if (sp >= 0) base[sp] = `${GREY}  ⎿  Interrupted · What should Claude do instead?${OFF}`
    paint()
    writeTranscript([{ parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] }, uuid: '@uuid', timestamp: '', sessionId, cwd: '/tmp/PROJECT' }])
  }
  skipping = true
}
async function runBeats(beats) {
  for (const b of beats) {
    if (skipping && b.wait !== 'input' && !b.keep) continue
    if (b.wait === 'input' || b.keep) skipping = false
    await runBeat(b)
  }
}
async function waitInput(re) {
  for (;;) {
    const line = queue.length ? queue.shift() : await new Promise((r) => { inputWaiter = r })
    inputWaiter = null
    if (!re || re.test(line)) return line
  }
}
async function runBeat(b) {
  if (b.exit !== undefined) { finish(b.exit); await new Promise(() => {}) }
  if (typeof b.wait === 'number' && b.wait > 0 && (await sleepI(b.wait)) === 'int') return interrupted(curInterrupt)
  if (b.screen) setBase(b.screen)
  if (b.working === false || b.wait === 'input') stopWork()
  else if (b.working) { startWork(b.working); curInterrupt = b.working.onInterrupt ?? b.onInterrupt ?? null }
  if (b.wait !== 'input') { writeTranscript(b.transcript); writeSubagents(b.subagents) }
  if (b.working?.seconds && (await sleepI(b.working.seconds * 1000)) === 'int') return interrupted(curInterrupt)
  if (b.wait === 'input') {
    paint()
    await waitInput(b.expectInput ? new RegExp(b.expectInput) : null)
    input = ''
    writeTranscript(b.transcript); writeSubagents(b.subagents)
    paint()
  }
  if (b.dialog) await runDialog(b.dialog)
}

// ---- keys
function onKey(key) {
  if (finished) return
  if (key === 'ctrlc') return finish(130)
  if (dlg) {
    const d = dlg
    if (key === 'up') { d.sel = Math.max(0, d.sel - 1); drawOpts(d) }
    else if (key === 'down') { d.sel = Math.min(d.opts.length - 1, d.sel + 1); drawOpts(d) }
    else if (/^[1-9]$/.test(key) && d.opts[0]?.num && Number(key) <= d.opts.length) { d.sel = Number(key) - 1; drawOpts(d); d.resolve(d.sel) } // real Claude: a digit selects and confirms
    else if (key === 'enter') d.resolve(d.kind === 'modal' ? 'esc' : d.sel)
    else if (key === 'esc') d.resolve('esc')
    return
  }
  if (key === 'btab') { modeIdx = ((modeTouched ? modeIdx : Math.max(0, frameMode(base))) + 1) % 4; modeTouched = true; return paint() }
  if (key === 'esc') {
    if (work && sleepWake) { const s = sleepWake; sleepWake = null; s.t.dead = true; s.res('int') }
    else if (input) { input = ''; paint() }
    return
  }
  if (key === 'ctrlu') { input = ''; return paint() }
  if (key === 'bs') { input = input.slice(0, -1); return paint() }
  if (key === 'enter') {
    const line = input.trim(); input = ''
    if (!line) return paint()
    if (inputWaiter && !work) { const w = inputWaiter; inputWaiter = null; w(line) }
    else if (!inputDone) queue.push(line)
    return paint()
  }
  if (key.length === 1) { input += key; paint() }
}
let inputDone = false
function onData(chunk) {
  const s = chunk.toString('utf8')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === ESC) {
      if (s[i + 1] === '[') {
        let j = i + 2
        while (j < s.length && !/[@-~]/.test(s[j])) j++
        const f = s[j]; i = j
        onKey(f === 'A' ? 'up' : f === 'B' ? 'down' : f === 'Z' ? 'btab' : 'ignore')
      } else if (s[i + 1] === 'O') i++
      else onKey('esc')
    } else if (c === '\r' || c === '\n') onKey('enter')
    else if (c === '\x7f') onKey('bs')
    else if (c === '\x15') onKey('ctrlu')
    else if (c === '\x03') onKey('ctrlc')
    else if (c >= ' ') onKey(c)
  }
}
function finish(code) {
  if (finished) return
  finished = true
  if (process.stdin.isTTY) try { process.stdin.setRawMode(false) } catch {}
  process.stdout.write(`${ESC}[?25h${ESC}[?7h`, () => process.exit(code))
}

// ---- main
if (process.stdin.isTTY) process.stdin.setRawMode(true)
process.stdin.on('data', onData)
process.stdin.resume()
const beats = A.resume ? (scenario.resume ?? scenario.beats.slice(1)) : scenario.beats
await runBeats(beats)
stopWork()
inputDone = true
paint()
if (A.exit) finish(0)
