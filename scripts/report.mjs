import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBudgetLedger } from '../src/budget.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const number = value => finite(value) ? value : null;
const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,180}$/.test(value);
const SAFE_ERRORS = new Set(['INVALID_STATE', 'STATE_TOO_LARGE', 'MODEL_UNAVAILABLE', 'PROVIDER_FAILED', 'INVALID_DECISION', 'MISSING_CREDENTIAL', 'PRICING_UNKNOWN', 'USAGE_UNKNOWN', 'UNEXPECTED_MODEL', 'UNEXPECTED_CHARGE', 'INVALID_RESPONSE', 'LEDGER_UNREADABLE', 'LEDGER_CORRUPT', 'LEDGER_LOCKED', 'LEDGER_WRITE_FAILED', 'BUDGET_EXHAUSTED', 'REQUEST_FAILED', 'ABORTED', 'TIMEOUT']);
const safeError = value => SAFE_ERRORS.has(value) || /^HTTP_\d{3}$/.test(value ?? '') ? value : 'OTHER';
const SAFE_STATUSES = new Set(['completed', 'provider_error', 'harness_error', 'run_timeout', 'tool_limit', 'turn_limit', 'missing_result']);

function stats(values) {
  const known = values.filter(finite);
  const sum = known.length ? known.reduce((total, value) => total + value, 0) : null;
  return { sum, mean: sum === null ? null : sum / known.length, known: known.length, missing: values.length - known.length, total: values.length };
}

function watcherMetrics(run) {
  const decisions = Array.isArray(run.decisions) ? run.decisions : [];
  const calls = number(run.watcherCalls);
  const errors = decisions.filter(d => d.status === 'error' || d.status === 'aborted');
  const unrecorded = calls === null ? null : Math.max(0, calls - decisions.length);
  const values = []; const tokens = []; const openai = []; const external = []; const jev = []; const jevReserves = [];
  for (const decision of decisions) {
    // A learned abstention still consumes a request. Missing usage/cost must
    // remain unknown, even if an older experiment omitted that flag.
    const local = decision.provider === 'deterministic';
    const preflightOnly = decision.dispatched === false;
    const cost = local || preflightOnly ? 0 : decision.provider === 'typesafe' && !finite(decision.usage?.input) ? null : number(decision.costUsd);
    values.push(cost);
    tokens.push(local || preflightOnly ? 0 : number(decision.usage?.totalTokens));
    if (decision.provider === 'openai') openai.push(cost);
    else if (!local) external.push(cost);
    if (decision.provider === 'typesafe') {
      jev.push(cost);
      jevReserves.push(finite(decision.budgetReservedUsd) ? decision.budgetReservedUsd : preflightOnly ? 0 : null);
    }
  }
  const complete = calls !== null && calls === decisions.length && !run.watcherCostUnknown && values.every(finite);
  const sum = values.filter(finite).reduce((total, value) => total + value, 0);
  const tokenComplete = calls !== null && calls === decisions.length && tokens.every(finite);
  return {
    calls, errors: errors.length, errorsByCode: errors.reduce((counts, d) => { const code = safeError(d.errorCode); counts[code] = (counts[code] ?? 0) + 1; return counts; }, {}),
    unrecorded, injections: decisions.filter(d => d.injected === true).length,
    complete, cost: complete ? sum : null, knownCost: sum,
    tokens: tokenComplete ? tokens.reduce((a, b) => a + b, 0) : null,
    openaiKnownCost: openai.filter(finite).reduce((a, b) => a + b, 0),
    externalKnownCost: external.filter(finite).reduce((a, b) => a + b, 0),
    jevKnownCost: jev.filter(finite).reduce((a, b) => a + b, 0),
    jevKnownCalls: jev.filter(finite).length, jevUnknownCalls: jev.filter(v => v === null).length,
    jevReserves,
  };
}

