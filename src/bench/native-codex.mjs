import {createHash} from 'node:crypto';
import {mkdir, readFile, realpath, stat, writeFile} from 'node:fs/promises';
import {isAbsolute, join, resolve} from 'node:path';
import {runProcess} from '../v9/process.mjs';

// Deliberately do not search PATH: the older PATH CLI does not support this model.
export const DEFAULT_NATIVE_BIN = 'C:/Users/Eric Qin/AppData/Local/OpenAI/Codex/bin/9614f1d9b40d9c4f/codex.exe';
export const DEFAULT_NATIVE_MODEL = 'gpt-6.1-sol';
const REQUIRED_FLAGS = ['--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config', '--model', '--cd', '--sandbox', '--output-last-message'];
const safeError = error => String(error?.message ?? error).replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 2000);
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600});
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
const sandboxFor = call => {
  const sandbox = call.sandbox === undefined ? 'workspace-write' : call.sandbox;
  if (!['workspace-write', 'danger-full-access'].includes(sandbox)) throw Error('Native sandbox must be workspace-write or danger-full-access');
  return sandbox;
};

function declared(call) {
  if (typeof call.model !== 'string' || !call.model || /[\0\r\n]/.test(call.model)) throw Error('An exact native model ID is required');
  if (typeof call.effort !== 'string' || !call.effort || /[\0\r\n]/.test(call.effort)) throw Error('An explicit native reasoning effort is required');
  if (typeof call.workspace !== 'string' || !isAbsolute(call.workspace) || call.workspace.includes('\0')) throw Error('An absolute native workspace is required');
}

export function nativeArgs(call) {
  declared(call);
  if (call.noTools) throw Error('The native benchmark adapter requires native tools; use the Pi adapter for a tool-free call');
  const sandbox = sandboxFor(call);
  const args = ['exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config', '--model', call.model, '--cd', call.workspace,
    '--sandbox', sandbox, '--color', 'never'];
  // Keep native shell/apply_patch behavior. These overrides only remove unrelated
  // extensions and inherited project documentation from the controlled baseline.
  const config = {
    approval_policy: 'never', model_reasoning_effort: call.effort, project_doc_max_bytes: 0,
    web_search: 'disabled', mcp_servers: {},
    'features.apps': false, 'features.plugins': false, 'features.remote_plugin': false, 'features.hooks': false,
    'features.multi_agent': false, 'features.multi_agent_v2': false, 'features.memories': false,
    'features.browser_use': false, 'features.browser_use_external': false, 'features.browser_use_full_cdp_access': false,
    'features.browser_annotation_api': false, 'features.in_app_browser': false, 'features.computer_use': false,
    // This binary implements its native shell/apply_patch tools through this
    // bundled host. Disabling it removes the entire native tool surface.
    'features.image_generation': false, 'features.shell_snapshot': false, 'features.code_mode_host': true,
    'features.standalone_web_search': false, 'features.external_agent_memory_import': false,
  };
  for (const [key, value] of Object.entries(config)) args.push('-c', `${key}=${JSON.stringify(value)}`);
  if (call.runDir) args.push('--output-last-message', resolve(call.runDir, 'final.txt'));
  args.push('-');
  return args;
}

function compactModel(model) {
  return {
    id: model.slug ?? model.id,
    displayName: typeof model.display_name === 'string' ? model.display_name : null,
    supportedReasoningEfforts: (model.supported_reasoning_levels ?? []).map(level => typeof level === 'string' ? level : level?.effort).filter(value => typeof value === 'string'),
    contextWindow: nonnegativeInteger(model.context_window) ? model.context_window : null,
    maxContextWindow: nonnegativeInteger(model.max_context_window) ? model.max_context_window : null,
    shellType: typeof model.shell_type === 'string' ? model.shell_type : null,
    applyPatchToolType: typeof model.apply_patch_tool_type === 'string' ? model.apply_patch_tool_type : null,
  };
}

