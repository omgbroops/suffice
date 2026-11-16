import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseModeLine, parseQueued, parseInputDraft, parseBackgroundTasks, parseContextWarning, parsePicker } from '../src/tui/screenparts.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tui-screens');
const fx = (n) => fs.readFileSync(path.join(dir, n), 'utf8');
const ALL = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));

test('parseModeLine', () => {
  assert.deepEqual(parseModeLine(fx('mode-accept.txt')), { agent: 'claude', mode: 'acceptEdits', hint: 'shift+tab to cycle' });
  assert.equal(parseModeLine(fx('mode-plan.txt')).mode, 'plan');
  assert.equal(parseModeLine('\x1b[2m  ⏵⏵ bypass permissions on\x1b[0m\n').mode, 'bypassPermissions');
  assert.equal(parseModeLine('  ⏵⏵ auto mode on (shift+tab to cycle)\n').mode, 'auto');
  assert.equal(parseModeLine(fx('mode-lookalike.txt')), null);
  assert.equal(parseModeLine(fx('spinner.txt')), null);
  assert.equal(parseModeLine(''), null);
  assert.equal(parseModeLine(undefined), null);
});

test('parseQueued', () => {
  assert.deepEqual(parseQueued(fx('queued.txt')), { messages: ['also run the tests', 'then commit'] });
  assert.equal(parseQueued(fx('queued-lookalike.txt')), null);
  assert.equal(parseQueued(' Queued messages\n\n no items\n'), null);
  assert.equal(parseQueued(fx('draft.txt')), null);
});

test('parseInputDraft', () => {
  assert.deepEqual(parseInputDraft(fx('draft.txt')), { text: 'refactor the parser' });
  assert.deepEqual(parseInputDraft(fx('draft-multiline.txt')), { text: 'line one\nline two' });
  assert.deepEqual(parseInputDraft(fx('draft-placeholder.txt')), { text: '', placeholder: true });
  assert.deepEqual(parseInputDraft(fx('mode-plan.txt')), { text: '' });
  assert.deepEqual(parseInputDraft('  ...\n› hello codex\n  gpt-x · ~/p\n'), { text: 'hello codex' });
  assert.equal(parseInputDraft(fx('spinner.txt')), null);
  assert.equal(parseInputDraft(fx('choice-ref.txt')), null); // a menu row is not a draft
  assert.equal(parseInputDraft(''), null);
});

test('parseBackgroundTasks', () => {
  assert.deepEqual(parseBackgroundTasks(fx('background.txt')), { count: 2, agent: 'claude' });
  assert.deepEqual(parseBackgroundTasks(' ok\n 1 background terminal running · /ps to view and /stop to close\n'), { count: 1, agent: 'codex' });
  assert.equal(parseBackgroundTasks(fx('background-lookalike.txt')), null);
  assert.equal(parseBackgroundTasks(fx('mode-accept.txt')), null);
});

test('parseContextWarning', () => {
  assert.deepEqual(parseContextWarning(fx('context-low.txt')), { kind: 'low', percentLeft: 6, hint: '/compact' });
  assert.deepEqual(parseContextWarning(fx('context-auto.txt')), { kind: 'auto-compact', percentLeft: 8 });
  assert.equal(parseContextWarning(fx('context-lookalike.txt')), null);
  assert.equal(parseContextWarning(''), null);
});

test('parsePicker accepts pickers', () => {
  const m = parsePicker(fx('picker-model.txt'));
  assert.equal(m.title, 'Select model');
  assert.deepEqual(m.options.map((o) => o.label), ['Default (recommended)', 'Opus', 'Sonnet', 'Haiku']);
  assert.equal(m.selected, 2);
  assert.equal(m.scrolls, true);
  const p = parsePicker(fx('picker-plain.txt'));
  assert.equal(p.title, 'Resume session');
  assert.equal(p.options.length, 3);
  assert.equal(p.selected, 1);
  assert.equal(p.scrolls, false);
  assert.equal(parsePicker(fx('choice-ref.txt')).title, 'Which database should we use?');
});

test('parsePicker rejects permission prompts and other screens', () => {
  for (const n of ['permission-ref.txt', 'plan-ref.txt', 'spinner.txt', 'draft.txt', 'queued.txt', 'mode-accept.txt']) assert.equal(parsePicker(fx(n)), null, n);
  assert.equal(parsePicker(' Pick one\n ❯ only\n Enter to select · Esc to cancel\n'), null); // 1 option
  assert.equal(parsePicker(' Pick one\n ❯ a\n   b\n'), null); // no nav hint
});

test('every parser returns null or a plain object on every fixture and never throws', () => {
  for (const n of ALL) for (const f of [parseModeLine, parseQueued, parseInputDraft, parseBackgroundTasks, parseContextWarning, parsePicker]) {
    const r = f(fx(n));
    assert.ok(r === null || (typeof r === 'object' && !Array.isArray(r)), `${f.name} ${n}`);
  }
});

test('parseModeLine reads the real recorded footer (manual mode = default)', () => {
  assert.deepEqual(parseModeLine('  Haiku 5.5 (medium) | USER:PROJECT\n  ⏸ manual mode on · ← for agents\n'), { agent: 'claude', mode: 'default', hint: undefined });
});
