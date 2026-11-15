import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createDecider } from '../src/decide/index.mjs';
import { POINTS } from '../src/decide/points.mjs';
import { PRESETS } from '../src/decide/presets.mjs';
import { compile, lookup } from '../src/decide/rules.mjs';
import { check } from '../src/decide/schema.mjs';

// smallest value that satisfies a schema (confidence-like numbers get their maximum)
const gen = (s) => {
  if (s.enum) return s.enum[0];
  if (s.type === 'object') return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, gen(v)]));
  if (s.type === 'array') return [];
  if (s.type === 'boolean') return true;
  if (s.type === 'string') return 'x';
  return s.maximum ?? s.minimum ?? 0;
};
const SAMPLE = {
  'model.select': { kind: 'code', promptTokens: 100, difficulty: 'normal', budgetRemaining: 100000, stepPath: '/a' },
  'model.escalate': { attempt: 1, failure: 'boom', tried: ['small'] },
  'tool.select': { candidates: ['a', 'b'], goal: 'g' },
  'action.approve': { tool: 'browser', action: 'click', target: 'btn', riskTags: ['purchase'] },
  'step.verify': { claims: ['c'], evidence: 'e' },
  'run.continue': { steps: 3, progress: 0.5, budgetRemaining: 1000 },
  'context.load': { candidates: [{ id: 'a', size: 5 }, { id: 'b', size: 50 }], budget: 20 },
  'context.compact': { size: 90, limit: 100 },
  'computer.observe': { target: 'Notes', lastAction: 'click', modes: ['tree', 'screenshot'] },
  'computer.ground': { instruction: 'the save button', elements: [{ ref: '@s1:e1', label: 'Save' }] },
  'computer.act': { goal: 'g', observation: 'o', allowed: ['click'] },
  'computer.check': { expected: 'e', before: 'b', after: 'a' },
  'voice.turn': { silenceMs: 800, partial: 'hello' },
};

function make(extra = {}) {
  const events = [], bus = [], calls = [], timers = [];
  let t = 1000;
  const clock = { now: () => t, tick: (n) => { t += n; } };
  const timer = { setTimeout: (fn, ms) => { const h = { fn, ms, off: false }; timers.push(h); return h; }, clearTimeout: (h) => { h.off = true; } };
  const runner = {
    queue: [],
    async run(req) {
      calls.push(req);
      const q = runner.queue.shift();
      if (q) return q;
      return { ok: true, value: gen(req.schema), usage: { inputTokens: 0, outputTokens: 0 }, ms: 1 };
    },
  };
  const d = createDecider({
    runners: { get: (n) => (n === 'missing' ? undefined : runner) },
    ask: async (r) => gen(r.schema),
    clock, timer,
    journal: { append: async (e) => { events.push(e); return e; } },
    bus: { emit: (type, p) => bus.push([type, p]) },
    ...extra,
  });
  return { d, events, bus, calls, timers, clock, runner };
}
const K = (reason, cont = true) => ({ kind: 'constant', output: { continue: cont, reason } });
const RC = { steps: 1, progress: 0, budgetRemaining: 10 };
const last = (events) => events.filter((e) => e.type === 'decision').at(-1).data;

test('constant decider returns its output', async () => {
  const { d } = make();
  d.loadLayers({ user: { points: { 'run.continue': K('fixed') } } });
  assert.deepEqual({ ...(await d.decide('run.continue', RC)) }, { continue: true, reason: 'fixed' });
});

test('no config at all: action.approve asks, other points use their default', async () => {
  const { d } = make();
  assert.equal((await d.decide('action.approve', SAMPLE['action.approve'])).decision, 'ask');
  assert.equal((await d.decide('run.continue', RC)).continue, true);
});

