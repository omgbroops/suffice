import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DEFAULT_NATIVE_BIN, nativeArgs, parseNativeEvents, inspectNative, createNativeAdapter} from '../src/bench/native-codex.mjs';

const model = 'gpt-6.1-sol', pricing = {input: 2, output: 10, cacheRead: .1, cacheWrite: 2.5};
const tokens = {input_tokens: 100, cached_input_tokens: 80, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 5};
const jsonl = events => events.map(event => typeof event === 'string' ? event : JSON.stringify(event)).join('\n') + '\n';
const events = (extra = [], usage = tokens) => [{type: 'thread.started', thread_id: 'fixture'}, {type: 'turn.started'}, ...extra,
  {type: 'item.completed', item: {id: 'reply', type: 'agent_message', text: 'done'}}, {type: 'turn.completed', usage}];
const stream = (extra = [], usage = tokens) => jsonl(events(extra, usage));
const parse = (raw, options = {}) => parseNativeEvents(raw, {model, pricing, ...options});
const catalog = {models: [{slug: model, display_name: 'Sol', base_instructions: 'private huge prompt must not escape', model_messages: {instructions_template: 'also private'},
  supported_reasoning_levels: [{effort: 'high', description: 'irrelevant'}], context_window: 400_000}]};
const help = '--json --ephemeral --ignore-user-config --ignore-rules --strict-config --model --cd --sandbox --output-last-message';
function fakeProcess(handler = async () => ({stdout: stream(), stderr: 'raw diagnostic\n', exitCode: 0, latencyMs: 11}), seen = []) {
  return async (command, args, options) => {
    seen.push({command, args, options});
    if (args[0] === '--version') return {stdout: 'codex-cli 0.162.0-alpha.17.2\n', exitCode: 0};
    if (args[0] === 'debug') { assert.deepEqual(args, ['debug', 'models', '--bundled']); return {stdout: JSON.stringify(catalog), exitCode: 0}; }
    if (args.includes('--help')) return {stdout: help, exitCode: 0};
    return handler(command, args, options);
  };
}
async function fixture(t) {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'suffice-native-codex-')));
  t.after(() => rm(workspace, {recursive: true, force: true}));
  return {workspace, runDir: join(workspace, 'receipt'), prompt: 'literal `command` $(never execute) "quotes"\nsecond line', model, effort: 'high', timeoutMs: 1000, maxCostUsd: Number.MAX_VALUE};
}

test('complete native receipts use injected rates once and retain optional token totals', () => {
  const result = parse(stream());
  assert.equal(result.status, 'completed');
  assert.equal(result.valid, true);
  assert.equal(result.costKnown, true);
  assert.equal(result.costUsd, (20 * 2 + 80 * .1 + 20 * 10) / 1e6);
  assert.deepEqual(result.usage, {inputTokens: 100, cachedInputTokens: 80, cacheWriteInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 5});
  assert.deepEqual(result.rawUsage, [tokens]);
  assert.equal(result.modelIdentity.perResponseProof, false);
  assert.deepEqual(result.modelIdentity.observed, []);
  const custom = parse(stream(), {pricing: {input: 7, output: 11, cacheRead: 3, cacheWrite: 9}});
  assert.equal(custom.costUsd, (20 * 7 + 80 * 3 + 20 * 11) / 1e6);
});

test('positive cache writes use supplied write rates in both interpretations without pretending a known total', () => {
  const result = parse(stream([], {...tokens, cache_write_input_tokens: 10}));
  assert.equal(result.status, 'completed');
  assert.equal(result.costKnown, false);
  assert.equal(result.costUsd, null);
  assert.equal(result.knownCostFloorUsd, 0);
  assert.deepEqual(result.cacheWriteEstimateRangeUsd, {inputIncludesWrites: (10 * 2 + 80 * .1 + 10 * 2.5 + 20 * 10) / 1e6, inputExcludesWrites: (20 * 2 + 80 * .1 + 10 * 2.5 + 20 * 10) / 1e6});
});

