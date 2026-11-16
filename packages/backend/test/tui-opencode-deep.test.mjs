import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createOpencodeMapper, drivers } from '../src/tui/opencode.mjs';
import { itemProblem, promptProblem, CONTROLS } from '../src/tui/model.mjs';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/tui-opencode/${f}`, import.meta.url), 'utf8'));
const screens = fx('screens.json');
const bytes = (c) => [...c.bytes];
const str = (c) => Buffer.from(c.bytes).toString();
const R = (table, id, data, x = {}) => ({ table, id, session_id: 's', time_created: 1000, data, ...x });

// Fresh mapper with one user message m1 and one assistant message m2 already seen.
function setup() {
  const m = createOpencodeMapper(); const st = m.newState();
  m.mapRow(R('message', 'm1', { role: 'user', time: { created: 1 } }), st);
  m.mapRow(R('message', 'm2', { role: 'assistant', modelID: 'x', providerID: 'p', mode: 'build', path: { cwd: '/w' }, time: { created: 2 } }), st);
  const part = (id, data, msg = 'm2') => m.mapRow(R('part', id, data, { message_id: msg }), st);
  return { m, st, part };
}
const tool = (callID, name, state) => ({ type: 'tool', callID, tool: name, state });

// ---- rows -> items ----
test('user text part becomes a user item', () => assert.deepEqual(setup().part('a', { type: 'text', text: 'hi' }, 'm1')[0], { id: 'a', ts: 1000, kind: 'user', text: 'hi' }));
test('assistant text part becomes an assistant item', () => assert.equal(setup().part('a', { type: 'text', text: 'yo' })[0].kind, 'assistant'));
test('part for an unknown message never throws and stays valid', () => { for (const i of setup().part('a', { type: 'text', text: 'x' }, 'nope')) assert.equal(itemProblem(i), null); });
test('malformed rows never throw and emit only valid items', () => {
  const { m, st } = setup();
  for (const r of [{}, { table: 'part' }, { table: 'part', id: 'q', data: null }, { table: 'part', id: 'q', message_id: 'm2', data: { type: 'tool' } }, { table: 'zzz', id: 'q', data: {} }, null]) {
    let out; assert.doesNotThrow(() => { out = m.mapRow(r, st); });
    for (const i of out) assert.equal(itemProblem(i), null);
  }
});
test('completed bash tool: ok, shell category, title is the command', () => {
  const [t] = setup().part('t', tool('c', 'bash', { status: 'completed', input: { command: 'ls' }, output: 'a' }));
  assert.equal(t.status, 'ok'); assert.equal(t.category, 'shell'); assert.equal(t.title, 'ls'); assert.equal(t.output.text, 'a');
  assert.equal(itemProblem(t), null);
});
test('running tool has no output', () => {
  const [t] = setup().part('t', tool('c', 'bash', { status: 'running', input: {} }));
  assert.equal(t.status, 'running'); assert.equal('output' in t, false);
});
test('permission rejection error maps to denied', () => {
  const [t] = setup().part('t', tool('c', 'bash', { status: 'error', input: {}, error: 'The user rejected permission to use this specific tool call.' }));
  assert.equal(t.status, 'denied');
});
test('plain tool error maps to error', () => assert.equal(setup().part('t', tool('c', 'read', { status: 'error', input: {}, error: 'ENOENT' }))[0].status, 'error'));
test('aborted tool adds an interrupted notice', () => {
  const out = setup().part('t', tool('c', 'bash', { status: 'error', input: {}, error: 'Tool execution aborted' }));
  assert.deepEqual(out.map((i) => i.kind), ['tool', 'notice']);
  assert.equal(out[1].code, 'interrupted');
  assert.equal(itemProblem(out[1]), null);
});
test('task tool adds a subagent item named by subagent_type', () => {
  const out = setup().part('t', tool('c', 'task', { status: 'completed', input: { subagent_type: 'explore' }, output: 'ok' }));
  const sub = out.find((i) => i.kind === 'subagent');
  assert.equal(sub.name, 'explore'); assert.equal(sub.status, 'ok'); assert.equal(itemProblem(sub), null);
});
test('task tool without subagent_type falls back to "task"', () => assert.equal(setup().part('t', tool('c', 'task', { status: 'running', input: {} })).find((i) => i.kind === 'subagent').name, 'task'));
test('todowrite adds a todo item with mapped statuses', () => {
  const out = setup().part('t', { ...tool('c', 'todowrite', { status: 'completed', input: {}, output: '', metadata: { todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }, { content: 'c', status: 'weird' }] } }) });
  const todo = out.find((i) => i.kind === 'todo');
  assert.equal(todo.items.length, 3); assert.equal(todo.items[2].status, 'pending'); assert.equal(itemProblem(todo), null);
});
for (const [name, cat] of [['read', 'read'], ['glob', 'search'], ['grep', 'search'], ['webfetch', 'web'], ['write', 'write'], ['edit', 'edit'], ['apply_patch', 'edit'], ['task', 'subagent']]) {
  test(`tool ${name} -> category ${cat}`, () => assert.equal(setup().part('t', tool('c', name, { status: 'running', input: {} }))[0].category, cat));
}
test('step-finish becomes a usage item with tokens and cost', () => {
  const [u] = setup().part('s', { type: 'step-finish', cost: 0.5, tokens: { input: 10, output: 5, cache: { read: 3, write: 2 } } });
  assert.deepEqual([u.kind, u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheWriteTokens, u.costUsd, u.model], ['usage', 10, 5, 3, 2, 0.5, 'p/x']);
  assert.equal(itemProblem(u), null);
});
test('step-finish without tokens still yields zeros', () => assert.equal(setup().part('s', { type: 'step-finish' })[0].inputTokens, 0));
test('compaction: manual vs auto text', () => {
  assert.equal(setup().part('c', { type: 'compaction' })[0].text, 'Context compacted');
  assert.equal(setup().part('c', { type: 'compaction', auto: true })[0].text, 'Context compacted automatically');
});
test('file part on a user message is an [attachment] user item', () => assert.equal(setup().part('f', { type: 'file', filename: 'a.png', mime: 'image/png' }, 'm1')[0].text, '[attachment] a.png'));
test('file part falls back to mime when no filename', () => assert.equal(setup().part('f', { type: 'file', mime: 'image/png' }, 'm1')[0].text, '[attachment] image/png'));
test('assistant MessageAbortedError becomes an interrupted notice', () => {
  const { m, st } = setup();
  const [n] = m.mapRow(R('message', 'm3', { role: 'assistant', error: { name: 'MessageAbortedError', data: { message: 'aborted' } }, time: { created: 3 } }), st);
  assert.equal(n.code, 'interrupted'); assert.equal(itemProblem(n), null);
});
test('retry part is a warn notice', () => {
  const [n] = setup().part('r', { type: 'retry', error: { name: 'APIError', data: { message: 'overloaded' } } });
  assert.equal(n.level, 'warn'); assert.equal(itemProblem(n), null);
});
test('meta after rows: model p/x, mode build, cwd /w', () => {
  const { m, st } = setup(); m.mapRow(R('session', 's', { directory: '/w', title: 't' }), st);
  const meta = m.meta(st);
  assert.equal(meta.model, 'p/x'); assert.equal(meta.mode, 'build'); assert.equal(meta.cwd, '/w'); assert.equal(meta.agent, 'opencode');
});
test('every fixture row maps to valid items', () => {
  const m = createOpencodeMapper(); const st = m.newState();
  const out = fx('rows.json').flatMap((r) => m.mapRow(r, st));
  assert.ok(out.length > 20);
  for (const i of out) assert.equal(itemProblem(i), null, JSON.stringify(i));
});

// ---- prompts (screens) ----
const parse = (k) => createOpencodeMapper().parsePrompt(screens[k]);
test('permission screen: three buttons, valid, type permission', () => {
  const p = parse('permission');
  assert.equal(promptProblem(p), null); assert.equal(p.type, 'permission'); assert.equal(p.options.length, 3);
});
test('permission screen: state check reads the selected index', () => assert.ok(Number.isInteger(parse('permission').selected)));
test('always screen is a confirmation prompt', () => assert.equal(promptProblem(parse('always')), null));
test('reject screen is the text dialog "Reject permission"', () => {
  const p = parse('reject'); assert.equal(p.type, 'text'); assert.equal(p.title, 'Reject permission'); assert.equal(promptProblem(p), null);
});
test('question screen: digit hotkeys on options', () => {
  const p = parse('question'); assert.equal(promptProblem(p), null); assert.ok(p.options.every((o) => o.hotkey));
});
test('idle and markdown screens are not prompts', () => { assert.equal(parse('idle'), null); assert.equal(parse('markdown'), null); });

// ---- drivers and controls ----
test('rejectFeedback: exact bytes are text then Enter', () => assert.equal(str(drivers.rejectFeedback(parse('reject'), 'use rg instead')), 'use rg instead\r'));
test('rejectFeedback throws on any other prompt', () => {
  for (const k of ['permission', 'always', 'question']) assert.throws(() => drivers.rejectFeedback(parse(k), 'x'), RangeError, k);
  assert.throws(() => drivers.rejectFeedback(null, 'x'), RangeError);
});
test('rejectFeedback rejects control characters (no key injection)', () => {
  for (const t of ['a\x1bb', 'a\rb', 'a\nb', 'a\x7f']) assert.throws(() => drivers.rejectFeedback(parse('reject'), t), RangeError);
});
test('rejectFeedback is not part of controls (key set pinned)', () => {
  const m = createOpencodeMapper();
  assert.equal('rejectFeedback' in m.controls, false);
  for (const k of Object.keys(m.controls)) assert.ok(CONTROLS.includes(k), k);
});
test('permission buttons: answerPrompt moves right with wrap, then Enter', () => {
  const m = createOpencodeMapper(); const p = parse('permission'); const n = p.options.length;
  for (const o of p.options) assert.equal(str(m.controls.answerPrompt(p, o.index)), '\x1b[C'.repeat((o.index - p.selected + n) % n) + '\r');
});
test('answerPrompt throws on a missing option', () => assert.throws(() => createOpencodeMapper().controls.answerPrompt(parse('permission'), 99), RangeError));
test('question answer is the digit hotkey alone', () => {
  const p = parse('question'); assert.equal(str(createOpencodeMapper().controls.answerPrompt(p, p.options[1].index)), p.options[1].hotkey);
});
test('controls bytes: interrupt, compact, clear, slash, setModel', () => {
  const c = createOpencodeMapper().controls;
  assert.deepEqual(bytes(c.interrupt()), [27, 27]);
  assert.equal(str(c.compact()), '/compact\r'); assert.equal(str(c.clear()), '/new\r');
  assert.equal(str(c.slash('help')), '/help\r'); assert.equal(str(c.slash('/help')), '/help\r');
  assert.equal(str(c.setModel('gpt')), '\x18mgpt\r');
});
test('controls reject control characters in typed args', () => {
  const c = createOpencodeMapper().controls;
  assert.throws(() => c.slash('a\x1b'), RangeError); assert.throws(() => c.setModel('a\r'), RangeError);
});
test('setMode: Tab count wraps around the cycle', () => {
  const c = createOpencodeMapper().controls;
  assert.equal(str(c.setMode('build', 'plan')), '\t'); assert.equal(str(c.setMode('plan', 'build')), '\t');
  assert.equal(str(c.setMode('build', 'build')), '');
  assert.equal(str(c.setMode('a', 'c', { cycle: ['a', 'b', 'c'] })), '\t\t');
  assert.equal(str(c.setMode('c', 'a', { cycle: ['a', 'b', 'c'] })), '\t');
  assert.throws(() => c.setMode('build', 'ghost'), RangeError);
});

// ---- coverage counts ----
test('coverage counts: 33 elements, 28 chat, driven 10 yes / 3 no / 20 n/a', () => {
  const cov = createOpencodeMapper().coverage; const n = (k, v) => cov.filter((r) => r[k] === v).length;
  assert.equal(cov.length, 33); assert.equal(n('shown', 'chat'), 28);
  assert.deepEqual([n('driven', 'yes'), n('driven', 'no'), n('driven', 'n/a')], [10, 3, 20]);
});
test('coverage: reject feedback is driven, the 3 remaining "no" rows are the TUI-only ones', () => {
  const cov = createOpencodeMapper().coverage;
  assert.equal(cov.find((r) => r.element === 'reject feedback input').driven, 'yes');
  assert.equal(cov.filter((r) => r.driven === 'no').length, 3);
});

// ---- what only a real recording can settle ----
test.todo('record opencode ctrl+t variant cycle: the on-screen variant label and the state change, to drive and verify it');
test.todo('record ctrl+p command palette: title, row format, and whether typing filters then Enter runs the first match');
test.todo('record leader ctrl+x l / u / r: the session list screen, and the undo/redo confirmation text, to state-check them');
test.todo('record the themes picker: the key that opens it (not in repo code) and its row format');
test.todo('record a multi-select question and the Review tab: key for toggling, and the submit screen text');
test.todo('record shell mode (! prefix) and the sidebar toggle: indicator text and keys');
test.todo('record a real patch and snapshot part row: the data schema (files, hash) to map them into items');
test.todo('record the model picker: whether typing filters and Enter picks the first match (setModel assumes it)');
test.todo('record the permission buttons with the selection moved: selected state is colour only, so the screen text may not show it');
