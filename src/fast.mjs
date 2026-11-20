// Fast-mode pieces for the experiment harness. Duplicates the tiny extension
// helpers from packages/cli/src/fast.mjs deliberately: experiment source is
// hashed into frozen campaign manifests, so it cannot import product code.
import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { filesIn, readText, hash, runNodeTests, formatTestResult } from './workspace.mjs';

export const FAST_TIER = 'ultrafast';
export const VALID_TIERS = ['ultrafast', 'priority', 'default', 'auto', 'flex', 'scale'];

// Sets service_tier on every outgoing provider request payload.
// pi-ai prices usage from the stream options' serviceTier, which the agent
// never sets: a payload-only injection leaves costs at the default rate.
// Multipliers mirror pi-ai getServiceTierCostMultiplier; 'ultrafast' is
// estimated at priority rates until the SDK publishes one.
export const TIER_MULTIPLIER = { flex: 0.5, priority: 2, fast: 2, ultrafast: 2 };

export function serviceTierExtension({ tier = FAST_TIER, log = () => {} } = {}) {
  if (!VALID_TIERS.includes(tier)) throw new Error(`Unknown service tier: ${tier}`);
  return pi => {
    let echoedTier, wireTier;
    pi.on('before_provider_request', event => {
      if (!event?.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return;
      if ('service_tier' in event.payload) { wireTier = event.payload.service_tier; return; }
      wireTier = tier;
      log({ type: 'service_tier', tier, model: event.payload.model });
      return { ...event.payload, service_tier: tier };
    });
    pi.on('provider_stream_event', event => {
      const echoed = event.data?.response?.service_tier;
      if (typeof echoed === 'string') echoedTier = echoed;
    });
    pi.on('message_end', event => {
      const usage = event.message?.role === 'assistant' ? event.message.usage : null;
      if (!usage?.cost) return;
      // Only requests we tagged on the wire get repriced.
      if (wireTier === undefined) { echoedTier = undefined; return; }
      const sdkApplied = TIER_MULTIPLIER[echoedTier] ?? 1; echoedTier = undefined;
      const injected = TIER_MULTIPLIER[wireTier] ?? 1; wireTier = undefined;
      if (sdkApplied === injected) return;
      const factor = injected / sdkApplied;
      for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) usage.cost[key] *= factor;
      usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
      log({ type: 'service_tier_cost', tier, factor, estimated: tier === 'ultrafast' });
    });
  };
}

// Emits `latency` events: provider wait/stream totals per request and
// per-tool-call durations, so fast-mode arms can attribute wall clock.
export function latencyTracker(log = () => {}) {
  const now = () => performance.now();
  return pi => {
    const requests = [];
    const toolStarts = new Map();
    pi.on('before_provider_request', () => { requests.push({ at: now(), ttft: null }); });
    pi.on('provider_stream_event', () => { const r = requests.at(-1); if (r && r.ttft === null) r.ttft = now(); });
    pi.on('after_provider_response', () => {
      const r = requests.shift(); if (!r) return;
      log({ type: 'latency', phase: 'provider', ttftMs: r.ttft === null ? null : Math.round(r.ttft - r.at), totalMs: Math.round(now() - r.at) });
    });
    pi.on('tool_call', event => { if (event.toolCallId) toolStarts.set(event.toolCallId, now()); });
    pi.on('tool_result', event => {
      const id = event.callId, start = id && toolStarts.get(id);
      if (start === undefined) return;
      toolStarts.delete(id);
      log({ type: 'latency', phase: 'tool', name: event.toolName, callId: id, ms: Math.round(now() - start) });
    });
  };
}

