import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runRace } from '../src/race.mjs';

const taskFixture = async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'suffice-race-'));
  const ws = resolve(dir, 'task');
  await mkdir(resolve(ws, 'src'), { recursive: true });
  await mkdir(resolve(ws, 'tests'), { recursive: true });
  await writeFile(resolve(ws, 'src/a.mjs'), 'export const a = 1;\n');
  await writeFile(resolve(ws, 'tests/accept.test.mjs'), "import test from 'node:test';\ntest('ok', () => {});\n");
  return { dir, task: { id: 't1', workspaceDir: ws, acceptancePath: resolve(ws, 'tests/accept.test.mjs'), prompt: 'x' } };
};

const fakeAgent = passes => {
  let i = 0;
  return async ({ signal, runDir }) => {
  // The outcome follows the attempt number (runDir ends in attempt-<n>), not call order: workspace copies finish in
  // any order, so call order made "attempt 0 hangs, attempt 1 passes" flip (failed 3 of 4 runs on 4ee663f too).
  const n = /attempt-(\d+)$/.exec(runDir ?? '')?.[1];
  const outcome = passes[(n == null ? i++ : +n) % passes.length];
  if (!outcome) await new Promise(r => { signal.addEventListener('abort', r, { once: true }); });
  return { status: 'completed', usage: { input: 1 }, turns: 1, latencyMs: 1 };
  };
};

test('race first: earliest verified pass wins and losers are aborted', async () => {
  const { dir, task } = await taskFixture();
  const agent = fakeAgent([false, true]); // attempt 0 hangs, attempt 1 passes
  const result = await runRace({ runtime: {}, task, variant: {}, n: 2, runDir: resolve(dir, 'run'), selection: 'first', runAgentImpl: agent });
  assert.equal(result.status, 'completed');
  assert.equal(result.chosen, 1);
  assert.ok(result.attempts[1].passed);
});

test('race: uniform completed-but-unverified attempts stay no_winner', async () => {
  const { dir, task } = await taskFixture();
  // Sabotage the acceptance test so finished agents can never pass.
  await writeFile(resolve(task.workspaceDir, 'tests/accept.test.mjs'), "import test from 'node:test';\ntest('nope', () => { throw new Error('fail'); });\n");
  const agent = async () => ({ status: 'completed', usage: { input: 1 }, turns: 1, latencyMs: 1 });
  const result = await runRace({ runtime: {}, task, variant: {}, n: 2, runDir: resolve(dir, 'run'), selection: 'best', runAgentImpl: agent });
  assert.equal(result.status, 'no_winner');
  assert.equal(result.chosen, null);
});

test('race: uniform provider failure propagates as the race status', async () => {
  const { dir, task } = await taskFixture();
  const agent = async () => ({ status: 'provider_error', providerFailureKind: 'other', usage: { input: 1 }, turns: 1, latencyMs: 1 });
  const result = await runRace({ runtime: {}, task, variant: {}, n: 2, runDir: resolve(dir, 'run'), selection: 'best', runAgentImpl: agent });
  assert.equal(result.status, 'provider_error');
  assert.equal(result.providerFailureKind, 'other');
  assert.equal(result.chosen, null);
});
