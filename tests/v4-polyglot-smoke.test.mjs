// Zero-spend smoke: real polyglot provider, real toolchains, fake agent (no model calls).
// Reference solution must pass verify; an untouched workspace must fail with a verdict, not a throw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as polyglot from '../src/v4-polyglot.mjs';
import { runBench } from '../scripts/v4-bench.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TASKS = [
  { benchmark: 'polyglot', taskId: 'javascript/space-age', difficulty: 'easy' },
  { benchmark: 'polyglot', taskId: 'cpp/linked-list', difficulty: 'easy' },
  { benchmark: 'polyglot', taskId: 'python/dot-dsl', difficulty: 'easy' },
];

async function smoke(mode) {
  const root = await mkdtemp(join(tmpdir(), 'v4-smoke-'));
  const verdicts = {};
  // Fake agent: 'reference' applies the gold solution into the workspace, 'untouched' does nothing.
  const runTask = async ({ task, verify }) => {
    const item = TASKS.find(t => t.taskId.replace('/', '_') === task.id);
    if (mode === 'reference') await polyglot.applyReference(item, task.workspaceDir);
    const snap = join(root, `snap-${task.id}`);
    await cp(task.workspaceDir, snap, { recursive: true });
    try { verdicts[item.taskId] = await verify(snap); } catch (error) { verdicts[item.taskId] = error; }
    return { status: 'done' };
  };
  process.env.V4_RUN_LABEL = `smoke-${mode}`;
  try {
    await runBench({ items: TASKS, arm: 'v4', workers: 1, globalCapUsd: 1, results: join(root, 'r.jsonl'),
      provider: polyglot, runTask, gate: 'self' });
  } finally {
    delete process.env.V4_RUN_LABEL;
    await rm(join(ROOT, 'reports', 'v4', 'failures', `smoke-${mode}`), { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
  return verdicts;
}

test('reference solutions pass verify on javascript, cpp and python tasks', async () => {
  const v = await smoke('reference');
  for (const t of TASKS) assert.equal(v[t.taskId], true, `${t.taskId} should pass: ${v[t.taskId]}`);
});

test('untouched workspaces fail verify with a verdict, not a harness error', async () => {
  const v = await smoke('untouched');
  for (const t of TASKS) assert.equal(v[t.taskId], false, `${t.taskId} should fail, got ${v[t.taskId]}`);
});