// No login, inference, credential access, catalog refresh, or configuration writes.
// Never return the raw catalog: it includes large model base instructions.
export async function inspectNative(bin = DEFAULT_NATIVE_BIN, {run = runProcess, model = DEFAULT_NATIVE_MODEL, effort = 'high'} = {}) {
  let binary = null, version = null, models = [], supportedFlags = [];
  try {
    if (typeof bin !== 'string' || !isAbsolute(bin) || bin.includes('\0')) throw Error('Native Codex requires an explicit absolute executable path');
    const path = await realpath(bin), info = await stat(path);
    if (!info.isFile()) throw Error('Native Codex executable is not a regular file');
    const checks = await Promise.all([
      readFile(path).then(bytes => createHash('sha256').update(bytes).digest('hex')),
      run(path, ['--version'], {timeoutMs: 20_000, maxBytes: 16_000}),
      run(path, ['debug', 'models', '--bundled'], {timeoutMs: 20_000, maxBytes: 32_000_000}),
      run(path, ['exec', '--help'], {timeoutMs: 20_000, maxBytes: 100_000}),
    ]);
    binary = {path, sha256: checks[0], bytes: info.size, mtimeMs: info.mtimeMs};
    for (const result of checks.slice(1)) if (result.exitCode !== 0 || result.timedOut || result.aborted || result.overflow || result.error) throw Error('Native CLI metadata inspection failed: ' + (result.error ?? `exit ${result.exitCode}`));
    version = checks[1].stdout.trim();
    if (!/^codex-cli\s*\S+/.test(version) || version.includes('\n')) throw Error('Unexpected native CLI version response');
    const catalog = JSON.parse(checks[2].stdout), entries = Array.isArray(catalog) ? catalog : catalog.models;
    if (!Array.isArray(entries) || entries.some(entry => !entry || typeof (entry.slug ?? entry.id) !== 'string')) throw Error('Malformed native bundled model catalog');
    models = entries.map(compactModel);
    if (new Set(models.map(entry => entry.id)).size !== models.length) throw Error('Duplicate model IDs in native catalog');
    supportedFlags = REQUIRED_FLAGS.filter(flag => checks[3].stdout.includes(flag));
    if (supportedFlags.length !== REQUIRED_FLAGS.length) throw Error('Native CLI lacks required controlled-run flags');
    const selected = models.find(entry => entry.id === model);
    if (!selected) throw Error(`Exact native model ${model} is absent from this binary's bundled catalog`);
    if (!selected.supportedReasoningEfforts.includes(effort)) throw Error(`Native model ${model} does not declare effort ${effort}`);
    return {runtime: 'native-codex', ready: true, binary, version, models, requestedModel: model, requestedEffort: effort, supportedFlags, catalogSource: 'binary bundled catalog; no refresh', error: null};
  } catch (error) {
    return {runtime: 'native-codex', ready: false, binary, version, models, requestedModel: model, requestedEffort: effort, supportedFlags, catalogSource: 'binary bundled catalog; no refresh', error: safeError(error)};
  }
}

function validPricing(pricing) {
  return pricing && ['input', 'output', 'cacheRead', 'cacheWrite'].every(key => Number.isFinite(pricing[key]) && pricing[key] >= 0);
}