function normalize(run) {
  assert.ok(identifier(run.task) && identifier(run.variant), 'Invalid task or variant identity');
  assert.ok(Number.isInteger(run.repetition) && run.repetition >= 0, 'Invalid repetition');
  const watcher = watcherMetrics(run);
  const mainCost = run.usageCostUnknown || run.mainCostUnknown || run.usageTelemetryMissing ? null : number(run.usage?.estimatedApiUsd);
  const knownMainCost = number(run.usage?.estimatedApiUsd);
  const totalCost = mainCost !== null && watcher.complete ? mainCost + watcher.cost : null;
  const knownComponents = knownMainCost !== null || watcher.complete || watcher.knownCost > 0;
  const mainTokens = number(run.usage?.totalTokens);
  const reasons = [];
  if (run.status !== 'completed') reasons.push('main_not_completed');
  if (!['passed', 'failed'].includes(run.acceptance?.status)) reasons.push('acceptance_unavailable');
  if (mainCost === null) reasons.push('main_cost_unknown');
  if (!watcher.complete) reasons.push('watcher_cost_unknown');
  if (watcher.errors) reasons.push('watcher_error');
  else if (run.watcherTreatmentValid === false) reasons.push('watcher_treatment_invalid');
  if (watcher.unrecorded === null || watcher.unrecorded > 0) reasons.push('watcher_record_missing');
  if (run.contextTreatmentValid === false) reasons.push('context_treatment_invalid');
  if (run.routingTreatmentValid === false) reasons.push('routing_treatment_invalid');
  return {
    task: run.task, variant: run.variant, repetition: run.repetition,
    runId: identifier(run.runId) ? run.runId : null,
    status: SAFE_STATUSES.has(run.status) ? run.status : 'other',
    operationalSuccess: run.success === true && run.status === 'completed' && run.acceptance?.status === 'passed',
    acceptancePassed: run.acceptance?.status === 'passed',
    valid: reasons.length === 0, excludedReasons: reasons,
    mainApiEquivalentUsd: mainCost, watcherEstimatedUsd: watcher.cost, totalEstimatedUsd: totalCost,
    knownEstimatedUsd: knownComponents ? (knownMainCost ?? 0) + watcher.knownCost : null,
    latencyMs: number(run.latencyMs), turns: number(run.turns), toolCalls: number(run.toolCalls),
    mainTokens, watcherTokens: watcher.tokens,
    totalTokens: mainTokens !== null && watcher.tokens !== null ? mainTokens + watcher.tokens : null,
    cacheReadTokens: number(run.usage?.cacheRead), watcher,
    context: { decisions: run.contextDecisions?.length ?? 0, prunedCalls: run.contextDecisions?.filter(d => d.removedMessages > 0).length ?? 0,
      removedCharacters: run.contextDecisions?.reduce((n, d) => n + (d.removedCharacters ?? 0), 0) ?? 0,
      failures: run.contextDecisions?.filter(d => d.status === 'fail_open').length ?? 0 },
    routingSwitches: run.routingDecisions?.filter(d => d.status === 'switched').length ?? 0,
    sourceHashesDigest: run.source && typeof run.source === 'object' ? digest(JSON.stringify(Object.entries(run.source).sort(([a], [b]) => a.localeCompare(b)))) : null,
  };
}

