import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, stateDir } from '../src/runtime.mjs';
import { writeReport } from './report.mjs';

const campaigns = process.argv.slice(2);
if (!campaigns.length || campaigns.some(c => !/^[a-zA-Z0-9_-]+$/.test(c))) throw new Error('Supply campaign names.');
const summaries = [];
for (const campaign of campaigns) {
  const { report } = await writeReport(campaign, { ledgerPath: '.suffice/jev-budget.jsonl' });
  const directory = resolve(stateDir, 'runs', campaign);
  const mechanisms = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'frozen-source') continue;
    let run;
    try { run = JSON.parse(await readFile(resolve(directory, entry.name, 'result.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const events = (await readFile(resolve(directory, entry.name, 'events.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
    mechanisms.push({ task: run.task, variant: run.variant, repetition: run.repetition,
      models: Object.fromEntries([...new Set(events.filter(e => e.type === 'request_shape').map(e => e.model))].map(model => [model, events.filter(e => e.type === 'request_shape' && e.model === model).length])),
      input: run.usage.input, cacheRead: run.usage.cacheRead, output: run.usage.output,
      contextPrunedCalls: run.contextDecisions?.filter(d => d.removedMessages > 0).length ?? 0,
      contextFailOpen: run.contextDecisions?.filter(d => d.status === 'fail_open').length ?? 0,
      preserveCacheDecisions: run.contextDecisions?.filter(d => d.reason === 'preserve_cache_forecast').length ?? 0,
      injections: run.decisions.filter(d => d.injected).length,
      auxiliaryErrors: run.decisions.filter(d => ['error','aborted'].includes(d.status)).map(d => d.errorCode),
      switches: run.routingDecisions?.filter(d => d.status === 'switched').length ?? 0,
    });
  }
  summaries.push({ campaign, report, mechanisms });
}
const fmt = n => n == null ? 'unknown' : n.toFixed(5);
const lines = ['# Context and control experiments', '',
  'Exploratory synthetic tasks, not a real-repository benchmark. Each campaign is separate. Subscription costs are API-equivalent estimates; all auxiliary inference is included. Unknown cost is not treated as zero. Cache warmth is observed, not controlled.', '',
  'The original transcript is retained. Replacement arms prune complete historical groups; they do not delete source files or permanently revoke retrieval. Delegate means bounded read-only exact-quote assistance, not a full autonomous worker. Graph means lexical imports and reverse dependencies, not a semantic call graph. Routing is a fixed Luna-to-Sol heuristic, not a trained policy.', ''];
const recorded = summaries.flatMap(s => s.report.runs).filter(r => r.status !== 'missing_result');
lines.splice(2, 0, `Execution bookkeeping across these separate campaigns: ${recorded.length} recorded runs, ${recorded.filter(r => r.operationalSuccess).length} completed with accepted patches, ${recorded.filter(r => r.acceptancePassed).length} accepted patches including runs that failed to finish. These are not pooled accuracy estimates.`, '');
const transfer = summaries.find(s => s.campaign === 'context-transfer-v5');
if (transfer) {
  const arms = transfer.report.variants;
  const core = arms.find(a => a.variant === 'core'), luna = arms.find(a => a.variant === 'luna-worker'), route = arms.find(a => a.variant === 'route');
  lines.splice(4, 0,
    `Transfer cohort (two tasks, two repetitions): core/Sol ${core.intentionToTreat.successes}/${core.scheduled}; Luna-only ${luna.intentionToTreat.successes}/${luna.scheduled}; Luna-to-Sol routing ${route.intentionToTreat.successes}/${route.scheduled}. Luna's recorded failure omitted live tenant filtering. Costs and missing telemetry are shown per arm below.`, '',
    `Revised selectors have ${transfer.mechanisms.filter(m => m.variant.startsWith('stable-')).reduce((n,m) => n + m.contextPrunedCalls, 0)} pruned requests in this cohort. Passing without pruning does not demonstrate active context-selection quality.`, '');
}
for (const { campaign, report, mechanisms } of summaries) {
  lines.push(`## ${campaign}`, '', '| Arm | Completed + passed / scheduled | Accepted patches | Valid treatment runs | Mean total estimated USD | Pruned requests | Injections | Model switches |', '|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const arm of report.variants) {
    const rows = mechanisms.filter(m => m.variant === arm.variant);
    const sum = key => rows.reduce((n, row) => n + row[key], 0);
    lines.push(`| ${arm.variant} | ${arm.intentionToTreat.successes}/${arm.scheduled} | ${arm.acceptedPatches} | ${arm.treatedValid.denominator} | ${fmt(arm.metrics.totalEstimatedUsd.mean)} (${arm.metrics.totalEstimatedUsd.known}/${arm.scheduled} known) | ${sum('contextPrunedCalls')} | ${sum('injections')} | ${sum('switches')} |`);
  }
  lines.push('', `Details: [${campaign}.md](${campaign}.md).`, '',
    'Valid-treatment counts exclude missing cost telemetry and unavailable auxiliary treatment; consult operational pass counts independently. Means only cover known-cost runs and may be selection-biased.', '');
}
lines.push('## Interpretation limits', '',
  '- Short exploratory runs cannot establish accuracy gains or a learned-policy moat.',
  '- The v4 model selector sees bounded prefixes of historical groups; these can omit the tool evidence later in a group. This is a limitation of this implementation, not a limit on context selection generally.',
  '- V5 stable selectors protect the first complete group and two recent groups, target 20,000 characters, exclude thinking from candidate excerpts, and attach omission metadata to a tool result. This bundle was tuned on inventory-reservations; transfer tasks were not used to tune it.',
  '- Cache-aware selection uses a character-based eight-call-horizon cost forecast. Actual usage determines the reported costs.',
  '- Model selection makes at most four calls, then reuses retained IDs alongside recent groups. Provider/format errors preserve full history for that call and mark the treatment unavailable.',
  '- The 35-line read default is not a restriction: the worker can request more. If files fit inside 35 lines, this arm has little opportunity to intervene.',
  '- No decision model was trained. These traces support future policy research; outcomes for unchosen actions remain unknown.', '');
await writeFile(resolve(root, 'reports/CONTEXT-RESULTS.md'), lines.join('\n'));
await writeFile(resolve(root, 'reports/CONTEXT-RESULTS.json'), JSON.stringify(summaries, null, 2));
console.log(JSON.stringify({ campaigns, report: 'reports/CONTEXT-RESULTS.md' }));
