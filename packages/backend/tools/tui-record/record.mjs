// Drives the real `claude` CLI (haiku, one session at a time) through scripted scenarios and saves scrubbed screens + transcripts.
// Usage: node record.mjs [scenario-name ...]   Own tmux socket only; never touches the owner's.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSessions } from '../../src/sessions/index.mjs';
import { createExec } from '../../src/runner/index.mjs';
import { createScrubber } from './scrub.mjs';

const OUT = fileURLToPath(new URL('../../test/fixtures/tui-real/claude/', import.meta.url));
const sock = `sfx-rec-${process.pid}`;
const T0 = Date.now(); const MAX_RUN = 45 * 60e3; const MAX_SESS = 25; const MAX_SCEN = 180e3;
const S = createSessions({ exec: createExec(), clock: { now: Date.now }, socketName: sock });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DOWN = Uint8Array.from([0x1b, 0x5b, 0x42]), UP = Uint8Array.from([0x1b, 0x5b, 0x41]), ENTER = Uint8Array.from([0x0d]), ESC = Uint8Array.from([0x1b]), BTAB = Uint8Array.from([0x1b, 0x5b, 0x5a]), CTRLU = Uint8Array.from([0x15]);
let sessions = 0;

const opts = (t) => { const rows = []; for (const l of t.split('\n')) { const m = /^\s*(❯)?\s*(\d+)\.\s+(\S.*)$/.exec(l); if (m) { if (+m[2] === 1) rows.length = 0; rows.push({ label: m[3].trim(), marked: !!m[1] }); } } return rows; };
const isDialog = (t) => { const o = opts(t); return o.length >= 2 && (/Esc to cancel|Do you want|Would you like|Enter to (select|confirm)/i.test(t) || o.some((r) => r.marked)); };
const SPIN = /^\s*[·✢✳✶✻✽*●]\s+\p{L}[\p{L}' -]*…/mu;
const isBusy = (t) => SPIN.test(t) || /esc to interrupt/i.test(t);
const isIdle = (t) => !/trust this folder/.test(t) && !isDialog(t) && !isBusy(t) && /^\s*❯/m.test(t) && /─{10}/.test(t);
const files = { 'greet.js': "// greeting helper\nfunction greet(name) {\n  return 'Helo, ' + name;\n}\nmodule.exports = { greet };\n", 'util.js': 'exports.add = (a, b) => a + b;\n', 'README.txt': 'tiny demo project\n', 'build/out.txt': 'old build output\n' };

const SCEN = [
  ['bash-allow', async (r) => { await r.turn('Run the shell command ls and show me its output.'); }],
  ['bash-deny', async (r) => { await r.turn('Run exactly: rm -rf build', [/^No/]); await r.turn('ok, never mind. Say done.'); }],
  ['bash-fail', async (r) => { await r.turn('Run exactly: node missing.js'); }],
  ['edit', async (r) => { await r.turn("Fix the typo in greet.js: 'Helo' should be 'Hello'. Use the Edit tool."); }],
  ['write', async (r) => { await r.turn('Create notes.txt containing the single line: remember milk. Use the Write tool.'); }],
  ['read-search', async (r) => { await r.turn('Find where the function greet is defined in this project. Use Grep, then Read the file.'); }],
  ['todo', async (r) => { await r.turn('Use the todo list tool to plan three steps: read greet.js, count its lines, report the count. Then do them.'); }],
  ['subagent', async (r) => { await r.turn('Use the Task tool to launch a subagent that counts the files in this directory and reports the number. Wait for it.'); }],
  ['plan-mode', async (r) => { await r.turn('Plan a tiny change: add one comment line at the top of util.js.'); }, { mode: 'plan' }],
  ['ask-question', async (r) => { await r.turn('Use the AskUserQuestion tool to ask me which color I prefer, red or blue. Then reply with my choice.', [/./]); }],
  ['interrupt', async (r) => {
    await r.send('Run this bash command exactly: for i in $(seq 1 30); do echo $i; sleep 1; done');
    await r.untilDialog(); await r.snap('dialog'); await r.choose(/^Yes/);
    await r.sleepSampling(4000); await r.bytes('esc', ESC); await sleep(1500); await r.snap('after-esc'); await r.untilIdle();
  }],
  ['queued', async (r) => {
    await r.send('Run the bash command: sleep 8 && echo first');
    await r.untilDialog(); await r.snap('dialog'); await r.choose(/^Yes/); await sleep(2000);
    await r.send('Then also say the word banana.'); await sleep(1000); await r.snap('queued'); await r.untilIdle();
  }],
  ['compact', async (r) => { await r.turn('Say hi.'); await r.turn('Say bye.'); await r.turn('/compact'); }],
  ['model-switch', async (r) => {
    await r.send('/model', { noWait: true }); await sleep(1500); await r.snap('model-picker');
    try { await r.choose(/haiku/i); await sleep(1500); await r.snap('after-model'); } catch (e) { r.note(String(e.message)); await r.bytes('esc', ESC); await sleep(500); }
    await r.send('/help', { noWait: true }); await sleep(1500); await r.snap('help'); await r.bytes('esc', ESC); await sleep(800);
    await r.bytes('slash', new TextEncoder().encode('/')); await sleep(1000); await r.snap('slash-menu'); await r.bytes('ctrl-u', CTRLU); await sleep(500); await r.snap('cleared');
  }],
  ['mode-cycle', async (r) => { await r.snap('start'); for (let i = 1; i <= 5; i++) { await r.bytes('shift-tab', BTAB); await sleep(700); await r.snap(`mode-${i}`); } }],
  ['web', async (r) => { await r.turn('Fetch https://example.com with WebFetch and tell me the page title.'); }],
  ['background', async (r) => {
    await r.turn('Run `sleep 20` in the background (bash run_in_background), then immediately run echo hi.');
    await r.send('/tasks', { noWait: true }); await sleep(1500); await r.snap('tasks-view'); await r.bytes('esc', ESC); await sleep(500);
  }],
  ['at-mention', async (r) => {
    await r.send('@gre', { enter: false, noWait: true }); await sleep(1500); await r.snap('at-picker'); await r.bytes('ctrl-u', CTRLU); await sleep(500); await r.snap('cleared');
  }],
  ['resume', async (r) => { await r.turn('Say ok.'); await r.stop(); await r.start(true); await sleep(1500); await r.snap('resumed'); }],
  ['status-idle', async (r) => {
    await r.snap('idle');
    for (const c of ['/status', '/cost', '/usage']) { await r.send(c, { noWait: true }); await sleep(1500); await r.snap(c.slice(1)); await r.bytes('esc', ESC); await sleep(800); }
  }],
];

async function run(name, fn, o = {}) {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sfxrec-')));
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(cwd, f)), { recursive: true }); fs.writeFileSync(path.join(cwd, f), c); }
  const sc = createScrubber({ cwd });
  const dir = path.join(OUT, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'screens'), { recursive: true });
  const sessionId = crypto.randomUUID(); const projDir = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  const t0 = Date.now(); const steps = []; const notes = []; let n = 0; let cur = null; let unsub = null; let wake = null; let status = 'ok'; let error = null;
  const step = (type, d = {}) => steps.push({ t: Date.now() - t0, type, ...d });
  const check = () => { if (Date.now() - t0 > MAX_SCEN) throw new Error('scenario over 3 min'); if (Date.now() - T0 > MAX_RUN) throw new Error('run over 45 min'); };
  const tick = () => new Promise((res) => { const t = setTimeout(done, 500); function done() { clearTimeout(t); wake = null; setTimeout(res, 120); } wake = done; });
  const scr = () => S.screen(cur.id);
  const snap = async (label, s) => { s ??= await scr(); const f = `${String(++n).padStart(2, '0')}-${label.replace(/[^\w-]/g, '')}`; fs.writeFileSync(path.join(dir, 'screens', `${f}.txt`), sc.screen(s.text)); fs.writeFileSync(path.join(dir, 'screens', `${f}.ansi`), sc.ansi(s.ansi)); step('snap', { file: f }); return s.text; };
  const shapes = new Set();
  const sample = async (s) => { if (shapes.size >= 5) return; const k = s.text.split('\n').filter((l) => l.trim()).slice(-14).join('\n').replace(/\d+/g, '#').replace(/\s+/g, ' '); if (!shapes.has(k)) { shapes.add(k); await snap('working', s); } };
  const bytes = async (label, b) => { await S.sendBytes(cur.id, b); step('bytes', { label }); };
  const start = async (resume = false) => {
    if (++sessions > MAX_SESS) throw new Error('session cap 25');
    cur = await S.start({ agent: 'claude', cwd, args: ['--model', 'haiku', '--permission-mode', o.mode ?? 'manual'], sessionId, resume });
    unsub = await S.stream(cur.id, () => wake?.()); step('start', { resume, mode: o.mode ?? 'manual' });
    for (;;) {
      check(); const s = await scr();
      if (/trust this folder/.test(s.text)) {
        await snap('trust', s);
        const mk = s.text.split('\n').find((l) => /^\s*❯/.test(l)) ?? '';
        if (/Yes/.test(mk)) { await bytes('enter', ENTER); step('answer', { label: 'Yes, I trust this folder' }); await sleep(2000); } else await bytes('down', DOWN);
      } else if (isIdle(s.text)) return snap('ready', s);
      await tick();
    }
  };
  const stop = async () => { try { await unsub?.(); } catch {} unsub = null; if (cur) { try { await S.stop(cur.id); } catch {} cur = null; } };
  const choose = async (re) => {
    for (let i = 0; i < 12; i++) {
      const rows = opts((await scr()).text); const to = rows.findIndex((r) => re.test(r.label)); const at = rows.findIndex((r) => r.marked);
      if (to < 0 || at < 0) throw new Error(`option ${re} not found among: ${rows.map((r) => r.label).join(' | ')}`);
      if (at === to) { await bytes('enter', ENTER); step('answer', { label: rows[to].label, options: rows.map((r) => r.label) }); return rows[to].label; }
      await bytes(at < to ? 'down' : 'up', at < to ? DOWN : UP); await sleep(200);
    }
    throw new Error(`could not reach option ${re}`);
  };
  const send = async (text, { enter = true, noWait = false } = {}) => { await S.send(cur.id, text, { enter }); step('send', { text, enter }); };
  const untilDialog = async () => { for (;;) { check(); await tick(); const s = await scr(); if (isDialog(s.text)) return; if (isBusy(s.text)) await sample(s); } };
  const untilIdle = async (seenBusy = false) => {
    let idle = 0; const t1 = Date.now();
    for (;;) {
      check(); await tick(); const s = await scr();
      if (isDialog(s.text)) { await snap('dialog', s); await choose(/^Yes/); await sleep(1500); idle = 0; continue; }
      if (isBusy(s.text)) { seenBusy = true; idle = 0; await sample(s); continue; }
      if (isIdle(s.text) && (seenBusy || Date.now() - t1 > 8000)) { if (++idle >= 3) return snap('idle', s); } else idle = 0;
    }
  };
  const turn = async (text, answers = []) => {
    await send(text); let seenBusy = false; let idle = 0; const t1 = Date.now();
    for (;;) {
      check(); await tick(); const s = await scr();
      if (isDialog(s.text)) { await snap('dialog', s); await choose(answers.shift() ?? /^Yes/); await sleep(1500); seenBusy = true; idle = 0; continue; }
      if (isBusy(s.text)) { seenBusy = true; idle = 0; await sample(s); continue; }
      if (isIdle(s.text) && (seenBusy || Date.now() - t1 > 8000)) { if (++idle >= 3) return snap('idle', s); } else idle = 0;
    }
  };
  const sleepSampling = async (ms) => { const e = Date.now() + ms; while (Date.now() < e) { await tick(); const s = await scr(); if (isBusy(s.text)) await sample(s); } };
  const r = { send, turn, choose, snap, bytes, untilDialog, untilIdle, sleepSampling, stop, start, note: (m) => { notes.push(m); step('note', { m }); } };
  try { await start(); await fn(r); } catch (e) { status = 'failed'; error = String(e.message); try { if (cur) await snap('failure'); } catch {} }
  finally {
    await sleep(1000); await stop();
    try {
      const copy = (from, to) => fs.writeFileSync(to, from.endsWith('.jsonl') ? sc.jsonl(fs.readFileSync(from, 'utf8')) : sc.text(fs.readFileSync(from, 'utf8')));
      const main = path.join(projDir, `${sessionId}.jsonl`);
      if (fs.existsSync(main)) copy(main, path.join(dir, 'transcript.jsonl')); else notes.push('no transcript written');
      const found = [];
      const walk = (d) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p !== main) found.push(p); } };
      walk(projDir);
      for (const p of found) { fs.mkdirSync(path.join(dir, 'subagents'), { recursive: true }); copy(p, path.join(dir, 'subagents', path.basename(p))); }
      steps.push({ t: Date.now() - t0, type: 'subagent-files', paths: found.map((p) => sc.text(path.relative(path.dirname(projDir), p))) });
    } catch (e) { notes.push(`collect failed: ${e.message}`); }
    fs.writeFileSync(path.join(dir, 'steps.json'), JSON.stringify({ scenario: name, status, error, notes, durationMs: Date.now() - t0, steps }, null, 1));
    if (path.basename(projDir).includes('sfxrec')) fs.rmSync(projDir, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  }
  return { name, status, error, notes };
}

const only = process.argv.slice(2); const index = [];
try {
  for (const [name, fn, o] of SCEN) {
    if (only.length && !only.includes(name)) continue;
    if (Date.now() - T0 > MAX_RUN || sessions >= MAX_SESS) { index.push({ name, status: 'skipped', error: 'run cap reached' }); continue; }
    console.log('scenario', name); const res = await run(name, fn, o ?? {}); console.log(' ->', res.status, res.error ?? ''); index.push(res);
  }
} finally {
  await S.close(); spawnSync('tmux', ['-L', sock, 'kill-server']);
  if (!only.length) fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ sessions, index }, null, 1));
}
