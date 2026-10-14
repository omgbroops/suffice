import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWatcher, OPENROUTER_MODELS } from '../src/watchers.mjs';
import { createBudgetLedger } from '../src/budget.mjs';

const state = { objective: 'Fix keyboard navigation', latestEvidence: 'Tab does not enter the menu',
  candidates: [{ id: 'a11y', path: 'skills/a11y.md', description: 'Keyboard accessibility', excerpt: 'Use roving focus.' }], recentActions: ['Read the menu component'] };
const docs = '| Jev 1.13 | `jev-1.13.0` |\n| Price (per Btok / per Mtok) | \\$42 / \\$0.042 |\nOutput tokens are free.\n64k tokens per request';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
async function ledgerFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'suffice-watcher-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'ledger.jsonl');
}

test('Luna delegates authentication to runtime and accepts only supplied IDs', async () => {
  let received;
  const runtime = { getModel: (provider, model) => ({ provider, id: model }),
    completeSimple: async (...args) => { received = args; return { stopReason: 'stop', content: [{ type: 'text', text: '{"selectedId":"a11y"}' }], usage: { input: 30, output: 5, totalTokens: 35 } }; } };
  const env = new Proxy({}, { get() { throw new Error('Must not read credentials'); } });
  const decide = createWatcher({ kind: 'luna', runtime, env });
  assert.equal((await decide(state)).selectedId, 'a11y');
  assert.deepEqual(received[0], { provider: 'openai', id: 'gpt-6-luna' });
  assert.deepEqual(JSON.parse(received[1].messages[0].content), state);
  runtime.completeSimple = async () => ({ content: [{ type: 'text', text: '{"selectedId":"invented"}' }] });
  assert.equal((await decide(state)).errorCode, 'INVALID_DECISION');
  runtime.completeSimple = async () => ({ content: [{ type: 'text', text: '{"selectedId":null}' }] });
  assert.equal((await decide(state)).status, 'abstained');
});

test('Luna runtime absence is explicit and never substitutes a model', async () => {
  assert.equal((await createWatcher({ kind: 'luna', runtime: { getModel: () => undefined } })(state)).errorCode, 'MODEL_UNAVAILABLE');
});

test('OpenRouter verifies free metadata, enforces zero-price routing and uses same state', async () => {
  for (const model of OPENROUTER_MODELS) {
    let sent;
    const fetchImpl = async (url, options) => {
      if (url.endsWith('/models')) return json({ data: [{ id: model, pricing: { prompt: '0', completion: '0' } }] });
      sent = JSON.parse(options.body);
      return json({ choices: [{ finish_reason: 'stop', message: { content: '{"selectedId":"a11y"}' } }], usage: { prompt_tokens: 20, completion_tokens: 4, cost: 0 } });
    };
    const result = await createWatcher({ kind: model, fetchImpl, env: { OPENROUTER_API_KEY: 'test-secret' } })(state);
    assert.equal(result.selectedId, 'a11y'); assert.equal(result.costUsd, 0);
    assert.deepEqual(JSON.parse(sent.messages[1].content), state);
    assert.deepEqual(sent.provider.max_price, { prompt: 0, completion: 0 });
    assert.equal(sent.provider.allow_fallbacks, false);
  }
});

test('OpenRouter missing or nonzero pricing blocks inference', async () => {
  let posts = 0;
  for (const pricing of [{ prompt: '1', completion: '0' }, { prompt: '0' }, null,
    { prompt: null, completion: '0' }, { prompt: '', completion: '0' }, { prompt: '0', completion: '0', request: '0.01' }]) {
    const fetchImpl = async (_url, options) => { if (options?.method === 'POST') posts++; return json({ data: [{ id: OPENROUTER_MODELS[0], pricing }] }); };
    const result = await createWatcher({ kind: OPENROUTER_MODELS[0], fetchImpl, env: { OPENROUTER_API_KEY: 'test' } })(state);
    assert.equal(result.errorCode, 'PRICING_UNKNOWN');
  }
  assert.equal(posts, 0);
});

test('Jev reserves before inference and retains reservations across success, failed and unknown-charge calls', async (t) => {
  const ledgerPath = await ledgerFixture(t);
  let mode = 'success', posts = 0;
  const fetchImpl = async (url, options) => {
    if (url.includes('docs.')) return new Response(docs);
    posts++;
    assert.equal((await createBudgetLedger(ledgerPath).snapshot()).calls, posts);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.state, state); assert.equal(body.model, 'jev-1.13.0');
    assert.deepEqual(Object.keys(body.questions.selected.criteria), ['a11y', '__abstain__']);
    if (mode === 'failed') throw new Error('secret-in-provider-error');
    return json({ model: 'jev-1.13.0', answers: { selected: { type: 'choice', choice: mode === 'abstain' ? '__abstain__' : 'a11y' } },
      ...(mode === 'unknown' ? {} : { usage: { input_tokens: 100, output_tokens: 4 } }) });
  };
  const decide = createWatcher({ kind: 'jev', ledgerPath, fetchImpl, env: { JEV_API_KEY: 'test-secret' } });
  assert.equal((await decide(state)).selectedId, 'a11y');
  mode = 'failed'; const failed = await decide(state);
  assert.equal(failed.costUsd, null); assert.equal(failed.budgetReservedUsd, 0.01);
  mode = 'unknown'; const unknown = await decide(state);
  assert.equal(unknown.errorCode, 'USAGE_UNKNOWN'); assert.equal(unknown.costUsd, null); assert.equal(unknown.budgetReservedUsd, 0.01);
  mode = 'abstain'; assert.equal((await decide(state)).status, 'abstained');
  assert.equal((await createBudgetLedger(ledgerPath).snapshot()).reservedUsd, 0.04);
});

