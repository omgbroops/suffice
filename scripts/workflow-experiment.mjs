import {readFile,writeFile,mkdir,cp,statfs,readdir,stat} from 'node:fs/promises';import {resolve,dirname} from 'node:path';
import {createRuntime,stateDir,root} from '../src/runtime.mjs';import {workflowTasks} from '../benchmarks/workflow/tasks.mjs';import {WORKFLOW_ARMS} from '../src/workflow-policy.mjs';import {runWorkflow} from '../src/workflow-agent.mjs';import {filesIn,hash,runNodeTests} from '../src/workspace.mjs';import {providerFailureKind} from '../src/tool-observations.mjs';
import {runUpstream} from '../src/workflow-upstream.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return i<0?[s,true]:[s.slice(0,i),s.slice(i+1)];}));
const campaign=args['--campaign'];if(!/^[a-zA-Z0-9_-]+$/.test(campaign??''))throw new Error('Unique campaign required');
const schedule=[];for(let r=0;r<3;r++)for(const [i,task]of workflowTasks.entries()){const order=[...WORKFLOW_ARMS],shift=(i+r)%3;order.push(...order.splice(0,shift));for(const arm of order)schedule.push({task:task.id,arm:arm.id,repetition:r});}
const directory=resolve(stateDir,'workflow-runs',campaign);await mkdir(directory,{recursive:true});
const paths=['package.json','bun.lock','scripts/workflow-experiment.mjs','scripts/workflow-report.mjs','scripts/prepare-workflow.mjs','scripts/fetch-workflow.mjs','docs/WORKFLOW-EXPERIMENT.md','tests/workflow.test.mjs',...(await filesIn(resolve(root,'src'))).map(p=>'src/'+p),...(await filesIn(resolve(root,'benchmarks/workflow'))).map(p=>'benchmarks/workflow/'+p)];
const inputs={};for(const p of paths)inputs[p]=hash(await readFile(resolve(root,p)));
const baselines={};for(const task of workflowTasks){baselines[task.id]={};for(const p of await filesIn(task.workspaceDir))baselines[task.id][p]=hash(await readFile(resolve(task.workspaceDir,p)));}
const validationHashes={};for(const task of workflowTasks)validationHashes[task.id]=hash(await readFile(resolve(dirname(task.workspaceDir),'validation.json')));
const config={version:1,campaign,schedule,arms:WORKFLOW_ARMS,effort:'low',inputs,baselines,validationHashes,capUsd:12,minFreeBytes:1024**3,maxArtifactBytes:350*1024**2,tasks:workflowTasks.map(t=>({id:t.id,base:t.base,fix:t.fix,prompt:t.prompt}))};
if(args['--resume']){const prior=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));for(const key of Object.keys(config))if(JSON.stringify(config[key])!==JSON.stringify(prior[key]))throw new Error('Frozen input changed: '+key);}
else{await writeFile(resolve(directory,'manifest.json'),JSON.stringify({...config,startedAt:new Date().toISOString()},null,2),{flag:'wx'});for(const p of paths){const dest=resolve(directory,'frozen-source',p);await mkdir(dirname(dest),{recursive:true});await cp(resolve(root,p),dest);}await mkdir(resolve(directory,'frozen-validation'));for(const task of workflowTasks)await cp(resolve(dirname(task.workspaceDir),'validation.json'),resolve(directory,'frozen-validation',task.id+'.json'));}
async function bytesIn(dir){let bytes=0;for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);bytes+=e.isDirectory()?await bytesIn(p):(await stat(p)).size;}return bytes;}
const runtime=await createRuntime();if(!runtime.isUsingSubscription('openai'))throw new Error('Subscription unavailable; no paid fallback');let knownCost=0,completed=0,consecutiveFailures=0;
for(const [index,item]of schedule.entries()){
  const runId=`${String(index+1).padStart(3,'0')}-${item.task}-${item.arm}-r${item.repetition}`,runDir=resolve(directory,runId);
  if(args['--resume']){try{const prior=JSON.parse(await readFile(resolve(runDir,'result.json'),'utf8'));knownCost+=prior.knownEstimatedUsd;completed++;continue;}catch(e){if(e.code!=='ENOENT')throw e;}}
  const disk=await statfs(root);if(disk.bavail*disk.bsize<config.minFreeBytes||knownCost>=config.capUsd||await bytesIn(directory)>=config.maxArtifactBytes){console.log(JSON.stringify({event:'campaign_stopped',reason:'resource_budget',completed}));break;}
  for(const [p,h]of Object.entries(inputs))if(hash(await readFile(resolve(root,p)))!==h)throw new Error('Frozen runtime changed');
  const task=workflowTasks.find(t=>t.id===item.task),arm=WORKFLOW_ARMS.find(a=>a.id===item.arm),validation=JSON.parse(await readFile(resolve(dirname(task.workspaceDir),'validation.json'),'utf8'));
  if(hash(await readFile(resolve(dirname(task.workspaceDir),'validation.json')))!==validationHashes[task.id])throw new Error('Validation receipt changed');
  for(const [p,h]of Object.entries(baselines[item.task]))if(hash(await readFile(resolve(task.workspaceDir,p)))!==h)throw new Error('Baseline changed');
  await mkdir(runDir);const workspace=resolve(runDir,'workspace');await cp(task.workspaceDir,workspace,{recursive:true});console.log(JSON.stringify({event:'run_start',runId,index:index+1,total:schedule.length}));
  const execution=await runWorkflow({runtime,workspace,baseline:task.workspaceDir,sourceFiles:validation.sourceFiles,runDir:resolve(runDir,'execution'),task,arm});await writeFile(resolve(runDir,'execution.json'),JSON.stringify(execution,null,2));
  const acceptance=await runNodeTests(workspace,task.acceptancePath),regression=await runNodeTests(workspace,resolve(workspace,'tests/visible.test.mjs')),upstream=await runUpstream(workspace);
  const upstreamPassed=upstream.status==='passed'&&upstream.tests===validation.upstream.tests;
  const allow=new Set(validation.sourceFiles),originals=baselines[item.task],actual=await filesIn(workspace);let immutableIntact=actual.length===Object.keys(originals).length;
  for(const [p,h]of Object.entries(originals)){if(allow.has(p))continue;try{if(hash(await readFile(resolve(workspace,p)))!==h)immutableIntact=false;}catch{immutableIntact=false;}}
  const patch=[];for(const p of validation.sourceFiles){const before=await readFile(resolve(task.workspaceDir,p),'utf8'),after=await readFile(resolve(workspace,p),'utf8');if(before!==after)patch.push({path:p,before,after});}
  const actualModels=[...new Set(execution.phases.flatMap(p=>p.actualModels))],modelValid=execution.phases.every(p=>p.actualModels.length>0&&p.actualModels.every(m=>m===p.model));
  const usage={input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,estimatedApiUsd:0};for(const phase of execution.phases)for(const k of Object.keys(usage))usage[k]+=phase.usage[k];
  const unknown=execution.phases.some(p=>p.usageCostUnknown)||execution.status==='harness_error';
  const result={runId,...item,status:execution.status,success:execution.status==='completed'&&acceptance.status==='passed'&&regression.status==='passed'&&upstreamPassed&&immutableIntact&&modelValid,patchAccepted:acceptance.status==='passed'&&regression.status==='passed'&&upstreamPassed&&immutableIntact,immutableIntact,modelValid,actualModels,usage,
    knownEstimatedUsd:usage.estimatedApiUsd,totalEstimatedUsd:unknown?null:usage.estimatedApiUsd,latencyMs:execution.latencyMs,turns:execution.phases.reduce((n,p)=>n+p.turns,0),phases:execution.phases.map(({final,...p})=>p),changed:patch.map(p=>p.path),packetCharacters:execution.packetCharacters,navigationCalls:execution.navigationCalls,
    afterWorker:execution.finalChecks&&arm.workflow?JSON.parse(await readFile(resolve(runDir,'execution/after-worker.json'),'utf8').catch(()=>'{"visible":{},"declared":{},"patch":{"changed":[]}}')):null,
    finalDeclared:execution.finalChecks?.declared?.status??null,acceptance:acceptance.status,regression:regression.status,upstream:upstream.status,upstreamTests:upstream.tests,errors:[...execution.errors,...execution.phases.flatMap(p=>p.errors)],endedAt:new Date().toISOString()};
  await writeFile(resolve(runDir,'tests.json'),JSON.stringify({acceptance,regression,upstream},null,2));await writeFile(resolve(runDir,'patch.json'),JSON.stringify(patch,null,2));await writeFile(resolve(runDir,'result.json'),JSON.stringify(result,null,2));knownCost+=result.knownEstimatedUsd;completed++;
  console.log(JSON.stringify({event:'run_end',runId,status:result.status,success:result.success,cost:result.totalEstimatedUsd,turns:result.turns,changed:result.changed}));
  if(providerFailureKind(result.errors)==='authorization_or_limit'){console.log(JSON.stringify({event:'campaign_stopped',reason:'authorization_or_limit'}));break;}
  consecutiveFailures=['harness_error','provider_error'].includes(result.status)?consecutiveFailures+1:0;if(consecutiveFailures>=2){console.log(JSON.stringify({event:'campaign_stopped',reason:'consecutive_failures'}));break;}
}
console.log(JSON.stringify({event:completed===schedule.length?'campaign_complete':'campaign_partial',completed,total:schedule.length,knownCost,directory}));