test('one user-turn receipt is required and malformed usage cannot be priced', () => {
  const invalid = [
    jsonl(events().filter(event => event.type !== 'turn.started')),
    jsonl(events().filter(event => event.type !== 'turn.completed')),
    stream() + jsonl([{type: 'turn.completed', usage: tokens}]),
    stream() + 'not json\n',
    jsonl([{type: 'turn.completed', usage: tokens}, {type: 'turn.started'}]),
    stream([], {...tokens, input_tokens: Number.MAX_SAFE_INTEGER + 1}),
    stream([], {...tokens, cached_input_tokens: 101}),
    stream([], {...tokens, output_tokens: -1}),
    stream([], {...tokens, cached_input_tokens: '80'}),
    stream([], {...tokens, input_tokens: 1.5}),
    stream([], {...tokens, cache_write_input_tokens: -1}),
    stream([], {...tokens, reasoning_output_tokens: 21}),
    jsonl(events().filter(event => event.item?.type !== 'agent_message')),
  ];
  for (const raw of invalid) { const result = parse(raw); assert.equal(result.valid, false, raw); assert.equal(result.costKnown, false); assert.equal(result.costUsd, null); }
});

test('timeout, abort, overflow, process errors and provider errors keep partial cost unknown', () => {
  for (const options of [{timedOut: true}, {aborted: true}, {overflow: true}, {error: 'lost process'}, {exitCode: 1}]) {
    const result = parse(stream(), options);
    assert.equal(result.costKnown, false); assert.equal(result.costUsd, null); assert.equal(result.knownCostFloorUsd, 0);
    assert.equal(result.usage.inputTokens, 100); assert.deepEqual(result.rawUsage, [tokens]);
  }
  for (const error of [{type: 'error', message: 'lost request'}, {type: 'turn.failed'}, {type: 'item.completed', item: {id: 'err', type: 'error', message: 'provider error'}}]) {
    const result = parse(stream([error])); assert.equal(result.valid, false); assert.match(result.error, /provider or turn error/);
  }
});

test('pre-turn native host diagnostics retain their setup error message without a chronology error', () => {
  const message = 'Code Mode is unavailable because code-mode host is disabled. Enable features.code_mode_host and install codex-code-mode-host.';
  for (const failure of [
    {type: 'item.completed', item: {id: 'setup-error', type: 'error', message}},
    {type: 'item.error', error: {message}},
    {type: 'error', message},
  ]) {
    const result = parse(jsonl([failure, ...events()]));
    assert.equal(result.status, 'failed'); assert.equal(result.costKnown, false); assert.equal(result.costUsd, null);
    assert.equal(result.failureKind, 'setup_error'); assert.match(result.error, /Code Mode is unavailable/);
    assert.equal(result.error.includes('outside the active user turn'), false);
    assert.equal(result.diagnostics[0].phase, 'setup'); assert.equal(result.diagnostics[0].message, message);
    assert.deepEqual(result.rawUsage, [tokens]);
  }
});

test('native tool IDs deduplicate across events and failed commands may recover', () => {
  const result = parse(stream([
    {type: 'item.started', item: {id: 'one', type: 'command_execution', status: 'in_progress'}},
    {type: 'item.updated', item: {id: 'one', type: 'command_execution'}},
    {type: 'item.completed', item: {id: 'one', type: 'command_execution', status: 'failed', exit_code: 1, error: 'test failed'}},
    {type: 'item.completed', item: {id: 'two', type: 'file_change', status: 'completed'}},
    {type: 'item.completed', item: {id: 'three', type: 'command_execution', status: 'completed', exit_code: 0}},
  ]));
  assert.equal(result.status, 'completed'); assert.equal(result.toolCalls, 3); assert.equal(result.failedToolCalls, 1); assert.equal(result.costKnown, true);
  assert.equal(parse(stream([{type: 'item.completed', item: {type: 'command_execution'}}])).valid, false);
  const unfinished = parse(stream([{type: 'item.started', item: {id: 'unfinished', type: 'command_execution'}}]));
  assert.equal(unfinished.valid, false); assert.equal(unfinished.costKnown, false); assert.match(unfinished.error, /Incomplete native tool receipt/);
});

test('model substitutions fail and missing identity is reported honestly', () => {
  const matching = events(); matching[1].model = model;
  assert.equal(parse(jsonl(matching)).modelIdentity.perResponseProof, false);
  matching.at(-1).model = model;
  assert.equal(parse(jsonl(matching)).modelIdentity.perResponseProof, true);
  const wrong = events(); wrong[1].model = 'gpt-6-luna';
  const result = parse(jsonl(wrong)); assert.equal(result.valid, false); assert.equal(result.costKnown, false); assert.match(result.error, /differs/);
  assert.equal(parse(stream(), {model: undefined}).valid, false);
});

