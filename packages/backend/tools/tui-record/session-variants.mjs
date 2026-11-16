// Records session-level Claude Code TUI states (haiku only, own tmux socket, one session per scenario).
// Usage: VS_ROOT=<pre-trusted dir> node session-variants.mjs <scenario>... ; never answers a trust dialog.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createScrubber } from './scrub.mjs';

const OUT = fileURLToPath(new URL('../../test/fixtures/tui-real/claude/variants/session/', import.meta.url));
const ROOT = process.env.VS_ROOT;
const sock = `sfx-vs-${process.pid}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tm = (...a) => spawnSync('tmux', ['-L', sock, '-f', '/dev/null', ...a], { encoding: 'utf8' });
const FILES = { 'greet.js': "// greeting helper\nfunction greet(name) {\n  return 'Helo, ' + name;\n}\nmodule.exports = { greet };\n", 'util.js': 'exports.add = (a, b) => a + b;\n', 'README.txt': 'tiny demo project\n', 'apple.txt': 'apple\n', 'avocado.js': 'module.exports = 1;\n', 'alpha.md': '# alpha\n', 'banana.txt': 'banana\n' };
const SETTINGS = { permissions: { allow: ['Bash(sleep:*)', 'Bash(echo:*)', 'Bash(ls:*)', 'Bash(seq:*)', 'Read', 'Glob', 'Grep'] } };
const SPIN = /^\s*[·✢✳✶✻✽*●]\s+\p{L}[\p{L}' -]*…/mu;
const isBusy = (t) => SPIN.test(t) || /esc to interrupt/i.test(t);
const isDialog = (t) => /Esc to cancel|Do you want|Would you like|Enter to (select|confirm)/i.test(t) && /^\s*(❯\s*)?\d+\.\s/m.test(t);
const isIdle = (t) => !/trust this folder/.test(t) && !isDialog(t) && !isBusy(t) && /^\s*❯/m.test(t) && /─{10}/.test(t);

let sc = null, cwd = null, scen = '', sessionId = null, projDir = null, n = 0;
const log = [];
const grab = () => (tm('capture-pane', '-p', '-t', 'v').stdout ?? '').replace(/[ \t]+$/gm, '');
const norm = (t) => t.split('\n').filter((l) => l.trim()).slice(-14).join('\n').replace(/\d+/g, '#').replace(/\s+/g, ' ');

function setup(dirName, { settings = SETTINGS, extra = {} } = {}) {
  cwd = path.join(ROOT, dirName); fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  for (const [f, c] of Object.entries(FILES)) fs.writeFileSync(path.join(cwd, f), c);
  fs.writeFileSync(path.join(cwd, '.claude', 'settings.json'), JSON.stringify(settings, null, 1));
  for (const [f, c] of Object.entries(extra)) { fs.mkdirSync(path.dirname(path.join(cwd, f)), { recursive: true }); fs.writeFileSync(path.join(cwd, f), c, { mode: 0o755 }); }
  const real = fs.realpathSync(cwd);
  sc = createScrubber({ cwd: real });
  projDir = path.join(os.homedir(), '.claude', 'projects', real.replace(/[^a-zA-Z0-9]/g, '-'));
}
function launch({ cols = 120, rows = 40, args = [], resume = null } = {}) {
  sessionId = resume ?? crypto.randomUUID();
  const a = ['--model', 'haiku', '--setting-sources', 'project,local', ...(resume ? ['--resume', resume] : ['--session-id', sessionId]), ...args];
  const r = tm('new-session', '-d', '-s', 'v', '-x', String(cols), '-y', String(rows), '-c', cwd, 'claude', ...a);
  if (r.status) throw new Error('tmux: ' + r.stderr);
}
function snap(moment, how = '') {
  const f = `${scen}--${String(++n).padStart(2, '0')}-${moment}.txt`;
  // home paths -> ~, as the task asks; scrub.mjs maps to /Users/USER first
  const txt = sc.screen(grab()).replace(/\/Users\/USER/g, '~').replace(/\n+$/, '');
  fs.writeFileSync(path.join(OUT, f), txt + '\n'); log.push({ file: f, scenario: scen, how });
  return txt;
}
async function ready(ms = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = grab();
    if (/trust this folder|Quick safety check/.test(t)) { snap('trust-dialog', 'UNANSWERED'); throw new Error('trust dialog shown: not answering'); }
    if (isDialog(t)) { snap('startup-dialog', 'UNANSWERED'); throw new Error('startup dialog shown: not answering'); }
    if (isIdle(t)) return t; await sleep(400);
  }
  snap('not-ready', 'timeout'); throw new Error('not ready');
}
const key = (...k) => tm('send-keys', '-t', 'v', ...k);
const type = (s) => tm('send-keys', '-t', 'v', '-l', s);
const enter = () => key('Enter');
const say = async (s) => { type(s); await sleep(300); enter(); };
async function untilIdle(ms = 120000, onBusy) {
  const t0 = Date.now(); let seen = false, idle = 0, last = '';
  while (Date.now() - t0 < ms) {
    await sleep(500); const t = grab();
    if (isDialog(t)) { snap('dialog-unexpected', 'unexpected'); throw new Error('unexpected dialog'); }
    if (isBusy(t)) { seen = true; idle = 0; const k = norm(t); if (k !== last) { last = k; onBusy?.(t); } continue; }
    if (isIdle(t) && (seen || Date.now() - t0 > 8000)) { if (++idle >= 3) return t; } else idle = 0;
  }
  throw new Error('untilIdle timeout');
}
function sampler(label, max = 6) { const seen = new Set(); let k = 0; return (t) => { const s = norm(t); if (seen.has(s) || k >= max) return; seen.add(s); k++; snap(`${label}${k}`, 'working sample'); }; }
const turn = async (text, label = 'working', max = 6) => { await say(text); return untilIdle(120000, sampler(label, max)); };
async function waitFor(re, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const t = grab(); if (re.test(t)) return t; await sleep(300); } throw new Error('waitFor ' + re); }
async function stop() {
  try { const f = path.join(projDir ?? '', `${sessionId}.jsonl`); if (projDir && fs.existsSync(f)) { fs.mkdirSync(path.join(OUT, 'transcripts'), { recursive: true }); fs.writeFileSync(path.join(OUT, 'transcripts', `${scen}.jsonl`), sc.jsonl(fs.readFileSync(f, 'utf8'))); } } catch (e) { console.log('transcript copy failed', e.message); }
  tm('kill-server');
}
const H = { snap, key, type, enter, say, untilIdle, sampler, turn, waitFor, sleep, grab, tm, setup, launch, ready, get cwd() { return cwd; }, get sessionId() { return sessionId; }, paste: (s) => { tm('set-buffer', '-b', 'vsb', s); tm('paste-buffer', '-p', '-b', 'vsb', '-t', 'v'); } };

fs.mkdirSync(OUT, { recursive: true });
const mod = await import('./session-variants-scenarios.mjs');
for (const name of process.argv.slice(2)) {
  scen = name; n = 0; const fn = mod.SC[name]; if (!fn) { console.log('no scenario', name); continue; }
  console.log('scenario', name);
  try { await fn(H); console.log(' ok'); } catch (e) { console.log(' failed:', e.message); try { snap('failure', e.message.slice(0, 40)); } catch {} }
  finally { await stop(); }
  if (log.length) fs.appendFileSync(path.join(OUT, 'captures.log.jsonl'), log.splice(0).map((x) => JSON.stringify(x)).join('\n') + '\n');
}
