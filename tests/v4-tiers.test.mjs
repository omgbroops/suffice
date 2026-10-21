import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTiers, validateTiers, effortFor } from '../src/v4-config.mjs';
import { runV4, V4Error } from '../src/v4-escalation.mjs';
import { buildAttempt } from '../src/v4-adapters.mjs';

const base = { name: 't', provider: 'claude', model: 'm', rounds: 1, effort: null, costEstimateUsd: 0.1, tools: ['Read'] };
const ladder = (...tiers) => ({ tiers: tiers.map((t, i) => ({ ...base, name: `t${i}`, model: `m${i}`, ...t })) });

test('default config reproduces the original ladder: haiku x3 then opus x1, no effort flag', () => {
  const tiers = loadTiers();
  assert.deepEqual(tiers.map(t => [t.model, t.rounds, t.effort]), [['claude-haiku-5-5', 3, null], ['claude-opus-5-5', 1, null]]);
  assert.deepEqual(tiers[0].tools, ['Read', 'Edit', 'Write', 'Bash']);
});

test('validation rejects a one-tier ladder, zero estimates, unknown providers and bad efforts', () => {
  assert.throws(() => validateTiers(ladder({})), /2 or more/);
  assert.throws(() => validateTiers({ tiers: [ladder({}).tiers[0], { ...base, name: 'x', costEstimateUsd: 0 }] }), /costEstimateUsd/);
  assert.throws(() => validateTiers({ tiers: [{ ...base, name: 'a' }, { ...base, name: 'b', provider: 'nope' }] }), /provider/);
  assert.throws(() => validateTiers({ tiers: [{ ...base, name: 'a' }, { ...base, name: 'b', effort: 'ultra' }] }), /effort/);
  assert.throws(() => validateTiers({ tiers: [{ ...base, name: 'a' }, { ...base, name: 'a' }] }), /unique/);
  assert.throws(() => validateTiers({ tiers: [{ ...base, name: 'a' }, { ...base, name: 'b', provider: 'command' }] }), /command/);
});

test('effort schedule: per round, last value repeats; null means no flag', () => {
  const tier = { effort: ['low', 'high'] };
  assert.deepEqual([1, 2, 3].map(r => effortFor(tier, r)), ['low', 'high', 'high']);
  assert.equal(effortFor({ effort: null }, 1), null);
  assert.equal(effortFor({ effort: 'max' }, 4), 'max');
});

test('three-tier generic ladder: effort per round, tier estimate gates escalation', async () => {
  const tiers = validateTiers(ladder({ rounds: 2, effort: ['low', 'medium'], costEstimateUsd: 0.1 }, { rounds: 1, effort: 'high', costEstimateUsd: 0.2 }, { rounds: 1, costEstimateUsd: 0.3 }));
  const calls = [];
  const attempt = async call => { calls.push(call); return { pass: false, costUsd: 0.1 }; };
  const row = await runV4({ id: 'x', prompt: 'p' }, { attempt, budgetUsd: 1, tiers });
  assert.deepEqual(calls.map(c => [c.model, c.effort]), [['m0', 'low'], ['m0', 'medium'], ['m1', 'high'], ['m2', null]]);
  assert.equal(calls[2].prompt, 'p');
  assert.equal(calls[2].remainingBudgetUsd.toFixed(2), '0.80');
  assert.equal(row.finalPass, false);
  // spent 0.3 + next tier estimate 0.3 = 0.6 <= 1, so the third tier runs; at budget 0.5 it must be skipped.
  const skipped = await runV4({ id: 'x', prompt: 'p' }, { attempt: async () => ({ pass: false, costUsd: 0.1 }), budgetUsd: 0.5, tiers });
  assert.equal(skipped.escalationSkipped, 'budget');
});

test('command adapter: argv placeholders are substituted, cost settles, unknown cost fails closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v4-tiers-'));
  const script = join(dir, 'stub.mjs');
  await writeFile(script, "const [model, effort, prompt] = process.argv.slice(2);\nconsole.log(JSON.stringify({ costUsd: model === 'nocost' ? undefined : 0.25, usage: { got: [model, effort, prompt] } }));\n");
  const command = [process.execPath, script, '{model}', '{effort}', '{prompt}'];
  const tiers = validateTiers({ tiers: [{ ...base, name: 'c', provider: 'command', command }, { ...base, name: 'd' }] });
  const ledger = { spentUsd: 0, costKnown: true };
  const verify = async () => true;
  const attempt = buildAttempt({ tiers, workspace: dir, verify, ledger, timeoutMs: 10_000 });
  const ok = await attempt({ tier: 'c', model: 'a{prompt}', effort: 'low', prompt: 'hi there', remainingBudgetUsd: 1, tools: ['Read'] });
  assert.equal(ok.pass, true);
  assert.equal(ok.costUsd, 0.25);
  assert.deepEqual(ok.usage.got, ['a{prompt}', 'low', 'hi there']);
  assert.equal(ledger.spentUsd, 0.25);
  const unknown = await attempt({ tier: 'c', model: 'nocost', effort: null, prompt: 'x', remainingBudgetUsd: 1, tools: ['Read'] });
  assert.equal(unknown.costUsd, null);
  assert.equal(ledger.costKnown, false);
  await assert.rejects(runV4({ id: 'x', prompt: 'p' }, { attempt: async () => ({ pass: false, costUsd: null }), budgetUsd: 1, tiers }), e => e instanceof V4Error && e.code === 'COST_UNKNOWN');
});
