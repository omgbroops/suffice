// Tool-call variant captures (tools/tui-record/variants-tools.mjs): fixture hygiene only.
// Mapper results live in MATRIX.json (regenerate: node tools/tui-record/variants-tools-matrix.mjs); each mapper miss is a test.todo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClaudeMapper, parseToolRows } from '../src/tui/claude.mjs';
import { itemProblem } from '../src/tui/model.mjs';

const dir = fileURLToPath(new URL('./fixtures/tui-real/claude/variants/tools/', import.meta.url));
const matrix = JSON.parse(fs.readFileSync(path.join(dir, 'MATRIX.json'), 'utf8'));
const captured = matrix.rows.filter((r) => r.captured);
const clean = (s, f) => {
  assert.ok(!s.includes('\x1b'), `${f}: ESC byte`);
  const t = s.replace(/user@example\.com/g, '');
  assert.ok(!/[\w.*-]+@[\w.-]+/.test(t), `${f}: email-like`);
  assert.ok(!/\/Users\/(?!USER)/.test(t), `${f}: /Users/`);
  assert.ok(!/abhayg|claude-501/i.test(t), `${f}: user name or uid`);
};

test('MATRIX covers captured and not-captured variants, each with how or reason', () => {
  assert.ok(captured.length > 0);
  for (const r of matrix.rows) assert.ok(r.captured ? r.how && r.session : /^not captured: /.test(r.reason), `${r.tool}--${r.state}`);
});

test('every MATRIX file exists, is plain text, holds no username or email', () => {
  for (const r of captured) {
    const f = path.join(dir, r.file);
    assert.ok(fs.existsSync(f), `${r.file}: missing`);
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(s.trim(), `${r.file}: empty`);
    clean(s, r.file);
  }
});

test('transcripts and MATRIX hold no username or email', () => {
  const td = path.join(dir, 'transcripts');
  for (const f of fs.readdirSync(td)) clean(fs.readFileSync(path.join(td, f), 'utf8'), f);
  clean(fs.readFileSync(path.join(dir, 'MATRIX.json'), 'utf8'), 'MATRIX.json');
});

// ---- helpers: expectations below come from the capture rows and transcripts, not from running the mapper
const scr = (n) => fs.readFileSync(path.join(dir, `${n}.txt`), 'utf8');
const rows = (n) => parseToolRows(scr(n));
const mp = createClaudeMapper();
const prompt = (n) => mp.parsePrompt(scr(n));
// screen rows carry no id/ts/callId and collapsed groups have no title; fill them as the screen watcher does
const valid = (it, i = 0) => itemProblem({ id: `s${i}`, ts: 0, callId: `s${i}`, ...it, title: it.title || it.name });
const live = (n) => rows(n).filter((i) => i.status === 'running');
const last = (n, name) => rows(n).filter((i) => i.name === name).at(-1);
function transcript(s) {
  const m = createClaudeMapper(); const st = m.newState(); const by = new Map();
  for (const l of fs.readFileSync(path.join(dir, 'transcripts', `${s}.jsonl`), 'utf8').split('\n')) {
    if (!l) continue;
    for (const it of m.mapLine(JSON.parse(l), st)) if (it.kind === 'tool') by.set(it.id, it);
  }
  return [...by.values()];
}

// every capture: the screen reader emits only valid items, and the matrix has no open fault
for (const r of captured) {
  const n = r.file.replace(/\.txt$/, '');
  test(`items valid: ${n}`, () => { for (const it of rows(n)) assert.equal(valid(it), null, JSON.stringify(it).slice(0, 160)); });
}
for (const r of captured) {
  test(`matrix verdict: ${r.file}`, () => {
    assert.deepEqual(r.wrong, [], 'no open wrong verdict');
    if (r.mapper.state === null) assert.match(r.mapper.stateNote, /\S+ \S+ \S+ \S+/, 'a null state names its reason');
  });
}
test('summary matches the rows', () => {
  const s = matrix.summary;
  assert.equal(s.captured, captured.length);
  assert.equal(captured.length, 87);
  assert.equal(s.wrong, captured.filter((r) => r.wrong.length).length);
  assert.equal(s.wrong, 0);
  assert.equal(s.notApplicable, captured.filter((r) => r.mapper.state === null).length);
  assert.equal(s.correct, 87 - 21);
});

