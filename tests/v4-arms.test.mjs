import test from 'node:test';
import assert from 'node:assert/strict';
import { armTiers, loadTiers } from '../src/v4-config.mjs';

test("arm 'v4' is the default ladder; 'single:<model>' sums rounds and takes the max estimate", () => {
  const ladder = loadTiers();
  assert.deepEqual(armTiers("v4"), ladder);
  const [single] = armTiers('single:claude-opus-5-5');
  assert.equal(single.model, 'claude-opus-5-5');
  assert.equal(single.rounds, ladder.reduce((s, t) => s + t.rounds, 0));
  assert.equal(single.costEstimateUsd, Math.max(...ladder.map(t => t.costEstimateUsd)));
  assert.throws(() => armTiers('bogus'), /unknown arm/);
});
