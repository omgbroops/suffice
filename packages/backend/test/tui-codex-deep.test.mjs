import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodexMapper, parsePrompt, parseStatus, controls, coverage, approvals } from '../src/tui/codex.mjs';
import { itemProblem, promptProblem, CONTROLS } from '../src/tui/model.mjs';

const mk = (title, rows, sel = 0, foot = '  Press enter to confirm or esc to cancel') =>
  [`  ${title}`, '', ...rows.map((r, i) => `${i === sel ? '›' : ' '} ${i + 1}. ${r}`), '', foot].join('\n');
const EXEC = ['Yes, proceed  (y)', "Yes, and don't ask again for commands that start with `ls`  (p)", 'No, and tell Codex what to do differently  (esc)'];
const execPrompt = (sel = 0) => parsePrompt(mk('Would you like to run the following command?', EXEC, sel));
const line = (payload, type = 'event_msg') => ({ timestamp: '2026-01-01T00:00:00Z', type, payload });
const map = (...recs) => { const m = createCodexMapper(); const st = {}; return recs.flatMap((r) => m.mapLine(r, st)); };

// ---- approval prompts as selectable options ----
test('approvals.decide allow picks the hotkey y', () => assert.equal(approvals.decide(execPrompt(), 'allow'), '('.length && 'y'));
test('approvals.decide always picks the hotkey p', () => assert.equal(approvals.decide(execPrompt(), 'always'), 'p'));
test('approvals.decide deny maps (esc) to the Esc byte', () => assert.equal(approvals.decide(execPrompt(), 'deny'), '\x1b'));
test('approvals.decide falls back to the digit when no hotkey is shown', () => {
  const p = parsePrompt(mk('Would you like to make the following edits?', ['Yes, proceed', "Yes, and don't ask again for these files", 'No, and tell Codex what to do differently']));
  assert.deepEqual(['allow', 'always', 'deny'].map((k) => approvals.decide(p, k)), ['1', '2', '3']);
});
test('approvals.decide handles the two-option permissions dialog', () => {
  const p = parsePrompt(mk('Would you like to grant these permissions?', ['Yes, grant these permissions for this turn', 'No, continue without permissions']));
  assert.equal(approvals.decide(p, 'allow'), '1');
  assert.equal(approvals.decide(p, 'deny'), '2');
  assert.throws(() => approvals.decide(p, 'always'), RangeError);
});
test('approvals.decide handles MCP elicitation Cancel as deny', () => {
  const p = parsePrompt(mk('srv needs your approval.', ['Yes, provide the requested info', 'No, but continue without it', 'Cancel this request']));
  assert.equal(approvals.decide(p, 'allow'), '1');
  assert.equal(approvals.decide(p, 'deny'), '2');
});
test('approvals.decide rejects non-permission prompts and unknown kinds', () => {
  const choice = parsePrompt('Which style?\n› 1. Compact\n  2. Detailed\n\nenter to submit, esc to cancel');
  assert.throws(() => approvals.decide(choice, 'allow'), RangeError);
  assert.throws(() => approvals.decide(execPrompt(), 'maybe'), RangeError);
  assert.throws(() => approvals.decide(null, 'allow'), RangeError);
});
test('approvals.current reads the highlighted option (state check)', () => {
  assert.equal(approvals.current(execPrompt(0)), 'Yes, proceed');
  assert.match(approvals.current(execPrompt(1)), /don't ask again/);
  assert.equal(approvals.current(null), null);
});
test('approvals.options marks exactly one selected row', () => {
  const o = approvals.options(execPrompt(2));
  assert.equal(o.length, 3);
  assert.deepEqual(o.map((x) => x.selected), [false, false, true]);
});
// presets popup labels are assumed (commands.mjs CODEX_MODES); real wording needs a recording (see todo)
const PRESETS = ['Read Only', 'Default permissions', 'Full Access'];
const presetScreen = (sel) => mk('Update Model Permissions', PRESETS, sel, '  Press enter to confirm or esc to go back');
for (const [re, digit] of [[/Read Only/i, '1'], [/Default/i, '2'], [/Full Access/i, '3']]) {
  test(`approvals.select ${re} -> ${digit}`, () => {
    const p = parsePrompt(presetScreen(0));
    assert.equal(promptProblem(p), null);
    assert.equal(p.type, 'choice');
    assert.equal(approvals.select(p, re), digit);
    assert.equal(controls.answerPrompt(Number(approvals.select(p, re))), digit);
  });
}
test('approvals.select throws when no label matches', () => assert.throws(() => approvals.select(parsePrompt(presetScreen(0)), /Nope/), RangeError));
test('approvals.current shows the active sandbox preset', () => assert.equal(approvals.current(parsePrompt(presetScreen(2))), 'Full Access'));

// ---- prompts and status ----
test('parsePrompt: write_stdin title is a permission', () => {
  const p = parsePrompt(mk('Would you like to send input to the running process?', ['Yes, proceed', 'No, and tell Codex what to do differently']));
  assert.equal(p.type, 'permission');
  assert.equal(promptProblem(p), null);
});
test('parsePrompt: promptId is stable and differs by title', () => {
  assert.equal(execPrompt().promptId, execPrompt().promptId);
  const other = parsePrompt(mk('Would you like to make the following edits?', ['Yes', 'No']));
  assert.notEqual(other.promptId, execPrompt().promptId);
});
test('parsePrompt: ANSI-free screen with only a numbered list and no hint is not a prompt', () => assert.equal(parsePrompt('1. one\n2. two'), null));
for (const [s, want] of [
  ['• Working (59s • esc to interrupt)', { verb: 'Working', elapsedSec: 59, hint: 'esc to interrupt' }],
  ['◦ Working (1m 05s • esc to interrupt)', { verb: 'Working', elapsedSec: 65, hint: 'esc to interrupt' }],
  ['• Thinking (1h 02m 03s • esc to interrupt)', { verb: 'Thinking', elapsedSec: 3723, hint: 'esc to interrupt' }],
]) test(`parseStatus ${s}`, () => assert.deepEqual(parseStatus(s), want));
test('parseStatus ignores a bare "(5s)" line without a glyph', () => assert.equal(parseStatus('Working (5s)'), null));

// ---- mapper over crafted records ----
test('exec approval policy and sandbox in turn_context become mode meta', () => {
  const m = createCodexMapper(); const st = {};
  m.mapLine(line({ turn_id: 't', model: 'gpt-x', approval_policy: 'on-request', sandbox_policy: { type: 'workspace-write' }, collaboration_mode: { mode: 'plan' } }, 'turn_context'), st);
  assert.match(m.meta(st).mode, /on-request/);
  assert.match(m.meta(st).mode, /workspace-write/);
  assert.match(m.meta(st).mode, /plan/);
});
test('a sandbox change between turns emits a validated notice', () => {
  const ctx = (sb) => line({ turn_id: 't', model: 'gpt-x', approval_policy: 'on-request', sandbox_policy: { type: sb }, collaboration_mode: { mode: 'default' } }, 'turn_context');
  const items = map(ctx('read-only'), ctx('danger-full-access'));
  const n = items.filter((i) => i.kind === 'notice');
  assert.ok(n.length >= 1, 'notice for the sandbox change');
  for (const i of n) assert.equal(itemProblem(i), null);
  assert.match(n.map((i) => i.text).join(' '), /danger-full-access/);
});
test('CommandExecution exit code maps to ok and error', () => {
  const cmd = (id, code) => line({ type: 'item_completed', item: { type: 'CommandExecution', id, command: 'ls', aggregated_output: '', exit_code: code, status: code ? 'failed' : 'completed', duration: { secs: 0, nanos: 0 }, cwd: '/w' } });
  const [a, b] = map(cmd('c1', 0), cmd('c2', 2)).filter((i) => i.kind === 'tool');
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'error');
  assert.equal(itemProblem(a), null);
});
test('task_complete error becomes an error notice', () => {
  const [n] = map(line({ type: 'task_complete', error: 'upstream failed' }));
  assert.equal(n.kind, 'notice');
  assert.equal(n.level, 'error');
  assert.equal(itemProblem(n), null);
});
test('mapper drops an empty reasoning item', () => assert.deepEqual(map(line({ type: 'item_completed', item: { type: 'Reasoning', id: 'r', summary_text: [], raw_content: [] } })), []));
test('mapper survives junk records without throwing', () => {
  const m = createCodexMapper(); const st = {};
  for (const r of [{}, { type: 'event_msg' }, { type: 'event_msg', payload: null }, line({ type: 'nope' }), 'x']) assert.doesNotThrow(() => m.mapLine(r, st));
});