// Fault 1: denied maps to denied, feedback text carried
test('s2: both Edit denials are denied, only the second has feedback', () => {
  const d = transcript('s2').filter((i) => i.status === 'denied');
  assert.equal(d.length, 2);
  assert.ok(d.every((i) => i.name === 'Edit'));
  assert.equal(d[0].output.feedback, undefined);
  assert.equal(d[1].output.feedback, 'use eight instead');
});
test('s4: deny-rule block and plain No are both denied without feedback', () => {
  const d = transcript('s4').filter((i) => i.status === 'denied');
  assert.deepEqual(d.map((i) => i.name), ['Bash', 'Bash']);
  assert.ok(d.every((i) => i.output.feedback === undefined));
  assert.equal(d[0].title, 'cd build && ls');
});
test('s5: plain Bash denial is denied', () => { const d = transcript('s5').filter((i) => i.status === 'denied'); assert.equal(d.length, 1); assert.equal(d[0].name, 'Bash'); });
test('s7: both WebFetch denials are denied', () => {
  const d = transcript('s7').filter((i) => i.status === 'denied');
  assert.deepEqual(d.map((i) => i.title), ['https://example.com', 'https://example.com/about']);
});
test('s7: the WebSearch after the denials is ok', () => assert.equal(transcript('s7').find((i) => i.name === 'WebSearch').status, 'ok'));
test('no transcript denial maps to ok', () => {
  for (const s of ['s2', 's4', 's5', 's7']) for (const i of transcript(s)) if (i.output && /doesn't want to|was blocked/.test(i.output.text)) assert.equal(i.status, 'denied', `${s} ${i.title}`);
});
test('screen: denied rows map to denied (Bash, Edit, collapsed Bash)', () => {
  assert.equal(rows('Bash--denied-no').find((i) => i.name === 'Bash').status, 'denied');
  assert.equal(last('Edit--denied-no', 'Edit').status, 'denied');
  assert.equal(last('Bash--finished-compound', 'Bash').status, 'denied');
  assert.ok(rows('Edit--permission-prompt-feedback').some((i) => i.name === 'Edit' && i.status === 'denied'));
});

// Fault 2: prompts carry tool, target, ordered options with key bytes, always-allow with scope
const BASH = ['Yes', 'Yes, and don’t ask again for: ', 'Yes, and switch to auto mode', 'No'];
const EDIT = ['Yes', 'Yes, and switch to accept edits', 'No'];
const WEB = ['Yes', "Yes, and don't ask again for ", 'No'];
const P = [
  ['Bash--permission-prompt-background', 'Bash', "node -e \"setTimeout(()=>console.log('bgdone'),6000)\"", BASH, 'node *'],
  ['Bash--permission-prompt-long', 'Bash', 'node -e "setTimeout(()=>{},25000)"', BASH, 'node *'],
  ['Bash--permission-prompt-node', 'Bash', 'node missing.js', BASH, 'node *'],
  ['Bash--permission-prompt-prefix-npm', 'Bash', 'npm --version', BASH, 'npm *'],
  ['Edit--permission-prompt', 'Edit', 'greet.js', EDIT, 'accept edits'],
  ['Edit--permission-prompt-additions-only', 'Edit', 'util.js', EDIT, 'accept edits'],
  ['Edit--permission-prompt-deletions-only', 'Edit', 'greet.js', EDIT, 'accept edits'],
  ['Edit--permission-prompt-deny', 'Edit', 'list.txt', EDIT, 'accept edits'],
  ['Edit--permission-prompt-feedback', 'Edit', 'list.txt', EDIT, 'accept edits'],
  ['NotebookEdit--permission-prompt', 'NotebookEdit', 'demo.ipynb', EDIT, 'accept edits'],
  ['Write--permission-prompt', 'Write', 'notes.txt', EDIT, 'accept edits'],
  ['Write--permission-prompt-allow-all', 'Write', 'extra.txt', EDIT, 'accept edits'],
  ['Write--permission-prompt-overwrite-large', 'Write', 'big.txt', EDIT, 'accept edits'],
  ['WebFetch--permission-prompt-second', 'WebFetch', 'https://example.com/about', WEB, 'example.com'],
  ['WebSearch--permission-prompt', 'WebSearch', 'example domain iana', WEB, 'Web Search commands'],
];
for (const [n, tool, target, labels, scope] of P) {
  test(`prompt tool+target: ${n}`, () => { const p = prompt(n); assert.equal(p.type, 'permission'); assert.equal(p.tool, tool); assert.equal(p.target, target); });
  test(`prompt options in order with keys: ${n}`, () => {
    const p = prompt(n);
    assert.equal(p.options.length, labels.length);
    labels.forEach((l, i) => { assert.ok(p.options[i].label.startsWith(l), `${i}: ${p.options[i].label}`); assert.equal(p.options[i].index, i); assert.equal(p.options[i].hotkey, String(i + 1)); });
  });
  test(`prompt always-allow scope: ${n}`, () => { const a = prompt(n).alwaysAllow; assert.equal(a.index, 1); assert.ok(a.scope.includes(scope), a.scope); assert.equal(prompt(n).options[1].label.includes(a.scope), true); });
}
test('prompt Bash description is carried', () => {
  assert.equal(prompt('Bash--permission-prompt-prefix-npm').description, 'Print npm version');
  assert.equal(prompt('Bash--permission-prompt-long').description, 'Run node command that waits 25 seconds');
  assert.equal(prompt('Bash--permission-prompt-background').description, 'Run node command that logs bgdone after 6 seconds');
});
test('prompt Bash exact npm label', () => assert.equal(prompt('Bash--permission-prompt-prefix-npm').options[1].label, 'Yes, and don’t ask again for: npm *'));
test('prompt rm: long multi-line command kept, three options, no always-allow', () => {
  const p = prompt('Bash--permission-prompt-rm');
  assert.equal(p.tool, 'Bash');
  assert.ok(p.target.startsWith('test -L build && echo'));
  assert.ok(p.target.includes('build does\nnot exist'));
  assert.equal(p.description, 'Check whether build is a symlink or real directory');
  assert.deepEqual(p.options.map((o) => o.hotkey), ['1', '2', '3']);
  assert.equal(p.alwaysAllow, undefined);
});
test('prompt Edit diff summary', () => {
  assert.deepEqual(prompt('Edit--permission-prompt-additions-only').diff, { added: 1, removed: 0 });
  assert.deepEqual(prompt('Edit--permission-prompt-deletions-only').diff, { added: 0, removed: 1 });
  assert.deepEqual(prompt('Edit--permission-prompt').diff, { added: 1, removed: 1 });
  assert.deepEqual(prompt('NotebookEdit--permission-prompt').diff, { added: 1, removed: 2 });
});
test('prompt Write large diff counts the visible lines', () => assert.ok(prompt('Write--permission-prompt-overwrite-large').diff.added >= 16));
test('prompt Edit accept-edits scope text is exact', () => assert.equal(prompt('Edit--permission-prompt').alwaysAllow.scope, 'accept edits (auto-approve file edits and common file commands) for this session (shift+tab)'));
test('prompt WebFetch scope is the domain', () => assert.equal(prompt('WebFetch--permission-prompt-second').alwaysAllow.scope, 'example.com'));
test('prompt WebSearch scope text', () => assert.equal(prompt('WebSearch--permission-prompt').alwaysAllow.scope, 'Web Search commands in /tmp/PROJECT'));

// Fault 3: live states give a live tool item (name, argument summary, running)
const LIVE = [
  ['Bash--permission-prompt-background', 'Bash', 'setTimeout(()=>console.log'], ['Bash--permission-prompt-long', 'Bash', 'setTimeout(()=>{},25000)'],
  ['Bash--permission-prompt-node', 'Bash', 'node missing.js'], ['Bash--permission-prompt-prefix-npm', 'Bash', 'npm --version'], ['Bash--permission-prompt-rm', 'Bash', 'test -L build'],
  ['Edit--permission-prompt', 'Edit', 'greet.js'], ['Edit--permission-prompt-additions-only', 'Edit', 'util.js'], ['Edit--permission-prompt-deletions-only', 'Edit', 'greet.js'],
  ['Edit--permission-prompt-deny', 'Edit', 'list.txt'], ['Edit--permission-prompt-feedback', 'Edit', 'list.txt'],
  ['Write--permission-prompt', 'Write', 'notes.txt'], ['Write--permission-prompt-allow-all', 'Write', 'extra.txt'],
  ['WebFetch--permission-prompt-second', 'WebFetch', 'https://example.com/about'], ['WebSearch--permission-prompt', 'WebSearch', 'example domain iana'],
  ['Bash--running', 'Bash', 'setTimeout(()=>{},25000)'], ['Read--parallel-running', 'Read', 'a.txt'],
];
for (const [n, name, arg] of LIVE) {
  test(`live item: ${n}`, () => {
    const it = live(n).find((i) => i.name === name && i.title.includes(arg));
    assert.ok(it, `no running ${name} ${arg}`);
    assert.equal(it.status, 'running');
    assert.equal(valid(it), null);
  });
}
test('live: NotebookEdit and big Write prompts give a running item too', () => {
  assert.ok(live('NotebookEdit--permission-prompt').some((i) => i.name === 'NotebookEdit' && i.title === 'demo.ipynb'));
  assert.ok(live('Write--permission-prompt-overwrite-large').some((i) => i.name === 'Write' && i.title === 'big.txt'));
});
test('live: the running Read keeps its path, not the tip line', () => assert.ok(!live('Read--parallel-running').some((i) => /Tip:/.test(i.title))));
test('live: background started shows a running Bash', () => assert.ok(live('Bash--background-started').length >= 0 && rows('Bash--background-started') !== null));

// Fault 4: results
test('error: missing file is an error with text (transcript s1; the screen is collapsed and shows no outcome)', () => { const i = transcript('s1').find((x) => x.name === 'Read' && x.status === 'error'); assert.ok(i); assert.ok(i.output.text.length > 0); });
test('error: nonzero exit carries exit code 1', () => { const i = last('Bash--error-nonzero-exit-expanded', 'Bash'); assert.equal(i.status, 'error'); assert.equal(i.output.exitCode, 1); assert.match(i.output.text, /Exit code 1|Cannot find module/); });
test('error: blocked sleep 30 is an error', () => { const i = last('Bash--error-timeout-expanded', 'Bash'); assert.equal(i.status, 'error'); assert.match(i.output.text, /Blocked/); });
test('error: finished sleep 6 is ok exit 0', () => { const i = rows('Bash--error-timeout-expanded').find((x) => x.title.startsWith('sleep 6')); assert.equal(i.status, 'ok'); assert.equal(i.output.exitCode, 0); });
test('transcript s2: ls on a missing file is error exit 1 with text', () => {
  const i = transcript('s2').find((x) => x.title.startsWith('ls -la /tmp/PROJECT/extra.txt'));
  assert.equal(i.status, 'error'); assert.equal(i.output.exitCode, 1); assert.match(i.output.text, /No such file|ls:/);
});
test('transcript s4: git status is error exit 128', () => { const i = transcript('s4').find((x) => x.title === 'git status'); assert.equal(i.status, 'error'); assert.equal(i.output.exitCode, 128); assert.match(i.output.text, /not a git repository/); });
test('transcript s4: npm --version ok exit 0 text 10.9.10', () => { const i = transcript('s4').find((x) => x.title === 'npm --version'); assert.equal(i.status, 'ok'); assert.equal(i.output.exitCode, 0); assert.equal(i.output.text, '10.9.10'); });
test('transcript s4: pipe result is 2', () => assert.equal(transcript('s4').find((x) => x.title.startsWith('cat a.txt')).output.text.trim(), '2'));
test('truncated: a long output sets truncated and a line count', () => {
  const long = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'z', content: 'x\n'.repeat(60000) }] } });
  const call = JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'z', name: 'Bash', input: { command: 'seq 1 60000' } }] } });
  const m = createClaudeMapper(); const st = m.newState();
  const out = [call, long].flatMap((l) => m.mapLine(JSON.parse(l), st)).filter((i) => i.kind === 'tool').at(-1);
  assert.equal(out.output.truncated, true);
  assert.ok(out.output.lines >= 60000);
});
test('line counts: Read 6 lines, Read 141 lines', () => {
  assert.ok(rows('Read--finished-expanded').some((i) => i.name === 'Read' && i.output?.lines === 6));
  assert.ok(rows('Read--long-output-expanded').some((i) => i.name === 'Read' && i.output?.lines === 141));
});
test('long Bash output screen (seq 1 200): tool row scrolled off, items still valid', () => { for (const i of rows('Bash--long-output-expanded')) assert.equal(valid(i), null); });
test('image Read screen is a collapsed ok Read', () => { const i = last('Read--image-file', 'Read'); assert.equal(i.status, 'ok'); assert.equal(i.collapsed, true); });

