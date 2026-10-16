// Separate post-hoc contract audit: never modify primary grader or give feedback to actors.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';import {spawnSync} from 'node:child_process';
const {executeIsolated,ROOT}=await import('../experiments/luna-fresh-v1/execution.mjs');
const DIR=resolve(ROOT,'.suffice/luna-fresh-v1/drain-contract-audit');await mkdir(DIR,{recursive:true});
const taskFile=resolve(ROOT,'.suffice/luna-fresh-v1/tasks/f06/task.json'),task=JSON.parse(await readFile(taskFile,'utf8'));
const cases=[['base',[]],['reference',JSON.parse(await readFile(task.referencePatchJson,'utf8'))],['A',JSON.parse(await readFile(resolve(ROOT,'.suffice/luna-fresh-v1/attempts/f06-A/patch.json'),'utf8'))]];
try{cases.push(['B',JSON.parse(await readFile(resolve(ROOT,'.suffice/luna-fresh-v1/attempts/f06-B/patch.json'),'utf8'))]);}catch(e){if(e.code!=='ENOENT')throw e;}
const program=`import {createRequire} from 'node:module';import assert from 'node:assert/strict';const require=createRequire(import.meta.url);const fastq=require('./queue.js');const runs=[];
for(let n=0;n<10;n++){
 const logs=[];async function processTask(){await new Promise(resolve=>setTimeout(resolve,0));logs.push('processed');}
 const queue=fastq.promise(processTask,1);queue.drain=()=>logs.push('called drain');queue.drained().then(()=>logs.push('drained promise resolved'));
 await Promise.all([queue.push(),queue.push(),queue.push()]);const atPromiseAll=[...logs];await new Promise(setImmediate);
 const expected=['processed','processed','processed','called drain','drained promise resolved'];runs.push({atPromiseAll,settledTrace:logs,publicExpectedTraceSatisfied:JSON.stringify(logs)===JSON.stringify(expected)});
}console.log(JSON.stringify({runs}));`;
const rows=[];
for(const[label,patch]of cases){
 const caseDir=resolve(DIR,label),workspace=resolve(caseDir,'workspace');await mkdir(caseDir,{recursive:true});const patchFile=resolve(caseDir,'patch.json');await writeFile(patchFile,JSON.stringify(patch));
 const data=spawnSync('python3',['-I',resolve(ROOT,'experiments/luna-fresh-v1/evaluator-data.py'),'grade',taskFile,workspace,patchFile],{encoding:'utf8'});if(data.status!==0)throw Error(data.stderr);
 const run=await executeIsolated({workspace,receipts:resolve(caseDir,'receipts'),command:['node','--input-type=module','-e',program],gitMetadata:[task.dependencyDir],network:false,timeoutMs:30000});
 if(run.exitCode!==0)throw Error(run.stderr);rows.push({label,...JSON.parse(run.stdout)});
}
const audit={at:new Date().toISOString(),primaryGraderChanged:false,modelFeedback:false,originalIssue:'https://github.com/mcollina/fastq/issues/88',observation:'Upstream grader checks event array immediately after await Promise.all. Original issue requires printed event order, not drained callback completion before the Promise.all continuation. Compare eventual trace separately from that additional scheduling boundary.',rows};
await writeFile(resolve(ROOT,'reports/luna-fresh-v1/drain-contract-audit.json'),JSON.stringify(audit,null,2));console.log(JSON.stringify(rows.map(r=>({label:r.label,publicTracePasses:r.runs.filter(x=>x.publicExpectedTraceSatisfied).length,total:r.runs.length,first:r.runs[0]}))));
