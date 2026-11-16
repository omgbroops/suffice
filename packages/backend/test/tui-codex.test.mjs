import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCodexMapper, parsePatch, parsePrompt, controls, coverage } from '../src/tui/codex.mjs';
import { itemProblem, promptProblem } from '../src/tui/model.mjs';

const fx = (n) => readFileSync(new URL(`./fixtures/tui-codex/${n}`, import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
function run(file) {
  const m = createCodexMapper();
  const state = {};
  const items = fx(file).flatMap((o) => m.mapLine(o, state));
  return { m, state, items };
}
const byId = (items, id) => items.filter((i) => i.id === id);

test('every item from both fixtures passes itemProblem', () => {
  for (const f of ['item-mode.jsonl', 'legacy.jsonl']) {
    const { items } = run(f);
    assert.ok(items.length > 8, f);
    for (const it of items) assert.equal(itemProblem(it), null, JSON.stringify(it));
  }
});

test('item mode covers every kind and drops injected/empty/duplicate content', () => {
  const { items } = run('item-mode.jsonl');
  const kinds = new Set(items.map((i) => i.kind));
  for (const k of ['user', 'assistant', 'thinking', 'tool', 'todo', 'subagent', 'notice', 'usage']) assert.ok(kinds.has(k), k);
  const users = items.filter((i) => i.kind === 'user');
  assert.equal(users.length, 1);
  assert.equal(users[0].text, 'hello there');
  assert.equal(users[0].attachments[0].type, 'image');
  assert.equal(items.filter((i) => i.kind === 'thinking').length, 1);
  assert.equal(items.filter((i) => i.kind === 'assistant').length, 1);
  assert.ok(!items.some((i) => i.text === 'dup of item mode'));
});

test('exec: shell wrapper stripped, exit code decides status', () => {
  const { items } = run('item-mode.jsonl');
  const ok = items.find((i) => i.callId === 'c1');
  assert.equal(ok.category, 'shell');
  assert.equal(ok.title, 'ls -la');
  assert.equal(ok.status, 'ok');
  assert.equal(ok.output.exitCode, 0);
  assert.equal(ok.output.text, 'ok');
  const bad = items.find((i) => i.callId === 'c2');
  assert.equal(bad.status, 'error');
  assert.equal(bad.output.exitCode, 1);
});

test('legacy exec begin/end pair on the same id; non-zero exit is an error', () => {
  const { items } = run('legacy.jsonl');
  const x = items.filter((i) => i.callId === 'x1');
  assert.equal(x.length, 2);
  assert.equal(x[0].id, x[1].id);
  assert.equal(x[0].status, 'running');
  assert.equal(x[1].status, 'error');
  assert.equal(x[1].output.exitCode, 3);
  assert.equal(x[1].title, 'exit 3');
});

test('multi-file patch: add, update, delete, move (ThreadItem)', () => {
  const { items } = run('item-mode.jsonl');
  const p = items.find((i) => i.callId === 'f1');
  assert.equal(p.category, 'edit');
  const d = Object.fromEntries(p.output.diff.map((e) => [e.path, e]));
  assert.equal(d['a.txt'].op, 'add');
  assert.equal(d['a.txt'].newText, 'new file');
  assert.equal(d['b.txt'].op, 'update');
  assert.match(d['b.txt'].patch, /\+y/);
  assert.equal(d['c.txt'].op, 'delete');
  assert.equal(d['c.txt'].oldText, 'old');
  assert.equal(d['d.txt'].op, 'move');
  assert.equal(d['d.txt'].moveTo, 'e.txt');
});

test('multi-file apply_patch text grammar, and late output keeps id and diff', () => {
  const { items } = run('legacy.jsonl');
  const ap = items.filter((i) => i.callId === 'ap1');
  assert.equal(ap.length, 2);
  assert.equal(ap[0].id, ap[1].id);
  assert.equal(ap[0].status, 'running');
  assert.equal(ap[1].status, 'ok');
  const d = Object.fromEntries(ap[1].output.diff.map((e) => [e.path, e]));
  assert.deepEqual(Object.keys(d), ['n.txt', 'u.txt', 'd.txt', 'm.txt']);
  assert.equal(d['n.txt'].op, 'add');
  assert.equal(d['n.txt'].newText, 'hi\nthere');
  assert.equal(d['u.txt'].op, 'update');
  assert.match(d['u.txt'].patch, /\+b/);
  assert.equal(d['d.txt'].op, 'delete');
  assert.equal(d['m.txt'].op, 'move');
  assert.equal(d['m.txt'].moveTo, 'm2.txt');
  assert.equal(parsePatch('garbage').length, 0);
});

test('plan update becomes todo with mapped statuses', () => {
  const { items } = run('item-mode.jsonl');
  const t = items.find((i) => i.kind === 'todo');
  assert.deepEqual(t.items.map((x) => x.status), ['done', 'active', 'pending']);
});

test('mcp, web, image view, subagent', () => {
  const { items } = run('item-mode.jsonl');
  const mcp = items.find((i) => i.callId === 'm1');
  assert.equal(mcp.category, 'mcp');
  assert.equal(mcp.name, 'srv.look');
  assert.equal(mcp.output.text, 'found');
  assert.equal(items.find((i) => i.callId === 'm2').status, 'error');
  const web = items.find((i) => i.callId === 'w1');
  assert.equal(web.category, 'web');
  assert.equal(web.title, 'node test runner');
  assert.equal(items.find((i) => i.callId === 'w2').category, 'other');
  assert.equal(items.find((i) => i.callId === 'iv1').category, 'read');
  const sub = items.filter((i) => i.kind === 'subagent');
  assert.equal(sub.length, 2);
  assert.equal(sub[0].childSessionId, 'th-2');
  const lm = run('legacy.jsonl').items.filter((i) => i.callId === 'mc1');
  assert.deepEqual(lm.map((i) => i.status), ['running', 'ok']);
  assert.equal(lm[0].id, lm[1].id);
  assert.equal(lm[1].output.text, 'fine');
});

test('usage, rate limit, compaction, abort, error, model/mode change notices', () => {
  const { items, m, state } = run('item-mode.jsonl');
  const u = items.find((i) => i.kind === 'usage');
  assert.equal(u.inputTokens, 100);
  assert.equal(u.cacheReadTokens, 40);
  const codes = items.filter((i) => i.kind === 'notice').map((i) => i.code);
  for (const c of ['rate_limit', 'compacted', 'interrupted', 'error', 'model_changed', 'mode_changed']) assert.ok(codes.includes(c), c);
  assert.equal(items.filter((i) => i.code === 'compacted').length, 2);
  const meta = m.meta(state);
  assert.deepEqual(meta, { agent: 'codex', model: 'gpt-y', mode: 'never', cwd: '/work/demo', branch: 'feat-x', contextUsedPct: 25, sessionId: 'sess-1' });
});

test('unknown line types never throw and emit nothing; hostile input is safe', () => {
  const m = createCodexMapper();
  const s = {};
  for (const bad of [null, undefined, 5, 'x', {}, { type: 'zzz', payload: 5 }, { type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Nope' } } }, { type: 'response_item', payload: { type: 'function_call', name: 'update_plan', arguments: '{bad' } }]) {
    assert.deepEqual(m.mapLine(bad, s), []);
  }
});

test('state is per caller: two sessions do not share meta', () => {
  const m = createCodexMapper();
  const a = {}; const b = {};
  m.mapLine({ timestamp: '2026-01-01T00:00:00Z', type: 'session_meta', payload: { cwd: '/a' } }, a);
  assert.equal(m.meta(b).cwd, undefined);
  assert.equal(m.meta(a).cwd, '/a');
});

test('parsePrompt: exec approval', () => {
  const screen = [
    '  Would you like to run the following command?',
    '',
    '  Reason: needs network',
    '  $ curl example.com',
    '',
    '› 1. Yes, proceed  (y)',
    '  2. Yes, and don\'t ask again for commands that start with `curl`  (p)',
    '  3. No, and tell Codex what to do differently  (esc)',
    '',
    '  Press enter to confirm or esc to cancel',
  ].join('\n');
  const p = parsePrompt(screen);
  assert.equal(promptProblem(p), null);
  assert.equal(p.type, 'permission');
  assert.equal(p.title, 'Would you like to run the following command?');
  assert.equal(p.options.length, 3);
  assert.equal(p.options[0].label, 'Yes, proceed');
  assert.equal(p.options[0].hotkey, '(y)');
  assert.equal(p.selected, 0);
  assert.match(p.body, /curl example.com/);
});

test('parsePrompt: patch, permissions, mcp titles and a moved selection', () => {
  const mk = (title, rows, sel = 0) => [title, '', ...rows.map((r, i) => `${i === sel ? '›' : ' '} ${i + 1}. ${r}`)].join('\n');
  const patch = parsePrompt(mk('Would you like to make the following edits?', ['Yes, proceed', 'Yes, and don\'t ask again for these files', 'No, and tell Codex what to do differently'], 2));
  assert.equal(promptProblem(patch), null);
  assert.equal(patch.selected, 2);
  const perm = parsePrompt(mk('Would you like to grant these permissions?', ['Yes, grant these permissions for this turn', 'No, continue without permissions']));
  assert.equal(perm.type, 'permission');
  const mcp = parsePrompt(mk('srv needs your approval.', ['Yes, provide the requested info', 'No, but continue without it', 'Cancel this request']));
  assert.equal(mcp.type, 'permission');
  assert.equal(mcp.title, 'srv needs your approval.');
  assert.equal(promptProblem(mcp), null);
});

test('parsePrompt: choice screen, trust assumption, and non-prompts return null', () => {
  const choice = parsePrompt('Which style?\n› 1. Compact\n  2. Detailed\n\nenter to submit, esc to cancel');
  assert.equal(promptProblem(choice), null);
  assert.equal(choice.type, 'choice');
  assert.equal(choice.options[1].label, 'Detailed');
  const trust = parsePrompt('Do you trust the contents of this directory?\n› 1. Yes, continue\n  2. No, quit');
  assert.equal(trust.type, 'trust');
  assert.equal(parsePrompt('just a normal chat screen\n> prompt'), null);
  assert.equal(parsePrompt(''), null);
  assert.equal(parsePrompt(undefined), null);
});

test('controls emit exact bytes', () => {
  assert.equal(controls.interrupt(), '\x1b');
  assert.equal(controls.answerPrompt(2), '2');
  assert.equal(controls.setMode('plan'), '\x1b[Z');
  assert.equal(controls.setModel('gpt-x'), '/model gpt-x\r');
  assert.equal(controls.slash('/status'), '/status\r');
  assert.equal(controls.slash('mcp', 'list'), '/mcp list\r');
  assert.equal(controls.compact(), '/compact\r');
  assert.equal(controls.clear(), '/clear\r');
});

test('coverage table is complete', () => {
  assert.ok(coverage.length >= 30);
  for (const r of coverage) {
    assert.ok(r.element?.trim(), 'element');
    assert.ok(['chat', 'terminal-only'].includes(r.shown), r.element);
    assert.ok(['yes', 'no', 'n/a'].includes(r.driven), r.element);
    assert.ok(r.how?.trim().length > 5, `how empty: ${r.element}`);
  }
  assert.equal(new Set(coverage.map((r) => r.element)).size, coverage.length);
  assert.ok(coverage.some((r) => r.shown === 'terminal-only') && coverage.some((r) => r.shown === 'chat'));
});

import { parseStatus as codexStatus } from '../src/tui/codex.mjs';

test('codex parseStatus: working line variants', () => {
  assert.deepEqual(codexStatus('out\n• Working (12s • esc to interrupt)\n\n› prompt'), { verb: 'Working', elapsedSec: 12, hint: 'esc to interrupt' });
  assert.deepEqual(codexStatus('Working (1m 05s • esc to interrupt) · hook ran'), { verb: 'Working', elapsedSec: 65, hint: 'esc to interrupt' });
  assert.deepEqual(codexStatus('◦ Thinking (1h 02m 03s)'), { verb: 'Thinking', elapsedSec: 3723 });
});

test('codex parseStatus: idle and look-alikes give null', () => {
  assert.equal(codexStatus(''), null);
  assert.equal(codexStatus('› Ask Codex\n  ? for shortcuts'), null);
  assert.equal(codexStatus('Done (12s)'), null); // no hint, no glyph
  assert.equal(codexStatus('lowercase text (12s • esc to interrupt)'), null);
});
