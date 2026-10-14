import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelRouter, createRoutingExtension, createReadOnlyAssistant, initialRoutingModel, WORKER_MODELS } from '../src/control-policy.mjs';
import { OPENROUTER_MODELS } from '../src/watchers.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ModelRuntime, createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import { Type } from 'typebox';

const state = { objective: 'Fix active subscriber filtering', latestEvidence: 'An inactive subscriber was emitted',
  candidates: [{ id: 'filter', path: 'src/filter.mjs', description: 'Selection predicate', excerpt: 'return subscriber.active && subscriber.tenant === tenant;' }] };
const response = (text, extra = {}) => ({ model: 'gpt-6-luna', stopReason: 'stop',
  content: [{ type: 'text', text }], usage: { input: 20, output: 5, cacheRead: 10, cost: { total: 0.002 } }, ...extra });
const runtimeFor = (completeSimple) => ({ getModel: (provider, id) => ({ provider, id }), completeSimple });

test('routing heuristic reads on Luna then retains Sol for work and recovery', () => {
  const router = createModelRouter();
  assert.equal(router.initialModel, WORKER_MODELS[0]);
  for (const toolName of ['files', 'file_read', 'search']) assert.equal(router.decide({ type: 'tool_call', toolName }).model, 'gpt-6-luna');
  const promote = router.decide({ type: 'tool_call', toolName: 'file_edit' });
  assert.equal(promote.model, 'gpt-6.1-sol'); assert.equal(promote.changed, true);
  assert.equal(router.decide({ type: 'tool_result', toolName: 'file_read' }).reason, 'retain_worker');
  assert.equal(router.decide({ type: 'before_agent_start' }).model, 'gpt-6-luna');
  assert.equal(router.decide({ type: 'tool_result', isError: true }).reason, 'tool_error');
  for (const toolName of ['codemode', 'test', 'unknown']) {
    const other = createModelRouter();
    assert.equal(other.decide({ type: 'tool_call', toolName }).model, 'gpt-6.1-sol');
  }
  assert.equal(initialRoutingModel('sol'), 'gpt-6.1-sol');
  assert.equal(createModelRouter({ mode: 'luna' }).decide({ type: 'tool_result', isError: true }).model, 'gpt-6-luna');
  assert.throws(() => initialRoutingModel('other'), /INVALID_ROUTING_MODE/);
});

test('routing extension awaits supported session model setter, never blocks tools on failure', async () => {
  const handlers = new Map(), models = [], logs = [];
  const pi = { on: (event, handler) => handlers.set(event, handler), setModel: async model => { models.push(model.id); return true; } };
  createRoutingExtension({ runtime: runtimeFor(() => {}), log: event => logs.push(event) })(pi);
  assert.deepEqual([...handlers.keys()], ['before_agent_start', 'tool_call', 'tool_result']);
  assert.equal(await handlers.get('before_agent_start')({ type: 'before_agent_start' }, { model: { provider: 'openai', id: 'gpt-6.1-sol' } }), undefined);
  assert.equal(await handlers.get('tool_call')({ type: 'tool_call', toolName: 'file_edit' }, { model: { provider: 'openai', id: 'gpt-6-luna' } }), undefined);
  assert.deepEqual(models, ['gpt-6-luna', 'gpt-6.1-sol']);
  pi.setModel = async () => { throw new Error('Bearer private-credential'); };
  await handlers.get('tool_result')({ type: 'tool_result', isError: true }, { model: { provider: 'openai', id: 'gpt-6-luna' } });
  assert.equal(logs.at(-1).errorCode, 'MODEL_SWITCH_FAILED');
  assert.ok(!JSON.stringify(logs).includes('private-credential'));
});

