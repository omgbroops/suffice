import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {mkdir,readFile,writeFile,readdir,cp,statfs,realpath,lstat,unlink,rm} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {homedir,freemem,totalmem} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {classicTask} from '../src/classic-svelte-eval.mjs';
import {dependencySnapshot} from '../src/native-intelligence-eval.mjs';
import {runTrial,snapshot,allFiles} from '../src/intelligence-eval.mjs';
import {hash} from '../src/workspace.mjs';
import {REAL_CONFIG,CAMPAIGN,cellId,runId,realSourceInputs,providerUnavailable,providerFailure,writeLedger} from '../src/real-intelligence-eval.mjs';
const exec=promisify(execFile),root=process.cwd(),args=Object.fromEntries(process.argv.slice(2).map(s=>s.split('=')));
const published=resolve(root,'reports/repository-intelligence-eval-v2/real-v3'),base=resolve(root,'.suffice/intelligence-real-v3');
const protocol=JSON.parse(await readFile(resolve(published,'protocol.json'),'utf8')),item=protocol.schedule.flat().find(item=>cellId(item)===args['--cell']);
const attempt=Number(args['--attempt']??0);if(!item||![0,1].includes(attempt))throw new Error('Unknown frozen evaluation cell');
const id=runId(item,attempt),runDir=resolve(base,'runs',id),ledgerPath=resolve(root,'reports/repository-intelligence-eval-v2/spending.json'),ledgerKey=CAMPAIGN+'/'+id;
const ledger=JSON.parse(await readFile(ledgerPath,'utf8')),entry=ledger.entries.find(e=>e.runId===ledgerKey);
if(!entry||entry.state!=='reserved'||ledger.entries.some(e=>e.state==='dispatched'))throw new Error('Worker requires one reserved, undispatched slot');
const lock=JSON.parse(await readFile(resolve(root,'.suffice/native-evaluation.lock'),'utf8'));if(lock.pid!==process.ppid||lock.kind!=='real-v3-coordinator')throw new Error('Worker requires the exclusive serial coordinator');
await mkdir(runDir,{recursive:true});
try{await readFile(resolve(published,id+'.json'));throw new Error('Refusing to overwrite an existing attempt');}catch(error){if(error.code!=='ENOENT')throw error;}
const resource=async()=>{const disk=await statfs(root);return {at:new Date().toISOString(),freeRAM:freemem(),totalRAM:totalmem(),freeDisk:disk.bavail*disk.bsize,harnessRSS:process.memoryUsage().rss,cpuTemperatureC:null,temperatureSource:'unavailable; concurrency fixed at one'};};
const resources=[await resource()];let timer,sampling=Promise.resolve(),result,dispatched=false;
try{
  if(process.version!==protocol.node||process.platform!==protocol.platform||process.arch!==protocol.arch)throw new Error('Node runtime environment drift');
  if(resources[0].freeRAM<1.75*1024**3||resources[0].freeDisk<6*1024**3)throw new Error('RESOURCE_FLOOR');
  if(JSON.stringify(await realSourceInputs(root))!==JSON.stringify(protocol.inputs))throw new Error('Frozen implementation drift');
  const descriptor=protocol.tasks.find(task=>task.id===item.task),directory=resolve(base,'tasks',item.task);
  const record=JSON.parse(await readFile(resolve(root,'benchmarks/intelligence-real-v3',descriptor.record),'utf8'));
  if(hash(await readFile(resolve(directory,'validation.json')))!==descriptor.validationSha256)throw new Error('Validation receipt drift');
  const {task,receipt,dependencies}=await classicTask(directory,record);
  if(JSON.stringify(await snapshot(task.baseline))!==JSON.stringify(receipt.baselineHashes))throw new Error('Starting files drift');
  if(hash(await readFile(resolve(dependencies,'package-lock.json')))!==receipt.dependencyLockSha256)throw new Error('Pinned dependency lock drift');
  if(JSON.stringify(await dependencySnapshot(resolve(dependencies,'node_modules')))!==JSON.stringify(JSON.parse(await readFile(resolve(directory,'dependency-hashes.json'),'utf8'))))throw new Error('Pinned dependency content drift before inference');
  const runtime=await ModelRuntime.create({authPath:resolve(homedir(),'.suffice/auth.json'),modelsPath:null,modelsStorePath:resolve(homedir(),'.suffice/catalog.json'),allowModelNetwork:false,refreshOnCreate:false});
  if(!runtime.isUsingSubscription('openai'))throw new Error('Subscription required; no paid-key or model fallback');
  const model=runtime.getModel('openai',REAL_CONFIG.model),catalog={id:model.id,api:model.api,contextWindow:model.contextWindow,maxTokens:model.maxTokens,cost:model.cost};
  if(JSON.stringify(catalog)!==JSON.stringify(protocol.catalog))throw new Error('Model catalog drift');
  await writeFile(resolve(published,id+'.manifest.json'),JSON.stringify({version:1,campaign:CAMPAIGN,item,attempt,config:REAL_CONFIG,catalog,protocolSha256:hash(await readFile(resolve(published,'protocol.json'))),commonSourceArchiveSha256:protocol.sourceArchiveSha256,validationSha256:descriptor.validationSha256,task:{id:item.task,prompt:task.prompt,revision:task.revision,baselineHashes:receipt.baselineHashes},initialResources:resources[0],dispatchConcurrency:1},null,2),{flag:'wx'});
  entry.state='dispatched';entry.dispatchedAt=new Date().toISOString();await writeLedger(ledgerPath,ledger);dispatched=true;
  timer=setInterval(()=>{sampling=sampling.then(async()=>resources.push(await resource()));},10000);timer.unref();
  result=await runTrial({runtime,task,item,runDir,published,config:REAL_CONFIG});
  const events=(await readFile(resolve(published,id+'.events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse),requests=events.filter(event=>event.type==='provider_request');
  const receipts=events.filter(event=>event.type==='provider_usage'&&['response.completed','response.incomplete','response.failed','response.cancelled'].includes(event.eventType)),receiptIds=new Set(receipts.map(event=>event.responseId));
  result.receiptAudit={requests:requests.length,finalUsageResponses:receiptIds.size,missingUsage:requests.length!==receiptIds.size,configurationMismatches:receipts.filter(event=>event.model!==REAL_CONFIG.model||event.reasoning?.effort!==REAL_CONFIG.effort||event.serviceTier!==REAL_CONFIG.serviceTier).length};
  if(result.receiptAudit.missingUsage){result.usage.costUnknown=true;result.totalEstimatedUsd=null;}
  result.sourceStable=JSON.stringify(await realSourceInputs(root))===JSON.stringify(protocol.inputs);
  if(!result.sourceStable){result.originalSuccess=result.success;result.success=false;result.status='source_drift';}
  if(result.receiptAudit.configurationMismatches){result.originalSuccess=result.success;result.success=false;result.sourceStable=false;result.status='source_drift';}
  result.runtimeTargets={required:record.evaluation.runtimeTargets.length,passed:['passed','failed'].includes(result.acceptance.status)?record.evaluation.runtimeTargets.filter(title=>!result.acceptance.unpassed.includes(title)&&!result.acceptance.missing.includes(title)).length:null};
  result.classification=providerUnavailable(result)?'provider_interruption':providerFailure(result)?'provider_failure':result.status==='source_drift'?'experimental_invalidation':result.status==='completed'?'completed':result.status==='budget_or_incomplete'?'budget_or_incomplete':'agent_error';
}catch(error){
  // Preserve usage and raw receipts even if independent grading itself throws.
  let events=[];
  try{
    const eventDirectory=resolve(runDir,'home/events'),files=await readdir(eventDirectory),source=resolve(eventDirectory,files.find(file=>file.endsWith('.jsonl')));
    events=(await readFile(source,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);await cp(source,resolve(published,id+'.events.jsonl'));
  }catch{}
  try{const sessionRoot=resolve(runDir,'home/sessions'),file=(await allFiles(sessionRoot)).filter(file=>file.endsWith('.jsonl')).at(-1);if(file)await cp(resolve(sessionRoot,file),resolve(published,id+'.session.jsonl'));}catch{}
  const totals=events.filter(e=>e.type==='task_end').at(-1)?.totals,requests=events.filter(e=>e.type==='provider_request').length;
  const known=totals??{input:0,cacheRead:0,cacheWrite:0,output:0,modelCalls:0,estimatedApiUsd:0,costUnknown:dispatched};
  if(!requests&&events.some(e=>e.type==='provider_request_blocked'))known.costUnknown=false;
  result={...item,runId:id,status:'infrastructure_error',classification:/RESOURCE_FLOOR/.test(error.message)?'resource_stop':'infrastructure_or_evaluator_error',error:error.stack,success:false,patchAccepted:false,usage:known,totalEstimatedUsd:known.costUnknown?null:known.estimatedApiUsd,providerRequests:requests,attempt};
  if(!dispatched){result.usage.costUnknown=false;result.totalEstimatedUsd=0;}
}finally{
  clearInterval(timer);await sampling;resources.push(await resource());await writeFile(resolve(published,id+'.resources.json'),JSON.stringify(resources,null,2));
}
result.attempt=attempt;result.cellId=cellId(item);
result.engineeringAccepted=result.patchAccepted===true&&result.modelValid===true&&result.sourceStable===true;
result.normalTaskCompletion=result.status==='completed';
await writeFile(resolve(published,id+'.json'),JSON.stringify(result,null,2));
await writeFile(resolve(published,id+'.summary.json'),JSON.stringify({task:result.task,arm:result.arm,repetition:result.repetition,attempt,cellId:result.cellId,status:result.status,classification:result.classification,error:result.error,success:result.success,engineeringAccepted:result.engineeringAccepted,patchAccepted:result.patchAccepted,modelValid:result.modelValid,sourceStable:result.sourceStable,receiptAudit:result.receiptAudit,usage:result.usage,totalEstimatedUsd:result.totalEstimatedUsd},null,2));
entry.known=result.usage.estimatedApiUsd;entry.unknown=result.totalEstimatedUsd===null;entry.reserved=entry.unknown?Math.max(REAL_CONFIG.maxCost,entry.known):result.totalEstimatedUsd;entry.state='finished';await writeLedger(ledgerPath,ledger);
// Archive exact production bytes before reclaiming generated workspace copies.
let archived=false;
try{await exec('tar',['-czf',resolve(published,id+'.production.tar.gz'),'-C',resolve(runDir,'workspace'),'src'],{windowsHide:true,timeout:60000,maxBuffer:1024**2});archived=true;}catch(error){await writeFile(resolve(published,id+'.archive-error.json'),JSON.stringify({error:error.message,workspaceRetained:true},null,2));}
for(const name of archived?['workspace','independent-grade']:[]){
  const intendedRoot=await realpath(runDir),target=resolve(runDir,name);let actual;try{actual=await realpath(target);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  const inside=relative(intendedRoot,actual);if(isAbsolute(inside)||inside==='..'||inside.startsWith('..\\')||inside.startsWith('../')||resolve(actual).toLowerCase()!==target.toLowerCase())throw new Error('Refusing cleanup outside the owned run directory');
  const dependencyLink=resolve(target,'node_modules');try{if((await lstat(dependencyLink)).isSymbolicLink())await unlink(dependencyLink);}catch(error){if(error.code!=='ENOENT')throw error;}
  await rm(target,{recursive:true,force:true});
}
console.log(JSON.stringify({event:'real_trial_end',runId:id,classification:result.classification,status:result.status,success:result.success,targets:result.acceptance?.requiredPassed,totalTargets:result.acceptance?.required,estimatedApiUsd:result.totalEstimatedUsd}));
