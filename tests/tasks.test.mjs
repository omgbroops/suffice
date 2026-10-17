import test from 'node:test';
import assert from 'node:assert/strict';
import { tasks } from '../benchmarks/tasks.mjs';
import { verifyTasks } from '../benchmarks/verify-tasks.mjs';

test('synthetic task catalog has disjoint fixed pilot, holdout and context sets', () => {
  assert.equal(tasks.length, 15);
  assert.equal(new Set(tasks.map(task => task.id)).size, 15);
  assert.equal(tasks.filter(task => task.split === 'pilot').length, 4);
  assert.equal(tasks.filter(task => task.split === 'holdout').length, 4);
  assert.equal(tasks.filter(task => task.split === 'context').length, 3);
  assert.equal(tasks.filter(task => task.split === 'hard').length, 4);
  for (const task of tasks) {
    assert.match(task.provenance, /synthetic/);
    assert.ok(!task.acceptancePath.startsWith(task.workspaceDir));
    assert.ok(!task.referencePatchPath.startsWith(task.workspaceDir));
  }
});

test('every authored bug fails frozen acceptance and its reference repair passes', { timeout: 120_000 }, async () => {
  const results = await verifyTasks();
  assert.equal(results.length, tasks.length);
  for (const result of results) {
    assert.equal(result.baselineAcceptance, 'fail');
    assert.equal(result.referenceAcceptance, 'pass');
    assert.equal(result.visible, 'pass');
  }
});
