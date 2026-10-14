import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { aggregateCampaign, loadCampaign, renderMarkdown, writeReport } from '../scripts/report.mjs';

function run(variant, overrides = {}) {
  return {
    runId: `one-${variant}-r0`, task: 'one', variant, repetition: 0, status: 'completed', success: true,
    acceptance: { status: 'passed' }, usage: { estimatedApiUsd: 0.1, totalTokens: 100, cacheRead: 20 },
    latencyMs: 1000, turns: 2, toolCalls: 4, watcherCalls: 0, decisions: [],
    ...overrides,
  };
}
const arm = (report, variant) => report.variants.find(item => item.variant === variant);

test('ITT includes failed attempts and cost/success uses their costs', () => {
  const report = aggregateCampaign([
    run('core'),
    run('core', { runId: 'two-core-r0', task: 'two', success: false, acceptance: { status: 'failed' }, usage: { estimatedApiUsd: 0.3, totalTokens: 300, cacheRead: 80 }, latencyMs: 3000 }),
  ]);
  const core = arm(report, 'core');
  assert.deepEqual(core.intentionToTreat, { successes: 1, denominator: 2, rate: 0.5 });
  assert.deepEqual(core.treatedValid, { successes: 1, denominator: 2, rate: 0.5, exclusions: {} });
  assert.equal(core.costPerOperationalSuccessUsd, 0.4);
  assert.equal(core.metrics.totalEstimatedUsd.mean, 0.2);
  assert.equal(core.metrics.totalTokens.mean, 200);
  assert.equal(core.metrics.cacheReadTokens.mean, 50);
  assert.equal(core.metrics.latencyMs.mean, 2000);
});

test('watcher errors are visible and excluded from valid efficacy without discarding cost', () => {
  const report = aggregateCampaign([run('luna', {
    watcherCalls: 1,
    decisions: [{ provider: 'openai', status: 'error', errorCode: 'INVALID_DECISION', costUsd: 0.02, usage: { totalTokens: 10 }, injected: false }],
  })]);
  const luna = arm(report, 'luna');
  assert.equal(luna.intentionToTreat.successes, 1);
  assert.equal(luna.treatedValid.denominator, 0);
  assert.equal(luna.treatedValid.rate, null);
  assert.deepEqual(luna.watcherErrorsByCode, { INVALID_DECISION: 1 });
  assert.equal(luna.metrics.watcherErrors.sum, 1);
  assert.ok(Math.abs(luna.metrics.totalEstimatedUsd.sum - 0.12) < 1e-9);
  assert.equal(luna.metrics.totalTokens.sum, 110);
  assert.equal(luna.watcherSubscriptionApiEquivalentKnownUsd, 0.02);
});

test('null/absent cost and learned abstention never become zero or a valid treatment', () => {
  const report = aggregateCampaign([
    run('luna', { watcherCalls: 1, watcherCostUnknown: true, decisions: [{ provider: 'openai', status: 'selected', costUsd: null, usage: null, injected: true }] }),
    run('luna', { task: 'two', runId: 'two-luna-r0', watcherCalls: 1, decisions: [{ provider: 'openai', status: 'abstained', costUsd: null, usage: null }] }),
    run('core', { usage: { estimatedApiUsd: null, totalTokens: 50, cacheRead: null } }),
  ]);
  const luna = arm(report, 'luna');
  assert.equal(luna.metrics.totalEstimatedUsd.mean, null);
  assert.equal(luna.metrics.totalEstimatedUsd.missing, 2);
  assert.equal(luna.costPerOperationalSuccessUsd, null);
  assert.equal(luna.knownCostPerOperationalSuccessLowerBoundUsd, 0.1);
  assert.equal(luna.treatedValid.denominator, 0);
  assert.equal(luna.metrics.injections.sum, 1);
  const core = arm(report, 'core');
  assert.equal(core.metrics.mainApiEquivalentUsd.mean, null);
  assert.equal(core.metrics.cacheReadTokens.mean, null);
  assert.equal(core.treatedValid.exclusions.main_cost_unknown, 1);
});