// ---- controls ----
test('every codex control key is a model control', () => { for (const k of Object.keys(controls)) assert.ok(CONTROLS.includes(k), k); });
test('approvals is not part of controls (key set pinned to CONTROLS)', () => assert.equal('approvals' in controls, false));
test('setMode: presets go through /permissions, plan/default through shift+tab', () => {
  assert.equal(controls.setMode('full-access'), '/permissions\r');
  assert.equal(controls.setMode('plan'), '\x1b[Z');
});

// ---- coverage counts must not regress ----
const n = (k, v) => coverage.filter((r) => r[k] === v).length;
test('coverage counts: 35 elements, 25 in chat, 12 driven', () => {
  assert.equal(coverage.length, 35);
  assert.equal(n('shown', 'chat'), 25);
  assert.equal(n('driven', 'yes'), 12);
  assert.equal(n('driven', 'no'), 10);
  assert.equal(n('driven', 'n/a'), 13);
});
test('coverage: every chat-shown and driven row stays that way', () => {
  for (const el of ['exec approval dialog', 'patch approval dialog', 'permissions approval dialog', 'MCP elicitation dialog', 'request_user_input question']) {
    const r = coverage.find((x) => x.element === el);
    assert.deepEqual([r.shown, r.driven], ['chat', 'yes'], el);
  }
});
test('coverage: the permissions row names the approvals driver', () => assert.match(coverage.find((r) => r.element === 'permissions approval dialog').how, /approvals\.decide/));

// ---- what only a real recording can settle ----
test.todo('record codex /permissions: popup title, the exact preset labels (assumed Read Only / Default permissions / Full Access), and whether a digit or arrow+Enter selects');
test.todo('record codex trust-directory dialog: exact title text and whether a digit key answers it (parsePrompt wording is from memory)');
test.todo('record codex ctrl+v image paste and launch -i: the screen text of the attachment chip, to drive the image attachment row');
test.todo('record /resume and /fork pickers: row format and selection keys, to map them into chat');
test.todo('record /status and /usage panels: layout, to parse them into usage/meta items');
test.todo('record /diff, /copy, /export overlays: how they render and which key closes them');