// Stream-prefire: the provider streams function_call arguments before the
// message completes; once `function_call_arguments.done` arrives the call is
// already determined, so read-only tools can execute while the rest of the
// message decodes. When the agent later issues the identical call the
// prefired result is returned. Only pure tools are prefired — writes wait.
const PREFIREABLE = new Set(['files', 'file_read', 'search', 'test', 'history_read']);
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
};
export function withStreamPrefire(tools, { log = () => {} } = {}) {
  const byName = new Map(tools.map(t => [t.name, t]));
  const pending = new Map();
  const callKey = (name, args) => `${name}\n${canonical(args)}`;
  const ext = pi => {
    const names = new Map();
    pi.on('provider_stream_event', event => {
      const d = event.data;
      if (d?.type === 'response.output_item.added' && d.item?.type === 'function_call') names.set(d.item.id, d.item.name);
      if (d?.type === 'response.function_call_arguments.done') {
        const name = names.get(d.item_id);
        if (!name || !PREFIREABLE.has(name)) return;
        let args; try { args = JSON.parse(d.arguments); } catch { return; }
        const tool = byName.get(name);
        if (!tool) return;
        const key = callKey(name, args);
        if (pending.has(key)) return;
        log({ type: 'stream_prefire', event: 'started', tool: name });
        pending.set(key, Promise.resolve()
          .then(() => tool.execute(`prefire-${d.item_id}`, args))
          .then(result => { log({ type: 'stream_prefire', event: 'finished', tool: name }); return result; })
          .catch(error => ({ __prefireError: error })));
      }
    });
  };
  const wrapped = tools.map(t => PREFIREABLE.has(t.name)
    ? { ...t, async execute(id, args, signal, onUpdate) {
        const key = callKey(t.name, args);
        const p = pending.get(key);
        if (!p) return t.execute(id, args, signal, onUpdate);
        pending.delete(key);
        const result = await p;
        if (result && typeof result === 'object' && '__prefireError' in result) throw result.__prefireError;
        log({ type: 'stream_prefire', event: 'reused', tool: t.name });
        return result;
      } }
    : t);
  return { tools: wrapped, ext };
}

// Hash over every src/ file: the workspace's only mutable region.
export async function srcFingerprint(workspace) {
  const parts = [];
  for (const path of (await filesIn(workspace)).filter(p => p.startsWith('src/'))) {
    parts.push(`${path}:${hash(await readText(workspace, path))}`);
  }
  return hash(parts.join('\n'));
}

// TomasuLLM-lite: after an edit lands, copy the workspace and start the
// visible test suite on the snapshot immediately. When the agent calls test,
// if src/ is unchanged since the snapshot the precomputed result is returned.
// A later edit invalidates the snapshot by fingerprint, never by guesswork.
export function withSpeculativeTests(tools, { workspace, snapshotRoot, artifactsDir, signal, log = () => {} }) {
  let pending = null;
  const speculate = () => {
    if (signal?.aborted || pending) return;
    pending = (async () => {
      await mkdir(snapshotRoot, { recursive: true });
      const dir = await mkdtemp(resolve(snapshotRoot, 'spec-'));
      const skip = [snapshotRoot, artifactsDir].filter(Boolean).map(p => resolve(p));
      await cp(workspace, dir, { recursive: true, filter: src => !skip.some(s => src === s || src.startsWith(s + '/')) });
      // Fingerprint the copied bytes, not the live workspace: edits can land
      // mid-copy, and only the snapshot's own content decides what was run.
      const fp = await srcFingerprint(dir);
      log({ type: 'speculative_test', event: 'started', snapshot: dir, fingerprint: fp });
      return { fp, promise: runNodeTests(dir, resolve(dir, 'tests/visible.test.mjs'), { signal }) };
    })().catch(error => { log({ type: 'speculative_test', event: 'aborted_error', error: String(error?.message ?? error) }); pending = null; });
  };
  const wrapped = tools.map(tool => {
    if (['file_edit', 'file_write'].includes(tool.name)) {
      return { ...tool, async execute(id, args, s, onUpdate) {
        const result = await tool.execute(id, args, s, onUpdate);
        speculate();
        return result;
      } };
    }
    if (tool.name === 'test') {
      return { ...tool, async execute(id, args, s, onUpdate) {
        const spec = pending; pending = null;
        if (spec) {
          try {
            const snapshot = await spec;
            if (snapshot && (await srcFingerprint(workspace)) === snapshot.fp) {
              const result = await snapshot.promise;
              log({ type: 'speculative_test', event: 'reused' });
              const data = await formatTestResult({ ...result, speculated: true }, artifactsDir);
              return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, details: {} };
            } else log({ type: 'speculative_test', event: 'discarded_stale' });
          } catch { log({ type: 'speculative_test', event: 'discarded_error' }); }
        }
        return tool.execute(id, args, s, onUpdate);
      } };
    }
    return tool;
  });
  return wrapped;
}
