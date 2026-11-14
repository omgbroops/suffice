import {readFile,writeFile,mkdir,cp,statfs,readdir,stat,appendFile} from 'node:fs/promises';import {resolve,dirname} from 'node:path';
import {createRuntime,stateDir,root} from '../src/runtime.mjs';import {efficiencyTasks} from '../benchmarks/efficiency/tasks.mjs';import {realTasks} from '../benchmarks/real/tasks.mjs';
import {EFFICIENCY_ARMS,providerFailureKind} from '../src/tool-observations.mjs';import {runRealAgent,sourceSnapshot} from '../src/real-agent.mjs';import {filesIn,hash,runNodeTests} from '../src/workspace.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return i<0?[s,true]:[s.slice(0,i),s.slice(i+1)];}));
const campaign=args['--campaign'];if(!/^[a-zA-Z0-9_-]+$/.test(campaign??''))throw new Error('Unique campaign required');
const reps=Number(args['--repetitions']??3);if(!Number.isInteger(reps)||reps<1||reps>3)throw new Error('Repetitions must be 1-3');
const tasks=args['--smoke']?[realTasks[0]]:efficiencyTasks;
const selected=String(args['--arms']??EFFICIENCY_ARMS.map(a=>a.id).join(',')).split(',');if(selected.some(id=>!EFFICIENCY_ARMS.some(a=>a.id===id)))throw new Error('Unknown arm');
const arms=selected.map(id=>({...EFFICIENCY_ARMS.find(a=>a.id===id),efficiencyCampaign:true}));
const schedule=[];for(let r=0;r<reps;r++)for(const [i,t]of tasks.entries()){const order=[...arms],shift=(i+r)%arms.length;order.push(...order.splice(0,shift));if(r%2)order.reverse();for(const arm of order)schedule.push({task:t.id,arm:arm.id,repetition:r});}
const directory=resolve(stateDir,'efficiency-runs',campaign);await mkdir(directory,{recursive:true});
const resourceFloorMiB=args['--resource-floor-mib']===undefined?null:Number(args['--resource-floor-mib']);
if(resourceFloorMiB!==null&&(!args['--resume']||!Number.isInteger(resourceFloorMiB)||resourceFloorMiB<1024||resourceFloorMiB>5120))throw new Error('Resource-only continuation floor must be 1024-5120 MiB and requires --resume');
async function artifactSize(path){let total=0;for(const e of await readdir(path,{withFileTypes:true})){const p=resolve(path,e.name);if(e.isDirectory())total+=await artifactSize(p);else if(e.isFile())total+=(await stat(p)).size;}return total;}
const sourcePaths=['package.json','bun.lock','scripts/efficiency-experiment.mjs','scripts/efficiency-report.mjs','scripts/prepare-efficiency.mjs','docs/TOOL-EFFICIENCY.md',
  ...(await filesIn(resolve(root,'src'))).map(p=>`src/${p}`),...(await filesIn(resolve(root,'benchmarks/efficiency'))).map(p=>`benchmarks/efficiency/${p}`),'benchmarks/real/visible.test.mjs','tests/tool-efficiency.test.mjs'];
if(args['--smoke'])sourcePaths.push('benchmarks/real/tasks.mjs','benchmarks/real/prerelease-subset.test.mjs');
const inputs={};for(const file of sourcePaths)inputs[file]=hash(await readFile(resolve(root,file)));
const baselineHashes={};for(const t of tasks){baselineHashes[t.id]={};for(const file of await filesIn(t.workspaceDir))baselineHashes[t.id][file]=hash(await readFile(resolve(t.workspaceDir,file)));}
const configuration={version:1,campaign,model:'gpt-6.1-sol',effort:'low',smoke:!!args['--smoke'],arms,schedule,inputs,baselineHashes,workerTimeoutMs:360000,maxTurns:24,estimatedCostStopUsd:12,minimumFreeBytes:5*1024**3,
  tasks:tasks.map(t=>({id:t.id,base:t.base??'efa4be6096c1f9b77d9d27d6132f6220c43b4e31',fix:t.fix,prompt:t.prompt}))};
