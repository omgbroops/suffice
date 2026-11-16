// Records how real Claude Code draws subagents: one scenario per run, haiku only, own tmux socket, pre-trusted parent folder (never answers a trust dialog).
// Usage: node record-agents.mjs <scenario> ; scenarios listed in SC below.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSessions } from '../../src/sessions/index.mjs';
import { createExec } from '../../src/runner/index.mjs';
import { createScrubber } from './scrub.mjs';

const OUT = fileURLToPath(new URL('../../test/fixtures/tui-real/claude/variants/agents/', import.meta.url));
const TRUSTED_PARENT = path.join(os.homedir(), 'Downloads'); // already trusted in the owner's setup; trust is inherited by children
const sock = `sfx-va-${process.pid}`;
const S = createSessions({ exec: createExec(), clock: { now: Date.now }, socketName: sock });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const K = { ESC: [0x1b], ENTER: [0x0d], DOWN: [0x1b, 0x5b, 0x42], UP: [0x1b, 0x5b, 0x41], CTRL_O: [0x0f], CTRL_B: [0x02], CTRL_X: [0x18], CTRL_K: [0x0b], CTRL_C: [0x03], CTRL_U: [0x15], CTRL_E: [0x05] };
const opts = (t) => { const rows = []; for (const l of t.split('\n')) { const m = /^\s*(❯)?\s*(\d+)\.\s+(\S.*)$/.exec(l); if (m) { if (+m[2] === 1) rows.length = 0; rows.push({ label: m[3].trim(), marked: !!m[1] }); } } return rows; };
const isDialog = (t) => { const o = opts(t); return o.length >= 2 && (/Esc to cancel|Do you want|Would you like|Enter to (select|confirm)/i.test(t) || o.some((r) => r.marked)); };
const SPIN = /^\s*[·✢✳✶✻✽*●]\s+\p{L}[\p{L}' -]*…/mu;
const isBusy = (t) => SPIN.test(t) || /esc to interrupt/i.test(t);
const isIdle = (t) => !/trust this folder/.test(t) && !isDialog(t) && !isBusy(t) && /^\s*❯/m.test(t) && /─{10}/.test(t);

const long = Array.from({ length: 60 }, (_, i) => `line ${i + 1}: the quick brown fox number ${i + 1}`).join('\n') + '\n';
const files = {
  'a.txt': 'alpha\nbeta\ngamma\ndelta\nepsilon\n', 'b.txt': 'one\ntwo\nthree\n', 'c.txt': 'red\ngreen\nblue\nyellow\n', 'd.txt': 'x\ny\n', 'e.txt': 'north\nsouth\neast\nwest\n',
  'long.txt': long, 'greet.js': "function greet(n){ return 'Hi ' + n; }\nmodule.exports = { greet };\n", 'build/out.txt': 'old build output\n',
  '.claude/agents/counter.md': '---\nname: counter\ndescription: Counts lines in a file and reports the number. Use when asked for a line count.\nmodel: haiku\ntools: Read, Grep\n---\nYou count lines in the file you are given and answer with the number only.\n',
};
const HAIKU = ' Use the haiku model for the agent.';
const P = (s) => s + HAIKU;

// each scenario: [mode, async (r) => ...]
const SC = {
  'fg-tools': ['acceptEdits', async (r) => {
    await r.snap('start', 'session idle before any agent');
    await r.send(P('Use the Agent tool to launch one foreground subagent (general-purpose). It must: Read a.txt, Grep for "beta" in this directory, run `wc -l a.txt` with Bash, then Edit a.txt replacing "alpha" with "ALPHA", then report what it did. Wait for it.'), 'prompt sent');
    await r.watch(40000, 6, 'run', 'screen changed while agent runs', (t) => /Read|Grep|Bash|Edit/.test(t));
    await r.key('ctrl-o', K.CTRL_O, 'Ctrl+O mid-run (expand transcript view)'); await r.snap('expanded', 'after Ctrl+O');
    await r.key('ctrl-o', K.CTRL_O, 'Ctrl+O again (collapse)'); await r.snap('collapsed', 'after second Ctrl+O');
    await r.untilIdle(90000, 'run');
    await r.snap('end', 'turn finished, idle');
    await r.key('ctrl-o', K.CTRL_O, 'Ctrl+O after end'); await r.snap('end-expanded', 'after Ctrl+O at end'); await r.key('ctrl-o', K.CTRL_O, 'Ctrl+O back'); await r.snap('end-collapsed', 'after Ctrl+O back');
  }],
  ...Object.fromEntries([2, 3, 5].map((n) => [`par${n}`, ['acceptEdits', async (r) => {
    await r.snap('start', 'session idle');
    await r.send(P(`Launch exactly ${n} subagents IN PARALLEL (${n} Agent tool calls in a single message), each general-purpose. Subagent k (k=1..${n}) must Read a.txt, then b.txt, then c.txt, then d.txt, then e.txt one at a time, and report the total number of lines it saw. Wait for all.`), 'prompt sent');
    await r.watch(60000, 8, 'run', 'screen changed while agents run');
    await r.untilIdle(120000, 'run'); await r.snap('end', 'turn finished, idle');
    await r.key('ctrl-o', K.CTRL_O, 'Ctrl+O at end'); await r.snap('end-expanded', 'after Ctrl+O'); await r.key('ctrl-o', K.CTRL_O, 'back'); await r.snap('end-collapsed', 'collapsed again');
  }]])),
  'bg-complete': ['acceptEdits', async (r) => {
    await r.snap('start', 'session idle');
    await r.send(P('Launch ONE background subagent (Agent tool with run_in_background true, general-purpose) that Reads a.txt, b.txt, c.txt, d.txt, e.txt one at a time and reports the total line count. Do not wait for it; reply "launched" right away.'), 'prompt sent');
    await r.watch(25000, 6, 'launch', 'screen changed after launch');
    await r.send('/tasks', 'type /tasks while background agent may run', { noWait: true }); await sleep(1500); await r.snap('tasks-view', '/tasks'); await r.key('esc', K.ESC, 'Esc closes /tasks'); await sleep(600);
    await r.send('/agents', 'type /agents', { noWait: true }); await sleep(1500); await r.snap('agents-view', '/agents'); await r.key('right', [0x1b, 0x5b, 0x43], 'Right arrow: next tab in /agents'); await sleep(700); await r.snap('agents-tab2', '/agents after Right'); await r.key('esc', K.ESC, 'Esc'); await sleep(600);
    await r.watch(90000, 8, 'wait', 'idle wait for completion notice');
    await r.snap('end', 'after wait');
    await r.send(P('Now launch one foreground subagent (general-purpose) that Reads long.txt and reports its line count.'), 'second turn: foreground agent to Ctrl+B');
    await sleep(6000); await r.snap('before-ctrl-b', 'foreground agent running'); await r.key('ctrl-b', K.CTRL_B, 'Ctrl+B backgrounds the running agent'); await sleep(1500); await r.snap('after-ctrl-b', 'after Ctrl+B'); await r.key('ctrl-b', K.CTRL_B, 'second Ctrl+B'); await sleep(1000); await r.snap('after-ctrl-b-2', 'after second Ctrl+B');
    await r.watch(60000, 6, 'wait2', 'wait for second completion');
  }],
  'bg-views': ['acceptEdits', async (r) => {
    await r.snap('start', 'session idle');
    await r.send(P('Launch ONE background subagent (Agent tool with run_in_background true, general-purpose) that uses only the Read tool, one call at a time, on a.txt, b.txt, c.txt, d.txt, e.txt, long.txt, then again a.txt, b.txt, c.txt, d.txt, e.txt, long.txt, and reports the total line count. Do not wait for it; reply "launched" right away.'), 'long-lived background agent');
    await r.waitFor(/launched|background|Agent/, 30000); await sleep(1500); await r.snap('launched', 'after launch');
    await r.send('/agents', 'type /agents', { noWait: true }); await sleep(1200); await r.key('enter', [0x0d], 'Enter to run /agents'); await sleep(1500); await r.snap('agents-view', '/agents'); await r.key('right', [0x1b, 0x5b, 0x43], 'Right arrow'); await sleep(700); await r.snap('agents-tab2', '/agents after Right'); await r.key('esc', K.ESC, 'Esc closes /agents'); await sleep(600);
    await r.send('/tasks', 'type /tasks', { noWait: true }); await sleep(1200); await r.key('enter', [0x0d], 'Enter to run /tasks'); await sleep(1500); await r.snap('tasks-view', '/tasks'); await r.key('enter', [0x0d], 'Enter opens selected task'); await sleep(1000); await r.snap('tasks-detail', 'task detail'); await r.key('esc', K.ESC, 'Esc'); await sleep(600); await r.key('esc', K.ESC, 'Esc'); await sleep(600);
    await r.watch(60000, 6, 'wait', 'wait for completion notice');
    await r.snap('end', 'after wait');
  }],
  'esc-kill': ['acceptEdits', async (r) => {
    await r.snap('start', 'session idle');
    await r.send(P('Launch one foreground subagent (general-purpose) that Reads a.txt, b.txt, c.txt, d.txt, e.txt, long.txt one at a time and reports the total line count.'), 'prompt sent');
    await r.waitFor(/Agent|agent/, 30000); await sleep(2500); await r.snap('before-esc', 'foreground agent running');
    await r.key('esc', K.ESC, 'Esc while agent runs'); await sleep(1200); await r.snap('after-esc', 'right after Esc'); await sleep(2500); await r.snap('after-esc-2', 'later');
    await r.send(P('Launch two background subagents (run_in_background true, general-purpose), each Reading long.txt then a.txt then b.txt, one at a time. Reply "launched" right away.'), 'second turn: two background agents');
    await r.watch(20000, 4, 'bg', 'after launch');
    await r.key('ctrl-x', K.CTRL_X, 'Ctrl+X (first key of the stop-background chord)'); await sleep(900); await r.snap('ctrl-x', 'after Ctrl+X');
    await r.key('ctrl-k', K.CTRL_K, 'Ctrl+K (second key)'); await sleep(1200); await r.snap('ctrl-x-ctrl-k', 'after Ctrl+X Ctrl+K');
    await r.key('ctrl-x', K.CTRL_X, 'Ctrl+X again to confirm'); await sleep(500); await r.key('ctrl-k', K.CTRL_K, 'Ctrl+K again'); await sleep(1500); await r.snap('ctrl-x-ctrl-k-2', 'after second chord');
    await r.watch(15000, 4, 'after', 'after stop');
  }],
  'fail': ['acceptEdits', async (r) => {
    await r.snap('start', 'session idle');
    await r.send(P('Launch one foreground subagent (general-purpose) that Reads the file missing-file.txt and reports exactly what happened. Wait for it.'), 'agent whose tool call fails');
    await r.watch(40000, 5, 'run', 'running'); await r.untilIdle(60000, 'run'); await r.snap('end', 'turn finished');
    await r.send('Now launch a subagent with subagent_type "does-not-exist" to count lines in a.txt.', 'unknown agent type');
    await r.watch(40000, 5, 'bad', 'running'); await r.untilIdle(60000, 'bad'); await r.snap('end-bad-type', 'turn finished');
  }],
  'perm': ['manual', async (r) => {
    await r.snap('start', 'session idle');
    await r.send(P('Launch one foreground subagent (general-purpose) that runs the bash command `touch made.txt` and reports done. Wait for it.'), 'agent needing Bash permission');
    await r.waitDialog(60000); await r.snap('prompt-approve', 'permission prompt raised inside subagent'); await r.choose(/^Yes/, 'approve'); await sleep(1500); await r.snap('after-approve', 'after approving');
    await r.untilIdle(60000, 'a'); await r.snap('end-approve', 'turn finished');
    await r.send(P('Launch one foreground subagent (general-purpose) that runs the bash command `rm -rf build` and reports. Wait for it.'), 'second agent, will be denied');
    await r.waitDialog(60000); await r.snap('prompt-deny', 'permission prompt raised inside subagent'); await r.choose(/^No/, 'deny'); await sleep(2500); await r.snap('after-deny', 'after denying');
    await r.watch(30000, 4, 'd', 'after deny'); await r.untilIdle(60000, 'd'); await r.snap('end-deny', 'turn finished');
  }],
  'types': ['acceptEdits', async (r) => {
    await r.snap('start', 'session idle');
    for (const [k, txt] of [['general', 'general-purpose'], ['explore', 'Explore'], ['plan', 'Plan'], ['custom', 'counter']]) {
      await r.send(P(`Launch one foreground subagent of type ${txt} (subagent_type "${txt}") to count the lines in a.txt and report the number. The agent must use only the Read tool, no Bash. Wait for it.`), `agent type ${txt}`);
      await r.watch(40000, 4, k, `running ${txt}`); await r.untilIdle(60000, k); await r.snap(`${k}-end`, `${txt} turn finished`);
    }
  }],
  'nested': ['acceptEdits', async (r) => {
    await r.snap('start', 'session idle');
    await r.send(P('Launch one general-purpose subagent whose job is to itself launch another subagent (Agent tool) that counts lines in a.txt. The inner agent must also use haiku. Report what happened, including if the inner launch is not possible.'), 'subagent asked to spawn a subagent');
    await r.watch(60000, 6, 'run', 'running'); await r.untilIdle(90000, 'run'); await r.snap('end', 'turn finished');
  }],
  'question': ['acceptEdits', async (r) => {
    await r.snap('start', 'session idle');
    await r.send(P('Launch one general-purpose subagent whose job is to use the AskUserQuestion tool to ask me which colour I prefer (red or blue) and relay my answer. Report what happened.'), 'subagent asked to ask a question');
    await r.watch(40000, 6, 'run', 'running', null, true); await r.untilIdle(60000, 'run'); await r.snap('end', 'turn finished');
  }],
  'long-resume': ['acceptEdits', async (r) => {
    await r.snap('start', 'session idle');
    await r.send(P('Launch one foreground subagent (general-purpose) that uses only the Read tool (no Bash, no find) on long.txt in the current directory and returns the first 40 lines verbatim, with no commentary. Then show me its full result.'), 'long result');
    await r.watch(40000, 5, 'run', 'running'); await r.untilIdle(90000, 'run'); await r.snap('end', 'turn finished');
    await r.send(P('Continue that same finished subagent with a follow-up message (SendMessage to it, or resume it) asking: how many lines does long.txt have in total? Show its answer.'), 'follow-up to finished agent');
    await r.watch(40000, 5, 'fu', 'running follow-up'); await r.untilIdle(90000, 'fu'); await r.snap('end-followup', 'follow-up finished');
  }],
};

async function run(name) {
  const [mode, fn] = SC[name];
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(TRUSTED_PARENT), 'sfx-va-')));
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(cwd, f)), { recursive: true }); fs.writeFileSync(path.join(cwd, f), c); }
  const sc = createScrubber({ cwd }); const fix = (s) => sc.text(s).replace(/\/Users\/USER/g, '~');
  const dir = OUT; fs.mkdirSync(path.join(dir, 'transcripts'), { recursive: true });
  const sessionId = crypto.randomUUID(); const projDir = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  const t0 = Date.now(); const caps = []; let n = 0; let cur = null; let status = 'ok'; let error = null; const log = [];
  const scr = () => S.screen(cur.id);
  const snap = async (label, trigger, s) => {
    s ??= await scr(); const moment = `${String(++n).padStart(2, '0')}-${label.replace(/[^\w-]/g, '')}`;
    const text = sc.screen(s.text).replace(/\/Users\/USER/g, '~').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n');
    fs.writeFileSync(path.join(dir, `${name}--${moment}.txt`), text); caps.push({ file: `${name}--${moment}.txt`, scenario: name, moment, trigger, tMs: Date.now() - t0 }); return s.text;
  };
  const norm = (t) => t.split('\n').filter((l) => !SPIN.test(l)).join('\n').replace(/\d+/g, '#').replace(/\s+/g, ' ');
  const key = async (label, b, trigger) => { await S.sendBytes(cur.id, Uint8Array.from(b)); log.push({ key: label, trigger }); await sleep(500); };
  const send = async (text, trigger, { noWait = false } = {}) => { await S.send(cur.id, text, { enter: true }); log.push({ send: text, trigger }); };
  const watch = async (ms, max, label, trigger, _f, stopOnDialog) => {
    const end = Date.now() + ms; let last = ''; let k = 0;
    while (Date.now() < end && k < max) {
      await sleep(900); const s = await scr(); const nn = norm(s.text);
      if (nn !== last) { last = nn; k++; await snap(`${label}${k}`, trigger, s); }
      if (isDialog(s.text) && stopOnDialog) return 'dialog';
      if (isIdle(s.text) && k > 0 && Date.now() - t0 > 5000) { await sleep(1200); const s2 = await scr(); if (isIdle(s2.text)) return 'idle'; }
    }
  };
  const untilIdle = async (ms, label) => { const end = Date.now() + ms; let idle = 0; let k = 0; let last = ''; while (Date.now() < end) { await sleep(1000); const s = await scr(); if (isDialog(s.text)) { await snap(`${label}-unexpected-dialog`, 'unexpected dialog (left unanswered)', s); throw new Error('unexpected dialog'); } const nn = norm(s.text); if (nn !== last && k < 4 && !isIdle(s.text)) { last = nn; k++; await snap(`${label}-late${k}`, 'screen changed while waiting', s); } if (isIdle(s.text)) { if (++idle >= 3) return; } else idle = 0; } throw new Error('timeout waiting for idle'); };
  const waitFor = async (re, ms) => { const end = Date.now() + ms; while (Date.now() < end) { await sleep(500); if (re.test((await scr()).text)) return true; } return false; };
  const waitDialog = async (ms) => { const end = Date.now() + ms; while (Date.now() < end) { await sleep(500); if (isDialog((await scr()).text)) return true; } throw new Error('no dialog'); };
  const choose = async (re, why) => { for (let i = 0; i < 12; i++) { const rows = opts((await scr()).text); const to = rows.findIndex((x) => re.test(x.label)); const at = rows.findIndex((x) => x.marked); if (to < 0 || at < 0) throw new Error(`option ${re} not among ${rows.map((x) => x.label).join('|')}`); if (at === to) { await key('enter', K.ENTER, `${why}: ${rows[to].label}`); return; } await key(at < to ? 'down' : 'up', at < to ? K.DOWN : K.UP, why); } };
  const r = { snap, key, send, watch, untilIdle, waitFor, waitDialog, choose };
  try {
    if (!(await new Promise((res) => res(true)))) return;
    cur = await S.start({ agent: 'claude', cwd, args: ['--model', 'haiku', '--permission-mode', mode], sessionId });
    for (let i = 0; ; i++) { const s = await scr(); if (/trust this folder/.test(s.text)) { await snap('trust-ABORT', 'trust dialog appeared; NOT answered', s); throw new Error('trust dialog appeared (never auto-answered)'); } if (isIdle(s.text)) break; if (i > 60) throw new Error('never idle'); await sleep(700); }
    await fn(r);
  } catch (e) { status = 'failed'; error = String(e.message); try { if (cur) await snap('failure', `driver error: ${error}`); } catch {} }
  finally {
    await sleep(1500); try { if (cur) await S.stop(cur.id); } catch {}
    const tr = [];
    try {
      const main = path.join(projDir, `${sessionId}.jsonl`);
      if (fs.existsSync(main)) { fs.writeFileSync(path.join(dir, 'transcripts', `${name}.jsonl`), sc.jsonl(fs.readFileSync(main, 'utf8'))); tr.push(`${name}.jsonl`); }
      const sub = path.join(projDir, sessionId, 'subagents');
      for (const f of fs.existsSync(sub) ? fs.readdirSync(sub) : []) { const raw = fs.readFileSync(path.join(sub, f), 'utf8'); const out = f.endsWith('.jsonl') ? sc.jsonl(raw) : fix(raw); const nm = `${name}.${f.replace(/^agent-/, 'agent-')}`; fs.writeFileSync(path.join(dir, 'transcripts', nm), out); tr.push(nm); }
    } catch (e) { log.push({ collectError: e.message }); }
    fs.writeFileSync(path.join(dir, `.run-${name}.json`), JSON.stringify({ name, mode, status, error, durationMs: Date.now() - t0, captures: caps, log, transcripts: tr }, null, 1));
    fs.rmSync(cwd, { recursive: true, force: true });
    console.log(name, status, error ?? '', caps.length, 'captures', tr.length, 'transcript files');
  }
}
const name = process.argv[2];
try { if (!SC[name]) throw new Error('unknown scenario'); await run(name); } finally { await S.close(); spawnSync('tmux', ['-L', sock, 'kill-server']); }
