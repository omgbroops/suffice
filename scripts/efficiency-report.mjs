import {readFile,writeFile,readdir} from 'node:fs/promises';import {resolve} from 'node:path';import {root,stateDir} from '../src/runtime.mjs';
const campaign=process.argv[2];if(!/^[a-zA-Z0-9_-]+$/.test(campaign??''))throw new Error('Campaign required');
const directory=resolve(stateDir,'efficiency-runs',campaign),manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8')),runs=[];
for(const n of(await readdir(directory)).filter(n=>/^\d{3}-/.test(n)))try{runs.push(JSON.parse(await readFile(resolve(directory,n,'result.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const comparisons=(id,baseline='control')=>{
  const pairs=runs.filter(r=>r.arm===id).flatMap(r=>{const control=runs.find(c=>c.arm===baseline&&c.task===r.task&&c.repetition===r.repetition);return control?[{control,candidate:r}]:[];});
  const known=pairs.filter(p=>p.control.totalEstimatedUsd!==null&&p.candidate.totalEstimatedUsd!==null),base=known.reduce((n,p)=>n+p.control.totalEstimatedUsd,0),candidate=known.reduce((n,p)=>n+p.candidate.totalEstimatedUsd,0);
  return {baseline,pairs:pairs.length,knownCostPairs:known.length,costChange:base?candidate/base-1:null,baselinePasses:pairs.filter(p=>p.control.success).length,candidatePasses:pairs.filter(p=>p.candidate.success).length,
    wins:pairs.filter(p=>!p.control.success&&p.candidate.success).map(p=>`${p.candidate.task}/r${p.candidate.repetition}`),losses:pairs.filter(p=>p.control.success&&!p.candidate.success).map(p=>`${p.candidate.task}/r${p.candidate.repetition}`)};
};
const groups=manifest.arms.map(a=>{const rows=runs.filter(r=>r.arm===a.id),known=rows.filter(r=>r.totalEstimatedUsd!==null),passed=rows.filter(r=>r.success).length;const raw=rows.reduce((n,r)=>n+r.observations.rawCharacters,0),delivered=rows.reduce((n,r)=>n+r.observations.deliveredCharacters,0);
  return {arm:a.id,attempts:rows.length,scheduled:manifest.schedule.filter(r=>r.arm===a.id).length,passed,knownCostRuns:known.length,knownCost:rows.reduce((n,r)=>n+r.knownEstimatedUsd,0),meanCost:mean(known.map(r=>r.totalEstimatedUsd)),costPerSuccess:passed&&known.length===rows.length?rows.reduce((n,r)=>n+r.totalEstimatedUsd,0)/passed:null,
    meanSeconds:mean(rows.map(r=>r.latencyMs/1000)),meanTurns:mean(rows.map(r=>r.turns)),meanUncachedInput:mean(rows.map(r=>r.usage.input)),meanCachedInput:mean(rows.map(r=>r.usage.cacheRead)),meanOutput:mean(rows.map(r=>r.usage.output)),
    formattedResponses:rows.reduce((n,r)=>n+r.observations.formattedResponses,0),rawCharacters:raw,deliveredCharacters:delivered,localOutputReduction:raw?1-delivered/raw:0,navigationCalls:rows.reduce((n,r)=>n+r.navigation.calls,0),recoveryCalls:rows.reduce((n,r)=>n+r.observations.recoveryCalls,0),comparison:comparisons(a.id)};});
const report={campaign,at:new Date().toISOString(),completed:runs.length,scheduled:manifest.schedule.length,groups,combinedVsCompact:comparisons('combined','compact'),combinedVsNavigation:comparisons('combined','navigation'),runs};
await writeFile(resolve(root,`reports/${campaign}.json`),JSON.stringify(report,null,2));
const money=x=>x===null?'unknown':`$${x.toFixed(5)}`,pct=x=>x===null?'unknown':`${(x*100).toFixed(1)}%`;
const lines=[`# Tool efficiency: ${campaign}`,'',`${runs.length}/${manifest.schedule.length} attempts completed. All workers use GPT-6.1 Sol, low reasoning.${manifest.smoke?' Infrastructure smoke on an old subset task; excluded from the main comparison.':''}`,
  '', '| Configuration | Accepted / attempted | Mean estimated cost (known runs) | Cost change vs matched control | Mean seconds | Mean turns |', '|---|---:|---:|---:|---:|---:|'];
for(const g of groups)lines.push(`| ${g.arm} | ${g.passed}/${g.attempts} | ${money(g.meanCost)} (${g.knownCostRuns}/${g.attempts}) | ${pct(g.comparison.costChange)} (${g.comparison.knownCostPairs} pairs) | ${g.meanSeconds?.toFixed(1)??'-'} | ${g.meanTurns?.toFixed(1)??'-'} |`);
lines.push('','Cost comparisons include every matched attempt with complete cost telemetry, including failures; success rates are separate. Unknown totals are not zero. Costs are API-equivalent subscription estimates, not invoices. Cached prefixes are not forcibly warmed or reset.','',
  '## Mechanism activation','','| Configuration | Formatted responses | Navigation calls | Full-output retrievals | Output characters removed locally | Mean uncached input | Mean cached input | Mean output |','|---|---:|---:|---:|---:|---:|---:|---:|');
for(const g of groups)lines.push(`| ${g.arm} | ${g.formattedResponses} | ${g.navigationCalls} | ${g.recoveryCalls} | ${pct(g.localOutputReduction)} | ${g.meanUncachedInput?.toFixed(0)??'-'} | ${g.meanCachedInput?.toFixed(0)??'-'} | ${g.meanOutput?.toFixed(0)??'-'} |`);
lines.push('','Local output reduction compares each run’s actual raw printed tool responses with its formatted responses. It does not measure cross-arm token savings: different runs may read different code or print different data. Provider usage and matched total costs are the economic outcome.','',
  '## Paired correctness','');for(const g of groups.filter(g=>g.arm!=='control'))lines.push(`- ${g.arm}: ${g.comparison.candidatePasses}/${g.comparison.pairs} versus control ${g.comparison.baselinePasses}/${g.comparison.pairs}; lost passes: ${g.comparison.losses.join(', ')||'none'}; gained passes: ${g.comparison.wins.join(', ')||'none'}.`);
lines.push('','## Individual runs','','| Task | Repetition | Configuration | Status | Hidden tests | Regressions | Estimated cost |','|---|---:|---|---|---|---|---:|');for(const r of runs)lines.push(`| ${r.task} | ${r.repetition+1} | ${r.arm} | ${r.status} | ${r.acceptance.status} | ${r.regression.status} | ${money(r.totalEstimatedUsd)} |`);
lines.push('','## Boundaries','',
  manifest.smoke?'- This is an infrastructure smoke, not an efficacy comparison.':'- Four fresh historical bugs in npm/node-semver; each uses its own pre-fix revision. Public historical solutions may have been in training data.',
  manifest.smoke?'- The smoke task was already used in the previous campaign.':'- Three repetitions per task/configuration, rotated/reversed ordering. Four tasks do not establish broad software-engineering superiority.',
  '- Compact formatting preserves programmatic structured tool APIs. Only printed observations sent to the model change; full originals remain recoverable. Source code is not summarized or deleted.',
  '- Navigation uses Acorn ASTs for exact symbol ranges and syntactic reference candidates. It is not a complete semantic call graph. Parse failures and omitted results are explicit.',
  '- Existing read/search/edit/test tools remain available in all configurations. Navigation availability plus its short usage guidance constitutes the navigation treatment.',
  '- No history pruning, watcher, model routing, learned selector, or extra model calls are used.',
  '- Hidden acceptance and upstream reference solutions remain outside model-accessible workspaces. Old regression groups are adapted to Node test, not the complete TAP suite.',
  '- Main inputs and task snapshots are frozen; smoke testing uses an old task and stays separate.');
await writeFile(resolve(root,`reports/${campaign}.md`),lines.join('\n')+'\n');console.log(JSON.stringify({campaign,completed:runs.length,scheduled:manifest.schedule.length,groups},null,2));