test('unknown Jev request reservation is separate from known usage estimate and ledger', () => {
  const report = aggregateCampaign([
    run('jev', { watcherCalls: 1, decisions: [{ provider: 'typesafe', status: 'selected', costUsd: 0.000042, usage: { input: 1000, totalTokens: 1002 }, injected: true }] }),
    run('jev', { runId: 'two-jev-r0', task: 'two', watcherCalls: 1, decisions: [{ provider: 'typesafe', status: 'error', errorCode: 'HTTP_503', costUsd: 0.01, usage: null }] }),
  ], { ledger: { limitUsd: 2, reservedUsd: 0.03, remainingUsd: 1.97, calls: 3 } });
  const jev = arm(report, 'jev');
  assert.equal(jev.jev.knownEstimatedSpendUsd, 0.000042);
  assert.equal(jev.jev.knownCalls, 1); assert.equal(jev.jev.unknownCalls, 1);
  assert.equal(jev.jev.recordedReservations.missing, 2);
  assert.equal(jev.metrics.totalEstimatedUsd.known, 1);
  assert.ok(Math.abs(jev.metrics.knownEstimatedUsd.sum - 0.200042) < 1e-9);
  assert.equal(report.jevGlobalLedger.reservedUsd, 0.03);
  assert.match(report.jevGlobalLedger.scope, /global/);
  assert.match(renderMarkdown(report), /reservation on a failed request is not measured spend/);
});

test('pairs match task/repetition exactly and preserve unknown deltas', () => {
  const report = aggregateCampaign([
    run('pi', { latencyMs: 2000 }), run('core', { latencyMs: 1000 }),
    run('rules', { latencyMs: 800, watcherCalls: 1, decisions: [{ provider: 'deterministic', status: 'selected', costUsd: 0, usage: null, injected: true }] }),
    run('luna', { repetition: 1, runId: 'one-luna-r1' }),
    run('jev', { usageCostUnknown: true }),
  ]);
  const rulesCore = report.pairs.find(pair => pair.variant === 'rules' && pair.baseline === 'core');
  assert.equal(rulesCore.latencyMsDelta, -200);
  assert.equal(rulesCore.validPair, true);
  assert.equal(rulesCore.totalTokensDelta, 0);
  assert.equal(report.pairs.some(pair => pair.variant === 'luna'), false);
  assert.equal(report.pairs.find(pair => pair.variant === 'jev' && pair.baseline === 'pi').estimatedUsdDelta, null);
  assert.equal(report.pairs.find(pair => pair.variant === 'jev' && pair.baseline === 'pi').treatedValidSuccessDelta, null);
  assert.equal(arm(report, 'rules').intervention.eligibleRunRate, 1);
  assert.equal(arm(report, 'core').intervention.eligibleRunRate, null);
});

test('explicit preflight failure has known zero spend but remains an unavailable treatment', () => {
  const report = aggregateCampaign([run('jev', { watcherCalls: 1, watcherTreatmentValid: false, decisions: [{ provider: 'typesafe', status: 'error', dispatched: false, errorCode: 'PRICING_UNKNOWN', usage: null, costUsd: 0 }] })]);
  const jev = arm(report, 'jev');
  assert.equal(jev.metrics.watcherEstimatedUsd.sum, 0);
  assert.equal(jev.metrics.watcherTokens.sum, 0);
  assert.equal(jev.jev.recordedReservations.sum, 0);
  assert.equal(jev.treatedValid.denominator, 0);
  assert.equal(jev.intentionToTreat.successes, 1);
});