test('rule decider: first match wins, default and abstain', async () => {
  const { d } = make();
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'rule', rules: [
    { when: { lte: [{ var: 'budgetRemaining' }, 0] }, then: { continue: false, reason: 'broke' } },
    { when: { gt: [{ var: 'steps' }, 5] }, then: { continue: false, reason: 'long' } },
  ], default: { continue: true, reason: 'ok' } } } } });
  assert.equal((await d.decide('run.continue', { ...RC, budgetRemaining: 0 })).reason, 'broke');
  assert.equal((await d.decide('run.continue', { ...RC, steps: 9 })).reason, 'long');
  assert.equal((await d.decide('run.continue', RC)).reason, 'ok');
});

test('table decider looks up by fields with a default row', async () => {
  const { d } = make();
  d.loadLayers({ user: { points: { 'model.select': { kind: 'table', keys: ['kind', 'difficulty'],
    rows: [{ when: { kind: 'code', difficulty: 'hard' }, then: { runner: 'default', model: 'large', effort: 'high' } }],
    default: { runner: 'default', model: 'small', effort: 'low' } } } } });
  assert.equal((await d.decide('model.select', { kind: 'code', promptTokens: 1, difficulty: 'hard' })).model, 'large');
  assert.equal((await d.decide('model.select', { kind: 'code', promptTokens: 1, difficulty: 'easy' })).model, 'small');
});

test('script decider calls the registered function', async () => {
  const { d } = make();
  d.registerScript('mine', (input, ctx) => ({ continue: false, reason: `${ctx.point}:${input.steps}` }));
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'script', id: 'mine' } } } });
  assert.equal((await d.decide('run.continue', RC)).reason, 'run.continue:1');
});

test('model decider: schema passed, prompt template filled, retry once on invalid output', async () => {
  const { d, calls, runner, events } = make();
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'model', model: 'small', prompt: 'steps={{steps}} all={{$input}}' } } } });
  runner.queue.push({ ok: true, value: { nope: 1 }, usage: {}, ms: 1 }, { ok: true, value: { continue: false, reason: 'r' }, usage: {}, ms: 1 });
  const out = await d.decide('run.continue', RC);
  assert.equal(out.continue, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].model, 'small');
  assert.ok(calls[0].prompt.startsWith('steps=1 all={'));
  assert.deepEqual(calls[0].schema, POINTS['run.continue'].output);
  assert.equal(last(events).ok, true);
});

test('model decider: invalid twice falls back to the safe default and counts a fallback', async () => {
  const { d, runner, events } = make();
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'model' } } } });
  runner.queue.push({ ok: true, value: { nope: 1 }, usage: {}, ms: 1 }, { ok: true, value: 5, usage: {}, ms: 1 });
  const out = await d.decide('run.continue', RC);
  assert.deepEqual({ ...out }, POINTS['run.continue'].default);
  assert.equal(last(events).ok, false);
  assert.equal(d.stats()['run.continue'].fallbacks, 1);
});

test('unknown runner name falls back', async () => {
  const { d, events } = make();
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'model', runner: 'missing' } } } });
  await d.decide('run.continue', RC);
  assert.equal(last(events).ok, false);
});

test('timeout falls back to the default', async () => {
  const { d, timers, events } = make();
  d.registerScript('hang', () => new Promise(() => {}));
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'script', id: 'hang', timeoutMs: 50 } } } });
  const p = d.decide('run.continue', RC);
  assert.equal(timers[0].ms, 50);
  timers[0].fn();
  assert.deepEqual({ ...(await p) }, POINTS['run.continue'].default);
  assert.equal(last(events).ok, false);
  assert.match(last(events).error, /timeout/);
});

test('failClosed: errors, invalid output and bad input give the closed value; open points give the default', async () => {
  const { d } = make();
  d.registerScript('boom', () => { throw new Error('x'); });
  d.registerScript('junk', () => ({ decision: 'allow-everything' }));
  d.loadLayers({ user: { points: {
    'action.approve': { kind: 'script', id: 'boom' }, 'run.continue': { kind: 'script', id: 'boom' }, 'computer.check': { kind: 'script', id: 'junk' } } } });
  assert.equal((await d.decide('action.approve', SAMPLE['action.approve'])).decision, 'deny');
  assert.equal((await d.decide('computer.check', SAMPLE['computer.check'])).ok, false);
  assert.equal((await d.decide('run.continue', RC)).continue, true);
  assert.equal((await d.decide('action.approve', { nope: 1 })).decision, 'deny');
});