test('missing or invalid pinned rates do not turn valid receipts into zero-cost inference', () => {
  for (const invalid of [undefined, {input: 2, output: 10, cacheRead: .1}, {...pricing, cacheWrite: -1}, {...pricing, input: Infinity}]) {
    const result = parse(stream(), {pricing: invalid}); assert.equal(result.status, 'completed'); assert.equal(result.costKnown, false); assert.equal(result.costUsd, null);
  }
  const long = parse(stream([], {...tokens, input_tokens: 300_000})); assert.equal(long.costKnown, true); // explicitly base-rate estimate, not a surcharge claim
});

test('argv disables inherited extensions while preserving native shell/apply_patch and sandbox', async t => {
  const call = await fixture(t), args = nativeArgs(call);
  assert.equal(args[args.indexOf('--model') + 1], model);
  assert.equal(args[args.indexOf('--cd') + 1], call.workspace);
  assert.equal(args[args.indexOf('--sandbox') + 1], 'workspace-write');
  for (const value of ['approval_policy="never"', 'project_doc_max_bytes=0', 'mcp_servers={}', 'features.apps=false', 'features.plugins=false', 'features.hooks=false', 'features.browser_use=false', 'web_search="disabled"']) assert.ok(args.includes(value), value);
  assert.equal(args.includes('features.shell_tool=false'), false);
  assert.equal(args.includes('features.code_mode_host=true'), true);
  assert.equal(args.includes('features.code_mode_host=false'), false);
  assert.equal(args.some(arg => arg.includes('dangerously-bypass')), false);
  assert.equal(args.at(-1), '-'); assert.equal(args.includes(call.prompt), false);
  assert.throws(() => nativeArgs({...call, noTools: true}), /native tools/);
  assert.throws(() => nativeArgs({...call, model: undefined}), /exact native model/);
});

test('sandbox policy changes require explicit valid caller configuration', async t => {
  const call = await fixture(t), args = nativeArgs({...call, sandbox: 'danger-full-access'});
  assert.equal(args[args.indexOf('--sandbox') + 1], 'danger-full-access');
  assert.equal(args.includes('approval_policy="never"'), true);
  for (const sandbox of ['read-only', '', 'unrestricted', null, true]) assert.throws(() => nativeArgs({...call, sandbox}), /Native sandbox must/);
  const seen = [], adapter = createNativeAdapter({bin: process.execPath, pricing, run: fakeProcess(undefined, seen)});
  const result = await adapter({...call, sandbox: 'danger-full-access'});
  assert.equal(result.status, 'completed', result.error);
  assert.equal(result.sandbox, 'danger-full-access'); assert.match(result.toolPolicy, /danger-full-access/);
  assert.deepEqual(result.permissionPolicy, {requestedSandbox: 'danger-full-access', appliedSandbox: 'danger-full-access', approvalPolicy: 'never', source: 'explicit caller configuration', automaticFallback: false});
  assert.equal(seen.filter(item => item.args.includes('--json')).length, 1);
  const invalid = await adapter({...call, sandbox: 'unrestricted', runDir: join(call.workspace, 'invalid-policy')});
  assert.equal(invalid.status, 'unavailable'); assert.equal(invalid.dispatched, false); assert.equal(invalid.permissionPolicy.appliedSandbox, null);
  assert.equal(seen.filter(item => item.args.includes('--json')).length, 1);
});

test('read-only CLI inspection filters bundled catalog to compact metadata and never searches PATH', async () => {
  const seen = [], result = await inspectNative(process.execPath, {run: fakeProcess(undefined, seen)});
  assert.equal(result.ready, true, result.error); assert.equal(result.models[0].id, model);
  assert.equal(result.binary.sha256.length, 64); assert.match(result.version, /0.162.0/);
  assert.equal(JSON.stringify(result).includes('private huge'), false); assert.equal(JSON.stringify(result).includes('instructions_template'), false);
  assert.ok(seen.every(call => call.command === result.binary.path));
  assert.equal((await inspectNative('codex', {run: fakeProcess()})).ready, false);
  assert.equal(DEFAULT_NATIVE_BIN.includes('9614f1d9b40d9c4f'), true);
  assert.equal((await inspectNative(process.execPath, {run: fakeProcess(), model: 'absent'})).ready, false);
});