export function parseNativeEvents(raw, {exitCode = 0, timedOut = false, overflow = false, aborted = false, error = null, model, pricing} = {}) {
  const errors = [], tools = new Map(), rawUsage = [], observedModels = new Set(), responseModels = new Set(), modelEvidence = [], diagnostics = [];
  const usage = {inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0};
  let started = 0, completed = 0, final = '', finalSeen = false, usageValid = false, providerFailed = false, setupFailed = false;
  const recordFailure = (source, detail) => {
    const phase = started === 0 ? 'setup' : 'turn';
    const message = safeError(detail?.message ?? detail?.error?.message ?? detail?.error ?? 'No diagnostic message supplied');
    diagnostics.push({source, phase, message});
    errors.push(`Native ${phase} error: ${message}`);
    if (phase === 'setup') setupFailed = true;
    else providerFailed = true;
  };
  if (typeof model !== 'string' || !model) errors.push('An exact requested model is required');
  for (const [index, line] of String(raw ?? '').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { errors.push(`Malformed JSON event at line ${index + 1}`); continue; }
    if (!event || Array.isArray(event) || typeof event !== 'object' || typeof event.type !== 'string') { errors.push(`Invalid event at line ${index + 1}`); continue; }
    if (['thread.started', 'turn.started', 'turn.completed', 'turn.failed'].includes(event.type)) {
      for (const value of [event.model, event.model_id, event.response?.model]) if (typeof value === 'string') {
        observedModels.add(value);
        modelEvidence.push({eventType: event.type, model: value});
        if (event.type === 'turn.completed') responseModels.add(value);
      }
    }
    if (event.type === 'turn.started') {
      started++;
      if (completed) errors.push('User turn starts after completion');
    }
    if (event.type === 'error' || event.type === 'turn.failed' || event.type === 'item.error') {
      recordFailure(event.type, event.item ?? event);
      if (event.type === 'item.error') continue;
    }
    if (event.type === 'turn.completed') {
      completed++;
      if (started !== 1) errors.push('Completion is outside exactly one started user turn');
      const tokens = event.usage;
      rawUsage.push(tokens ?? null);
      const valid = tokens && ['input_tokens', 'cached_input_tokens', 'output_tokens'].every(key => nonnegativeInteger(tokens[key])) && tokens.cached_input_tokens <= tokens.input_tokens
        && (tokens.cache_write_input_tokens === undefined || nonnegativeInteger(tokens.cache_write_input_tokens))
        && (tokens.reasoning_output_tokens === undefined || (nonnegativeInteger(tokens.reasoning_output_tokens) && tokens.reasoning_output_tokens <= tokens.output_tokens));
      if (!valid) errors.push('Malformed native usage receipt');
      if (completed === 1 && valid) {
        usageValid = true;
        usage.inputTokens = tokens.input_tokens;
        usage.cachedInputTokens = tokens.cached_input_tokens;
        usage.cacheWriteInputTokens = tokens.cache_write_input_tokens ?? 0;
        usage.outputTokens = tokens.output_tokens;
        usage.reasoningOutputTokens = tokens.reasoning_output_tokens ?? 0;
      }
    }
    if (event.type.startsWith('item.')) {
      const item = event.item;
      if (!item || typeof item !== 'object' || typeof item.type !== 'string') { errors.push('Malformed native item'); continue; }
      // Setup diagnostics can precede turn.started. They are a setup failure,
      // rather than a malformed event chronology, and their message is evidence.
      if (item.type === 'error') { recordFailure(event.type, item); continue; }
      if (started !== 1 || completed) errors.push('Native item is outside the active user turn');
      if (item.type === 'agent_message') {
        if (event.type === 'item.completed') {
          if (typeof item.text !== 'string') errors.push('Malformed final agent message');
          else { final = item.text; finalSeen = true; }
        }
      } else if (item.type !== 'reasoning') {
        const id = item.id ?? item.call_id;
        if (typeof id !== 'string' || !id) errors.push('Native tool item is missing its ID');
        else {
          const existing = tools.get(id);
          if (existing && existing.type !== item.type) errors.push('Native tool ID changed type');
          tools.set(id, {id, type: item.type, completed: Boolean(existing?.completed || event.type === 'item.completed'),
            failed: Boolean(existing?.failed || item.status === 'failed' || (Number.isInteger(item.exit_code) && item.exit_code !== 0))});
        }
      }
    }
  }
  if (started !== 1 || completed !== 1 || !usageValid || !finalSeen) errors.push('Incomplete native user-turn receipt');
  if ([...tools.values()].some(tool => !tool.completed)) errors.push('Incomplete native tool receipt');
  if (providerFailed) errors.push('Native provider or turn error');
  if (setupFailed) errors.push('Native tool or session setup failed');
  if ([...observedModels].some(value => value !== model)) errors.push('Observed native model differs from the exact requested model');
  if (exitCode !== 0) errors.push(`Native process exited with ${exitCode}`);
  if (timedOut) errors.push('Native process timed out');
  if (aborted) errors.push('Native process was aborted');
  if (overflow) errors.push('Native event output allowance exceeded');
  if (error) errors.push(safeError(error));
  const valid = errors.length === 0;
  // This CLI's aggregate does not specify whether positive cache writes are
  // included in input_tokens. Preserve both possible estimates instead of
  // silently choosing a meaning. Zero writes have no such ambiguity.
  let cacheWriteEstimateRangeUsd = null;
  if (valid && validPricing(pricing) && usage.cacheWriteInputTokens) {
    const base = (usage.inputTokens - usage.cachedInputTokens) * pricing.input + usage.cachedInputTokens * pricing.cacheRead + usage.outputTokens * pricing.output;
    const write = usage.cacheWriteInputTokens * pricing.cacheWrite;
    const included = base - usage.cacheWriteInputTokens * pricing.input + write;
    const excluded = base + write;
    cacheWriteEstimateRangeUsd = {inputIncludesWrites: usage.inputTokens >= usage.cachedInputTokens + usage.cacheWriteInputTokens ? included / 1_000_000 : null, inputExcludesWrites: excluded / 1_000_000};
  }
  const estimate = valid && validPricing(pricing) && !usage.cacheWriteInputTokens ? ((usage.inputTokens - usage.cachedInputTokens) * pricing.input + usage.cachedInputTokens * pricing.cacheRead + usage.outputTokens * pricing.output) / 1_000_000 : null;
  const costKnown = estimate !== null && Number.isFinite(estimate);
  return {
    status: timedOut ? 'timeout' : aborted ? 'aborted' : overflow ? 'overflow' : valid ? 'completed' : 'failed',
    valid, final, text: final, usage, rawUsage, usageReconciled: valid, userTurns: {started, completed},
    toolCalls: tools.size, failedToolCalls: [...tools.values()].filter(tool => tool.failed).length, nativeTools: [...tools.values()],
    costKnown, costUsd: costKnown ? estimate : null,
    cacheWriteEstimateRangeUsd,
    cacheWriteAccounting: usage.cacheWriteInputTokens ? 'Positive cache writes retained; inclusion in native input_tokens is undocumented, so exact aggregate pricing is unknown. Both base-rate interpretations use the supplied cacheWrite rate.' : 'No cache writes reported; cache reads are a subset of input_tokens and reasoning is a subset of output_tokens',
    // A partial aggregate cannot establish a nonzero billed-cost lower bound.
    knownCostFloorUsd: costKnown ? estimate : 0,
    modelIdentity: {requested: model ?? null, observed: [...observedModels], evidence: modelEvidence, perResponseProof: responseModels.size > 0 && [...responseModels].every(value => value === model)},
    diagnostics, failureKind: setupFailed ? 'setup_error' : providerFailed ? 'provider_error' : valid ? null : 'receipt_or_process_error',
    error: errors.length ? [...new Set(errors)].join('; ') : null,
  };
}