test('Jev unknown pricing, invalid state and exhausted budget prevent paid calls', async (t) => {
  const ledgerPath = await ledgerFixture(t);
  let priceDocs = 'unknown', posts = 0;
  const fetchImpl = async (url) => { if (url.includes('docs.')) return new Response(priceDocs); posts++; throw new Error(); };
  const decide = createWatcher({ kind: 'jev', ledgerPath, fetchImpl, env: { JEV_API_KEY: 'test' } });
  assert.equal((await decide(state)).errorCode, 'PRICING_UNKNOWN');
  assert.equal((await decide({ ...state, candidates: [...state.candidates, ...state.candidates] })).errorCode, 'INVALID_STATE');
  assert.equal((await decide({ ...state, latestEvidence: 'x'.repeat(30000) })).errorCode, 'STATE_TOO_LARGE');
  priceDocs = docs;
  for (let i = 0; i < 200; i++) await createBudgetLedger(ledgerPath).reserve();
  assert.equal((await decide(state)).errorCode, 'BUDGET_EXHAUSTED');
  assert.equal(posts, 0);
});

test('errors and logs cannot expose provider error text or credentials', async () => {
  const logs = [];
  const runtime = { getModel: () => ({}), completeSimple: async () => { throw Object.assign(new Error('Authorization: Bearer top-secret'), { code: 'top-secret' }); } };
  const result = await createWatcher({ kind: 'luna', runtime, log: (entry) => logs.push(entry) })(state);
  assert.equal(result.errorCode, 'REQUEST_FAILED');
  assert.ok(!JSON.stringify({ result, logs }).includes('top-secret'));
});

test('upstream usage extras are never echoed in results or logs', async () => {
  const logs = [];
  const runtime = { getModel: () => ({}), completeSimple: async () => ({ content: [{ type: 'text', text: '{"selectedId":null}' }],
    usage: { input: 1, output: 2, totalTokens: 'top-secret', headers: 'top-secret', cost: { total: 0 } } }) };
  const result = await createWatcher({ kind: 'luna', runtime, log: (entry) => logs.push(entry) })(state);
  assert.equal(result.usage.totalTokens, 3);
  assert.ok(!JSON.stringify({ result, logs }).includes('top-secret'));
});

test('timeout returns even when a runtime ignores cancellation', async () => {
  const runtime = { getModel: () => ({}), completeSimple: () => new Promise(() => {}) };
  const result = await createWatcher({ kind: 'luna', runtime, timeoutMs: 10 })(state);
  assert.equal(result.status, 'aborted'); assert.equal(result.errorCode, 'TIMEOUT');
});

test('Jev timeout after dispatch retains its entire reservation without retry', async (t) => {
  const ledgerPath = await ledgerFixture(t);
  let calls = 0;
  const fetchImpl = async (url) => { if (url.includes('docs.')) return new Response(docs); calls++; return new Promise(() => {}); };
  const result = await createWatcher({ kind: 'jev', ledgerPath, fetchImpl, env: { JEV_API_KEY: 'test' }, timeoutMs: 50 })(state);
  assert.equal(result.errorCode, 'TIMEOUT'); assert.equal(result.costUsd, null); assert.equal(result.budgetReservedUsd, 0.01);
  assert.equal(calls, 1); assert.equal((await createBudgetLedger(ledgerPath).snapshot()).reservedUsd, 0.01);
});

test('empty candidates abstain without requests and cancellation prevents dispatch', async () => {
  const runtime = { getModel: () => { throw new Error('Should not dispatch'); } };
  const decide = createWatcher({ kind: 'luna', runtime });
  const empty = await decide({ ...state, candidates: [] });
  assert.equal(empty.status, 'abstained'); assert.equal(empty.dispatched, false); assert.equal(empty.costUsd, 0);
  assert.equal((await decide(state, { signal: AbortSignal.abort() })).errorCode, 'ABORTED');
});

test('Luna usage preserves cache and reasoning without double-counting total tokens', async () => {
  const runtime = { getModel: () => ({}), completeSimple: async () => ({ model: 'gpt-6-luna',
    content: [{ type: 'text', text: '{"selectedId":null}' }],
    usage: { input: 10, output: 20, cacheRead: 80, cacheWrite: 5, reasoning: 12, totalTokens: 115 } }) };
  const result = await createWatcher({ kind: 'luna', runtime })(state);
  assert.deepEqual(result.usage, { input: 10, output: 20, cacheRead: 80, cacheWrite: 5, reasoning: 12, totalTokens: 115 });
  assert.equal(result.resolvedModel, 'gpt-6-luna');
  assert.equal(result.costUsd, null);
});

test('OpenRouter reported prompt total includes cache tokens and reasoning is a subset', async () => {
  const model = OPENROUTER_MODELS[0];
  const fetchImpl = async (url) => url.endsWith('/models')
    ? json({ data: [{ id: model, pricing: { prompt: '0', completion: '0' } }] })
    : json({ model: model.replace(/:free$/, ''), choices: [{ message: { content: '{"selectedId":null}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
        prompt_tokens_details: { cached_tokens: 80 }, completion_tokens_details: { reasoning_tokens: 12 } } });
  const result = await createWatcher({ kind: model, fetchImpl, env: { OPENROUTER_API_KEY: 'test' } })(state);
  assert.deepEqual(result.usage, { input: 100, output: 20, cacheRead: 80, cacheWrite: 0, reasoning: 12, totalTokens: 120 });
  assert.equal(result.resolvedModel, model.replace(/:free$/, ''));
});