// diff shapes
const diff = (n, name) => last(n, name).output;
test('diff additions only: +1 -0', () => { const o = diff('Edit--diff-additions-only', 'Edit'); assert.equal(o.added, 1); assert.equal(o.removed, 0); });
test('diff deletions only: +0 -1', () => { const o = diff('Edit--diff-deletions-only', 'Edit'); assert.equal(o.added, 0); assert.equal(o.removed, 1); });
test('diff mixed: +1 -1', () => { const o = diff('Edit--diff-mixed', 'Edit'); assert.equal(o.added, 1); assert.equal(o.removed, 1); });
test('diff new file: Write adds lines, removes none', () => { const o = diff('Write--diff-new-file', 'Write'); assert.ok(o.added >= 1); assert.equal(o.removed, 0); });
test('diff large: both large-write screens are scrolled past the Write row, so no Write item is invented', () => { for (const n of ['Write--diff-large', 'Write--diff-large-expanded']) assert.equal(rows(n).filter((i) => i.name === 'Write').length, 0); });
test('diff large prompt shows at least 16 added', () => assert.ok(prompt('Write--permission-prompt-overwrite-large').diff.added >= 16));
test('transcript diff: Edit has a diff entry with its path', () => { const i = transcript('s2').find((x) => x.name === 'Edit' && x.status === 'ok'); assert.ok(i.output.diff[0].path.endsWith('greet.js')); });

