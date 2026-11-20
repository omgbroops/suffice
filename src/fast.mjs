// Fast-mode pieces for the experiment harness. Duplicates the tiny extension
// helpers from packages/cli/src/fast.mjs deliberately: experiment source is
// hashed into frozen campaign manifests, so it cannot import product code.
import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { filesIn, readText, hash, runNodeTests, formatTestResult } from './workspace.mjs';

export const FAST_TIER = 'ultrafast';
export const VALID_TIERS = ['ultrafast', 'priority', 'default', 'auto', 'flex', 'scale'];

// Sets service_tier on every outgoing provider request payload.
export function serviceTierExtension({ tier = FAST_TIER, log = () => {} } = {}) {
  if (!VALID_TIERS.includes(tier)) throw new Error(`Unknown service tier: ${tier}`);
  return pi => {
    pi.on('before_provider_request', event => {
      if (!event?.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return;
      if ('service_tier' in event.payload) return;
      log({ type: 'service_tier', tier, model: event.payload.model });
      return { ...event.payload, service_tier: tier };
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
      const fp = await srcFingerprint(workspace);
      await mkdir(snapshotRoot, { recursive: true });
      const dir = await mkdtemp(resolve(snapshotRoot, 'spec-'));
      const skip = [snapshotRoot, artifactsDir].filter(Boolean).map(p => resolve(p));
      await cp(workspace, dir, { recursive: true, filter: src => !skip.some(s => src === s || src.startsWith(s + '/')) });
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