test('a decider can never return outside its schema', async () => {
  const { d } = make();
  d.registerScript('junk', () => ({ decision: 'allow', reason: 5 }));
  d.loadLayers({ user: { points: { 'action.approve': { kind: 'script', id: 'junk' } } } });
  assert.notEqual((await d.decide('action.approve', SAMPLE['action.approve'])).decision, 'allow');
});

test('layer precedence across all six layers', async () => {
  const order = ['builtin', 'org', 'user', 'project', 'workflow', 'step'];
  const all = Object.fromEntries(order.slice(1).map((n) => [n, { points: { 'run.continue': K(n) } }]));
  for (let i = order.length - 1; i >= 1; i--) {
    const { d } = make();
    d.loadLayers(Object.fromEntries(order.slice(1, i + 1).map((n) => [n, all[n]])));
    assert.equal((await d.decide('run.continue', RC)).reason, order[i]);
  }
  const { d } = make();
  d.loadLayers({ user: { router: 'balanced' } });
  assert.equal((await d.decide('run.continue', RC)).reason, 'progressing'); // builtin preset
});

test('scoped beats unscoped; more specific scope wins; layer priority still first', async () => {
  const { d } = make();
  d.loadLayers({
    user: { points: { 'run.continue': K('plain') }, scopes: [
      { match: { tool: 'browser' }, points: { 'run.continue': K('tool') } },
      { match: { tool: 'browser', app: 'x*' }, points: { 'run.continue': K('tool+app') } },
    ] },
    workflow: { points: { 'voice.turn': { kind: 'constant', output: { end: true } } } },
  });
  assert.equal((await d.decide('run.continue', RC, {})).reason, 'plain');
  assert.equal((await d.decide('run.continue', RC, { tool: 'browser' })).reason, 'tool');
  assert.equal((await d.decide('run.continue', RC, { tool: 'browser', app: 'xyz' })).reason, 'tool+app');
  d.loadLayers({ user: { scopes: [{ match: { tool: 'browser' }, points: { 'run.continue': K('user-scope') } }] }, project: { points: { 'run.continue': K('project') } } });
  assert.equal((await d.decide('run.continue', RC, { tool: 'browser' })).reason, 'project');
});

test('scope matches stepPath glob, domain and actionType', async () => {
  const { d } = make();
  d.loadLayers({ step: { scopes: [{ match: { stepPath: '/wf/*/pay', domain: 'shop.com', actionType: 'click' }, points: { 'run.continue': K('hit') } }] } });
  assert.equal((await d.decide('run.continue', RC, { stepPath: '/wf/a/pay', domain: 'shop.com', actionType: 'click' })).reason, 'hit');
  assert.notEqual((await d.decide('run.continue', RC, { stepPath: '/wf/a/other', domain: 'shop.com', actionType: 'click' })).reason, 'hit');
});

test('glob points; exact key beats glob in the same layer', async () => {
  const { d } = make();
  d.registerScript('g', (i, ctx) => (ctx.point === 'computer.check' ? { ok: true, reason: 'g' } : { action: 'click', ref: 'r', text: '' }));
  d.loadLayers({ user: { points: { 'computer.*': { kind: 'script', id: 'g' } } } });
  assert.equal((await d.decide('computer.check', SAMPLE['computer.check'])).reason, 'g');
  assert.equal((await d.decide('computer.act', SAMPLE['computer.act'])).action, 'click');
  d.loadLayers({ user: { points: { 'computer.*': { kind: 'script', id: 'g' }, 'computer.check': { kind: 'constant', output: { ok: false, reason: 'exact' } } } } });
  assert.equal((await d.decide('computer.check', SAMPLE['computer.check'])).reason, 'exact');
});