test('fake native invocation preserves raw prompt/events/stderr/final and receipt independently', async t => {
  const call = await fixture(t), seen = [], raw = stream();
  const result = await createNativeAdapter({bin: process.execPath, pricing, run: fakeProcess(async () => ({stdout: raw, stderr: 'raw diagnostic\n', exitCode: 0, latencyMs: 11}), seen)})(call);
  assert.equal(result.status, 'completed', result.error); assert.equal(result.latencyMs, 11); assert.equal(result.dispatched, true);
  assert.equal(result.cliIdentity.ready, true); assert.equal(result.modelIdentity.perResponseProof, false); assert.equal(result.budgetPolicy.enforced, false);
  assert.equal(await readFile(result.artifacts.prompt, 'utf8'), call.prompt);
  assert.equal(await readFile(result.artifacts.events, 'utf8'), raw);
  assert.equal(await readFile(result.artifacts.stderr, 'utf8'), 'raw diagnostic\n');
  assert.equal(await readFile(result.artifacts.final, 'utf8'), 'done');
  assert.equal(JSON.parse(await readFile(result.artifacts.receipt, 'utf8')).model, model);
  const invocation = seen.find(item => item.args.includes('--json'));
  assert.equal(invocation.options.input, call.prompt); assert.equal(invocation.options.cwd, call.workspace); assert.equal(invocation.args.includes(call.prompt), false);
  assert.equal(invocation.options.stdoutPath, result.artifacts.events); assert.equal(invocation.options.stderrPath, result.artifacts.stderr);
});

test('native sandbox setup errors remain failed receipts without a sandbox bypass retry', async t => {
  const call = await fixture(t), seen = [];
  const result = await createNativeAdapter({bin: process.execPath, pricing, run: fakeProcess(async () => ({stdout: '', stderr: 'Windows sandbox initialization failed', exitCode: 1}), seen)})(call);
  assert.equal(result.status, 'failed'); assert.equal(result.costKnown, false); assert.equal(result.costUsd, null);
  assert.equal(seen.filter(item => item.args.includes('--json')).length, 1);
  assert.equal(result.permissionPolicy.requestedSandbox, 'workspace-write');
  assert.equal(result.permissionPolicy.automaticFallback, false);
  assert.match(await readFile(result.artifacts.stderr, 'utf8'), /sandbox initialization failed/);
});

test('finite monetary caps are refused before dispatch, with a complete known-zero local receipt', async t => {
  const call = await fixture(t), seen = [];
  const result = await createNativeAdapter({bin: process.execPath, pricing, run: fakeProcess(undefined, seen)})({...call, maxCostUsd: 1});
  assert.equal(result.status, 'unavailable'); assert.equal(result.dispatched, false); assert.equal(result.costKnown, true); assert.equal(result.costUsd, 0); assert.equal(seen.length, 0);
  assert.match(result.error, /cannot enforce a monetary cap/);
  for (const path of Object.values(result.artifacts)) assert.equal(typeof await readFile(path, 'utf8'), 'string');
});

test('preexisting complete raw files survive output overflow and final disagreements fail', async t => {
  const call = await fixture(t);
  const result = await createNativeAdapter({bin: process.execPath, pricing, run: fakeProcess(async (_, args, options) => {
    await writeFile(options.stdoutPath, 'full raw bytes retained despite memory truncation'); await writeFile(options.stderrPath, 'full stderr');
    return {stdout: stream(), stderr: 'short stderr', exitCode: 0, overflow: true};
  })})(call);
  assert.equal(result.status, 'overflow'); assert.equal(result.costKnown, false); assert.equal(result.knownCostFloorUsd, 0);
  assert.equal(await readFile(result.artifacts.events, 'utf8'), 'full raw bytes retained despite memory truncation');
  const other = {...call, runDir: join(call.workspace, 'other')};
  const mismatch = await createNativeAdapter({bin: process.execPath, pricing, run: fakeProcess(async (_, args) => {
    await writeFile(args[args.indexOf('--output-last-message') + 1], 'different answer'); return {stdout: stream(), exitCode: 0};
  })})(other);
  assert.equal(mismatch.status, 'failed'); assert.equal(mismatch.costKnown, false); assert.match(mismatch.error, /disagrees/);
});