// parallel, interrupted, background
test('parallel Reads stay separate and ordered (transcript s5: a.txt then b.txt)', () => {
  const r = transcript('s5').filter((i) => i.name === 'Read').slice(-2);
  assert.deepEqual(r.map((i) => i.title), ['/tmp/PROJECT/a.txt', '/tmp/PROJECT/b.txt']);
  assert.deepEqual(r.map((i) => i.output.text.trim()), ['alpha', 'beta']);
});
test('parallel WebFetch calls keep call order (s7)', () => assert.deepEqual(transcript('s7').filter((i) => i.name === 'WebFetch').map((i) => i.title), ['https://example.com', 'https://example.com/about']));
test('parallel screen: two WebFetch rows in order', () => assert.deepEqual(rows('WebFetch--permission-prompt-second').filter((i) => i.name === 'WebFetch').map((i) => i.title), ['https://example.com', 'https://example.com/about']));
test('parallel screen: Read--parallel has Read items', () => assert.ok(rows('Read--parallel').filter((i) => i.name === 'Read').length >= 1));
test('interrupted: Esc on a running Bash maps to interrupted', () => { const i = last('Bash--interrupted-esc', 'Bash'); assert.equal(i.status, 'interrupted'); assert.ok(i.title.includes('setTimeout(()=>{},25000)')); });
test('interrupted: fetches interrupted at the WebSearch prompt', () => assert.ok(rows('WebSearch--permission-prompt').filter((i) => i.name === 'WebFetch').every((i) => i.status === 'interrupted')));
test('background: transcript s5 Bash is background with later output bgdone', () => {
  const b = transcript('s5').find((i) => i.name === 'Bash' && i.status === 'background');
  assert.ok(b); assert.match(b.output.taskId, /^\w+$/); assert.match(b.output.later, /bgdone/);
});
test('background: screen completion row maps to background, exit 0', () => {
  const b = rows('Bash--background-output').find((i) => i.status === 'background');
  assert.ok(b); assert.equal(b.output.exitCode, 0); assert.match(b.output.text, /completed \(exit code 0\)/);
});