/** Pure aggregation: no provider calls, raw responses, credentials, or prose. */
export function aggregateCampaign(rawRuns, { campaign = 'campaign', manifest = {}, evidence = {}, ledger = null } = {}) {
  assert.ok(identifier(campaign), 'Invalid campaign name');
  const keys = new Set();
  const runs = rawRuns.map(normalize);
  const key = run => `${run.task}/${run.repetition}/${run.variant}`;
  for (const run of runs) { assert.ok(!keys.has(key(run)), `Duplicate task/repetition/variant: ${key(run)}`); keys.add(key(run)); }
  const schedule = Array.isArray(manifest.schedule) ? manifest.schedule : [];
  const scheduledKeys = new Set();
  for (const item of schedule) {
    assert.ok(identifier(item.task) && identifier(item.variant) && Number.isInteger(item.repetition) && item.repetition >= 0, 'Invalid schedule entry');
    assert.ok(!scheduledKeys.has(key(item)), 'Duplicate schedule entry'); scheduledKeys.add(key(item));
    if (!keys.has(key(item))) runs.push(normalize({ ...item, status: 'missing_result', success: false }));
  }
  if (schedule.length) for (const run of rawRuns) assert.ok(scheduledKeys.has(key(run)), 'Result is absent from the frozen schedule');
  const grouped = Map.groupBy(runs, run => run.variant);
  const variants = [...grouped].map(([variant, arm]) => {
    const valid = arm.filter(run => run.valid);
    const successes = arm.filter(run => run.operationalSuccess).length;
    const completeCost = stats(arm.map(run => run.totalEstimatedUsd));
    const knownCost = stats(arm.map(run => run.knownEstimatedUsd));
    const statuses = {}; const exclusions = {}; const errorsByCode = {};
    for (const run of arm) {
      statuses[run.status] = (statuses[run.status] ?? 0) + 1;
      for (const reason of run.excludedReasons) exclusions[reason] = (exclusions[reason] ?? 0) + 1;
      for (const [code, count] of Object.entries(run.watcher.errorsByCode)) errorsByCode[code] = (errorsByCode[code] ?? 0) + count;
    }
    return {
      variant, scheduled: arm.length, recorded: arm.filter(run => run.status !== 'missing_result').length,
      statuses,
      intentionToTreat: { successes, denominator: arm.length, rate: successes / arm.length },
      acceptedPatches: arm.filter(run => run.acceptancePassed).length,
      treatedValid: { successes: valid.filter(run => run.operationalSuccess).length, denominator: valid.length, rate: valid.length ? valid.filter(run => run.operationalSuccess).length / valid.length : null, exclusions },
      metrics: {
        mainApiEquivalentUsd: stats(arm.map(run => run.mainApiEquivalentUsd)),
        watcherEstimatedUsd: stats(arm.map(run => run.watcherEstimatedUsd)),
        totalEstimatedUsd: completeCost,
        knownEstimatedUsd: knownCost,
        latencyMs: stats(arm.map(run => run.latencyMs)),
        turns: stats(arm.map(run => run.turns)), toolCalls: stats(arm.map(run => run.toolCalls)),
        mainTokens: stats(arm.map(run => run.mainTokens)), watcherTokens: stats(arm.map(run => run.watcherTokens)),
        totalTokens: stats(arm.map(run => run.totalTokens)), cacheReadTokens: stats(arm.map(run => run.cacheReadTokens)),
        watcherCalls: stats(arm.map(run => run.watcher.calls)), injections: stats(arm.map(run => run.status === 'missing_result' ? null : run.watcher.injections)),
        watcherErrors: stats(arm.map(run => run.status === 'missing_result' ? null : run.watcher.errors)),
        contextPrunedCalls: stats(arm.map(run => run.status === 'missing_result' ? null : run.context.prunedCalls)),
        contextRemovedCharacters: stats(arm.map(run => run.status === 'missing_result' ? null : run.context.removedCharacters)),
        routingSwitches: stats(arm.map(run => run.status === 'missing_result' ? null : run.routingSwitches)),
      },
      watcherErrorsByCode: errorsByCode,
      intervention: {
        runsWithWatcherCalls: arm.filter(run => run.watcher.calls > 0).length,
        runsWithInjection: arm.filter(run => run.watcher.injections > 0).length,
        recordedRuns: arm.filter(run => run.status !== 'missing_result').length,
        runRate: arm.some(run => run.status !== 'missing_result') ? arm.filter(run => run.watcher.injections > 0).length / arm.filter(run => run.status !== 'missing_result').length : null,
        eligibleRunRate: arm.some(run => run.watcher.calls > 0) ? arm.filter(run => run.watcher.injections > 0).length / arm.filter(run => run.watcher.calls > 0).length : null,
      },
      costPerOperationalSuccessUsd: successes && completeCost.missing === 0 ? completeCost.sum / successes : null,
      knownCostPerOperationalSuccessLowerBoundUsd: successes && knownCost.sum !== null ? knownCost.sum / successes : null,
      watcherSubscriptionApiEquivalentKnownUsd: arm.reduce((sum, run) => sum + run.watcher.openaiKnownCost, 0),
      watcherExternalEstimatedKnownUsd: arm.reduce((sum, run) => sum + run.watcher.externalKnownCost, 0),
      jev: { knownEstimatedSpendUsd: arm.some(run => run.watcher.jevKnownCalls) ? arm.reduce((sum, run) => sum + run.watcher.jevKnownCost, 0) : null,
        knownCalls: arm.reduce((sum, run) => sum + run.watcher.jevKnownCalls, 0), unknownCalls: arm.reduce((sum, run) => sum + run.watcher.jevUnknownCalls, 0),
        recordedReservations: stats(arm.flatMap(run => run.watcher.jevReserves)) },
    };
  }).sort((a, b) => a.variant.localeCompare(b.variant));
  const pairs = [];
  for (const baseline of ['core', 'pi']) {
    for (const run of runs.filter(run => run.variant !== baseline && run.status !== 'missing_result')) {
      const control = runs.find(other => other.variant === baseline && other.task === run.task && other.repetition === run.repetition && other.status !== 'missing_result');
      if (!control) continue;
      const delta = field => run[field] !== null && control[field] !== null ? run[field] - control[field] : null;
      pairs.push({ baseline, variant: run.variant, task: run.task, repetition: run.repetition,
        validPair: run.valid && control.valid,
        operationalSuccessDelta: Number(run.operationalSuccess) - Number(control.operationalSuccess),
        treatedValidSuccessDelta: run.valid && control.valid ? Number(run.operationalSuccess) - Number(control.operationalSuccess) : null,
        estimatedUsdDelta: delta('totalEstimatedUsd'), latencyMsDelta: delta('latencyMs'), totalTokensDelta: delta('totalTokens'), cacheReadTokensDelta: delta('cacheReadTokens'),
      });
    }
  }
  pairs.sort((a, b) => `${a.baseline}/${a.variant}/${a.task}/${a.repetition}`.localeCompare(`${b.baseline}/${b.variant}/${b.task}/${b.repetition}`));
  return {
    version: 1, campaign, split: ['pilot', 'holdout', 'context'].includes(manifest.split) ? manifest.split : 'unspecified',
    model: ['gpt-6.1-sol', 'variant-specific: gpt-6.1-sol or gpt-6-luna'].includes(manifest.mainModel) ? manifest.mainModel : 'unspecified',
    reasoning: ['low', 'medium', 'high'].includes(manifest.reasoning) ? manifest.reasoning : 'unspecified',
    provenance: 'AI-authored synthetic tasks', evidence, variants, pairs,
    runs: runs.map(({ watcher, ...run }) => ({ ...run, watcherCalls: watcher.calls, watcherErrors: watcher.errors, injections: watcher.injections })),
    jevGlobalLedger: ledger ? { scope: 'global across campaigns; not attributable to this campaign', reservedUsd: number(ledger.reservedUsd), remainingUsd: number(ledger.remainingUsd), limitUsd: number(ledger.limitUsd), calls: number(ledger.calls) } : null,
    limitations: [
      'Descriptive pilot only; small samples do not establish significance or real-world performance.',
      'Core versus Pi compares a prompt/tool bundle; watcher versus core compares an added observer.',
      'Intention-to-treat operational success includes scheduled missing results and provider/watcher failures. Missing results are incomplete executions, not evidence of model inability.',
      'Treated-valid efficacy excludes unavailable acceptance, main failure, missing cost telemetry, watcher errors, and missing decision records. This selected subset is descriptive and can be biased.',
      'Costs are API-equivalent estimates for subscription models plus estimated external watcher spend, not an actual subscription bill or verified provider invoice.',
      'Known cost includes failed attempts and known components of partially costed runs. Incomplete cost/success is a nonnegative lower bound; null never means zero.',
      'Jev ledger reservations are conservative budget consumption, separate from usage-based estimated spend; global reservations cannot be attributed to a campaign.',
      'Provider cache warmth was observed rather than controlled. Fixed task/repetition pairs do not remove order or availability effects.',
    ],
  };
}

