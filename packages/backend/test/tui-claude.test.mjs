import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClaudeMapper } from '../src/tui/claude.mjs';
import { itemProblem, promptProblem, ITEM_KINDS, TOOL_CATEGORIES, NOTICE_CODES, PROMPT_TYPES, CONTROLS } from '../src/tui/model.mjs';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/tui-claude/${f}`, import.meta.url), 'utf8');
const ss = (f) => fs.readFileSync(new URL(`./fixtures/sessionstate/${f}`, import.meta.url), 'utf8');
const lines = fx('transcript.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const m = createClaudeMapper();

function runAll(mapper = m, state = mapper.newState()) {
  const emitted = lines.flatMap((l) => mapper.mapLine(l, state));
  const byId = new Map(emitted.map((i) => [i.id, i])); // latest wins, as the app replaces by id
  return { state, emitted, byId, items: [...byId.values()] };
}
const { state, emitted, byId, items } = runAll();
const snap = { sidechainSkipped: state.sidechainSkipped, queue: [...state.queue] }; // before any replay test mutates state
const of = (kind) => items.filter((i) => i.kind === kind);
const tool = (id) => byId.get(`tool:${id}`);

test('every emitted item is valid and ids are unique per final item', () => {
  for (const i of emitted) assert.equal(itemProblem(i), null, JSON.stringify(i));
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
});

test('item counts per kind', () => {
  const n = Object.fromEntries(ITEM_KINDS.map((k) => [k, of(k).length]));
  assert.deepEqual(n, { user: 4, assistant: 2, thinking: 2, tool: 14, todo: 1, subagent: 1, notice: 11, usage: 2 });
});

test('user items: text, command echo, bash echo, image + @file attachment', () => {
  const t = of('user').map((u) => u.text);
  assert.deepEqual(t, ['hello there', '/model opus', 'see @src/a.js', '!pwd']);
  const u = of('user')[2];
  assert.deepEqual(u.attachments, [{ type: 'image', name: 'image' }, { type: 'file', name: 'a.js', path: '/tmp/example-project/src/a.js' }]);
});

test('usage replaced by message id, last count wins', () => {
  const u = byId.get('usage:m1');
  assert.equal(u.outputTokens, 40);
  assert.equal(u.cacheReadTokens, 20000);
  assert.equal(emitted.filter((i) => i.id === 'usage:m1').length, 2);
});

test('a streamed message re-written under a new uuid emits its thinking again (tail files never replay)', () => {
  assert.deepEqual(emitted.filter((i) => i.kind === 'thinking').map((i) => i.id), ['u1:0', 'u2:0']);
});

test('tool statuses and categories', () => {
  const want = { c1: ['shell', 'ok'], c2: ['shell', 'error'], c3: ['edit', 'error'], c4: ['write', 'ok'], c5: ['read', 'ok'], c6: ['read', 'ok'], c7: ['search', 'ok'],
    c8: ['web', 'ok'], c9: ['web', 'ok'], c12: ['mcp', 'ok'], c13: ['other', 'running'], c14: ['shell', 'denied'], c15: ['shell', 'ok'], c16: ['other', 'ok'] };
  for (const [id, [cat, st]] of Object.entries(want)) assert.deepEqual([tool(id).category, tool(id).status], [cat, st], id);
});

test('shell output: stdout, exit codes', () => {
  assert.deepEqual(tool('c1').output, { text: 'a.txt\nb.txt', exitCode: 0 });
  assert.equal(tool('c2').output.exitCode, 3);
  assert.equal(tool('c1').title, 'ls -la');
});

test('write output carries a diff with patch', () => {
  const d = tool('c4').output.diff[0];
  assert.equal(d.path, '/tmp/example-project/b.js');
  assert.equal(d.patch, '@@ -1,0 +1,1 @@\n+new');
  assert.equal(tool('c3').output.diff[0].oldText, 'x');
});

test('image read never leaks base64, text read uses file content', () => {
  assert.equal(JSON.stringify(emitted).includes('B64MARKERDONOTLEAK'), false);
  assert.equal(JSON.stringify(emitted).includes('IMGMARK2'), false);
  assert.equal(tool('c6').output.text, '[image]');
  assert.equal(tool('c5').output.text, 'const a = 1;');
});

test('result arriving before its call is paired', () => {
  assert.equal(tool('c15').status, 'ok');
  assert.equal(tool('c15').output.text, 'early result');
});

test('mcp title, unknown tool, subagent, todo', () => {
  assert.equal(tool('c12').title, 'srv: do');
  assert.equal(tool('c16').name, 'FooBar');
  const s = byId.get('sub:c11');
  assert.deepEqual([s.name, s.status, s.childSessionId, s.prompt], ['reviewer', 'ok', 'ag1', 'check it']);
  assert.deepEqual(byId.get('todo:c10').items, [{ text: 'one', status: 'done' }, { text: 'two', status: 'active' }, { text: 'three', status: 'pending' }]);
});

test('notices by code', () => {
  const codes = of('notice').map((n) => n.code);
  const count = (c) => codes.filter((x) => x === c).length;
  assert.deepEqual({ i: count('interrupted'), c: count('compacted'), mc: count('model_changed'), md: count('mode_changed'), rl: count('rate_limit'), e: count('error'), o: count('other') },
    { i: 1, c: 1, mc: 2, md: 0, rl: 1, e: 2, o: 4 }); // o was 5 before task_status moved to meta.backgroundTasks
  assert.equal(of('notice').find((n) => n.code === 'compacted').text, 'Compacted: 150000 -> 20000 tokens');
  assert.match(of('notice').find((n) => n.durationMs !== undefined).text, /^\d+(s|m \d+s)$/);
});
test('mode: first seen is silent, a later change emits mode_changed', () => {
  const st = m.newState();
  const mk = (mode, t) => ({ type: 'permission-mode', permissionMode: mode, timestamp: `2026-11-15T11:00:0${t}.000Z` });
  assert.deepEqual(m.mapLine(mk('default', 1), st), []);
  const n = m.mapLine(mk('plan', 2), st);
  assert.deepEqual(n.map((i) => [i.code, i.text]), [['mode_changed', 'Mode: default -> plan']]);
  assert.equal(m.meta(st).mode, 'plan');
});

test('replaying every line into the same state emits nothing', () => {
  const again = lines.flatMap((l) => m.mapLine(l, state));
  // tool, todo and subagent items dedupe by id + content; state-driven notices and alternating usage may repeat
  assert.deepEqual(again.filter((i) => ['tool', 'todo', 'subagent', 'assistant'].includes(i.kind)), []);
});

test('sidechain skipped by default, tagged when included', () => {
  assert.equal(snap.sidechainSkipped, 1);
  assert.equal(JSON.stringify(emitted).includes('side text'), false);
  const r = runAll(createClaudeMapper({ includeSidechain: true }));
  const side = r.items.filter((i) => i.sidechain);
  assert.ok(side.some((i) => i.text === 'side text'));
  assert.ok(r.items.some((i) => !i.sidechain));
});

test('garbage input never throws', () => {
  const st = m.newState();
  for (const g of [null, undefined, 5, 'x', [], {}, { type: 'user' }, { type: 'user', message: { content: [null, 3, { type: 'tool_result' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use' }, null], usage: 7 } }, { type: 'system' }, { type: 'attachment' }, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'z', content: 9 }] } }])
    assert.ok(Array.isArray(m.mapLine(g, st)));
  assert.ok(Array.isArray(m.mapLine({ type: 'user' }, {}))); // a bare {} works as a state
});

test('meta', () => {
  assert.deepEqual(m.meta(state), { agent: 'claude', model: 'claude-opus-5-5', mode: 'plan', cwd: '/tmp/example-project', branch: 'main', sessionId: 's1', backgroundTasks: [{ id: 'att:u45', label: 'build', status: 'completed' }], contextUsedPct: 10 });
  assert.deepEqual(createClaudeMapper().meta({}), { agent: 'claude' });
});

test('queue-operation tracks the queue without an item', () => {
  assert.deepEqual(snap.queue, ['later']);
});

// ---- prompts ----
const P = (t) => m.parsePrompt(t);
test('parsePrompt: trust dialog fixture', () => {
  const p = P(ss('claude-trust.txt'));
  assert.equal(promptProblem(p), null);
  assert.deepEqual([p.type, p.selected, p.options.map((o) => o.label)], ['trust', 0, ['No, exit', 'Yes, I trust this folder']]);
  assert.equal(p.options[0].hotkey, undefined);
});
test('parsePrompt: permission fixture without a marker', () => {
  const p = P(ss('claude-permission.txt'));
  assert.equal(promptProblem(p), null);
  assert.equal(p.type, 'permission');
  assert.equal(p.title, 'Do you want to make this edit to a.js?');
  assert.deepEqual(p.options.map((o) => o.label), ['Yes', "Yes, and don't ask again this session", 'No']);
  assert.equal(p.selected, 0);
});
test('parsePrompt: bash permission with marker', () => {
  const p = P(fx('permission-bash.txt'));
  assert.equal(promptProblem(p), null);
  assert.deepEqual([p.type, p.title, p.options.length, p.selected], ['permission', 'Do you want to proceed?', 3, 0]);
  assert.match(p.body, /rm -rf build/);
});
test('parsePrompt: plan approval ignores the numbered plan above', () => {
  const p = P(fx('plan.txt'));
  assert.equal(promptProblem(p), null);
  assert.deepEqual([p.type, p.options.map((o) => o.label)], ['choice', ['Yes, and bypass permissions', 'Yes, manually approve edits', 'No, keep planning']]);
});
test('parsePrompt: question dialog', () => {
  const p = P(fx('choice.txt'));
  assert.equal(promptProblem(p), null);
  assert.deepEqual([p.type, p.title, p.options.map((o) => o.label)], ['choice', 'Which database should we use?', ['SQLite', 'Postgres', 'Other']]);
});
test('parsePrompt: marker on a later row sets selected; id is stable and content-based', () => {
  const t = fx('choice.txt').replace('❯ 1.', '  1.').replace('  2. Postgres', '❯ 2. Postgres');
  assert.equal(P(t).selected, 1);
  assert.equal(P(fx('choice.txt')).promptId, P(fx('choice.txt')).promptId);
  assert.notEqual(P(fx('choice.txt')).promptId, P(fx('plan.txt')).promptId);
});
test('parsePrompt: ordinary screens give null', () => {
  for (const f of ['claude-idle.txt', 'claude-working.txt', 'generic-permission.txt']) assert.equal(P(ss(f)), null, f);
  assert.equal(P(''), null);
  assert.equal(P(undefined), null);
  assert.equal(P('1. a list in the assistant answer\n2. with two items'), null);
});

// ---- controls ----
const b = (r) => Buffer.from(r.bytes).toString('latin1');
test('interrupt is Esc', () => assert.equal(b(m.controls.interrupt()), '\x1b'));
test('answerPrompt: hotkey, arrows down, arrows up, same row', () => {
  const num = P(fx('plan.txt'));
  assert.equal(b(m.controls.answerPrompt(num, 2)), '3');
  const trust = P(ss('claude-trust.txt'));
  assert.equal(b(m.controls.answerPrompt(trust, 1)), '\x1b[B\r');
  assert.equal(b(m.controls.answerPrompt(trust, 0)), '\r');
  const down = { ...trust, selected: 1 };
  assert.equal(b(m.controls.answerPrompt(down, 0)), '\x1b[A\r');
  assert.throws(() => m.controls.answerPrompt(trust, 5), RangeError);
});
test('setMode counts Shift+Tab presses over the cycle', () => {
  const c = m.controls.setMode;
  assert.equal(b(c('default', 'default')), '');
  assert.equal(b(c('default', 'plan')), '\x1b[Z\x1b[Z');
  assert.equal(b(c('plan', 'default')), '\x1b[Z');
  assert.equal(b(c('plan', 'default', { bypass: true })), '\x1b[Z\x1b[Z');
  assert.equal(b(c('default', 'auto', { bypass: true, auto: true })), '\x1b[Z'.repeat(4));
  assert.throws(() => c('default', 'bypassPermissions'), RangeError);
  assert.throws(() => c('dontAsk', 'plan'), RangeError);
});
test('typed controls reject control characters and format commands', () => {
  const c = m.controls;
  assert.equal(b(c.setModel('opus')), '/model opus\r');
  assert.equal(b(c.slash('cost')), '/cost\r');
  assert.equal(b(c.slash('/cost')), '/cost\r');
  assert.equal(b(c.compact()), '/compact\r');
  assert.equal(b(c.compact('keep tests')), '/compact keep tests\r');
  assert.equal(b(c.clear()), '/clear\r');
  assert.equal(b(c.attach('src/a.js')), '@src/a.js ');
  for (const bad of ['x\r/exit', 'x\x1b[A', 'a\nb']) {
    assert.throws(() => c.setModel(bad), RangeError);
    assert.throws(() => c.slash(bad), RangeError);
    assert.throws(() => c.compact(bad), RangeError);
    assert.throws(() => c.attach(bad), RangeError);
  }
});

// ---- coverage ----
const cov = m.coverage;
test('controls keys equal CONTROLS', () => assert.deepEqual(Object.keys(m.controls).sort(), [...CONTROLS].sort()));
test('coverage rows are complete and map every model entry', () => {
  for (const r of cov) { assert.ok(r.element && r.how, r.element); assert.ok(['chat', 'terminal-only'].includes(r.shown)); assert.ok(['yes', 'no', 'n/a'].includes(r.driven)); }
  assert.equal(new Set(cov.map((r) => r.element)).size, cov.length);
  const maps = new Set(cov.flatMap((r) => r.maps.split(' ').filter(Boolean)));
  const need = [...ITEM_KINDS.map((k) => `item:${k}`), ...TOOL_CATEGORIES.map((k) => `tool:${k}`), ...NOTICE_CODES.map((k) => `notice:${k}`),
    ...PROMPT_TYPES.filter((k) => k !== 'text').map((k) => `prompt:${k}`), ...CONTROLS.map((k) => `control:${k}`)];
  assert.deepEqual(need.filter((k) => !maps.has(k)), []);
  assert.deepEqual([...maps].filter((k) => !need.includes(k)), []);
});
test('coverage totals', () => {
  const chat = cov.filter((r) => r.shown === 'chat'), term = cov.filter((r) => r.shown === 'terminal-only');
  assert.deepEqual([cov.length, chat.length, term.length, cov.filter((r) => r.driven === 'yes').length], [49, 39, 10, 10]);
  assert.ok(term.every((r) => r.driven === 'no'));
});

import { parseStatus } from '../src/tui/claude.mjs';
import { statusProblem } from '../src/tui/model.mjs';

test('parseStatus: spinner row variants', () => {
  const cases = [
    ['✽ Newspapering… (6s · ↓ 388 tokens · thought for 4s)', { verb: 'Newspapering', elapsedSec: 6, tokens: 388, tokenDirection: 'down', thoughtSec: 4 }],
    ['✻ Pondering… (1m 6s · ↑ 1.2k tokens)', { verb: 'Pondering', elapsedSec: 66, tokens: 1200, tokenDirection: 'up' }],
    ['* Thinking… (12s · esc to interrupt)', { verb: 'Thinking', elapsedSec: 12, hint: 'esc to interrupt' }],
    ['· Running… (esc to interrupt · 3s · ↓ 5 tokens)', { verb: 'Running', elapsedSec: 3, tokens: 5, tokenDirection: 'down', hint: 'esc to interrupt' }],
    ['\x1b[38;5;174m✶\x1b[39m Cogitating… (2s)', { verb: 'Cogitating', elapsedSec: 2 }],
  ];
  for (const [line, want] of cases) {
    const got = parseStatus(`some output\n\n${line}\n\n╭────╮\n│ > │\n╰────╯\n  ? for shortcuts`);
    assert.deepEqual(got, want, line);
    assert.equal(statusProblem(got), null);
  }
});

test('parseStatus: idle and look-alike screens give null', () => {
  assert.equal(parseStatus(''), null);
  assert.equal(parseStatus(undefined), null);
  assert.equal(parseStatus('╭────╮\n│ > │\n╰────╯\n  ? for shortcuts'), null);
  assert.equal(parseStatus('The build finished… (3s) and then stopped'), null);
  assert.equal(parseStatus('Loading… (6s · ↓ 388 tokens)'), null); // no spinner glyph
  assert.equal(parseStatus('✽ Note… (see docs)'), null); // glyph but nothing recognised
  assert.equal(parseStatus('✽ Newspapering… (6s)\n' + 'x\n'.repeat(20)), null); // scrolled out of the last 12 lines
});

test('statusProblem rejects bad shapes', () => {
  assert.ok(statusProblem(null));
  assert.ok(statusProblem({ verb: '', elapsedSec: 1 }));
  assert.ok(statusProblem({ verb: 'A', elapsedSec: -1 }));
  assert.ok(statusProblem({ verb: 'A', elapsedSec: 1, tokenDirection: 'left' }));
  assert.equal(statusProblem({ verb: 'A', elapsedSec: 0 }), null);
});

test('subagent item carries description, agentId and result stats', () => {
  const st = m.newState();
  const mk = (o) => m.mapLine({ timestamp: '2026-01-01T00:00:00Z', ...o }, st);
  mk({ type: 'assistant', uuid: 'a', message: { id: 'm', role: 'assistant', content: [{ type: 'tool_use', id: 'tu', name: 'Task', input: { subagent_type: 'Explore', description: 'Find typos', prompt: 'p' } }] } });
  const out = mk({ type: 'user', uuid: 'u', toolUseResult: { agentId: 'abc', totalToolUseCount: 3, totalTokens: 900, totalDurationMs: 4000 }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu', content: 'done' }] } });
  const it = out.find((i) => i.kind === 'subagent');
  assert.equal(itemProblem(it), null);
  assert.deepEqual([it.description, it.agentId, it.totalToolUseCount, it.totalTokens, it.totalDurationMs], ['Find typos', 'abc', 3, 900, 4000]);
});

test('parsePrompt: spinner line above the dialog is not in the body', () => {
  const p = P(['Edit file', '', '✻ Newspapering… (6s · ↓ 388 tokens · thought for 4s)', '', ' Do you want to make this edit?', ' ❯ 1. Yes', '   2. No'].join('\n'));
  assert.equal(p.title, 'Do you want to make this edit?');
  assert.equal(p.body, 'Edit file');
});

// ---- real recordings + synthetic lines for the transcript/screen gaps ----
import { parseTurnFooter, mapperHealth } from '../src/tui/claude.mjs';
const REAL = new URL('./fixtures/tui-real/claude/', import.meta.url);
const realLines = (d) => fs.readFileSync(new URL(`${d}/transcript.jsonl`, REAL), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const realScreen = (d, f) => fs.readFileSync(new URL(`${d}/screens/${f}`, REAL), 'utf8');
const runLines = (ls) => { const mm = createClaudeMapper(); const st = mm.newState(); const em = ls.flatMap((l) => mm.mapLine(l, st)); return { mm, st, em, items: [...new Map(em.map((i) => [i.id, i])).values()] }; };
const runReal = (d) => runLines(realLines(d));
const ts = (n) => new Date(1.7e12 + n * 1000).toISOString();

test('item 1: mode lines go to meta.uiMode; permission-mode drives meta.mode; one mode_changed in plan-mode', () => {
  const r = runReal('plan-mode');
  const mc = r.items.filter((i) => i.code === 'mode_changed');
  assert.equal(mc.length, 1);
  assert.equal(mc[0].text, 'Mode: plan -> auto');
  assert.equal(r.mm.meta(r.st).mode, 'auto');
  assert.equal(r.mm.meta(r.st).uiMode, 'normal'); // another axis; feeding it to meta.mode would flip against permission-mode
  assert.equal(runReal('read-search').items.filter((i) => i.code === 'mode_changed').length, 0);
  const s = runLines([{ type: 'mode', mode: 'normal', timestamp: ts(1) }, { type: 'mode', mode: 'vim', timestamp: ts(2) }]);
  assert.equal(s.em.length, 0);
  assert.equal(s.mm.meta(s.st).uiMode, 'vim');
});

test('item 2: one timing notice per turn "<n>s"/"<m>m <n>s"; parseTurnFooter reads any verb', () => {
  for (const d of ['read-search', 'plan-mode', 'bash-allow']) {
    const want = realLines(d).filter((l) => l.type === 'system' && l.subtype === 'turn_duration').length;
    const got = runReal(d).items.filter((i) => i.durationMs !== undefined);
    assert.equal(got.length, want, d);
    assert.ok(want > 0 && got.every((n) => /^\d+(s|m \d+s)$/.test(n.text)), d);
  }
  const t = runLines([{ type: 'system', subtype: 'turn_duration', durationMs: 65000, uuid: 'x', timestamp: ts(1) }]);
  assert.deepEqual(t.em.map((n) => n.text), ['1m 5s']);
  assert.deepEqual(parseTurnFooter('x\n✻ Sautéed for 2s · done 12:13 AM\n❯'), { verb: 'Sautéed', seconds: 2 });
  assert.deepEqual(parseTurnFooter('✻ Brewed for 1m 5s · done 12:17 AM'), { verb: 'Brewed', seconds: 65 });
  assert.ok(parseTurnFooter(realScreen('ask-question', '11-idle.txt')).seconds > 0);
  assert.equal(parseTurnFooter('Cogitated for 2s'), null);
  assert.equal(parseTurnFooter(realScreen('model-switch', '07-help.txt')), null);
});

test('item 3: task notices go to meta.backgroundTasks, attachments to the next user item, the rest is counted', () => {
  const user = (id, text, n) => ({ type: 'user', uuid: id, timestamp: ts(n), message: { role: 'user', content: text } });
  const att = (id, a, n) => ({ type: 'attachment', uuid: id, timestamp: ts(n), attachment: a });
  const r = runLines([
    user('u1', '<task-notification><task-id>bg1</task-id><status>running</status><summary>Build started</summary></task-notification>', 1),
    user('u2', '<task-notification><task-id>bg1</task-id><status>completed</status><summary>Build done</summary></task-notification>', 2),
    att('a1', { type: 'task_status', taskId: 'bg2', description: 'lint', status: 'running' }, 3),
    { type: 'assistant', uuid: 'as1', timestamp: ts(4), message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'ok' }] } },
    att('a2', { type: 'file', filename: '/p/x.js' }, 5),
    att('a3', { type: 'image', filename: 'shot.png' }, 6),
    att('a4', { type: 'skill_listing' }, 7), att('a6', { type: 'plan_mode' }, 9),
    { type: 'system', subtype: 'weird', uuid: 's1', timestamp: ts(10) },
    user('u3', 'next', 11),
  ]);
  assert.equal(r.items.filter((i) => i.kind === 'notice').length, 0);
  assert.deepEqual(r.mm.meta(r.st).backgroundTasks.map((t) => t.id).sort(), ['bg1', 'bg2']);
  assert.equal(r.mm.meta(r.st).backgroundTasks.find((t) => t.id === 'bg1').status, 'completed');
  assert.equal(r.items.find((i) => i.kind === 'user').attachments.length, 2);
  assert.deepEqual(r.st.dropped, { 'attachment.skill_listing': 1, 'attachment.plan_mode': 1, 'system.weird': 1 });
});

test('item 4: AskUserQuestion, ExitPlanMode and housekeeping tools on real recordings', () => {
  const q = runReal('ask-question').items.find((i) => i.name === 'AskUserQuestion');
  assert.equal(q.category, 'other');
  assert.ok(Array.isArray(q.input.questions) && q.input.questions.length > 0);
  assert.equal(q.output.answer, 'Red');
  const p = runReal('plan-mode').items;
  const e = p.find((i) => i.name === 'ExitPlanMode');
  assert.equal(e.title, 'Plan');
  assert.equal(e.output.decision, 'approved');
  assert.equal(typeof e.output.plan, 'string');
  const ts1 = p.filter((i) => i.name === 'ToolSearch');
  assert.ok(ts1.length > 0 && ts1.every((i) => i.category === 'other' && i.internal === true));
  const rej = runLines([
    { type: 'assistant', uuid: 'a', timestamp: ts(1), message: { id: 'm', role: 'assistant', content: [{ type: 'tool_use', id: 'p1', name: 'ExitPlanMode', input: { plan: 'do x' } }] } },
    { type: 'user', uuid: 'b', timestamp: ts(2), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'p1', is_error: true, content: "The user doesn't want to proceed" }] } },
  ]).items.find((i) => i.kind === 'tool');
  assert.deepEqual([rej.output.decision, rej.output.plan], ['rejected', 'do x']);
});

test('item 5: every non-empty thinking block yields exactly one item; empty and signature-only yield none', () => {
  const think = (uuid, text, extra = {}) => ({ type: 'assistant', uuid, timestamp: ts(1), message: { id: 'm1', role: 'assistant', content: [{ type: 'thinking', thinking: text, signature: 'sig', ...extra }] } });
  const sameUuid = [think('a', 'T1'), { type: 'assistant', uuid: 'a', timestamp: ts(2), message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'hello' }] } }, think('a', 'T2')];
  const noUuid = [{ ...think('', 'N1'), uuid: undefined }, { ...think('', 'N2'), uuid: undefined }];
  for (const [ls, want] of [[sameUuid, ['T1', 'T2']], [noUuid, ['N1', 'N2']]]) {
    const r = runLines(ls);
    assert.deepEqual(r.items.filter((i) => i.kind === 'thinking').map((i) => i.text), want);
    assert.equal(r.items.length, new Set(r.items.map((i) => i.id)).size);
    assert.equal(ls.flatMap((l) => r.mm.mapLine(l, r.st)).length, 0); // replayed lines de-dup
  }
  assert.equal(runLines(sameUuid).items.filter((i) => i.kind === 'assistant').length, 1);
  const none = runLines([think('e', ''), think('f', '   '), { type: 'assistant', uuid: 'g', timestamp: ts(1), message: { id: 'm', role: 'assistant', content: [{ type: 'redacted_thinking', data: 'zz' }] } }]);
  assert.equal(none.items.length, 0);
});

test('item 6: ai-title, agent-name, cost-state, file-history-delta; the rest is dropped and counted', () => {
  const r = runLines([
    { type: 'ai-title', aiTitle: 'Fix the parser' }, { type: 'agent-name', agentName: 'reviewer' }, { type: 'cost-state', totalCostUSD: 0.42 },
    { type: 'file-history-delta', messageId: 'a' }, { type: 'file-history-delta', messageId: 'b' },
    { type: 'last-prompt', leafUuid: 'x' }, { type: 'tools-used', tools: [] }, { type: 'api-request', a: 1 }, { type: 'api-request-blob' }, { type: 'api-request-blob' },
  ]);
  assert.equal(r.em.length, 0);
  const mt = r.mm.meta(r.st);
  assert.deepEqual([mt.title, mt.agentName, mt.costUsd], ['Fix the parser', 'reviewer', 0.42]);
  assert.equal(r.st.fileHistory, 2);
  assert.deepEqual(r.st.dropped, { 'last-prompt': 1, 'tools-used': 1, 'api-request': 1, 'api-request-blob': 2 });
});

test('item 7: malformed lines never throw, are counted by class only; mapperHealth reports them', () => {
  const mm = createClaudeMapper(); const st = mm.newState();
  assert.equal(mapperHealth(st).ok, true);
  assert.deepEqual(mm.mapLine('SECRET line text', st), []);
  const boom = { get type() { throw new RangeError('SECRET inside message'); } };
  assert.deepEqual(mm.mapLine(boom, st), []);
  const h = mapperHealth(st);
  assert.deepEqual([h.ok, h.errors, h.lastClass], [false, 2, 'RangeError']);
  assert.ok(!JSON.stringify(st.errors).includes('SECRET'));
  const old = { emitted: new Map(), calls: new Map(), results: new Map(), queue: [] }; // persisted before these fields existed
  assert.doesNotThrow(() => mm.mapLine({ type: 'file-history-delta' }, old));
  assert.equal(old.fileHistory, 1);
});

test('item 8: parsePrompt on the recorded plan-approval and question dialogs; null on /help and the slash menu', () => {
  for (const f of ['10-dialog.txt', '11-dialog.txt']) {
    const plan = m.parsePrompt(realScreen('plan-mode', f));
    assert.equal(plan.type, 'choice');
    assert.equal(plan.title, 'Claude has written up a plan and is ready to execute. Would you like to proceed?');
    assert.deepEqual(plan.options.map((o) => o.label), ['Yes, and use auto mode', 'Yes, manually approve edits', 'Tell Claude what to change']);
    assert.equal(plan.selected, 0);
    assert.equal(promptProblem(plan), null);
  }
  const ask = m.parsePrompt(realScreen('ask-question', '10-dialog.txt'));
  assert.equal(ask.type, 'choice');
  assert.equal(ask.title, 'Which color do you prefer, red or blue?');
  assert.deepEqual(ask.options.map((o) => o.label), ['Red', 'Blue', 'Type something.', 'Chat about this']);
  assert.equal(promptProblem(ask), null);
  assert.equal(m.parsePrompt(realScreen('model-switch', '07-help.txt')), null);
  assert.equal(m.parsePrompt(realScreen('model-switch', '08-slash-menu.txt')), null);
});

test('parsePrompt: diff preview between rules is not in the body', () => {
  const p = P(['Edit file', '╌╌╌╌╌╌╌╌╌', '  1 +const a = 1', '  2 -const b = 2', '╌╌╌╌╌╌╌╌╌', ' Do you want to make this edit?', ' ❯ 1. Yes', '   2. No'].join('\n'));
  assert.equal(p.body, 'Edit file');
});