test('a lock in org blocks a user override and explain reports it', async () => {
  const { d } = make();
  d.loadLayers({
    org: { locks: ['action.approve'], points: { 'action.approve': { kind: 'constant', output: { decision: 'deny', reason: 'org' } } } },
    user: { points: { 'action.approve': { kind: 'constant', output: { decision: 'allow', reason: 'me' } } } },
  });
  assert.equal((await d.decide('action.approve', SAMPLE['action.approve'])).decision, 'deny');
  const ex = d.explain('action.approve', {});
  assert.equal(ex.winner.layer, 'org');
  assert.deepEqual(ex.blocked.map((b) => [b.layer, b.lockedBy]), [['user', 'org']]);
  // glob lock
  d.loadLayers({ org: { locks: ['computer.*'] }, user: { points: { 'computer.check': { kind: 'constant', output: { ok: true, reason: 'x' } } } } });
  assert.equal(d.explain('computer.check', {}).blocked.length, 1);
});

test('explain reports winner and shadowed entries without running anything', async () => {
  const { d, calls, events } = make();
  d.loadLayers({ org: { points: { 'run.continue': K('o') } }, user: { points: { 'run.continue': { kind: 'model' } } } });
  const ex = d.explain('run.continue', {});
  assert.equal(ex.winner.layer, 'user');
  assert.deepEqual(ex.shadowed.map((s) => s.layer), ['org', 'builtin']);
  assert.equal(calls.length, 0);
  assert.equal(events.length, 0);
});

test('every preset resolves every built-in point to a valid decider that runs', async () => {
  for (const name of Object.keys(PRESETS)) {
    for (const pt of Object.keys(POINTS)) assert.ok(PRESETS[name][pt], `${name} lacks ${pt}`);
    const { d, events } = make();
    const v = d.validateConfig({ user: { router: name } });
    assert.deepEqual(v, { ok: true, errors: [] });
    d.loadLayers({ user: { router: name } });
    for (const pt of Object.keys(POINTS)) {
      const out = await d.decide(pt, SAMPLE[pt]);
      assert.deepEqual(check(POINTS[pt].output, out), [], `${name}/${pt}`);
      assert.equal(last(events).ok, true, `${name}/${pt} ${last(events).error}`);
    }
  }
  assert.deepEqual(Object.keys(PRESETS).sort(), ['balanced', 'cheap', 'careful', 'local-first', 'quality'].sort());
});

test('one line {router: "balanced"} is a complete setup; router layers override each other', async () => {
  const { d } = make();
  d.loadLayers({ user: { router: 'balanced' } });
  assert.equal((await d.decide('model.select', { ...SAMPLE['model.select'], difficulty: 'hard' })).model, 'large');
  d.loadLayers({ org: { router: 'quality' } });
  assert.equal((await d.decide('model.select', SAMPLE['model.select'])).model, 'large');
  d.loadLayers({ org: { router: 'quality' }, user: { router: 'cheap' } });
  assert.equal((await d.decide('model.select', SAMPLE['model.select'])).model, 'small');
  d.loadLayers({ user: { router: 'careful' } });
  assert.equal((await d.decide('action.approve', { tool: 'd', action: 'rm', target: 't', riskTags: ['destructive'] })).decision, 'ask');
});

test('cache: hit on equal normalised input, ttl expiry, max size eviction, hit rate', async () => {
  const { d, clock, events } = make();
  let n = 0;
  d.registerScript('count', () => { n++; return { continue: true, reason: 'c' }; });
  const spec = { kind: 'cache', ttlMs: 100, max: 2, inner: { kind: 'script', id: 'count' } };
  d.loadLayers({ user: { points: { 'run.continue': spec } } });
  await d.decide('run.continue', { steps: 1, progress: 0, budgetRemaining: 10 });
  assert.equal(last(events).cacheHit, false);
  await d.decide('run.continue', { budgetRemaining: 10, progress: 0, steps: 1 });
  assert.equal(n, 1);
  assert.equal(last(events).cacheHit, true);
  clock.tick(101);
  await d.decide('run.continue', RC); assert.equal(n, 2);
  await d.decide('run.continue', { ...RC, steps: 2 });
  await d.decide('run.continue', { ...RC, steps: 3 }); // evicts steps:1
  assert.equal(n, 4);
  await d.decide('run.continue', RC); assert.equal(n, 5);
  assert.ok(d.stats()['run.continue'].cacheHitRate > 0);
});