const display = (value, digits = 3) => value === null || value === undefined ? 'unknown' : Number(value).toFixed(digits);
const metric = (value, digits = 1) => `${display(value.mean, digits)} (${value.known}/${value.total})`;
const fraction = group => `${group.successes}/${group.denominator}`;

export function renderMarkdown(report) {
  const lines = [`# Campaign ${report.campaign}`, '', `AI-authored synthetic ${report.split} tasks. Descriptive results; no significance claim.`, '',
    `Main model: ${report.model}; reasoning effort: ${report.reasoning}. Compare arms within this campaign; do not pool different effort settings.`, '',
    'Means show known telemetry coverage in parentheses. Subscription costs are API-equivalent estimates, not billed subscription spend. Total estimated cost also includes watcher estimates. Unknown costs are not zero.', '',
    '| Variant | Recorded / scheduled | ITT success | Treated-valid success | Main API-equivalent mean $ | Total estimated mean $ | Mean latency ms | Mean total tokens | Mean cache reads | Mean watcher calls | Mean injections | Mean watcher errors |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const arm of report.variants) lines.push(`| ${arm.variant} | ${arm.recorded}/${arm.scheduled} | ${fraction(arm.intentionToTreat)} | ${fraction(arm.treatedValid)} | ${metric(arm.metrics.mainApiEquivalentUsd, 6)} | ${metric(arm.metrics.totalEstimatedUsd, 6)} | ${metric(arm.metrics.latencyMs)} | ${metric(arm.metrics.totalTokens)} | ${metric(arm.metrics.cacheReadTokens)} | ${metric(arm.metrics.watcherCalls)} | ${metric(arm.metrics.injections)} | ${metric(arm.metrics.watcherErrors)} |`);
  lines.push('', 'Costs per operational success include all known attempted-run costs, including unsuccessful runs. A partial lower bound is shown separately from a fully covered ratio.', '',
    '| Variant | Known cost components $ | Complete cost coverage | Cost / success $ | Known cost / success lower bound $ | Status counts | Valid-subset exclusions | Watcher error codes |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
  const counts = value => Object.entries(value).map(([key, count]) => `${key}: ${count}`).join(', ') || 'none';
  for (const arm of report.variants) lines.push(`| ${arm.variant} | ${display(arm.metrics.knownEstimatedUsd.sum, 6)} | ${arm.metrics.totalEstimatedUsd.known}/${arm.scheduled} | ${display(arm.costPerOperationalSuccessUsd, 6)} | ${display(arm.knownCostPerOperationalSuccessLowerBoundUsd, 6)} | ${counts(arm.statuses)} | ${counts(arm.treatedValid.exclusions)} | ${counts(arm.watcherErrorsByCode)} |`);
  lines.push('', 'Intervention rates describe availability: a valid watcher arm may have no eligible source-read event. A watcher error remains an operational outcome even when the main agent succeeds.', '', '| Variant | Runs with watcher calls | Runs with injection / recorded | Injection rate among eligible runs |', '| --- | --- | --- | --- |');
  for (const arm of report.variants) lines.push(`| ${arm.variant} | ${arm.intervention.runsWithWatcherCalls} | ${arm.intervention.runsWithInjection}/${arm.intervention.recordedRuns} | ${display(arm.intervention.eligibleRunRate)} |`);
  lines.push('', 'Jev usage-based estimates and global ledger reserves are separate. Estimates require returned input usage after dispatch; the $0.01 reservation on a failed request is not measured spend. Explicitly undispatched preflight failures have zero inference spend.', '', '| Variant | Jev known estimated spend $ | Known / unknown Jev calls | Recorded reservations $ (coverage) |', '| --- | --- | --- | --- |');
  for (const arm of report.variants.filter(arm => arm.variant === 'jev' || arm.jev.knownCalls || arm.jev.unknownCalls)) lines.push(`| ${arm.variant} | ${display(arm.jev.knownEstimatedSpendUsd, 6)} | ${arm.jev.knownCalls}/${arm.jev.unknownCalls} | ${display(arm.jev.recordedReservations.sum, 2)} (${arm.jev.recordedReservations.known}/${arm.jev.recordedReservations.total}) |`);
  if (report.jevGlobalLedger) lines.push('', `Global Jev ledger: $${display(report.jevGlobalLedger.reservedUsd, 2)} reserved of $${display(report.jevGlobalLedger.limitUsd, 2)}, ${display(report.jevGlobalLedger.calls, 0)} reservations. This spans campaigns and is not campaign-attributed spend.`);
  else lines.push('', 'Global Jev ledger snapshot was not requested.');
  lines.push('', 'Paired differences are variant minus baseline on the same task and repetition. Operational success differences include failures; valid efficacy differences require both arms to be valid. Positive cost/latency differences mean greater resource use.', '',
    '| Baseline | Variant | Task | Repetition | Valid pair | ITT success delta | Valid success delta | Estimated $ delta | Latency ms delta | Total token delta | Cache-read delta |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const pair of report.pairs) lines.push(`| ${pair.baseline} | ${pair.variant} | ${pair.task} | ${pair.repetition} | ${pair.validPair} | ${pair.operationalSuccessDelta} | ${display(pair.treatedValidSuccessDelta, 0)} | ${display(pair.estimatedUsdDelta, 6)} | ${display(pair.latencyMsDelta, 1)} | ${display(pair.totalTokensDelta, 0)} | ${display(pair.cacheReadTokensDelta, 0)} |`);
  if (!report.pairs.length) lines.push('', 'No recorded matched pairs are available.');
  lines.push('', `Frozen manifest SHA-256: \`${report.evidence.manifestSha256 ?? 'unavailable'}\`.`, '', 'Local evidence links point to ignored run files on this machine; raw run output is not embedded in this report.', '');
  for (const run of report.runs.filter(run => run.runId)) lines.push(`- [${run.runId}](../.suffice/runs/${report.campaign}/${run.runId}/result.json)`);
  lines.push('', ...report.limitations.map(value => `- ${value}`), '');
  return lines.join('\n');
}

function contained(root, path) { const part = relative(root, path); return part !== '' && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part); }

/** Load aggregate-only evidence; no environment/auth file or model is used. */
export async function loadCampaign(campaign, { root = ROOT, ledgerPath } = {}) {
  assert.ok(identifier(campaign), 'Invalid campaign name');
  const directory = resolve(root, '.suffice', 'runs', campaign);
  const manifestPath = resolve(directory, 'manifest.json');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.campaign, campaign, 'Campaign manifest identity mismatch');
  const runs = []; const resultHashes = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    assert.ok(identifier(entry.name), 'Invalid run directory identity');
    const file = resolve(directory, entry.name, 'result.json');
    let bytes;
    try { bytes = await readFile(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const run = JSON.parse(bytes);
    assert.equal(run.runId, entry.name, 'Run identity mismatch');
    // Older harness versions summed absent message usage into zero. Inspect
    // metadata in local events only to mark that ambiguity; never export text.
    try {
      const events = (await readFile(resolve(directory, entry.name, 'events.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      const assistants = events.filter(event => event.type === 'assistant');
      if (assistants.some(event => !finite(event.usage?.cost?.total)) || (run.turns > 0 && assistants.length !== run.turns)) run.usageCostUnknown = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; if (!Object.hasOwn(run, 'usageCostUnknown')) run.usageCostUnknown = true; }
    resultHashes[entry.name] = digest(bytes); runs.push(run);
  }
  let ledger = null;
  if (ledgerPath) ledger = await createBudgetLedger(resolve(root, ledgerPath)).snapshot();
  assert.equal(digest(await readFile(manifestPath)), digest(manifestBytes), 'Frozen manifest changed while reading report evidence');
  const inputHashes = Object.fromEntries(Object.entries(manifest.inputs ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  for (const [name, value] of Object.entries(inputHashes)) assert.ok(/^[a-zA-Z0-9_/:.\-]+$/.test(name) && typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'Invalid evidence input hash');
  return aggregateCampaign(runs, { campaign, manifest, ledger, evidence: { manifestSha256: digest(manifestBytes), inputHashes, resultHashes } });
}

export async function writeReport(campaign, options = {}) {
  const root = options.root ?? ROOT;
  const report = await loadCampaign(campaign, options);
  const directory = resolve(root, 'reports'); await mkdir(directory, { recursive: true });
  const json = resolve(directory, `${campaign}.json`), markdown = resolve(directory, `${campaign}.md`);
  assert.ok(contained(directory, json) && contained(directory, markdown), 'Report output escapes destination');
  // Existing reports are reviewable derivatives; raw campaign evidence is never overwritten.
  await writeFile(json, JSON.stringify(report, null, 2) + '\n');
  await writeFile(markdown, renderMarkdown(report));
  return { json, markdown, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [campaign, ...flags] = process.argv.slice(2);
  assert.ok(campaign && flags.every(flag => flag.startsWith('--ledger=')), 'Usage: node scripts/report.mjs <campaign> [--ledger=.suffice/jev-budget.jsonl]');
  const ledgerFlag = flags.find(flag => flag.startsWith('--ledger='));
  const { json, markdown } = await writeReport(campaign, { ledgerPath: ledgerFlag?.slice('--ledger='.length) });
  console.log(JSON.stringify({ json: relative(ROOT, json), markdown: relative(ROOT, markdown) }));
}
