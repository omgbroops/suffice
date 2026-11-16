import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createOpencodeMapper } from '../src/tui/opencode.mjs';
import { itemProblem, promptProblem, CONTROLS } from '../src/tui/model.mjs';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/tui-opencode/${f}`, import.meta.url), 'utf8'));
const rows = fx('rows.json');
const screens = fx('screens.json');
const m = createOpencodeMapper();
const state = m.newState();
const items = rows.flatMap((r) => m.mapRow(r, state));
const by = Object.fromEntries(items.map((i) => [i.id, i]));
const bytes = (c) => [...c.bytes];
const str = (c) => Buffer.from(c.bytes).toString();

test('mapper exposes the seven keys', () => {
  assert.deepEqual(Object.keys(m).sort(), ['controls', 'coverage', 'mapLine', 'mapRow', 'meta', 'newState', 'parsePrompt'].sort());
});

test('every item passes itemProblem, ids unique, exact count', () => {
  for (const i of items) assert.equal(itemProblem(i), null, `${i.id}: ${itemProblem(i)}`);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  assert.equal(items.length, 32);
});

test('part types: text, reasoning, file, ignored, hidden, string data', () => {
  assert.equal(by.p01.kind, 'user');
  assert.equal(by.p01.text, 'user says hello');
  assert.equal(by.p02.text, '[attachment] shot.png');
  assert.equal(by.p04.kind, 'thinking');
  assert.equal(by.p05.kind, 'assistant');
  for (const id of ['p03', 'p06', 'p23', 'p24']) assert.equal(by[id], undefined, `${id} must produce no item`);
  assert.equal(by.p30.kind, 'user');
  assert.equal(by.p30.text, 'json string row');
});

test('tool states: completed, running, pending, error, denied, aborted', () => {
  assert.equal(by.p07.status, 'ok');
  assert.equal(by.p07.category, 'shell');
  assert.equal(by.p07.output.exitCode, 0);
  assert.equal(by.p08.status, 'running');
  assert.equal(by.p09.status, 'running');
  assert.equal(by.p20.status, 'denied');
  assert.equal(by.p21.status, 'error');
  assert.equal(by.p22.status, 'error');
  assert.equal(by['p22:int'].code, 'interrupted');
  assert.equal(by['p20:int'], undefined);
});

test('tool categories and diffs', () => {
  assert.equal(by.p10.category, 'edit');
  assert.deepEqual(by.p10.output.diff.map((d) => d.path), ['a.js']);
  assert.equal(by.p11.category, 'write');
  assert.equal(by.p12.output.diff[0].path, '/work/demo/c.js');
  assert.notEqual(by.p18.category, by.p14.category);
});

test('todowrite and task emit extra items', () => {
  assert.deepEqual(by['p16:todo'].items.map((t) => t.status), ['done', 'active', 'pending']);
  assert.equal(by['p17:sub'].status, 'ok');
  assert.equal(by['p17:sub'].childSessionId, 'ses_child');
  assert.equal(by['p17:sub'].name, 'explore');
  assert.equal(by.p28.kind, 'subagent');
  assert.equal(by.p28.status, 'running');
});

test('compaction, retry, agent, usage, assistant errors', () => {
  assert.equal(by.p25.code, 'compacted');
  assert.equal(by.p26.code, 'rate_limit');
  assert.equal(by.p26.level, 'warn');
  assert.equal(by.p29.inputTokens, 100);
  assert.equal(by.p29.outputTokens, 20);
  assert.equal(by.p29.model, 'prov/mod-a');
  assert.equal(by['m3:err'].code, 'interrupted');
  assert.equal(by['m4:err'].code, 'rate_limit');
  assert.equal(by['m5:err'].code, 'error');
});

test('rows before their message still map, meta reads state', () => {
  const s = m.newState();
  const out = m.mapRow({ table: 'part', id: 'z', message_id: 'none', data: { type: 'text', text: 'orphan' } }, s);
  assert.equal(out.length, 1);
  assert.equal(itemProblem(out[0]), null);
  assert.deepEqual(m.meta(state), { sessionId: 'ses_1', cwd: '/work/demo', model: 'prov/mod-a', mode: 'build', agent: 'opencode' });
});

test('parsePrompt: four dialogs pass promptProblem', () => {
  const p = (k) => { const r = m.parsePrompt(screens[k]); assert.equal(promptProblem(r), null, k); return r; };
  const perm = p('permission');
  assert.equal(perm.type, 'permission');
  assert.deepEqual(perm.options.map((o) => o.label), ['Allow once', 'Allow always', 'Reject']);
  assert.equal(perm.title, 'Edit src/a.js');
  assert.equal(p('shell').body, '$ npm test');
  assert.deepEqual(p('always').options.map((o) => o.label), ['Confirm', 'Cancel']);
  const rej = p('reject');
  assert.equal(rej.type, 'text');
  assert.deepEqual(rej.options, []);
  const q = p('question');
  assert.equal(q.type, 'choice');
  assert.deepEqual(q.options.map((o) => o.hotkey), ['1', '2', '3']);
});

test('parsePrompt: look-alikes return null', () => {
  assert.equal(m.parsePrompt(screens.markdown), null);
  assert.equal(m.parsePrompt(screens.idle), null);
  assert.equal(m.parsePrompt(''), null);
});

test('controls: exact bytes', () => {
  const c = m.controls;
  assert.deepEqual(bytes(c.interrupt()), [0x1b, 0x1b]);
  assert.equal(str(c.setModel('p/m')), '\x18mp/m\r');
  assert.equal(str(c.slash('compact')), '/compact\r');
  assert.equal(str(c.slash('/help')), '/help\r');
  assert.equal(str(c.compact()), '/compact\r');
  assert.equal(str(c.clear()), '/new\r');
  assert.equal(str(c.setMode('build', 'plan')), '\t');
  assert.equal(str(c.setMode('build', 'build')), '');
  const perm = m.parsePrompt(screens.permission);
  assert.equal(str(c.answerPrompt(perm, 0)), '\r');
  assert.equal(str(c.answerPrompt(perm, 2)), '\x1b[C\x1b[C\r');
  const q = m.parsePrompt(screens.question);
  assert.equal(str(c.answerPrompt(q, 1)), '2');
  assert.throws(() => c.answerPrompt(perm, 9), RangeError);
  assert.throws(() => c.slash('a\x1bb'), RangeError);
  for (const k of Object.keys(c)) assert.ok(CONTROLS.includes(k), `${k} not a model control`);
});

test('coverage: valid enums, counts, serve-SSE row', () => {
  const cov = m.coverage;
  assert.equal(cov.length, 33);
  for (const r of cov) {
    assert.ok(['chat', 'terminal-only'].includes(r.shown), r.element);
    assert.ok(['yes', 'no', 'n/a'].includes(r.driven), r.element);
    assert.ok(r.element && r.how, 'non-empty text');
  }
  const n = (k, v) => cov.filter((r) => r[k] === v).length;
  assert.deepEqual([n('shown', 'chat'), n('shown', 'terminal-only')], [28, 5]);
  assert.deepEqual([n('driven', 'yes'), n('driven', 'no'), n('driven', 'n/a')], [9, 4, 20]);
  assert.equal(cov.filter((r) => /live feed via opencode serve/.test(r.element)).length, 1);
});
