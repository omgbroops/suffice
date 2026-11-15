import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDecider } from '../src/decide/index.mjs';
import { createDatasetFile } from '../src/decide/dataset.mjs';

const RC = { steps: 1, progress: 0, budgetRemaining: 10 };
const K = (reason, cont = true) => ({ kind: 'constant', output: { continue: cont, reason } });
const mk = (extra = {}) => createDecider({ runners: { get: () => ({ run: async () => ({ ok: false }) }) }, ask: async () => undefined, clock: { now: () => 1 }, ...extra });
const tick = () => new Promise((r) => setImmediate(r));

test('a slow shadow candidate never delays the primary result', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const d = mk();
  d.registerScript('slow', async () => { await gate; return { continue: true, reason: 'late' }; });
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'shadow', primary: K('p'), candidate: { kind: 'script', id: 'slow' } } } } });
  const r = await Promise.race([d.decide('run.continue', RC), new Promise((x) => setTimeout(() => x('stuck'), 300))]);
  assert.equal(r.reason, 'p');
  release(); await tick(); await tick();
});

test('a late candidate still lands in agreement once it settles', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const d = mk();
  d.registerScript('slow', async () => { await gate; return { continue: true, reason: 'p' }; });
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'shadow', primary: K('p'), candidate: { kind: 'script', id: 'slow' } } } } });
  await d.decide('run.continue', RC);
  release(); await tick(); await tick();
  assert.equal(d.stats()['run.continue'].agreement, 1);
});

test('a throwing candidate counts as a shadow error and not as agreement', async () => {
  const d = mk();
  d.registerScript('boom', () => { throw new Error('x'); });
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'shadow', primary: K('p'), candidate: { kind: 'script', id: 'boom' } } } } });
  assert.equal((await d.decide('run.continue', RC)).reason, 'p');
  await tick();
  const s = d.stats()['run.continue'];
  assert.equal(s.shadowErrors, 1);
  assert.equal(s.agreement, 0);
});

test('a candidate that never settles times out on its own timer', async () => {
  const timers = [];
  const d = mk({ timer: { setTimeout: (fn, ms) => { const h = { fn, ms, off: false }; timers.push(h); return h; }, clearTimeout: (h) => { h.off = true; } } });
  d.registerScript('hang', () => new Promise(() => {}));
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'shadow', primary: K('p'), candidate: { kind: 'script', id: 'hang', timeoutMs: 50 } } } } });
  assert.equal((await d.decide('run.continue', RC)).reason, 'p');
  const h = timers.filter((t) => !t.off).at(-1);
  assert.ok(h, 'candidate timer armed');
  h.fn(); await tick();
  assert.equal(d.stats()['run.continue'].shadowErrors, 1);
});

test('store receives decision and outcome rows with no input text', async () => {
  const rows = [];
  const d = mk({ store: { append: (r) => rows.push(r) } });
  const out = await d.decide('run.continue', RC);
  d.recordOutcome(out.decisionId, { ok: true, secretNote: 'do not store me' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].point, 'run.continue');
  assert.ok(rows[0].inputHash && rows[0].id === out.decisionId);
  assert.equal(rows[1].id, out.decisionId);
  assert.equal(rows[1].outcome.ok, true);
  assert.equal(JSON.stringify(rows).includes('do not store me'), false);
});

test('a throwing store never breaks a decision', async () => {
  const d = mk({ store: { append: () => { throw new Error('disk'); } } });
  assert.ok((await d.decide('run.continue', RC)).reason !== undefined);
});

test('dataset file appends jsonl and rotates to .1 past the size cap', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ds-'));
  const ds = createDatasetFile({ dir, maxBytes: 200 });
  for (let i = 0; i < 20; i++) await ds.append({ id: `dec-${i}`, point: 'p', inputHash: 'h', output: { a: i }, ok: true });
  const cur = (await fs.readFile(path.join(dir, 'decisions.jsonl'), 'utf8')).trim().split('\n');
  assert.ok(cur.every((l) => JSON.parse(l).id));
  assert.ok((await fs.stat(path.join(dir, 'decisions.jsonl.1'))).size > 0);
  assert.ok((await fs.stat(path.join(dir, 'decisions.jsonl'))).size <= 400);
});
