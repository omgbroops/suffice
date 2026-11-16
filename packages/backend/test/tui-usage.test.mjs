import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsageMeter, format } from '../src/tui/usage.mjs';

const u = (id, i, o, extra = {}) => ({ id, ts: 1, kind: 'usage', inputTokens: i, outputTokens: o, ...extra });
const compacted = (id) => ({ id, ts: 2, kind: 'notice', level: 'info', code: 'compacted', text: 'x' });

test('claude usage adds; duplicate id replaces (last wins)', () => {
  const m = createUsageMeter();
  m.add(u('usage:a', 100, 10));
  m.add(u('usage:b', 200, 20));
  m.add(u('usage:a', 150, 15));
  const s = m.snapshot();
  assert.equal(s.inputTokens, 350);
  assert.equal(s.outputTokens, 35);
  assert.equal(s.turns, 2);
  assert.deepEqual(m.turns().map((t) => t.id), ['usage:a', 'usage:b']);
});

test('codex usage is cumulative: only growth counts, a drop uses the raw value', () => {
  const m = createUsageMeter();
  m.add(u('codex:usage:1', 100, 10));
  m.add(u('codex:usage:2', 250, 30));
  assert.equal(m.snapshot().inputTokens, 250);
  assert.equal(m.snapshot().outputTokens, 30);
  m.add(u('codex:usage:3', 40, 5)); // counter reset
  assert.equal(m.snapshot().inputTokens, 290);
  m.add(u('codex:usage:2', 250, 30)); // duplicate
  assert.equal(m.snapshot().turns, 3);
  assert.equal(m.snapshot().inputTokens, 290);
});

test('compaction clears context pct until meta reports again; repeated notice id is ignored', () => {
  const m = createUsageMeter();
  m.setMeta({ contextUsedPct: 80 });
  assert.equal(m.snapshot().contextUsedPct, 80);
  m.add(compacted('n1'));
  assert.equal('contextUsedPct' in m.snapshot(), false);
  m.setMeta({ contextUsedPct: 12 });
  m.add(compacted('n1')); // same id replayed: no second reset
  assert.equal(m.snapshot().contextUsedPct, 12);
  m.add(compacted('n2'));
  assert.equal(m.snapshot().contextUsedPct, undefined);
});

test('cost only with pricing for every turn', () => {
  const m = createUsageMeter({ pricing: { fake: { inputPerM: 1000, outputPerM: 2000, cacheReadPerM: 100 } } });
  m.add(u('usage:a', 1e6, 5e5, { model: 'fake', cacheReadTokens: 1e6 }));
  assert.equal(m.snapshot().costUsd, 1000 + 1000 + 100);
  m.add(u('usage:b', 10, 10, { model: 'unpriced' }));
  assert.equal('costUsd' in m.snapshot(), false); // partial price = no total
  const none = createUsageMeter();
  none.add(u('usage:a', 10, 10, { model: 'fake' }));
  assert.equal('costUsd' in none.snapshot(), false);
});

test('model comes from meta or the last item; junk input is ignored', () => {
  const m = createUsageMeter();
  m.add(null); m.add('x'); m.add({ kind: 'text' });
  assert.equal(m.snapshot().turns, 0);
  m.add(u('usage:a', 1, 1, { model: 'm1' }));
  assert.equal(m.snapshot().model, 'm1');
  m.setMeta({ model: 'm2' });
  assert.equal(m.snapshot().model, 'm2');
});

test('format strings', () => {
  assert.deepEqual(format({ inputTokens: 12400, outputTokens: 3100, contextUsedPct: 26.6, costUsd: 0.42 }), ['12.4k in · 3.1k out', 'ctx 27%', '$0.42']);
  assert.deepEqual(format({ inputTokens: 999, outputTokens: 2500000 }), ['999 in · 2.5M out']);
  assert.deepEqual(format({ inputTokens: 0, outputTokens: 0, costUsd: 0.0042 }), ['0 in · 0 out', '$0.0042']);
  const m = createUsageMeter();
  m.add(u('usage:a', 1500, 5));
  assert.deepEqual(format(m), ['1.5k in · 5 out']);
});
