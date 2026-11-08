import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root} from '../src/runtime.mjs';
const semanticReportDirectory=resolve(root,'reports/semantic-graph-v2');

const manifest=JSON.parse(await readFile(resolve(semanticReportDirectory,'manifest.json'),'utf8'));
const completion=JSON.parse(await readFile(resolve(semanticReportDirectory,'completion.json'),'utf8'));
const runs=[];
for(const [i,item]of manifest.schedule.entries()){
  const id=`${String(i+1).padStart(3,'0')}-${item.task}-${item.arm}-r${item.repetition}`;
  try{runs.push(JSON.parse(await readFile(resolve(semanticReportDirectory,id,'result.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
}
const mean=(rows,fn)=>rows.length?rows.reduce((sum,row)=>sum+fn(row),0)/rows.length:null;
const groups=manifest.protocol.arms.map(arm=>{
  const rows=runs.filter(r=>r.arm===arm),known=rows.filter(r=>r.totalEstimatedUsd!==null),accepted=rows.filter(r=>r.patchAccepted).length;
  const totalEstimatedUsd=known.length===rows.length&&rows.length?rows.reduce((n,r)=>n+r.totalEstimatedUsd,0):null;
  return {arm,attempted:rows.length,scheduled:6,accepted,completed:rows.filter(r=>r.completed).length,success:rows.filter(r=>r.success).length,knownCostAttempts:known.length,totalEstimatedUsd,
    meanEstimatedUsd:totalEstimatedUsd===null?null:totalEstimatedUsd/rows.length,costPerAccepted:accepted&&totalEstimatedUsd!==null?totalEstimatedUsd/accepted:null,
    meanInputTokens:mean(rows,r=>r.totals.input+r.totals.cacheRead+r.totals.cacheWrite),meanUncachedInput:mean(rows,r=>r.totals.input),meanCachedInput:mean(rows,r=>r.totals.cacheRead),meanOutputTokens:mean(rows,r=>r.totals.output),
    meanModelCalls:mean(rows,r=>r.totals.modelCalls),meanToolCalls:mean(rows,r=>r.toolCalls),meanWallMs:mean(rows,r=>r.wallMs),meanTotalWallMs:mean(rows,r=>r.totalWallMs),
    meanFilesRead:mean(rows,r=>r.sourceRetrieval.files.length),meanSourceBytes:mean(rows,r=>r.sourceRetrieval.bytes),meanSourceLines:mean(rows,r=>r.sourceRetrieval.lines),meanChangedFiles:mean(rows,r=>r.changed.length),
    compliant:rows.filter(r=>r.activation.compliant).length,activatedSuccess:rows.filter(r=>r.success).length,blockedEdits:rows.reduce((n,r)=>n+r.activation.blockedEdits,0),impactCalls:rows.reduce((n,r)=>n+r.activation.impactCalls,0),astCalls:rows.reduce((n,r)=>n+r.navigation.calls,0),semanticUsers:rows.filter(r=>r.graph.calls>0).length,initialInvestigationUsd:mean(rows,r=>r.initialInvestigation.knownEstimatedUsd),graphCalls:rows.reduce((n,r)=>n+r.graph.calls,0),meanIndexingMs:mean(rows,r=>r.graph.indexingMs),meanGraphToolMs:mean(rows,r=>r.graph.toolLatencyMs),meanAstToolMs:mean(rows,r=>r.navigation.latencyMs),
    meanGraphIoBytes:mean(rows,r=>r.graph.io.bytes),meanGraphScanMs:mean(rows,r=>r.graph.io.scanMs),
    meanCpuMs:mean(rows,r=>(r.cpuMicros.user+r.cpuMicros.system)/1000),regressionsPassed:rows.filter(r=>r.regression.status==='passed').length,unknownCostAttempts:rows.length-known.length};
});
const report={sourceCommit:manifest.sourceCommit,executionCommit:completion.executionCommit,completion,groups,runs:runs.map(({final,...r})=>r)};
await writeFile(resolve(semanticReportDirectory,'summary.json'),JSON.stringify(report,null,2));
const n=(v,d=1)=>v===null||v===undefined?'unavailable':v.toFixed(d),money=v=>v===null||v===undefined?'unavailable':`$${v.toFixed(6)}`;
const seconds=v=>v===null||v===undefined?'unavailable':n(v/1000,2);
const lines=['# Activated four-arm navigation experiment: recorded outcomes','',`Implementation: \`${manifest.sourceCommit}\`. Frozen execution: \`${completion.executionCommit}\`. Executed ${completion.executed}/${completion.scheduled}. Stop reason: ${completion.stopReason??'none'}.`,'',
  '| Metric | Baseline | AST-assisted | Semantic-assisted | Semantic-optional |','|---|---:|---:|---:|---:|'];
const table=(label,fn)=>lines.push(`| ${label} | ${groups.map(fn).join(' | ')} |`);
table('Activation-compliant attempts',g=>`${g.compliant}/${g.attempted}`);table('Accepted + completed + compliant',g=>`${g.activatedSuccess}/${g.attempted}`);table('Blocked edit attempts',g=>String(g.blockedEdits));table('AST navigation calls',g=>String(g.astCalls));table('Impact analysis calls',g=>String(g.impactCalls));table('Attempts using semantic tools',g=>`${g.semanticUsers}/${g.attempted}`);table('Mean initial-investigation known cost',g=>money(g.initialInvestigationUsd));table('Independently accepted patches',g=>`${g.accepted}/${g.attempted}`);table('Completed attempts',g=>`${g.completed}/${g.attempted}`);table('Visible regressions passed',g=>`${g.regressionsPassed}/${g.attempted}`);
table('Mean total estimated inference cost',g=>money(g.meanEstimatedUsd));table('Cost per accepted patch',g=>money(g.costPerAccepted));table('Mean total input tokens (including cache)',g=>n(g.meanInputTokens,0));table('Mean cached input tokens',g=>n(g.meanCachedInput,0));table('Mean output tokens',g=>n(g.meanOutputTokens,0));
table('Mean model calls',g=>n(g.meanModelCalls));table('Mean tool calls (parent + children)',g=>n(g.meanToolCalls));table('Mean agent wall seconds',g=>seconds(g.meanWallMs));table('Mean wall seconds including independent checks',g=>seconds(g.meanTotalWallMs));
table('Mean unique files retrieved',g=>n(g.meanFilesRead));table('Mean retrieved source bytes',g=>n(g.meanSourceBytes,0));table('Mean retrieved source lines',g=>n(g.meanSourceLines,0));table('Mean changed files',g=>n(g.meanChangedFiles));
table('Graph lookup calls (total)',g=>String(g.graphCalls));table('Mean graph indexing/update ms',g=>g.arm.startsWith('semantic-')?n(g.meanIndexingMs,2):'N/A');table('Mean graph tool ms including import/hashing/formatting',g=>g.arm.startsWith('semantic-')?n(g.meanGraphToolMs,2):'N/A');table('Mean AST navigation ms',g=>g.arm==='ast-assisted'?n(g.meanAstToolMs,2):'N/A');table('Mean observed parent-process CPU ms',g=>n(g.meanCpuMs,1));
table('Mean local graph input bytes scanned (including repeat freshness scans)',g=>g.arm.startsWith('semantic-')?n(g.meanGraphIoBytes,0):'N/A');table('Mean local graph freshness-scan ms',g=>g.arm.startsWith('semantic-')?n(g.meanGraphScanMs,2):'N/A');
lines.push('','## Every executed attempt','','| Task | Arm | Rep | Accepted | Completed | Compliant | Graph calls | Impacts | Blocks | Inference cost | Input incl. cache | Output | Tool calls | Files | Source bytes | Wall s | Index ms | Changed files |','|---|---|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
for(const r of runs)lines.push(`| ${r.task} | ${r.arm} | ${r.repetition+1} | ${r.patchAccepted} | ${r.completed} | ${r.activation.compliant} | ${r.graph.calls} | ${r.activation.impactCalls} | ${r.activation.blockedEdits} | ${money(r.totalEstimatedUsd)} | ${r.totals.input+r.totals.cacheRead+r.totals.cacheWrite} | ${r.totals.output} | ${r.toolCalls} | ${r.sourceRetrieval.files.length} | ${r.sourceRetrieval.bytes} | ${n(r.wallMs/1000,2)} | ${n(r.graph.indexingMs,2)} | ${r.changed.join(', ')} |`);
lines.push('','## Per-task means','','| Task | Arm | Accepted | Mean cost | Mean tool calls | Mean files | Mean wall s |','|---|---|---:|---:|---:|---:|---:|');
for(const task of manifest.tasks)for(const arm of manifest.protocol.arms){const rows=runs.filter(r=>r.task===task.id&&r.arm===arm),known=rows.every(r=>r.totalEstimatedUsd!==null);lines.push(`| ${task.id} | ${arm} | ${rows.filter(r=>r.patchAccepted).length}/${rows.length} | ${known?money(mean(rows,r=>r.totalEstimatedUsd)):'unavailable'} | ${n(mean(rows,r=>r.toolCalls))} | ${n(mean(rows,r=>r.sourceRetrieval.files.length))} | ${rows.length?n(mean(rows,r=>r.wallMs/1000),2):'unavailable'} |`);}
lines.push('','## Accounting and limitations','',`Budget consumed/reserved: ${money(completion.budgetConsumedUsd)} against ${money(completion.capUsd)}. Unknown usage: ${completion.usageUnknown}. Subscription billing is not measured.`,
  '',`Unrun attempts: ${completion.unrun.length}. ${completion.unrun.map(r=>`${r.task}/${r.arm}/r${r.repetition+1}`).join(', ')}`,
  '', 'Input is the sum of uncached input, cache reads and cache writes from the frozen Pi usage schema. Source retrieval counts delivered UTF-8 snippets, line numbers and import headers, including repeat reads; unique files count paths represented in reads or search snippets. Graph metadata is separate from source bytes. Calls count codemode parents and child tools. Indexing time is a subset of graph tool time, which also includes lazy compiler loading, content-hash scans, relationship expansion and formatting.',
  '', 'Observed parent-process CPU excludes test subprocess CPU; heap/RSS samples include the model runtime and are not isolated peak memory. Agent wall time includes model/network/tool time; independent checks are separately added. No energy or invoice measurement is claimed.',
  '', 'Two tasks are existing authored synthetic tasks, and the real historical issue is reused; these are the identical v1 tasks. Required workflows include additional prompt instructions and edit gating. This estimates workflow effects, not a pure algorithm effect. The cohort is small, repeated on one machine, and has no claim of independent held-out generalization. Source-read and context differences are observations; the data does not isolate a causal mechanism or justify broad savings claims.',
  '', `Combined v1+v2 budget consumed/reserved: ${money(completion.combinedBudgetConsumedUsd)} / $8.00.`, '', 'All raw manifests, ledger entries, transcripts, tool evidence, patches and independent test outputs are retained alongside this summary.');
await writeFile(resolve(semanticReportDirectory,'RESULTS.md'),lines.join('\n')+'\n');console.log(JSON.stringify({groups,executed:runs.length},null,2));
