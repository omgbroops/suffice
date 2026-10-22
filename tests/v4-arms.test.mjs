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

test("v5 --v5-cheap=sonnet makes the cheap rung Sonnet; top opus gives [sonnet, opus]", () => {
  const tiers = armTiers('v5', undefined, { cheap: 'sonnet', top: 'opus' });
  assert.deepEqual(tiers.map(t => t.model), ['claude-sonnet-5-5', 'claude-opus-5-5']);
  assert.throws(() => armTiers('v5', undefined, { cheap: 'opus' }), /unknown v5 cheap/);
});