test('chain: first output at or above the confidence threshold wins', async () => {
  const { d } = make();
  const c = (reason, confidence) => ({ kind: 'constant', confidence, output: { continue: true, reason } });
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'chain', threshold: 0.8, deciders: [
    { kind: 'rule', rules: [{ when: { gt: [{ var: 'steps' }, 100] }, then: { continue: false, reason: 'rule' } }] }, c('low', 0.4), c('high', 0.9), c('later', 1)] } } } });
  assert.equal((await d.decide('run.continue', RC)).reason, 'high');
  assert.equal((await d.decide('run.continue', { ...RC, steps: 101 })).reason, 'rule');
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'chain', threshold: 0.8, deciders: [c('low', 0.4)] } } } });
  assert.deepEqual({ ...(await d.decide('run.continue', RC)) }, POINTS['run.continue'].default);
});

test('chain: error in one member moves on; model output confidence is read from the output', async () => {
  const { d, runner } = make();
  d.registerScript('boom', () => { throw new Error('x'); });
  runner.queue.push({ ok: true, value: { ok: true, confidence: 0.2, reason: 'meh' }, usage: {}, ms: 1 });
  d.loadLayers({ user: { points: { 'step.verify': { kind: 'chain', threshold: 0.7, deciders: [{ kind: 'script', id: 'boom' }, { kind: 'model', model: 'small' }, { kind: 'human' }] } } } });
  const out = await d.decide('step.verify', SAMPLE['step.verify']);
  assert.equal(out.reason, 'x'); // fell through to the human (fake ask)
});

test('human decider calls the injected ask with the point and schema', async () => {
  const seen = [];
  const { d } = make({ ask: async (r) => { seen.push(r); return { decision: 'allow', reason: 'human' }; } });
  d.loadLayers({ user: { points: { 'action.approve': { kind: 'human' } } } });
  assert.equal((await d.decide('action.approve', SAMPLE['action.approve'])).reason, 'human');
  assert.equal(seen[0].point, 'action.approve');
  assert.ok(seen[0].schema);
});

test('vote: majority and unanimous', async () => {
  const { d } = make();
  const k = (r) => K(r);
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'vote', mode: 'majority', deciders: [k('a'), k('a'), k('b')] } } } });
  assert.equal((await d.decide('run.continue', RC)).reason, 'a');
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'vote', mode: 'unanimous', deciders: [k('a'), k('a'), k('b')] } } } });
  assert.deepEqual({ ...(await d.decide('run.continue', RC)) }, POINTS['run.continue'].default);
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'vote', mode: 'unanimous', deciders: [k('a'), k('a')] } } } });
  assert.equal((await d.decide('run.continue', RC)).reason, 'a');
});

test('shadow returns the primary output and records agreement', async () => {
  const { d } = make();
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'shadow', primary: K('p'), candidate: K('c') } } } });
  assert.equal((await d.decide('run.continue', RC)).reason, 'p');
  assert.equal(d.stats()['run.continue'].agreement, 0);
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'shadow', primary: K('p'), candidate: K('p') } } } });
  await d.decide('run.continue', RC);
  assert.equal(d.stats()['run.continue'].agreement, 0.5);
  d.registerScript('boom', () => { throw new Error('x'); });
  d.loadLayers({ user: { points: { 'run.continue': { kind: 'shadow', primary: K('p'), candidate: { kind: 'script', id: 'boom' } } } } });
  assert.equal((await d.decide('run.continue', RC)).reason, 'p'); // a failing candidate never affects the caller
});

