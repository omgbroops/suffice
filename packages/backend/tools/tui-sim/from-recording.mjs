// Generates tools/tui-sim/scenarios/*.json from the recordings in test/fixtures/tui-real/claude.
// Run: node tools/tui-sim/from-recording.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.resolve(HERE, '../../test/fixtures/tui-real/claude')
const OUT = path.join(HERE, 'scenarios')
fs.mkdirSync(OUT, { recursive: true })

const ls = (s) => { try { return fs.readFileSync(path.join(FIX, s, 'transcript.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] } }
const stepsOf = (s) => JSON.parse(fs.readFileSync(path.join(FIX, s, 'steps.json'), 'utf8')).steps
const info = (s) => {
  const L = ls(s)
  const u = L.findIndex((o) => o.type === 'user' && typeof o.message?.content === 'string')
  const fa = L.findIndex((o, i) => i >= u && o.type === 'assistant')
  const r = L.findIndex((o, i) => i > fa && o.type === 'user' && Array.isArray(o.message?.content) && o.message.content.some((c) => c.type === 'tool_result'))
  return { L, len: L.length, u, fa, r }
}
const R = (rec, a, b, x = {}) => (a >= b ? [] : [{ rec, from: a, to: b, ...x }])
const CUTS = { 'ask-question': [34], 'bash-fail': [34], edit: [48], web: [50], write: [35], 'plan-mode': [56, 96], interrupt: [35], 'bash-deny': [35] }
const snaps = (s) => stepsOf(s).filter((x) => x.type === 'snap')
const workBeats = (s) => {
  const sn = snaps(s)
  const w = sn.filter((x) => /^\d+-working$/.test(x.file))
  return w.map((x, i) => {
    const nxt = sn[sn.indexOf(x) + 1]
    const sec = Math.min(8, Math.max(0.15, ((nxt?.t ?? x.t + 500) - x.t) / 1000))
    return { screen: `${s}/${x.file}`, working: { seconds: sec, cont: i > 0 } }
  })
}
const head = (s) => {
  const { u } = info(s)
  return [
    { screen: `${s}/01-trust`, dialog: { kind: 'trust', onChoose: { 0: [{ exit: 1 }], 1: [], esc: [{ exit: 1 }] } } },
    { screen: `${s}/04-ready`, transcript: R(s, 0, Math.max(u, 0)) },
  ]
}
const lastSnap = (s) => { const sn = snaps(s); return sn[sn.length - 1].file }

function turn(s, F, from) {
  const { u, fa, r, len } = info(s)
  const cuts = CUTS[s] || []
  const b = [{ wait: 'input', transcript: R(s, from ?? u, fa, F ? { fresh: F } : {}) }]
  const x = F ? { fresh: F } : {}
  const wb = workBeats(s)
  let prev = fa
  if (cuts.length) {
    b.push(...wb)
    cuts.forEach((c, i) => {
      b.push({ screen: `${s}/${10 + i}-dialog`, transcript: R(s, prev, c + 1, x), dialog: { kind: 'perm' } })
      prev = c + 1
    })
  } else {
    const mid = r >= 0 ? r + 1 : fa
    const k = Math.floor(wb.length / 2)
    wb.forEach((w, i) => {
      if (i === k) {
        w.transcript = R(s, fa, mid, x)
        if (s === 'subagent') w.subagents = [{ id: 'a8fd05f428d5e8097', rec: 'subagent', file: 'agent-a8fd05f428d5e8097.jsonl', ...x }]
      }
    })
    b.push(...wb)
    prev = mid
  }
  b.push({ screen: `${s}/${lastSnap(s)}`, working: false, transcript: R(s, prev, len, x) })
  return b
}

const interruptBeats = (F) => {
  const s = 'interrupt'
  const { len } = info(s)
  const x = F ? { fresh: F } : {}
  return [
    ...turn(s, F).slice(0, -1),
    { screen: 'interrupt/09-working', working: { seconds: 3600, onInterrupt: [{ screen: 'interrupt/11-after-esc', working: false, transcript: R(s, 36, len, x) }] } },
    { keep: true, screen: 'interrupt/12-idle' },
  ]
}
const bashDeny = (F, redirect = true) => {
  const s = 'bash-deny'
  const { len } = info(s)
  const x = F ? { fresh: F } : {}
  const b = [
    { wait: 'input', transcript: R(s, 8, 34, x) },
    ...workBeats(s),
    { screen: `${s}/10-dialog`, transcript: R(s, 34, 36, x), dialog: { kind: 'perm' } },
    { screen: `${s}/11-idle`, working: false, transcript: R(s, 36, 47, x) },
  ]
  if (redirect) b.push({ wait: 'input', transcript: R(s, 47, 52, x) }, { screen: `${s}/12-idle`, transcript: R(s, 52, len, x) })
  return b
}

const out = {}
const put = (name, o) => { out[name] = { name, ...o } }
const rec = (s, beats, extra = {}) => put(s, { recorded: true, beats, ...extra })

for (const s of fs.readdirSync(FIX).filter((d) => fs.existsSync(path.join(FIX, d, 'steps.json')))) {
  const { len } = info(s)
  const H = head(s)
  switch (s) {
    case 'interrupt': rec(s, [...H, ...interruptBeats()]); break
    case 'bash-deny': rec(s, [...H, ...bashDeny(null)]); break
    case 'compact': {
      const wb = workBeats(s)
      rec(s, [...H,
        { wait: 'input', transcript: R(s, 8, 32) }, ...wb,
        { screen: `${s}/10-idle`, working: false, transcript: R(s, 32, 43) },
        { wait: 'input', transcript: R(s, 43, 52) },
        { screen: `${s}/11-idle`, working: false, transcript: R(s, 52, 66) },
        { wait: 'input', expectInput: '^/compact' },
        { screen: `${s}/12-idle`, working: false, transcript: R(s, 66, len) }])
      break
    }
    case 'resume': {
      const t = turn(s, null)
      t[t.length - 1].transcript = R(s, 32, 43)
      // first beat of the turn already carries u..fa; mid split is handled by turn()
      rec(s, [...H, ...t], { resume: [{ screen: `${s}/11-ready` }, { wait: 600, screen: `${s}/12-resumed`, transcript: R(s, 43, 44) }] })
      break
    }
    case 'background':
      rec(s, [...H, ...turn(s, null),
        { wait: 'input', expectInput: '^/tasks' },
        { screen: `${s}/11-tasks-view`, dialog: { kind: 'modal' } },
        { screen: `${s}/10-idle` }])
      break
    case 'model-switch':
      rec(s, [...H,
        { wait: 'input', expectInput: '^/model', transcript: R(s, 8, 10) },
        { screen: `${s}/05-model-picker`, dialog: { kind: 'picker' } },
        { screen: `${s}/06-after-model` },
        { wait: 'input', expectInput: '^/help', transcript: R(s, 10, 11) },
        { screen: `${s}/07-help`, dialog: { kind: 'modal' } },
        { screen: `${s}/09-cleared` }])
      break
    case 'at-mention': rec(s, H); break
    case 'mode-cycle': rec(s, [...H, { screen: `${s}/05-start` }]); break
    case 'status-idle': {
      const b = [...H, { screen: `${s}/05-idle` }]
      for (const [c, f] of [['status', '06-status'], ['cost', '07-cost'], ['usage', '08-usage']]) {
        b.push({ wait: 'input', expectInput: `^/${c}` }, { screen: `${s}/${f}`, dialog: { kind: 'modal' } }, { screen: `${s}/05-idle` })
      }
      rec(s, b)
      break
    }
    default: rec(s, [...H, ...turn(s, null)])
  }
}

// ---- composites
const H0 = (s) => head(s)
put('long-session', {
  recorded: true,
  beats: [...H0('bash-allow'),
    ...['read-search', 'edit', 'bash-allow', 'todo', 'web', 'write', 'subagent', 'read-search', 'bash-allow', 'ask-question']
      .flatMap((s, i) => turn(s, 'L' + i))],
})

{
  const s = 'subagent'
  const wb = workBeats(s)
  const subs = [1, 2, 3].map((i) => ({ id: `a000000000000000${i}`, rec: s, file: 'agent-a8fd05f428d5e8097.jsonl', fresh: 'p' + i, map: { a8fd05f428d5e8097: `a000000000000000${i}` } }))
  const pair = (i) => [...R(s, 34, 36, { fresh: 'p' + i, map: { a8fd05f428d5e8097: `a000000000000000${i}` } })]
  const tool = [1, 2, 3].flatMap(pair)
  const k = Math.floor(wb.length / 2)
  wb[k].transcript = tool
  wb[k].subagents = subs.map((x) => ({ ...x, to: 2 }))
  put('parallel-subagents', {
    recorded: true,
    beats: [...head(s),
      { wait: 'input', transcript: R(s, 8, 34) }, ...wb,
      { screen: `${s}/10-idle`, working: false, transcript: R(s, 36, info(s).len, { fresh: 'p9' }), subagents: subs.map((x) => ({ ...x, from: 2 })) }],
  })
}

{
  const s = 'bash-allow'
  const wb = workBeats(s)
  const beats = [...head(s), { wait: 'input', transcript: R(s, 9, 34) }]
  for (let i = 0; i < 80; i++) beats.push({ screen: wb[i % wb.length].screen, working: { seconds: 0.05, cont: true }, transcript: R(s, 34, 36, { fresh: 's' + i }) })
  beats.push({ screen: `${s}/10-idle`, working: false, transcript: R(s, 36, info(s).len, { fresh: 'se' }) })
  put('storm', { recorded: true, beats })
}

{
  const s = 'bash-allow'
  const L = ls(s)
  const big = (o, set) => { const c = structuredClone(o); set(c); return JSON.stringify(c) }
  const res = big(L[35], (c) => { c.message.content[0].content = '@big(3000)'; c.toolUseResult.stdout = '@big(3000)' })
  const wb = workBeats(s)
  const k = Math.floor(wb.length / 2)
  wb[k].transcript = [...R(s, 34, 35), res]
  put('huge-output', { recorded: true, beats: [...head(s), { wait: 'input', transcript: R(s, 9, 34) }, ...wb, { screen: `${s}/10-idle`, working: false, transcript: R(s, 36, info(s).len) }] })
}

{
  const s = 'bash-allow'
  const sid = '00000000-0000-4000-8000-000000000001'
  const err = JSON.stringify({ type: 'system', subtype: 'api_error', level: 'error', content: 'API Error: 429 Rate limit reached', uuid: '00000000-0000-4000-8000-0000000000e1', timestamp: '2026-11-16T06:11:40.000Z', sessionId: sid, cwd: '/tmp/PROJECT', userType: 'external', version: '2.1.325' })
  const err2 = JSON.stringify({ type: 'assistant', isApiErrorMessage: true, message: { id: 'msg_err1', role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'API Error: Rate limit reached' }] }, uuid: '00000000-0000-4000-8000-0000000000e2', timestamp: '2026-11-16T06:11:41.000Z', sessionId: sid, cwd: '/tmp/PROJECT', userType: 'external', version: '2.1.325' })
  put('error-rate-limit', {
    synthetic: true,
    beats: [...head(s), { wait: 'input', transcript: R(s, 9, 34) }, ...workBeats(s).slice(0, 2),
      { screen: { ref: `${s}/10-idle`, set: { 20: '⎿  API Error: Rate limit reached' } }, working: false, transcript: [err, err2] }],
  })
}

put('deny-and-redirect', { recorded: true, beats: [...head('bash-deny'), ...bashDeny('d1', true), ...bashDeny('d2', true), ...turn('read-search', 'dr')] })

put('interrupt-then-queue', { recorded: true, beats: [...head('interrupt'), ...interruptBeats('i1'), ...turn('read-search', 'q1')] })

{
  const t = turn('read-search', 'cm')
  const i = t.findIndex((b) => b.working && !b.transcript)
  t[i < 0 ? 1 : i].transcript = [...(t[i < 0 ? 1 : i].transcript || []), ...R('compact', 66, 71, { fresh: 'c1' })]
  put('compact-mid-run', { recorded: true, beats: [...head('read-search'), ...t, ...turn('bash-allow', 'cm2')] })
}

put('resume-existing', {
  recorded: true,
  beats: [...head('bash-allow'), ...turn('bash-allow', null)],
  resume: [{ screen: 'resume/11-ready' }, { wait: 600, screen: 'resume/12-resumed' }, ...turn('read-search', 'r1')],
})

for (const [n, o] of Object.entries(out)) fs.writeFileSync(path.join(OUT, n + '.json'), JSON.stringify(o, null, 1) + '\n')
console.log(`wrote ${Object.keys(out).length} scenarios`)