let resourceAmendment=null;
if(args['--resume']){
  const saved=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
  for(const key of Object.keys(configuration)){
    if(key==='inputs'&&resourceFloorMiB!==null){
      const paths=[...new Set([...Object.keys(saved.inputs),...Object.keys(inputs)])],changed=paths.filter(p=>saved.inputs[p]!==inputs[p]);
      if(changed.some(p=>p!=='scripts/efficiency-experiment.mjs'))throw new Error('Only the operational runner may differ for this resource-only amendment');
      resourceAmendment={at:new Date().toISOString(),kind:'resource-only',originalMinimumFreeBytes:saved.minimumFreeBytes,minimumFreeBytes:resourceFloorMiB*1024**2,maximumCampaignArtifactBytes:100*1024**2,
        sourceChanges:changed.map(path=>({path,original:saved.inputs[path],current:inputs[path]})),unchanged:'model, prompts, runtime tools, dependencies, tasks, acceptance, repetitions, order, per-run limits, and cost limit'};
    }else if(JSON.stringify(saved[key])!==JSON.stringify(configuration[key]))throw new Error(`Frozen ${key} changed`);
  }
  if(resourceAmendment){await appendFile(resolve(directory,'operational-amendments.jsonl'),JSON.stringify(resourceAmendment)+'\n');console.log(JSON.stringify({event:'resource_amendment',...resourceAmendment}));}
}
else{await writeFile(resolve(directory,'manifest.json'),JSON.stringify({...configuration,startedAt:new Date().toISOString()},null,2),{flag:'wx'});for(const file of sourcePaths){const target=resolve(directory,'frozen-source',file);await mkdir(dirname(target),{recursive:true});await cp(resolve(root,file),target);}}
const runtime=await createRuntime();if(!runtime.isUsingSubscription('openai'))throw new Error('Subscription unavailable; no paid fallback');
let knownCost=0,failures=0,completed=0;
for(const [index,item]of schedule.entries()){
  const runId=`${String(index+1).padStart(3,'0')}-${item.task}-${item.arm}-r${item.repetition}`,runDir=resolve(directory,runId);
  if(args['--resume'])try{const prior=JSON.parse(await readFile(resolve(runDir,'result.json'),'utf8'));knownCost+=prior.knownEstimatedUsd;completed++;continue;}catch(e){if(e.code!=='ENOENT')throw e;}
  const disk=await statfs(root),artifactBytes=resourceAmendment?await artifactSize(directory):0;
  if(disk.bavail*disk.bsize<(resourceAmendment?.minimumFreeBytes??configuration.minimumFreeBytes)||knownCost>=12||(resourceAmendment&&artifactBytes>=resourceAmendment.maximumCampaignArtifactBytes)){console.log(JSON.stringify({event:'campaign_stopped',reason:'resource_budget',completed,freeBytes:disk.bavail*disk.bsize,artifactBytes}));process.exitCode=3;break;}
  const task=tasks.find(t=>t.id===item.task),arm=arms.find(a=>a.id===item.arm),validation=JSON.parse(await readFile(resolve(dirname(task.workspaceDir),'validation.json'),'utf8'));
  for(const [file,h]of Object.entries(baselineHashes[item.task]))if(hash(await readFile(resolve(task.workspaceDir,file)))!==h)throw new Error('Baseline changed');
  await mkdir(runDir);const workspace=resolve(runDir,'workspace');await cp(task.workspaceDir,workspace,{recursive:true});
  console.log(JSON.stringify({event:'run_start',runId,index:index+1,total:schedule.length}));
  const worker=await runRealAgent({runtime,workspace,baseline:task.workspaceDir,sourceFiles:validation.sourceFiles,runDir:resolve(runDir,'worker'),task,arm,timeoutMs:360000,maxTurns:24});
  await writeFile(resolve(runDir,'worker.json'),JSON.stringify(worker,null,2));
  const acceptance=await runNodeTests(workspace,task.acceptancePath),regression=await runNodeTests(workspace,resolve(workspace,'tests/visible.test.mjs'));
  const expectedAcceptance=inputs[`benchmarks/${args['--smoke']?'real':'efficiency'}/${task.id}.test.mjs`];if(hash(await readFile(task.acceptancePath))!==expectedAcceptance)throw new Error('Acceptance changed');
  const originals=baselineHashes[item.task],allow=new Set(validation.sourceFiles),actualFiles=await filesIn(workspace);let immutableIntact=actualFiles.filter(p=>!allow.has(p)).length===Object.keys(originals).filter(p=>!allow.has(p)).length;
  for(const p of Object.keys(originals).filter(p=>!allow.has(p))){try{if(hash(await readFile(resolve(workspace,p)))!==originals[p])immutableIntact=false;}catch{immutableIntact=false;}}
  const before=await sourceSnapshot(task.workspaceDir,validation.sourceFiles),after=await sourceSnapshot(workspace,validation.sourceFiles),changed=validation.sourceFiles.filter(p=>before[p]!==after[p]);
  const events=(await readFile(resolve(runDir,'worker/events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse),assistant=events.filter(e=>e.type==='assistant');
  const actualModels=[...new Set(assistant.map(e=>e.model).filter(Boolean))],modelValid=actualModels.every(m=>m==='gpt-6.1-sol');
  const presentations=worker.presentations??[],navigation=worker.navigation??[];
  const result={runId,...item,...(resourceAmendment?{resourceAmendmentAt:resourceAmendment.at}:{}),status:worker.status,success:worker.status==='completed'&&acceptance.status==='passed'&&regression.status==='passed'&&immutableIntact&&modelValid,
    patchAccepted:acceptance.status==='passed'&&regression.status==='passed'&&immutableIntact,immutableIntact,modelValid,actualModels,changed,turns:worker.turns,calls:worker.calls,usage:worker.usage,
    knownEstimatedUsd:worker.usage.estimatedApiUsd,totalEstimatedUsd:worker.usageCostUnknown?null:worker.usage.estimatedApiUsd,latencyMs:worker.latencyMs,
    costComponents:assistant.reduce((sum,e)=>{for(const k of ['input','output','cacheRead','cacheWrite'])sum[k]=(sum[k]??0)+(e.usage?.cost?.[k]??0);return sum;},{}),
    observations:{rawCharacters:presentations.reduce((n,e)=>n+e.rawCharacters,0),deliveredCharacters:presentations.reduce((n,e)=>n+e.deliveredCharacters,0),formattedResponses:presentations.filter(e=>e.changed).length,recoveryCalls:(worker.recoveries??[]).length},
    navigation:{calls:navigation.length,tools:Object.fromEntries([...new Set(navigation.map(e=>e.tool))].map(tool=>[tool,navigation.filter(e=>e.tool===tool).length])),latencyMs:navigation.reduce((n,e)=>n+e.latencyMs,0)},
    providerErrors:worker.errors??[],acceptance:{...acceptance,stdout:undefined,stderr:undefined},regression:{...regression,stdout:undefined,stderr:undefined},endedAt:new Date().toISOString()};
  await writeFile(resolve(runDir,'acceptance.json'),JSON.stringify({acceptance,regression},null,2));await writeFile(resolve(runDir,'patch.json'),JSON.stringify(changed.map(path=>({path,before:before[path],after:after[path]})),null,2));await writeFile(resolve(runDir,'result.json'),JSON.stringify(result,null,2));
  knownCost+=result.knownEstimatedUsd;completed++;
  console.log(JSON.stringify({event:'run_end',runId,status:result.status,success:result.success,cost:result.totalEstimatedUsd,turns:result.turns,formatted:result.observations.formattedResponses,navigation:result.navigation.calls,recoveries:result.observations.recoveryCalls}));
  const kind=providerFailureKind(worker.errors);if(kind==='authorization_or_limit'){console.log(JSON.stringify({event:'campaign_stopped',reason:kind}));process.exitCode=3;break;}
  failures=['provider_error','harness_error'].includes(result.status)?failures+1:0;if(failures>=2){console.log(JSON.stringify({event:'campaign_stopped',reason:'consecutive_failures'}));process.exitCode=2;break;}
}
console.log(JSON.stringify({event:completed===schedule.length?'campaign_complete':'campaign_partial',completed,total:schedule.length,knownCost,directory}));