test('frozen schedule includes missing executions in operational coverage', () => {
  const report = aggregateCampaign([run('core')], { manifest: { schedule: [{ task: 'one', variant: 'core', repetition: 0 }, { task: 'two', variant: 'core', repetition: 0 }] } });
  const core = arm(report, 'core');
  assert.equal(core.recorded, 1); assert.equal(core.scheduled, 2);
  assert.equal(core.statuses.missing_result, 1);
  assert.equal(core.intentionToTreat.rate, 0.5);
  assert.equal(core.metrics.totalEstimatedUsd.missing, 1);
  assert.equal(core.costPerOperationalSuccessUsd, null);
  assert.equal(core.knownCostPerOperationalSuccessLowerBoundUsd, 0.1);
  assert.throws(() => aggregateCampaign([run('core'), run('core')]), /Duplicate/);
});

test('reports contain sanitized aggregates rather than raw final, candidates, or errors', () => {
  const secret = 'private-credential-example';
  const report = aggregateCampaign([run('luna', { final: secret, watcherCalls: 1, decisions: [{ provider: 'openai', status: 'error', errorCode: secret, costUsd: null, candidates: [{ excerpt: secret }] }] })]);
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(!renderMarkdown(report).includes(secret));
  assert.deepEqual(arm(report, 'luna').watcherErrorsByCode, { OTHER: 1 });
  assert.throws(() => aggregateCampaign([run('core')], { campaign: '../escape' }), /Invalid campaign/);
  assert.throws(() => aggregateCampaign([run('core', { variant: '|unsafe' })]), /Invalid task or variant/);
});

test('loader preserves frozen evidence hashes and writes reviewable aggregate artifacts', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'suffice-report-'));
  const checked = await realpath(temporary);
  try {
    const campaign = 'unit-campaign'; const result = run('core');
    const directory = resolve(checked, '.suffice', 'runs', campaign, result.runId); await mkdir(directory, { recursive: true });
    const manifest = JSON.stringify({ campaign, split: 'pilot', mainModel: 'gpt-6.1-sol', inputs: { 'acceptance:one': 'a'.repeat(64) }, schedule: [{ task: 'one', variant: 'core', repetition: 0 }] });
    const manifestPath = resolve(directory, '..', 'manifest.json');
    await writeFile(manifestPath, manifest);
    await writeFile(resolve(directory, 'result.json'), JSON.stringify(result));
    // The old result has a seemingly known aggregate but one missing per-call cost.
    await writeFile(resolve(directory, 'events.jsonl'), [{ type: 'assistant', usage: { cost: { total: 0.1 } }, content: 'PRIVATE OUTPUT' }, { type: 'assistant', usage: {}, content: 'PRIVATE OUTPUT' }].map(item => JSON.stringify(item)).join('\n') + '\n');
    const report = await loadCampaign(campaign, { root: checked });
    assert.equal(report.evidence.manifestSha256, createHash('sha256').update(manifest).digest('hex'));
    assert.equal(arm(report, 'core').metrics.mainApiEquivalentUsd.mean, null);
    const outputs = await writeReport(campaign, { root: checked });
    const json = await readFile(outputs.json, 'utf8'); const markdown = await readFile(outputs.markdown, 'utf8');
    assert.ok(!json.includes('PRIVATE OUTPUT')); assert.ok(!markdown.includes('PRIVATE OUTPUT'));
    assert.match(markdown, /\.\.\/\.suffice\/runs\/unit-campaign\/one-core-r0\/result.json/);
    assert.equal(await readFile(manifestPath, 'utf8'), manifest);
    assert.deepEqual(JSON.parse(json).evidence.inputHashes, { 'acceptance:one': 'a'.repeat(64) });
  } finally {
    const parent = await realpath(tmpdir()); const target = relative(parent, checked);
    assert.ok(target !== '' && !isAbsolute(target) && target !== '..' && !target.startsWith('..' + sep));
    assert.ok(checked.split(sep).at(-1).startsWith('suffice-report-'));
    await rm(checked, { recursive: true, force: true });
  }
});