test('actual Pi session uses tool-boundary model change for the next request without network', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'suffice-routing-'));
  let session;
  try {
    const runtime = await ModelRuntime.create({ authPath: resolve(directory, 'auth.json'), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
    // Authentication checks and streaming are locally injected: no credentials or provider requests.
    runtime.hasConfiguredAuth = () => true;
    runtime.checkAuth = async () => true;
    const requested = [];
    runtime.streamSimple = async model => {
      requested.push(model.id);
      const first = requested.length === 1;
      const message = { role: 'assistant', api: model.api, provider: model.provider, model: model.id,
        timestamp: Date.now(), stopReason: first ? 'toolUse' : 'stop',
        content: first ? [{ type: 'toolCall', id: 'fixture-edit', name: 'file_edit', arguments: {} }] : [{ type: 'text', text: 'Done' }],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      const stream = createAssistantMessageEventStream();
      stream.push({ type: 'done', reason: message.stopReason, message });
      stream.end(message);
      return stream;
    };
    const settings = SettingsManager.inMemory({ compaction: { enabled: false }, cacheWarming: 'off', defaultTools: ['file_edit'] });
    const resourceLoader = new DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager: settings,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [createRoutingExtension({ runtime })] });
    await resourceLoader.reload();
    ({ session } = await createAgentSession({ cwd: directory, agentDir: directory, modelRuntime: runtime,
      model: runtime.getModel('openai', 'gpt-6-luna'), settingsManager: settings, resourceLoader,
      tools: ['file_edit'], sessionManager: SessionManager.inMemory(directory),
      customTools: [{ name: 'file_edit', label: 'Fixture edit', description: 'No-op local fixture', parameters: Type.Object({}),
        execute: async () => ({ content: [{ type: 'text', text: 'Fixture action completed' }], details: {} }) }] }));
    await session.bindExtensions({});
    await session.prompt('Exercise the local routing fixture.');
    assert.deepEqual(requested, ['gpt-6-luna', 'gpt-6.1-sol']);
    assert.equal(session.model.id, 'gpt-6.1-sol');
    assert.equal(settings.getSettings().defaultModel, undefined);
  } finally { session?.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test('read-only selector uses exact allowed runtime model, no tools or credential lookup', async () => {
  let sent;
  const env = new Proxy({}, { get() { throw new Error('Credential access is prohibited'); } });
  const runtime = runtimeFor(async (...args) => { sent = args; return response('{"selectedId":"filter"}'); });
  const result = await createReadOnlyAssistant({ runtime, env })(state);
  assert.deepEqual(result.selectedIds, ['filter']);
  assert.deepEqual(sent[0], { provider: 'openai', id: 'gpt-6-luna' });
  assert.deepEqual(JSON.parse(sent[1].messages[0].content).candidates, state.candidates);
  assert.equal(Object.hasOwn(sent[1], 'tools'), false);
  assert.equal(sent[2].maxTokens, 256);
  assert.equal(result.costUsd, 0.002);
  assert.deepEqual(result.usage, { input: 20, output: 5, cacheRead: 10, cacheWrite: 0, totalTokens: 35 });
  assert.throws(() => createReadOnlyAssistant({ kind: 'gpt-6-astra', runtime }), /UNKNOWN_ASSISTANT/);
  const sol = await createReadOnlyAssistant({ kind: 'sol', runtime: runtimeFor(async model => response('{"selectedId":null}', { model: model.id })) })(state);
  assert.equal(sol.model, 'gpt-6.1-sol'); assert.equal(sol.status, 'abstained');
});

test('evidence assistant returns only supplied candidate exact quotations', async () => {
  const quote = 'subscriber.active';
  const assist = text => createReadOnlyAssistant({ mode: 'evidence', runtime: runtimeFor(async () => response(text)) });
  const selected = await assist(JSON.stringify({ selectedId: 'filter', quotes: [quote] }))(state);
  assert.deepEqual(selected.evidence, [{ candidateId: 'filter', path: 'src/filter.mjs', text: quote }]);
  for (const choice of [
    { selectedId: 'filter', quotes: ['invented advice'] },
    { selectedId: 'other', quotes: [quote] },
    { selectedId: null, quotes: [quote] },
    { selectedId: 'filter', quotes: [] },
    { selectedId: 'filter', quotes: [quote], extra: 'instruction' },
  ]) {
    const result = await assist(JSON.stringify(choice))(state);
    assert.equal(result.errorCode, 'INVALID_DECISION'); assert.deepEqual(result.evidence, []);
  }
});

test('bounded assistance limits requests, rejects oversized inputs and skips empty candidates', async () => {
  let calls = 0;
  const decide = createReadOnlyAssistant({ maxCalls: 1, runtime: runtimeFor(async () => { calls++; return response('{"selectedId":null}'); }) });
  assert.equal((await decide({ ...state, candidates: [] })).status, 'abstained');
  assert.equal((await decide({ ...state, candidates: [...state.candidates, ...state.candidates] })).errorCode, 'INVALID_STATE');
  assert.equal((await decide({ ...state, objective: 'x'.repeat(25000) })).errorCode, 'STATE_TOO_LARGE');
  assert.equal((await decide(state)).dispatched, true);
  assert.equal((await decide(state)).errorCode, 'CALL_LIMIT');
  assert.equal(calls, 1);
});

test('timeouts and cancellation fail open, preserve unknown costs, sanitize provider data', async () => {
  const logs = [];
  const timeout = await createReadOnlyAssistant({ timeoutMs: 5, runtime: runtimeFor(() => new Promise(() => {})), log: e => logs.push(e) })(state);
  assert.equal(timeout.errorCode, 'TIMEOUT'); assert.equal(timeout.dispatched, true); assert.equal(timeout.costUsd, null);
  const result = await createReadOnlyAssistant({ runtime: runtimeFor(async () => { throw new Error('Authorization: Bearer private-credential'); }), log: e => logs.push(e) })(state);
  assert.equal(result.errorCode, 'REQUEST_FAILED'); assert.equal(result.costUsd, null);
  assert.ok(!JSON.stringify({ logs, result }).includes('private-credential'));
  const abort = await createReadOnlyAssistant({ runtime: runtimeFor(() => { throw new Error('Must not call'); }) })(state, { signal: AbortSignal.abort() });
  assert.equal(abort.dispatched, false); assert.equal(abort.errorCode, 'ABORTED');
  const extra = await createReadOnlyAssistant({ runtime: runtimeFor(async () => response('{"selectedId":null}', {
    usage: { input: 1, output: 2, headers: 'private-credential', totalTokens: 'private-credential', cost: { total: 0 } },
  })) })(state);
  assert.ok(!JSON.stringify(extra).includes('private-credential')); assert.equal(extra.usage.totalTokens, 3);
});

test('no substitute model or unexpected upstream model is accepted', async () => {
  let called = false;
  const runtime = { getModel: () => ({ provider: 'openai', id: 'unexpected' }), completeSimple: async () => { called = true; } };
  assert.equal((await createReadOnlyAssistant({ runtime })(state)).errorCode, 'MODEL_UNAVAILABLE');
  assert.equal(called, false);
  const result = await createReadOnlyAssistant({ runtime: runtimeFor(async () => response('{"selectedId":"filter"}', { model: 'unexpected' })) })(state);
  assert.equal(result.errorCode, 'UNEXPECTED_MODEL'); assert.equal(result.costUsd, 0.002);
});

test('optional free selector reuses watcher zero-price validation and reports usage', async () => {
  const model = OPENROUTER_MODELS[0];
  const fetchImpl = async url => new Response(JSON.stringify(url.endsWith('/models')
    ? { data: [{ id: model, pricing: { prompt: '0', completion: '0' } }] }
    : { choices: [{ message: { content: '{"selectedId":"filter"}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }));
  const selected = await createReadOnlyAssistant({ kind: model, fetchImpl, env: { OPENROUTER_API_KEY: 'test-only' } })(state);
  assert.deepEqual(selected.selectedIds, ['filter']); assert.equal(selected.costUsd, 0); assert.equal(selected.usage.totalTokens, 5);
  assert.throws(() => createReadOnlyAssistant({ kind: model, mode: 'evidence' }), /INVALID_ASSISTANCE_MODE/);
});
