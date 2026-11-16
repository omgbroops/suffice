// Session-level real claude screens (tools/tui-record/session-variants.mjs): hygiene, parsers run on each, content and kind assertions per capture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClaudeMapper, parseStatus, parseWorking, parseTurnFooter } from '../src/tui/claude.mjs';
import { classifyScreen } from '../src/tui/screens.mjs';
import { parseDashboard } from '../src/tui/screens-parsers.mjs';
import { parseModeLine, parseQueued, parseInputDraft, parseBackgroundTasks, parseContextWarning, parsePicker } from '../src/tui/screenparts.mjs';

const dir = fileURLToPath(new URL('./fixtures/tui-real/claude/variants/session/', import.meta.url));
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
const matrix = JSON.parse(fs.readFileSync(path.join(dir, 'MATRIX.json'), 'utf8'));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

test('every matrix row has a capture file and every capture has a row', () => {
  assert.ok(files.length > 100);
  assert.deepEqual(matrix.rows.map((r) => r.file).sort(), files);
});

test('captures and transcripts are plain text: no ESC bytes, /Users/, user name, uid dir or email', () => {
  const all = [...files.map((f) => path.join(dir, f)), ...fs.readdirSync(path.join(dir, 'transcripts')).map((f) => path.join(dir, 'transcripts', f)), path.join(dir, 'MATRIX.json')];
  for (const f of all) {
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(!s.includes('\x1b'), `${f}: ESC byte`);
    assert.ok(!/\/Users\//.test(s), `${f}: /Users/`);
    assert.ok(!/abhayg|claude-501/i.test(s), `${f}: name or uid`);
    assert.ok(!/[\w.*-]+@[\w.-]+/.test(s.replace(/user@example\.com/g, '')), `${f}: email-like`);
  }
});

test('parsers run on every capture without throwing', () => {
  const m = createClaudeMapper();
  for (const f of files) {
    const t = read(f);
    for (const fn of [parseStatus, parseTurnFooter, parseModeLine, parseQueued, parseInputDraft, parseBackgroundTasks, parseContextWarning, parsePicker, (x) => m.parsePrompt(x)]) assert.doesNotThrow(() => fn(t), f);
  }
});

test('permission-mode footers: accept edits, plan, auto, manual parse to their mode', () => {
  for (const [f, want] of [['modes--02-mode-1.txt', 'accept edits'], ['modes--03-mode-2.txt', 'plan'], ['modes--04-mode-3.txt', 'auto'], ['modes--05-mode-4.txt', 'default']]) {
    const r = parseModeLine(read(f));
    assert.ok(r, f);
    assert.ok(String(r.mode).startsWith(want.split(' ')[0]), `${f}: ${JSON.stringify(r)}`);
  }
});

test('working line with elapsed and tokens parses', () => {
  const r = parseStatus(read('working--04-phase3.txt'));
  if (r) { assert.ok(r.verb); return; }
  assert.ok(files.filter((f) => f.startsWith('working--')).some((f) => parseStatus(read(f))?.verb));
});

test('MATRIX rows judged right have no issues, wrong ones name the issue', () => {
  for (const r of matrix.rows) assert.equal(r.correct, r.issues.length === 0, r.file);
});

const kinds = JSON.parse(fs.readFileSync(path.join(dir, 'kinds.json'), 'utf8'));
const INVALID = matrix.rows.filter((r) => r.invalid).map((r) => r.file);
const cap = (prefix) => { const f = files.find((x) => x.startsWith(prefix)); assert.ok(f, prefix); return read(f); };
const kind = (t) => classifyScreen(t).kind;
const labels = (c) => c.prompt.options.map((o) => o.label);

test('invalid captures are explicit: blank, marked in MATRIX, listed here', () => {
  assert.deepEqual(INVALID, ['export--05-exit-slash.txt', 'smoke--03-exit-screen.txt']);
  for (const r of matrix.rows.filter((x) => x.invalid)) {
    assert.equal(read(r.file).split('\n').filter((l) => l.trim()).length, 0, r.file);
    assert.equal(r.correct, false);
    assert.match(r.issues[0], /^invalid capture/);
  }
});

test('every valid MATRIX row is judged correct', () => {
  for (const r of matrix.rows.filter((x) => !x.invalid)) assert.equal(r.correct, true, `${r.file}: ${r.issues}`);
});

test('kinds.json covers every capture exactly', () => assert.deepEqual(Object.keys(kinds).sort(), files));

for (const f of files) {
  test(`${f}: kind is ${kinds[f]}`, () => assert.equal(kind(read(f)), kinds[f]));
  test(`${f}: option buttons only for permission, question or plan`, () => {
    const t = read(f);
    const c = classifyScreen(t);
    const ok = ['permission', 'question', 'plan'].includes(c.kind);
    assert.equal(!!c.prompt?.options?.length, ok, f);
    if (!ok) assert.equal(createClaudeMapper().parsePrompt(t)?.options?.length ?? 0, 0, f);
  });
}

test('parseWorking and parseStatus: working lines with no parenthetical', () => {
  for (const f of ['acceptedit--02-edit1.txt', 'working--02-phase1.txt', 'todo--02-todo1.txt', 'hooks--02-ctx1.txt', 'rewind--02-rw1.txt']) {
    const w = parseWorking(read(f));
    assert.ok(w && /^[A-Z][a-z]+$/.test(w.verb), `${f}: ${JSON.stringify(w)}`);
    assert.equal(w.elapsedSec, null);
    assert.equal(w.tokens, null);
    assert.equal(parseStatus(read(f)).verb, w.verb);
  }
});

test('parseWorking: line with elapsed and tokens', () => {
  const w = parseWorking(cap('queue--02'));
  assert.equal(w.verb, 'Boondoggling');
  assert.equal(w.elapsedSec, 6);
  assert.equal(w.tokens, 16);
  assert.equal(w.tokenDirection, 'down');
  assert.equal(parseWorking(cap('queue--05')).tokens, 73);
});

test('parseWorking: no working line after an interrupt', () => assert.equal(parseWorking(cap('queue--06')), null));

test('parseQueued: one and two queued messages, none when idle', () => {
  assert.deepEqual(parseQueued(cap('queue--02')).messages, ['first queued']);
  assert.deepEqual(parseQueued(cap('queue--03')).messages, ['first queued', 'second queued']);
  assert.equal(parseQueued(cap('queue--01')), null);
});

test('parseInputDraft: queue hint is not a draft, edited drafts are', () => {
  assert.equal(parseInputDraft(cap('queue--02')).text, '');
  assert.equal(parseInputDraft(cap('queue--04')).text, 'first queued\nsecond queued');
  for (const n of ['queue--05', 'queue--06', 'queue--07']) assert.equal(parseInputDraft(cap(n)).text, 'first queued', n);
  assert.equal(parseInputDraft(cap('input--08')).text, '@apple.txt');
  assert.equal(parseInputDraft(cap('input--05')).text, '# remember x');
});

test('ask: single choice question, options in order, selected, Other and Chat rows', () => {
  const c = classifyScreen(cap('ask--02'));
  assert.equal(c.prompt.title, 'Pick a color');
  assert.deepEqual(labels(c), ['red', 'green', 'blue', 'Type something.', 'Chat about this']);
  assert.equal(c.prompt.selected, 0);
  assert.equal(c.prompt.options[3].other, true);
  assert.ok(!c.prompt.multiSelect);
  assert.equal(classifyScreen(cap('ask--03')).prompt.selected, 1);
});

test('ask: multi-select flag, checked state, labels without box prefix', () => {
  const a = classifyScreen(cap('ask--04')).prompt;
  assert.equal(a.title, 'Pick fruits');
  assert.equal(a.multiSelect, true);
  assert.deepEqual(a.options.slice(0, 3).map((o) => o.label), ['apple', 'pear', 'plum']);
  assert.ok(a.options.slice(0, 3).every((o) => o.checked === false));
  assert.equal(a.options[3].other, true);
  const b = classifyScreen(cap('ask--05')).prompt;
  assert.deepEqual(b.options.slice(0, 3).map((o) => o.checked), [true, true, false]);
  assert.equal(b.selected, 1);
  assert.deepEqual(classifyScreen(cap('ask--06')).prompt.options.slice(0, 3).map((o) => o.checked), [true, false, false]);
});

test('ask: Other selected and typed', () => {
  const a = classifyScreen(cap('ask--07')).prompt;
  assert.equal(a.title, 'Pick a pet');
  assert.deepEqual(a.options.slice(0, 2).map((o) => o.label), ['cat', 'dog']);
  assert.equal(a.selected, 2);
  assert.equal(a.options[2].other, true);
  const b = classifyScreen(cap('ask--08')).prompt;
  assert.equal(b.options[2].label, 'hamster');
  assert.equal(b.selected, 2);
});

test('ask: two questions and review screen', () => {
  assert.equal(classifyScreen(cap('ask--09')).prompt.title, 'Pick a color');
  assert.deepEqual(labels(classifyScreen(cap('ask--09'))).slice(0, 2), ['red', 'green']);
  const b = classifyScreen(cap('ask--10')).prompt;
  assert.equal(b.title, 'Pick a size');
  assert.deepEqual(b.options.slice(0, 2).map((o) => o.label), ['small', 'large']);
  const r = classifyScreen(cap('ask--11')).prompt;
  assert.match(r.title, /Ready to submit your answers/);
  assert.deepEqual(labels({ prompt: r }), ['Submit answers', 'Cancel']);
  assert.match(cap('ask--11'), /red/);
  assert.match(cap('ask--11'), /small/);
});

test('plan: question, options in order, plan text in body', () => {
  const p = classifyScreen(cap('plan--02')).prompt;
  assert.match(p.title, /ready to execute|Ready to code/);
  assert.deepEqual(p.options.map((o) => o.label), ['Yes, and use auto mode', 'Yes, manually approve edits', 'Tell Claude what to change']);
  assert.equal(p.selected, 0);
  assert.match(p.body, /module\.exports = \{ greet, farewell \}/);
  assert.match(p.body, /Existing greet returns/);
  assert.equal(classifyScreen(cap('plan--03')).prompt.selected, 1);
  assert.equal(classifyScreen(cap('plan--04')).prompt.selected, 2);
});

test('rewind: picker entries, selected, then the confirm menu', () => {
  const c = classifyScreen(cap('rewind--05'));
  assert.equal(c.title, 'Rewind');
  assert.deepEqual(c.entries.map((e) => e.label), ['↑ 2 more', 'Say three.', 'No code changes', '(current)']);
  assert.equal(c.selected, 3);
  assert.equal(classifyScreen(cap('rewind--06')).kind, 'picker');
  assert.match(cap('rewind--07'), /Restore conversation[\s\S]*Summarize from here[\s\S]*Summarize up to here[\s\S]*Never mind/);
  assert.match(cap('rewind--07'), /Say three\./);
  assert.equal(classifyScreen(cap('rewind--07')).prompt, undefined);
});

test('resume: picker entries with details', () => {
  const c = classifyScreen(cap('resume--02'));
  assert.match(c.title, /^Resume session/);
  assert.deepEqual(c.entries.slice(3, 7).map((e) => e.label), ['Secret word question', 'TodoWrite three-item list test', '/clear', 'Three-word greeting']);
  assert.match(c.entries[3].detail, /52 seconds ago · HEAD · 367\.1KB/);
  assert.equal(c.selected, 0);
  assert.equal(classifyScreen(cap('resume--03')).kind, 'picker');
});

test('export: choices in order, first selected', () => {
  const c = classifyScreen(cap('export--03'));
  assert.equal(c.title, 'Export conversation');
  assert.deepEqual(c.entries.map((e) => e.label), ['Copy to clipboard', 'Save to file']);
  assert.equal(c.selected, 0);
});

test('/context, /cost, /usage parse into key/value data with numeric percentages', () => {
  const ctx = parseDashboard(cap('cmds--06'));
  const keys = ctx.fields.map((x) => x.key);
  for (const k of ['System prompt', 'System tools', 'MCP tools', 'Memory files', 'Skills', 'Messages', 'Free space']) assert.ok(keys.includes(k), k);
  assert.ok(ctx.bars.length >= 7 && ctx.bars.every((b) => typeof b.percent === 'number' && b.percent >= 0 && b.percent <= 100));
  for (const n of ['cmds--07', 'cmds--08']) {
    const d = parseDashboard(cap(n));
    const k = d.fields.map((x) => x.key);
    for (const w of ['Total cost', 'Total duration (API)', 'Total duration (wall)', 'Total code changes']) assert.ok(k.includes(w), `${n} ${w}`);
    assert.match(d.fields.find((x) => x.key === 'Total cost').value, /^\$/);
    assert.ok(d.bars.length >= 1 && d.bars.every((b) => typeof b.percent === 'number'), n);
  }
});

test('mode footer in each captured mode', () => {
  const want = { 'modes--01': 'shortcuts', 'modes--02': 'acceptEdits', 'modes--03': 'plan', 'modes--04': 'auto', 'modes--06': 'acceptEdits' };
  for (const [n, m] of Object.entries(want)) {
    const t = cap(n);
    if (m === 'shortcuts') assert.match(t, /\? for shortcuts/);
    else assert.equal(parseModeLine(t)?.mode, m, n);
  }
  assert.match(cap('modes--05'), /\? for shortcuts/);
});

test('status line capture: custom status line shows in the footer', () => {
  for (const n of ['hooks--02', 'hooks--04', 'hooks--07']) assert.match(cap(n), /STATUS demo line/, n);
});

test('hook captures: hooks run silently, blocked tool shows reason, parsers stay on chat', () => {
  assert.equal(parseWorking(cap('hooks--02')).verb, 'Churning');
  assert.match(cap('hooks--07'), /⏺ ok/);
  assert.match(cap('hooks--08'), /Run echo blockme with bash\./);
  assert.match(cap('hooks--11'), /Not run · permission denied/);
  assert.match(cap('hooks--11'), /Reason: PreToolUse:Bash hook error: blocked by project hook/);
  for (const n of ['hooks--02', 'hooks--04', 'hooks--07', 'hooks--08', 'hooks--11']) assert.equal(kind(cap(n)), 'chat', n);
});

test('@ popup entries and after selection', () => {
  const a = cap('input--06');
  assert.match(a, /@a\b/);
  assert.match(a, /\+ apple\.txt/);
  assert.match(a, /\(agent\)/);
  assert.match(cap('input--07'), /❯\s+\+ apple\.txt|❯ .*apple\.txt/);
  assert.equal(parseInputDraft(cap('input--08')).text, '@apple.txt');
});

test('bash mode: typed command and output', () => {
  assert.match(cap('input--02'), /^! ?|❯ ! /m);
  assert.match(cap('input--03'), /! echo hello-bash/);
  assert.match(cap('input--03'), /hello-bash\s*$/m);
});

test('narrow (40, 60) and wide (200) layouts keep parsing', () => {
  for (const n of ['widths--02', 'widths--03', 'widths--04']) {
    const t = cap(n);
    assert.equal(kind(t), 'chat', n);
    assert.ok(t.split('\n').some((l) => l.trim()), n);
  }
  assert.ok(Math.max(...cap('widths--03').split('\n').map((l) => l.length)) <= 60);
  assert.ok(Math.max(...cap('widths--04').split('\n').map((l) => l.length)) > 100);
});
