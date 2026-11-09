import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {readFile,writeFile,mkdir,cp,statfs} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {suite,suiteRoot} from '../benchmarks/intelligence-eval-v2/tasks.mjs';
import {preparePilot} from '../benchmarks/intelligence-eval-v2/pilot.mjs';
import {CONFIG,ARMS,schedule,snapshot,allFiles,runTrial} from '../src/intelligence-eval.mjs';
import {hash} from '../src/workspace.mjs';
import {root} from '../src/runtime.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const n=s.indexOf('=');return n<0?[s,true]:[s.slice(0,n),s.slice(n+1)];}));
const phase=args['--phase']??'main',campaign=args['--campaign']??'luna-xhigh-isolated-v2';
if(!['pilot','main'].includes(phase)||!/^[\w-]+$/.test(campaign))throw new Error('Invalid phase/campaign');
const publishedRoot=resolve(root,'reports/repository-intelligence-eval-v2'),published=resolve(publishedRoot,campaign,phase),runsRoot=resolve(suiteRoot,'runs',campaign,phase);await mkdir(published,{recursive:true});await mkdir(runsRoot,{recursive:true});
const validated=JSON.parse(await readFile(resolve(suiteRoot,'dataset.json'),'utf8'));
const tasks=phase==='pilot'?await preparePilot():suite.map(t=>{const v=validated.find(v=>v.id===t.id);return {...t,sourceFiles:v.sourceFiles,referenceFiles:v.referenceFiles,acceptanceHash:v.acceptanceHash};});
const parallelBlocks=Number(args['--parallel-blocks']??(phase==='pilot'?3:4));
if(!Number.isInteger(parallelBlocks)||parallelBlocks<1||parallelBlocks>4)throw new Error('Parallel blocks must be 1-4');
for(const t of tasks)t.baselineHashes=await snapshot(t.baseline);
const blocks=phase==='pilot'?tasks.map(t=>[{task:t.id,arm:'A',mode:'off',repetition:0}]):schedule(tasks);
// Six availability-only diagnostics are separate from all 144 primary attempts.
if(phase==='main')for(const category of ['simple','cross-file','complex'])for(const t of [...tasks].filter(t=>t.category===category).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,2))blocks.push([{task:t.id,arm:'D',mode:'tools',repetition:0,diagnostic:true}]);
const sourcePaths=['package.json','package-lock.json','scripts/intelligence-eval.mjs','scripts/prepare-intelligence-eval.mjs','src/intelligence-eval.mjs','src/workspace.mjs','benchmarks/intelligence-eval-v2/tasks.mjs','benchmarks/intelligence-eval-v2/pilot.mjs',...(await allFiles(resolve(root,'packages/cli/src'))).map(p=>'packages/cli/src/'+p)];
const inputs={};for(const p of sourcePaths)inputs[p]=hash(await readFile(resolve(root,p)));
const manifest={version:2,phase,campaign,config:CONFIG,totalExperimentCapUsd:12,requestReserveExplanation:'$0.15 per request exceeds the catalog worst-case 272k input plus 16,384 output at up to 2x pricing; provider retries disabled. $0.50 reserved per dispatched run; unknown totals retain that entire reservation.',modelSelection:'User fixed gpt-6-luna at xhigh. Pilot checks calibration only; no model, trigger or budget tuning against final labels.',fastMode:'Requested priority in preflight; provider returned default. All scored calls explicitly request default.',seed:20261109,parallelBlocks,arms:ARMS,blocks,inputs,datasetHash:hash(JSON.stringify(validated)),tasks:tasks.map(t=>({id:t.id,category:t.category,kind:t.kind,repository:t.repository,revision:t.revision,family:t.family,difficultyRationale:t.difficultyRationale,prompt:t.prompt,baselineHashes:t.baselineHashes,acceptanceHash:t.acceptanceHash,sourceFiles:t.sourceFiles})),node:process.versions.node,platform:process.platform,sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};
const manifestPath=resolve(published,'manifest.json');
if(args['--resume']){
  const prior=JSON.parse(await readFile(manifestPath,'utf8'));
  if(JSON.stringify(prior)!==JSON.stringify(manifest)){
    if(!args['--operational-amendment']||phase!=='main')throw new Error('Frozen manifest differs; do not resume altered trials');
    const before={...prior,inputs:{...prior.inputs}},after={...manifest,inputs:{...manifest.inputs}},runner='scripts/intelligence-eval.mjs';
    delete before.inputs[runner];delete after.inputs[runner];delete before.parallelBlocks;delete after.parallelBlocks;
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Operational resume may change only runner bytes and concurrency');
    const original=await readFile(resolve(runsRoot,'frozen-source',runner));if(hash(original)!==prior.inputs[runner])throw new Error('Frozen original runner is missing or altered');
    const amendment={kind:'throughput-only',reason:'Drain initial six-run batches, then increase concurrent isolated runs without changing any trial, treatment, input, model setting, allowance, or scoring code.',originalParallelBlocks:prior.parallelBlocks,newParallelBlocks:parallelBlocks,originalRunnerHash:prior.inputs[runner],newRunnerHash:manifest.inputs[runner],originalManifest:'manifest.json',unchanged:'All manifest fields other than runner hash and parallelBlocks; canonical run IDs preserve completed attempts.'};
    const amendmentPath=resolve(published,'operational-amendment.json');let saved;try{saved=JSON.parse(await readFile(amendmentPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(saved){if(JSON.stringify(saved)!==JSON.stringify(amendment))throw new Error('A different operational amendment already exists');}
    else await writeFile(amendmentPath,JSON.stringify(amendment,null,2),{flag:'wx'});
  }
}
else{await writeFile(manifestPath,JSON.stringify(manifest,null,2),{flag:'wx'});for(const p of sourcePaths){const target=resolve(runsRoot,'frozen-source',p);await mkdir(dirname(target),{recursive:true});await cp(resolve(root,p),target);}}
await writeFile(resolve(publishedRoot,'dataset.json'),JSON.stringify(validated.map(({baseline,reference,regression,referenceRegression,hashes,...r})=>({...r,validation:{baseline:baseline.status,reference:reference.status,regression:regression.status,referenceRegression:referenceRegression.status}})),null,2));
const runtime=await ModelRuntime.create({authPath:resolve(homedir(),'.suffice/auth.json'),modelsPath:null,modelsStorePath:resolve(homedir(),'.suffice/catalog.json'),allowModelNetwork:false});if(!runtime.isUsingSubscription('openai'))throw new Error('Subscription required; no fallback');
const ledgerPath=resolve(publishedRoot,'spending.json');let ledger;try{ledger=JSON.parse(await readFile(ledgerPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;const p=JSON.parse(await readFile(resolve(publishedRoot,'preflight.json'),'utf8'));ledger={cap:12,entries:[{runId:'fast-preflight',known:p.usage.estimatedApiUsd,reserved:p.usage.costUnknown?0.1:p.usage.estimatedApiUsd,unknown:p.usage.costUnknown}]};}
const ledgerKey=runId=>campaign+'/'+phase+'/'+runId;
const results=[];let stopReason=null,infraBlocks=0;
async function persist(){await writeFile(ledgerPath,JSON.stringify(ledger,null,2));await writeFile(resolve(published,'summary.json'),JSON.stringify({manifest,attempted:results.length,primaryAttempted:results.filter(r=>!r.diagnostic).length,scheduled:blocks.flat().length,stopReason,results:results.map(({acceptance,regression,patches,graphOverhead,graphQueries,evidenceUptake,final,...r})=>({...r,acceptanceStatus:acceptance.status,regressionStatus:regression.status,graphQueryCount:graphQueries?.length??0,graphRefreshCount:graphOverhead?.length??0,graphMs:graphOverhead?.reduce((n,e)=>n+e.latencyMs,0)??0,uptakeCount:evidenceUptake?.filter(e=>e.subsequentTouches.length||e.subsequentTestCommands.length).length??0}))},null,2));}
for(let blockIndex=0;blockIndex<blocks.length;blockIndex+=parallelBlocks){
  const block=blocks.slice(blockIndex,blockIndex+parallelBlocks).flatMap((items,offset)=>items.map(item=>({...item,scheduleIndex:blockIndex+offset})));
  const pending=[];
  for(const item of block){const canonicalIndex=phase==='pilot'?item.scheduleIndex+1:Math.floor(item.scheduleIndex/2)*2+1;const runId=`${String(canonicalIndex).padStart(3,'0')}-${item.task}-${item.arm}-r${item.repetition}`;if(args['--resume'])try{const prior=JSON.parse(await readFile(resolve(published,runId+'.json'),'utf8'));results.push(prior);continue;}catch(e){if(e.code!=='ENOENT')throw e;}pending.push({...item,runId,dispatchConcurrency:parallelBlocks*3});}
  if(!pending.length)continue;
  const reserved=ledger.entries.reduce((n,e)=>n+e.reserved,0);if(reserved+pending.length*CONFIG.maxCost>ledger.cap){stopReason='spending_cap';await persist();break;}
  if((await statfs(root)).bavail*(await statfs(root)).bsize<2*1024**3){stopReason='disk_floor';await persist();break;}
  for(const [p,h]of Object.entries(inputs))if(hash(await readFile(resolve(root,p)))!==h)throw new Error('Frozen implementation changed: '+p);
  for(const item of pending){if(ledger.entries.some(e=>e.runId===ledgerKey(item.runId)))throw new Error('Orphaned reservation requires audit; do not silently repeat a dispatched run');ledger.entries.push({runId:ledgerKey(item.runId),reserved:CONFIG.maxCost,known:0,unknown:true,state:'dispatched'});}await persist();
  console.log(JSON.stringify({event:'block_start',phase,block:blockIndex+1,total:blocks.length,runs:pending.map(p=>p.runId),reserved:ledger.entries.reduce((n,e)=>n+e.reserved,0)}));
  const outcomes=await Promise.all(pending.map(async item=>{
    const task=tasks.find(t=>t.id===item.task);let result;
    try{result=await runTrial({runtime,task,item,runDir:resolve(runsRoot,item.runId),published});}
    catch(e){result={...item,category:task.category,kind:task.kind,status:'infrastructure_error',error:e.message,success:false,modelValid:false,immutableIntact:false,usage:{input:0,cacheRead:0,cacheWrite:0,output:0,estimatedApiUsd:0,costUnknown:true,modelCalls:0},totalEstimatedUsd:null,acceptance:{status:'not_run'},regression:{status:'not_run'},graphQueries:[],graphOverhead:[],evidenceUptake:[]};await writeFile(resolve(published,item.runId+'.json'),JSON.stringify(result,null,2));}
    const entry=ledger.entries.find(e=>e.runId===ledgerKey(item.runId));entry.known=result.usage.estimatedApiUsd;entry.unknown=result.totalEstimatedUsd===null;entry.reserved=entry.unknown?CONFIG.maxCost:result.totalEstimatedUsd;entry.state='finished';
    console.log(JSON.stringify({event:'run_end',phase,runId:item.runId,status:result.status,success:result.success,cost:result.totalEstimatedUsd,seconds:result.latencyMs/1000,queries:result.graphQueries.length}));return result;
  }));
  results.push(...outcomes);infraBlocks=outcomes.every(r=>['infrastructure_error','agent_error'].includes(r.status))?infraBlocks+1:0;await persist();
  if(infraBlocks>=2){stopReason='repeated_infrastructure_failure';await persist();break;}
}
await persist();console.log(JSON.stringify({event:'phase_end',phase,attempted:results.length,passed:results.filter(r=>r.success).length,stopReason,knownCost:ledger.entries.reduce((n,e)=>n+e.known,0),reservedCost:ledger.entries.reduce((n,e)=>n+e.reserved,0)}));