test('rule language: every operator', () => {
  const i = { n: 5, s: 'hello world', a: ['x', 'y'], o: { k: 1 } };
  const t = (c) => compile(c)(i);
  assert.ok(t({ eq: [{ var: 'n' }, 5] })); assert.ok(!t({ eq: [{ var: 'n' }, 6] }));
  assert.ok(t({ eq: [{ var: 'o' }, { var: 'o' }] }));
  assert.ok(t({ ne: [{ var: 'n' }, 6] }));
  assert.ok(t({ gt: [{ var: 'n' }, 4] })); assert.ok(t({ gte: [{ var: 'n' }, 5] }));
  assert.ok(t({ lt: [{ var: 'n' }, 6] })); assert.ok(t({ lte: [{ var: 'n' }, 5] }));
  assert.ok(!t({ gt: [{ var: 'n' }, 'a'] }));
  assert.ok(t({ in: ['x', { var: 'a' }] })); assert.ok(t({ in: [{ var: 'n' }, [1, 5]] })); assert.ok(t({ in: ['ell', { var: 's' }] }));
  assert.ok(t({ matches: [{ var: 's' }, '^hel+o'] })); assert.ok(!t({ matches: [{ var: 's' }, '^x'] }));
  assert.ok(t({ and: [{ gt: [{ var: 'n' }, 1] }, { lt: [{ var: 'n' }, 9] }] }));
  assert.ok(t({ or: [{ gt: [{ var: 'n' }, 10] }, { eq: [{ var: 'o.k' }, 1] }] }));
  assert.ok(t({ not: { eq: [{ var: 'n' }, 1] } }));
  assert.ok(t({ gt: [{ var: 'a.length' }, 1] }));
});

test('rule language: own properties only, no prototype access', () => {
  assert.equal(lookup({ a: 1 }, 'toString'), undefined);
  assert.equal(lookup({ a: { b: 2 } }, 'a.b'), 2);
  assert.equal(lookup({ a: 1 }, 'a.toString'), undefined);
  assert.throws(() => compile({ eq: [{ var: '__proto__.x' }, 1] }));
  assert.throws(() => compile({ eq: [{ var: 'a.constructor' }, 1] }));
  assert.throws(() => compile({ eq: [{ var: 'prototype' }, 1] }));
  assert.equal(lookup(JSON.parse('{"__proto__":{"x":1}}'), '__proto__.x'), undefined);
});

test('rule language: rejects long patterns, risky patterns, deep nesting, junk', () => {
  assert.throws(() => compile({ matches: [{ var: 's' }, 'a'.repeat(200)] }), /pattern/);
  assert.throws(() => compile({ matches: [{ var: 's' }, '(a+)+$'] }), /pattern/);
  assert.throws(() => compile({ matches: [{ var: 's' }, '(a)\\1'] }), /pattern/);
  assert.throws(() => compile({ matches: [{ var: 's' }, { var: 'x' }] }), /pattern/);
  let c = { eq: [1, 1] };
  for (let i = 0; i < 20; i++) c = { not: c };
  assert.throws(() => compile(c), /deep/);
  assert.throws(() => compile({ and: Array(200).fill({ eq: [1, 1] }) }), /large/);
  assert.throws(() => compile({ bogus: [1, 2] }), /operator/);
  assert.throws(() => compile({ eq: [1, 2], ne: [1, 2] }));
  assert.throws(() => compile({ eq: [{ x: 1 }, 1] }));
});

test('source has no dynamic code evaluation', () => {
  const dir = new URL('../src/decide/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /\beval\b|new\s+Function|\bFunction\s*\(|node:vm/, f);
  }
});

test('decision events carry no prompt text and reach the journal and the bus', async () => {
  const { d, events, bus } = make();
  const MARK = 'SECRET-MARKER-123';
  d.loadLayers({ user: { points: { 'step.verify': { kind: 'model', prompt: `${MARK} {{$input}}` } } } });
  await d.decide('step.verify', { claims: [MARK], evidence: MARK });
  const ev = events.find((e) => e.type === 'decision');
  assert.equal(ev.data.point, 'step.verify');
  assert.equal(ev.data.deciderKind, 'model');
  assert.equal(ev.data.layer, 'user');
  for (const k of ['ms', 'cacheHit', 'outputSummary', 'ok']) assert.ok(k in ev.data, k);
  assert.ok(!JSON.stringify(events).includes(MARK));
  assert.ok(!JSON.stringify(bus).includes(MARK));
  assert.equal(bus[0][0], 'decision');
});

