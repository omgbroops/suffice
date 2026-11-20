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
  return async ({ signal }) => {
  // Each call claims the next outcome in order.
  const outcome = passes[i++ % passes.length];
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
