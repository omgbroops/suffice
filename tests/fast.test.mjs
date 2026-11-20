import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { serviceTierExtension, latencyTracker, srcFingerprint, withSpeculativeTests } from '../src/fast.mjs';
import { workspaceTools } from '../src/workspace.mjs';

const handlers = ext => { const map = new Map(); ext({ on: (name, fn) => map.set(name, fn) }); return map; };

test('serviceTierExtension injects service_tier once into payloads', () => {
  const logged = [];
  const h = handlers(serviceTierExtension({ tier: 'priority', log: e => logged.push(e) }));
  const onRequest = h.get('before_provider_request');
  assert.deepEqual(onRequest({ payload: { model: 'gpt-6.1-sol', input: [] } }), { model: 'gpt-6.1-sol', input: [], service_tier: 'priority' });
  assert.equal(onRequest({ payload: { service_tier: 'flex' } }), undefined);
  assert.equal(onRequest({ payload: null }), undefined);
  assert.equal(logged.length, 1);
});
test('serviceTierExtension rejects unknown tiers', () => assert.throws(() => serviceTierExtension({ tier: 'warp' }), /Unknown service tier/));

test('latencyTracker emits provider and tool timings', async () => {
  const logged = [];
  const h = handlers(latencyTracker(e => logged.push(e)));
  h.get('before_provider_request')();
  await new Promise(r => setTimeout(r, 5));
  h.get('provider_stream_event')();
  h.get('after_provider_response')();
  h.get('tool_call')({ toolCallId: 'c1', toolName: 'test' });
  h.get('tool_result')({ callId: 'c1', toolName: 'test' });
  const provider = logged.find(e => e.phase === 'provider');
  const tool = logged.find(e => e.phase === 'tool');
  assert.ok(provider.ttftMs >= 0 && provider.totalMs >= provider.ttftMs);
  assert.equal(tool.name, 'test');
  assert.ok(tool.ms >= 0);
});

async function fixture() {
  const dir = await mkdtemp(resolve(tmpdir(), 'suffice-fast-'));
  await mkdir(resolve(dir, 'src'), { recursive: true });
  await mkdir(resolve(dir, 'tests'), { recursive: true });
  await writeFile(resolve(dir, 'src/value.mjs'), 'export const value = 1;\n');
  await writeFile(resolve(dir, 'tests/visible.test.mjs'), "import test from 'node:test';\ntest('ok', () => {});\n");
  return dir;
}

test('srcFingerprint changes only when src/ changes', async () => {
  const dir = await fixture();
  const a = await srcFingerprint(dir);
  await writeFile(resolve(dir, 'tests/visible.test.mjs'), "// changed\nimport test from 'node:test';\ntest('ok', () => {});\n");
  assert.equal(await srcFingerprint(dir), a);
  await writeFile(resolve(dir, 'src/value.mjs'), 'export const value = 2;\n');
  assert.notEqual(await srcFingerprint(dir), a);
});

test('speculative test: edit triggers a snapshot whose result is reused', async () => {
  const dir = await fixture();
  const logged = [];
  const tools = withSpeculativeTests(
    workspaceTools({ workspace: dir, artifactsDir: resolve(dir, 'artifacts'), log: e => logged.push(e) }),
    { workspace: dir, snapshotRoot: resolve(dir, '..', 'snaps-' + dir.split('/').at(-1)), artifactsDir: resolve(dir, 'artifacts'), log: e => logged.push(e) });
  const edit = tools.find(t => t.name === 'file_edit');
  const testTool = tools.find(t => t.name === 'test');
  await edit.execute('e1', { path: 'src/value.mjs', oldText: 'value = 1', newText: 'value = 2' });
  // Give the background snapshot a moment to start.
  await new Promise(r => setTimeout(r, 50));
  const result = await testTool.execute('t1', {});
  assert.equal(result.structuredContent.status, 'passed');
  assert.equal(result.structuredContent.speculated, true);
  assert.ok(logged.some(e => e.type === 'speculative_test' && e.event === 'reused'));
});

test('speculative test: a stale snapshot is discarded and the real run executes', async () => {
  const dir = await fixture();
  const logged = [];
  const tools = withSpeculativeTests(
    workspaceTools({ workspace: dir, artifactsDir: resolve(dir, 'artifacts'), log: e => logged.push(e) }),
    { workspace: dir, snapshotRoot: resolve(dir, '..', 'snaps-' + dir.split('/').at(-1)), artifactsDir: resolve(dir, 'artifacts'), log: e => logged.push(e) });
  const edit = tools.find(t => t.name === 'file_edit');
  const testTool = tools.find(t => t.name === 'test');
  await edit.execute('e1', { path: 'src/value.mjs', oldText: 'value = 1', newText: 'value = 2' });
  // Wait until the snapshot has settled (fingerprint taken, run started),
  // then a second edit makes its fingerprint stale deterministically.
  for (let i = 0; i < 100 && !logged.some(e => e.type === 'speculative_test' && e.event === 'started'); i++) await new Promise(r => setTimeout(r, 20));
  assert.ok(logged.some(e => e.type === 'speculative_test' && e.event === 'started'), 'snapshot never started');
  await edit.execute('e2', { path: 'src/value.mjs', oldText: 'value = 2', newText: 'value = 3' });
  const result = await testTool.execute('t1', {});
  assert.equal(result.structuredContent.status, 'passed');
  assert.equal(result.structuredContent.speculated, undefined);
});
