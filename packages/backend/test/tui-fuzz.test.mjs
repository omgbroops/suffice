import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzz, bigSession, runSession, prng } from '../tools/tui-fuzz/fuzz.mjs';
import { createGenericMapper } from '../src/tui/generic.mjs';
import { createCodexMapper } from '../src/tui/codex.mjs';
import { createOpencodeMapper } from '../src/tui/opencode.mjs';
import { itemProblem, promptProblem } from '../src/tui/model.mjs';

const MAPPERS = ['claude', 'codex', 'opencode'];

for (const kind of MAPPERS) {
  for (const seed of [1, 2, 3, 4, 5]) {
    test(`${kind}: seed ${seed}, 200 sessions, no throws and no invalid items`, () => {
      const r = fuzz(kind, seed, 200);
      assert.ok(r.records > 1000);
      assert.deepEqual([r.throws, r.invalid], [0, 0], String(JSON.stringify(r.firsts[0], (k, v) => (v instanceof Error ? v.stack : v))).slice(0, 600));
    });
  }
  test(`${kind}: a 10,000-record session maps in under 2 s with valid items`, () => {
    const recs = bigSession(kind);
    assert.equal(recs.length, 10000);
    const t = performance.now();
    const r = runSession(kind, recs);
    assert.ok(performance.now() - t < 2000, `${performance.now() - t} ms`);
    assert.deepEqual([r.throws, r.invalid], [0, 0]);
  });
  test(`${kind}: same seed gives the same summary (own PRNG, deterministic)`, () => {
    const a = fuzz(kind, 7, 20), b = fuzz(kind, 7, 20);
    assert.deepEqual([a.records, a.throws, a.invalid], [b.records, b.throws, b.invalid]);
  });
}

test('prng is seeded and stays in [0,1)', () => {
  const a = prng(3), b = prng(3);
  for (let i = 0; i < 100; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

// ---- generic mapper: no transcript, screens only ----
test('generic: random screens never throw and prompts validate', () => {
  const g = createGenericMapper(), rnd = prng(11);
  const bits = ['1. Yes', '2. No', '❯ Alpha', '(y/n)', '[Y/n]', 'Press Enter to continue', '○ A', '● B', '\u0000', '\ud800', '\n\n', 'x'.repeat(1 << 20), ''];
  for (let i = 0; i < 200; i++) {
    const screen = Array.from({ length: Math.floor(rnd() * 8) }, () => bits[Math.floor(rnd() * bits.length)]).join('\n');
    const p = g.parsePrompt(screen);
    if (p) assert.equal(promptProblem(p), null);
  }
});
test('generic: parsePrompt tolerates non-string screens', () => {
  const g = createGenericMapper();
  for (const v of [null, undefined, 0, {}, [], NaN]) assert.doesNotThrow(() => g.parsePrompt(v));
});
test('generic: sent() ids increase and items validate', () => {
  const g = createGenericMapper(), st = g.newState();
  const a = g.sent(st, 'hi', 1), b = g.sent(st, '', 2);
  assert.notEqual(a.id, b.id);
  assert.equal(itemProblem(a), null);
  assert.equal(itemProblem(b), null);
});

// ---- regressions: minimal reproducing input per defect ----
const oc = (rows) => { const m = createOpencodeMapper(), st = m.newState(); return { items: rows.flatMap((r) => m.mapRow(r, st)), st }; };
const cx = (rows) => { const m = createCodexMapper(), st = {}; return { items: rows.flatMap((r) => m.mapLine(r, st)), st }; };

test('opencode: row without a string id is skipped, not emitted with an invalid id', () => {
  for (const id of [undefined, null, 5, [null], '']) {
    const { items } = oc([{ table: 'part', id, message_id: 'm', data: { type: 'text', text: 'x' } }]);
    assert.deepEqual(items.map(itemProblem).filter(Boolean), []);
  }
});
test('opencode: truncated JSON in the data column is skipped without a swallowed throw', () => {
  const { items, st } = oc([{ table: 'part', id: 'p1', message_id: 'm', time_created: 1, data: '{"type":"text","te' }]);
  assert.equal(items.length, 0);
  assert.equal(st.errors, undefined);
});
test('opencode: non-object rows (null, string, number) do not throw', () => {
  const { items, st } = oc([null, 'x', 7, undefined]);
  assert.equal(items.length, 0);
  assert.equal(st.errors, undefined);
});
test('opencode: non-numeric time_created / time fields still give a numeric ts', () => {
  const { items } = oc([
    { table: 'part', id: 'p1', message_id: 'm', time_created: '', data: { type: 'text', text: 'x', time: { start: [1] } } },
    { table: 'message', id: 'm3', data: { role: 'assistant', time: { created: 1, completed: [2] }, error: { name: 'MessageAbortedError', data: { message: 'a' } } } },
  ]);
  assert.ok(items.length >= 2);
  for (const i of items) assert.equal(itemProblem(i), null, JSON.stringify(i));
});
test('opencode: non-numeric step-finish tokens become 0', () => {
  const { items } = oc([{ table: 'part', id: 'p1', message_id: 'm', time_created: 1, data: { type: 'step-finish', tokens: { input: 'a', output: [1], cache: { read: null } } } }]);
  assert.equal(items.length, 1);
  assert.equal(itemProblem(items[0]), null);
  assert.equal(items[0].inputTokens, 0);
});
test('codex: token_count with non-numeric token fields gives a valid usage item', () => {
  const { items } = cx([{ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: '', output_tokens: [20], cached_input_tokens: null } } } }]);
  const u = items.filter((i) => i.kind === 'usage');
  assert.equal(u.length, 1);
  assert.equal(itemProblem(u[0]), null);
});
test('codex: function_call with a non-string name still gives a valid tool item', () => {
  const { items } = cx([{ type: 'response_item', payload: { type: 'function_call', name: [1], call_id: 'c1', arguments: '{}' } }]);
  for (const i of items) assert.equal(itemProblem(i), null, JSON.stringify(i));
});