test('stats per point', async () => {
  const { d } = make();
  d.loadLayers({ user: { points: { 'run.continue': K('a') } } });
  await d.decide('run.continue', RC); await d.decide('run.continue', RC);
  const s = d.stats()['run.continue'];
  assert.equal(s.count, 2); assert.equal(s.fallbacks, 0); assert.equal(typeof s.meanMs, 'number');
});

test('plugin points are namespaced; definePoint validates the default', async () => {
  const { d } = make();
  const def = { input: { type: 'object' }, output: { type: 'object', properties: { v: { type: 'number' } }, required: ['v'] }, default: { v: 1 } };
  d.definePoint('myplug:pick', def);
  assert.deepEqual({ ...(await d.decide('myplug:pick', {})) }, { v: 1 });
  d.loadLayers({ user: { points: { 'myplug:*': { kind: 'constant', output: { v: 7 } } } } });
  assert.equal((await d.decide('myplug:pick', {})).v, 7);
  assert.throws(() => d.definePoint('myplug:bad', { ...def, default: { v: 'no' } }));
  assert.throws(() => d.definePoint('BAD NAME', def));
  await assert.rejects(d.decide('nope.nothing', {}), /unknown decision point/);
});

test('validateConfig reports paths', () => {
  const { d } = make();
  const errs = (l) => d.validateConfig(l).errors.join('\n');
  assert.match(errs({ bogus: {} }), /layers\.bogus/);
  assert.match(errs({ user: { router: 'nope' } }), /layers\.user\.router/);
  assert.match(errs({ user: { points: { 'zzz.q': K('a') } } }), /layers\.user\.points\.zzz\.q: matches no point/);
  assert.match(errs({ user: { points: { 'run.continue': { kind: 'wat' } } } }), /layers\.user\.points\.run\.continue\.kind/);
  assert.match(errs({ user: { points: { 'run.continue': { kind: 'constant', output: { continue: 'yes' } } } } }), /layers\.user\.points\.run\.continue\.output/);
  assert.match(errs({ user: { points: { 'run.continue': { kind: 'rule', rules: [{ when: { eq: [{ var: '__proto__' }, 1] }, then: {} }] } } } }), /rules\[0\]\.when/);
  assert.match(errs({ user: { points: { 'run.continue': { kind: 'script', id: 'ghost' } } } }), /script/);
  assert.match(errs({ user: { points: { 'run.continue': { kind: 'chain', deciders: [{ kind: 'wat' }] } } } }), /deciders\[0\]\.kind/);
  assert.match(errs({ user: { scopes: [{ match: { color: 'red' }, points: {} }] } }), /scopes\[0\]\.match\.color/);
  assert.match(errs({ user: { locks: [5] } }), /locks\[0\]/);
  assert.equal(d.validateConfig({ user: { router: 'cheap' } }).ok, true);
  assert.throws(() => d.loadLayers({ user: { router: 'nope' } }));
});

test('exportConfig returns what was loaded', () => {
  const { d } = make();
  const cfg = { user: { router: 'cheap', locks: ['action.approve'] } };
  d.loadLayers(cfg);
  assert.deepEqual(d.exportConfig(), cfg);
  assert.notEqual(d.exportConfig(), cfg);
});

test('dataset yields input hash, output and the recorded outcome', async () => {
  const { d } = make();
  d.loadLayers({ user: { points: { 'run.continue': K('a') } } });
  const out = await d.decide('run.continue', RC);
  await d.decide('run.continue', { ...RC, steps: 2 });
  d.recordOutcome(out.decisionId, { good: true });
  const rows = [...d.dataset()];
  assert.equal(rows.length, 2);
  assert.match(rows[0].inputHash, /^[0-9a-f]{40}$/);
  assert.equal(rows[0].point, 'run.continue');
  assert.deepEqual(rows[0].outcome, { good: true });
  assert.equal(rows[1].outcome, undefined);
  assert.ok(!('input' in rows[0]));
});
