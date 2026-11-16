// Records the real `claude` TUI (haiku only) for every tool-call state into test/fixtures/tui-real/claude/variants/tools/.
// Usage: node variants-tools.mjs <session-name>   One session per run, own tmux socket, one fixed throwaway scratch folder.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto'; import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSessions } from '../../src/sessions/index.mjs';
import { createExec } from '../../src/runner/index.mjs';
import { createScrubber } from './scrub.mjs';

const OUT = fileURLToPath(new URL('../../test/fixtures/tui-real/claude/variants/tools/', import.meta.url));
const SCRATCH = '/private/tmp/sfxvt-scratch';
const sock = `sfx-vt-${process.pid}`;
const S = createSessions({ exec: createExec(), clock: { now: Date.now }, socketName: sock });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const K = { down: [0x1b, 0x5b, 0x42], up: [0x1b, 0x5b, 0x41], enter: [0x0d], esc: [0x1b], ctrlo: [0x0f], tab: [0x09] };
const kb = (n) => Uint8Array.from(K[n]);

const opts = (t) => { const rows = []; for (const l of t.split('\n')) { const m = /^\s*(❯)?\s*(\d+)\.\s+(\S.*)$/.exec(l); if (m) { if (+m[2] === 1) rows.length = 0; rows.push({ label: m[3].trim(), marked: !!m[1] }); } } return rows; };
const isDialog = (t) => { const o = opts(t); return o.length >= 2 && (/Esc to cancel|Do you want|Would you like|Enter to (select|confirm)/i.test(t) || o.some((r) => r.marked)); };
const isBusy = (t) => /^\s*[·✢✳✶✻✽*●]\s+\p{L}[\p{L}' -]*…/mu.test(t) || /esc to interrupt/i.test(t);
const isIdle = (t) => !/trust this folder/.test(t) && !isDialog(t) && !isBusy(t) && /^\s*❯/m.test(t) && /─{10}/.test(t);

function png() { // 48x48 solid red-ish PNG
  const w = 48, h = 48; const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 200; raw[o + 1] = x * 4; raw[o + 2] = y * 4; }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ihdr), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]);
}
const big = Array.from({ length: 140 }, (_, i) => `line ${i + 1}: lorem ipsum dolor sit amet`).join('\n') + '\n';
const nb = { cells: [{ cell_type: 'code', id: 'c1', metadata: {}, execution_count: null, outputs: [], source: ['x = 1\n', 'print(x)'] }, { cell_type: 'markdown', id: 'c2', metadata: {}, source: ['# Title'] }], metadata: { kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' } }, nbformat: 4, nbformat_minor: 5 };
const files = {
  'greet.js': "// greeting helper\nfunction greet(name) {\n  return 'Helo, ' + name;\n}\nmodule.exports = { greet };\n", 'util.js': 'exports.add = (a, b) => a + b;\n', 'README.txt': 'tiny demo project\n',
  'build/out.txt': 'old build output\n', 'big.txt': big, 'list.txt': 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n', 'a.txt': 'alpha\n', 'b.txt': 'beta\n', 'demo.ipynb': JSON.stringify(nb, null, 1),
  '.claude/skills/hello/SKILL.md': '---\nname: hello\ndescription: Says hello. Use when asked to run the hello skill.\n---\nReply with the single word: hello.\n',
};

const meta = fs.existsSync(path.join(OUT, '_meta.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, '_meta.json'), 'utf8')) : {};
fs.mkdirSync(path.join(OUT, 'transcripts'), { recursive: true });
let sessions = 0;

async function run(name, fn, { mode = 'default', rows = 45 } = {}) {
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(SCRATCH, f)), { recursive: true }); fs.writeFileSync(path.join(SCRATCH, f), c); }
  fs.writeFileSync(path.join(SCRATCH, 'pic.png'), png());
  const cwd = fs.realpathSync(SCRATCH); const sc = createScrubber({ cwd });
  const clean = (s) => sc.screen(s).replace(/\/Users\/USER/g, '~').replace(/user@example\.com/g, 'user').replace(/USER/g, 'user');
  const sessionId = crypto.randomUUID(); const projDir = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  const t0 = Date.now(); let cur = null; const MAX = 240e3; const made = [];
  const scr = () => S.screen(cur.id);
  const bytes = (n) => S.sendBytes(cur.id, kb(n));
  const snap = async (file, how, s) => { s ??= await scr(); fs.writeFileSync(path.join(OUT, `${file}.txt`), clean(s.text)); meta[file] = { how, session: name }; made.push(file); };
  const choose = async (re) => {
    for (let i = 0; i < 14; i++) {
      const rs = opts((await scr()).text); const to = rs.findIndex((r) => re.test(r.label)); const at = rs.findIndex((r) => r.marked);
      if (to < 0 || at < 0) throw new Error(`option ${re} not among: ${rs.map((r) => r.label).join(' | ')}`);
      if (at === to) { await bytes('enter'); return rs[to].label; }
      await bytes(at < to ? 'down' : 'up'); await sleep(200);
    }
    throw new Error('no reach');
  };
  const wait = async ({ run: runs = [], until = 'both' } = {}) => {
    let idle = 0, seen = false; const t1 = Date.now(); const done = new Set();
    for (;;) {
      if (Date.now() - t0 > MAX) throw new Error('session over 4 min');
      await sleep(200); const s = await scr();
      if (isDialog(s.text)) return 'dialog';
      if (isBusy(s.text)) { seen = true; idle = 0; for (const [file, re, how] of runs) if (!done.has(file) && re.test(s.text)) { done.add(file); await snap(file, how, s); } continue; }
      if (isIdle(s.text) && (seen || Date.now() - t1 > 15000)) { if (++idle >= 3) return 'idle'; } else idle = 0;
    }
  };
  const send = async (text, enter = true) => { await S.send(cur.id, text, { enter }); };
  // turn: send prompt, handle each dialog in order (dialogs[i] = {snap, how, pick}); finally snap the idle screen.
  const turn = async (prompt, { run: runs = [], dialogs = [], final, how, expand, expandHow } = {}) => {
    await send(prompt); let i = 0; const picked = [];
    for (;;) {
      const k = await wait({ run: runs }); if (k === 'idle') break;
      const d = dialogs[i++] ?? { pick: /^Yes/ }; const rs = opts((await scr()).text).map((r) => r.label);
      if (d.snap) await snap(d.snap, d.how, undefined); picked.push({ options: rs, picked: d.custom ? await d.custom() : await choose(d.pick) }); await sleep(d.after ?? 1200);
      if (d.then) await d.then();
    }
    for (const f of [].concat(final ?? [])) await snap(f, how);
    if (expand) { await bytes('ctrlo'); await sleep(1200); await snap(expand, expandHow ?? 'Ctrl+O (transcript view) after the turn'); await bytes('ctrlo'); await sleep(800); }
    return picked;
  };
  const r = { type: (t) => send(t, false), send, turn, wait, snap, choose, bytes, sleep, scr, isIdle, isBusy, isDialog, opts, cwd };
  let err = null;
  try {
    if (++sessions > 1) throw new Error('one session per run');
    cur = await S.start({ agent: 'claude', cwd, args: ['--model', 'haiku', '--permission-mode', mode], sessionId, rows });
    for (;;) {
      if (Date.now() - t0 > 60e3) throw new Error('no ready screen in 60s');
      const s = await scr();
      if (/trust this folder/.test(s.text)) {
        if (!s.text.includes('sfxvt-scratch')) throw new Error('trust dialog is not for the scratch folder');
        const mk = s.text.split('\n').find((l) => /^\s*❯/.test(l)) ?? '';
        if (/Yes/.test(mk)) { await bytes('enter'); await sleep(2000); } else await bytes('down');
      } else if (isIdle(s.text)) break;
      await sleep(400);
    }
    await sleep(4000); await fn(r);
  } catch (e) { err = String(e.stack ?? e).split('\n').slice(0, 3).join(' | '); try { await snap(`_failure-${name}`, 'failure screen'); } catch {} }
  finally {
    await sleep(800); try { await S.stop(cur.id); } catch {}
    const main = path.join(projDir, `${sessionId}.jsonl`);
    if (fs.existsSync(main)) fs.writeFileSync(path.join(OUT, 'transcripts', `${name}.jsonl`), sc.jsonl(fs.readFileSync(main, 'utf8')));
    fs.writeFileSync(path.join(OUT, '_meta.json'), JSON.stringify(meta, null, 1));
    fs.rmSync(path.join(projDir, `${sessionId}.jsonl`), { force: true }); fs.rmSync(path.join(projDir, sessionId), { recursive: true, force: true });
    await S.close(); spawnSync('tmux', ['-L', sock, 'kill-server']);
  }
  console.log(name, err ? `FAILED ${err}` : 'ok', 'snaps:', made.join(' '));
}

import { SCEN } from './variants-tools-scen.mjs';
const want = process.argv[2]; const sc = SCEN[want];
if (!sc) { console.log('unknown', want, Object.keys(SCEN).join(' ')); process.exit(1); }
await run(want, sc.fn, sc.opts);