async function preserveIfAbsent(path, text) {
  try { await writeFile(path, text, {flag: 'wx', mode: 0o600}); } catch (error) { if (error.code !== 'EEXIST') throw error; }
}

export function createNativeAdapter({bin = DEFAULT_NATIVE_BIN, run = runProcess, pricing} = {}) {
  let inspection;
  return async call => {
    const startedAt = Date.now();
    const requestedSandbox = call.sandbox === undefined ? 'workspace-write' : call.sandbox;
    await mkdir(call.runDir, {recursive: true});
    const artifacts = Object.fromEntries(['prompt', 'events', 'stderr', 'final', 'receipt'].map(name => [name, resolve(call.runDir, name === 'events' ? 'events.jsonl' : name === 'receipt' ? 'receipt.json' : name + '.txt')]));
    await writeFile(artifacts.prompt, call.prompt, {flag: 'wx', mode: 0o600});
    let out = {}, identity = null, dispatched = false, failure = null;
    try {
      const args = nativeArgs(call);
      if (call.maxCostUsd !== undefined && call.maxCostUsd !== Number.MAX_VALUE) throw Error('Native CLI cannot enforce a monetary cap; this controlled run requires maxCostUsd=Number.MAX_VALUE or an omitted cap');
      if (!Number.isFinite(call.timeoutMs) || call.timeoutMs <= 0) throw Error('A positive native timeout is required');
      inspection ??= inspectNative(bin, {run, model: call.model, effort: call.effort});
      identity = await inspection;
      if (!identity.ready) throw Error(identity.error);
      const exact = identity.models.find(model => model.id === call.model);
      if (!exact?.supportedReasoningEfforts.includes(call.effort)) throw Error('Exact requested native model/effort is unavailable; no fallback');
      dispatched = true;
      out = await run(identity.binary.path, args, {cwd: call.workspace, input: call.prompt, timeoutMs: call.timeoutMs, signal: call.signal,
        stdoutPath: artifacts.events, stderrPath: artifacts.stderr});
    } catch (error) { failure = safeError(error); }
    const parsed = parseNativeEvents(out.stdout, {...out, model: call.model, pricing, error: failure ?? out.error, exitCode: out.exitCode ?? null});
    await preserveIfAbsent(artifacts.events, out.stdout ?? '');
    await preserveIfAbsent(artifacts.stderr, out.stderr ?? '');
    await preserveIfAbsent(artifacts.final, parsed.final);
    const nativeFinal = await readFile(artifacts.final, 'utf8');
    if (parsed.valid && nativeFinal.replace(/\r?\n$/, '') !== parsed.final.replace(/\r?\n$/, '')) {
      parsed.status = 'failed'; parsed.valid = false; parsed.usageReconciled = false; parsed.costKnown = false; parsed.costUsd = null; parsed.knownCostFloorUsd = 0;
      parsed.error = 'Native final-message artifact disagrees with the JSON event receipt';
    }
    const result = {
      role: call.role, runtime: 'native-codex', model: call.model, effort: call.effort, ...parsed,
      ...(!dispatched ? {status: 'unavailable', costKnown: true, costUsd: 0, knownCostFloorUsd: 0} : {}),
      dispatched, latencyMs: out.latencyMs ?? Date.now() - startedAt,
      cliIdentity: identity, pricing: validPricing(pricing) ? {...pricing} : null,
      costBasis: 'API-equivalent base-rate estimate from native aggregate input/cache-read/output tokens using supplied pinned Pi metadata; not a subscription invoice. Per-request long-context surcharges and cache-write distinctions are unavailable in this aggregate and may change actual cost.',
      costIsBaseRateEstimate: parsed.costKnown,
      budgetPolicy: {requestedMaxCostUsd: call.maxCostUsd ?? null, enforced: false, monetaryCap: 'No native predispatch monetary guard; only timeout/cancellation and output limits are enforced'},
      toolPolicy: `Native Codex ${requestedSandbox} shell/apply_patch through the enabled bundled code-mode host; approval_policy=never; external MCP/plugins/apps/hooks/memories/browser/web disabled; ephemeral session; project_doc_max_bytes=0`,
      sandbox: requestedSandbox, approvalPolicy: 'never', artifacts,
      permissionPolicy: {requestedSandbox, appliedSandbox: dispatched ? requestedSandbox : null, approvalPolicy: 'never',
        source: call.sandbox === undefined ? 'adapter default' : 'explicit caller configuration', automaticFallback: false},
      process: {exitCode: out.exitCode ?? null, timedOut: Boolean(out.timedOut), aborted: Boolean(out.aborted), overflow: Boolean(out.overflow), error: failure ?? out.error ?? null},
    };
    await save(artifacts.receipt, result);
    return result;
  };
}