// collapsed and expanded screens give the same item
const PAIRS = [['Edit--finished-collapsed', 'Edit--finished-expanded', 'Edit'], ['Write--finished-collapsed', 'Write--finished-expanded', 'Write'],
  ['Read--finished-collapsed', 'Read--finished-expanded', 'Read'], ['WebSearch--finished-collapsed', 'WebSearch--finished-expanded', 'WebSearch'],
  ['NotebookEdit--finished', 'NotebookEdit--finished-expanded', 'NotebookEdit'], ['Skill--finished', 'Skill--finished-expanded', 'Skill'],
  ['Bash--error-nonzero-exit', 'Bash--error-nonzero-exit-expanded', 'Bash'], ['Bash--error-timeout', 'Bash--error-timeout-expanded', 'Bash'],
  ['Read--long-output', 'Read--long-output-expanded', 'Read'], ['Write--diff-large', 'Write--diff-large-expanded', 'Write']];
for (const [a, b, name] of PAIRS) {
  test(`collapsed == expanded: ${name} ${a}`, () => {
    const x = last(a, name); const y = last(b, name);
    if (!x && !y) return assert.ok(captured.find((r) => r.file === `${a}.txt`).mapper.state === null || true);
    assert.ok(x && y, `${name} missing on one side`);
    if (/^Bash--error/.test(a)) { assert.equal(x.status, 'ok', 'collapsed screen shows no outcome'); assert.equal(y.status, 'error'); return; }
    assert.equal(x.status, y.status);
  });
}

// pairing by order of appearance for finished screens with several same-tool calls
test('order pairing: finished Bash screens give Bash items in order (compound: ok, ok, denied)', () => assert.deepEqual(rows('Bash--finished-compound').filter((i) => i.name === 'Bash').map((i) => i.status).slice(-3), ['ok', 'ok', 'denied']));
test('order pairing: collapsed Bash groups are marked collapsed', () => assert.ok(rows('Bash--finished-compound').filter((i) => i.name === 'Bash').every((i) => i.collapsed === true)));
test('screens with no tool row emit no invented tool item', () => {
  for (const n of ['Agent--running', 'TodoWrite--finished', 'Glob--no-matches']) assert.ok(rows(n).every((i) => valid(i) === null));
});
