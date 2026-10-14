import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root,stateDir} from '../src/runtime.mjs';
const campaign=process.argv[2];if(!/^[a-zA-Z0-9_-]+$/.test(campaign??''))throw new Error('Campaign required');
const directory=resolve(stateDir,'real-runs',campaign),manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
const runs=[];for(const name of await readdir(directory)){if(!/^\d{3}-/.test(name))continue;try{runs.push(JSON.parse(await readFile(resolve(directory,name,'result.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}}
const groups=manifest.arms.map(arm=>{
  const rows=runs.filter(r=>r.arm===arm.id),successes=rows.filter(r=>r.success).length,known=rows.filter(r=>r.totalEstimatedUsd!==null),cost=rows.reduce((n,r)=>n+r.knownEstimatedUsd,0);
  return {arm:arm.id,attempted:rows.length,scheduled:manifest.schedule.filter(r=>r.arm===arm.id).length,successes,patchesAccepted:rows.filter(r=>r.patchAccepted).length,
    completeCostRuns:known.length,knownCost:cost,costPerSuccess:successes&&known.length===rows.length?cost/successes:null,
    meanCost:known.length?known.reduce((n,r)=>n+r.totalEstimatedUsd,0)/known.length:null,meanSeconds:rows.length?rows.reduce((n,r)=>n+r.latencyMs,0)/rows.length/1000:null,
    prunedRequests:rows.reduce((n,r)=>n+(r.phases[0].prunedRequests??0),0),stateUpdates:rows.reduce((n,r)=>n+(r.phases[0].stateUpdates??0),0),
    reproEstablished:rows.filter(r=>r.phases[0].reproduction?.before==='failed').length,reproPassed:rows.filter(r=>r.phases[0].reproduction?.after==='passed').length,
    reviews:rows.filter(r=>r.review?.valid).length,repairs:rows.filter(r=>r.review?.verdict==='repair').length,
    falseApprovals:rows.filter(r=>r.review?.verdict==='approve'&&!r.patchAccepted).length,
    rescued:rows.filter(r=>r.arm==='luna-review'&&!r.beforeReviewAccepted&&r.patchAccepted).length};
});
const report={campaign,at:new Date().toISOString(),completed:runs.length,scheduled:manifest.schedule.length,repository:manifest.repository,baseRevision:manifest.baseRevision,groups,
  runs:runs.map(({phases,acceptance,regression,...r})=>({...r,phases:phases.map(({final,errors,...p})=>p)}))};
await writeFile(resolve(root,`reports/${campaign}.json`),JSON.stringify(report,null,2));
const usd=v=>v===null?'unknown':`$${v.toFixed(4)}`;
const lines=[`# Real repository experiments: ${campaign}`,'',`Completed ${runs.length}/${manifest.schedule.length} scheduled runs. Repository: [npm/node-semver](${manifest.repository}), base ${manifest.baseRevision}.`,'',
  'Three historical repairs in a real repository. Each task uses the same pre-fix snapshot; reference repairs pass separate hidden checks. This is a narrow historical replay, not a representative real-world benchmark. Public code and fixes may have appeared in training data. Policies were frozen before the campaign; no hidden outcomes are available to workers or reviewers.','',
  '| Arm | Completed + accepted / attempted | Accepted patches | Mean estimated cost (known runs) | Total cost / success | Mean seconds | Pruned requests |',
  '|---|---:|---:|---:|---:|---:|---:|'];
for(const g of groups)lines.push(`| ${g.arm} | ${g.successes}/${g.attempted} | ${g.patchesAccepted} | ${usd(g.meanCost)} (${g.completeCostRuns}/${g.attempted}) | ${usd(g.costPerSuccess)} | ${g.meanSeconds?.toFixed(1)??'-'} | ${g.prunedRequests} |`);
lines.push('','All model calls, including review, repair, retries with reported usage, and failed attempts, contribute to cost. Costs are API-equivalent catalog estimates using the existing subscription; no OpenAI API-key fallback. Missing telemetry makes total cost unknown; known components remain lower bounds. Cache warmth is observed, not controlled.','',
  '## Experiment 1: worker and review','',
  'Compare sol, luna, and luna-review. Review is a fresh read-only Sol session with the task and attempted patch; a concrete repair verdict triggers one bounded Sol repair phase. The reviewer sees neither hidden tests nor their results.');
const review=groups.find(g=>g.arm==='luna-review');if(review)lines.push('',`Valid reviews: ${review.reviews}; repair verdicts: ${review.repairs}; incorrect patches approved: ${review.falseApprovals}; initially failing patches rescued: ${review.rescued}.`);
lines.push('','## Experiment 2: progress state and recoverable pruning','',
  'Compare luna, luna-state, luna-prune, and luna-state-prune as a 2x2 design. State records requirements/unresolved issues plus automatic edit and test freshness. Pruning removes only large older read-only outputs, preserves actions/edits/tests and two recent turns, and leaves original evidence recoverable. Pruning activates above 18,000 serialized characters; this is not a tokenizer budget or learned selector.');
for(const g of groups.filter(g=>/state|prune/.test(g.arm)))lines.push('',`${g.arm}: ${g.stateUpdates} explicit state updates; ${g.prunedRequests} pruned requests.`);
lines.push('','## Experiment 3: reproduction-first verification','',
  'Compare luna-repro with luna. The worker must define a bounded set of public API assertions before editing; the harness confirms an assertion failure against the frozen original code. Cases then freeze. Success requires both the same reproduction passing afterward and independent acceptance plus regression checks. Reproducer quality is not guaranteed merely by a fail-to-pass transition.');
const repro=groups.find(g=>g.arm==='luna-repro');if(repro)lines.push('',`Established failing reproducers: ${repro.reproEstablished}/${repro.attempted}; passed after edits: ${repro.reproPassed}/${repro.attempted}.`);
lines.push('','## Individual outcomes','','| Task | Repetition | Arm | Completion | Hidden checks | Regression | Estimated cost |','|---|---:|---|---|---|---|---:|');
for(const r of runs)lines.push(`| ${r.task} | ${r.repetition+1} | ${r.arm} | ${r.status} | ${r.acceptance.status} | ${r.regression.status} | ${usd(r.totalEstimatedUsd)} |`);
lines.push('','## Scope and limitations','',
  '- Real upstream production files and old regression fixtures are preserved; the existing scoped runner places the repository under src/.',
  '- Regression execution adapts upstream fixture groups to Node test (seven in the main campaign; six in the initial smoke); it is not the complete upstream TAP suite, CLI suite, or lint gate.',
  '- Hidden acceptance combines upstream bug examples with additional contract cases; fixed references pass and baseline fails before model trials.',
  '- All repairs may converge on one file despite cross-module investigation; this is larger than the original fixtures but not a long-horizon application task.',
  '- Two repetitions across three issues cannot establish statistical superiority. No controller training or general accuracy advantage is claimed.',
  '- Fresh review is additional compute, not a budget-matched baseline. Compare total cost and latency as well as acceptance.',
  '- Raw local transcripts and credentials stay in ignored storage. Sources, schedule, input hashes and failure evidence are retained.');
await writeFile(resolve(root,`reports/${campaign}.md`),lines.join('\n')+'\n');
console.log(JSON.stringify({campaign,completed:runs.length,scheduled:manifest.schedule.length,groups},null,2));
