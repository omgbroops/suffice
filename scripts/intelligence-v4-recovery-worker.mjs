import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {mkdir,readFile,writeFile,cp,readdir,statfs,realpath,lstat,unlink,rm} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir,freemem,totalmem} from 'node:os';
import {runTrial,allFiles} from '../src/intelligence-eval.mjs';
import {dependencySnapshot} from '../src/native-intelligence-eval.mjs';
import {writeLedger,providerFailure,providerUnavailable} from '../src/real-intelligence-eval.mjs';
import {hash} from '../src/workspace.mjs';
import {LIMITS,COST_CEILINGS,requestCostReserve,v4CellId} from '../src/eval-v4/design.mjs';
import {CAMPAIGN,sourceInputs,catalogEntry,receiptAudit} from '../src/eval-v4/protocol.mjs';
import {createV4Task,repositorySnapshot} from '../src/eval-v4/environment.mjs';
import {publicWorkspaceRoot,lazySandboxOperations,binaryHash,sandboxExecutable} from '../src/eval-v4/sandbox.mjs';

const root=process.cwd(),out=resolve(root,'reports/repository-intelligence-v4'),load=async path=>JSON.parse(await readFile(path,'utf8'));
const protocol=await load(resolve(out,'protocol.json')),cell=process.argv.find(a=>a.startsWith('--cell='))?.slice(7),item=protocol.schedule.flat().find(i=>v4CellId(i)===cell);
if(!item)throw new Error('Unknown frozen cell');
const id=cell+'-a1',ledgerPath=resolve(out,'spending.json'),ledger=await load(ledgerPath),entry=ledger.entries.find(e=>e.runId===CAMPAIGN+'/'+id);
if(!entry||entry.state!=='reserved'||ledger.entries.some(e=>e.state==='dispatched'))throw new Error('Requires one reserved serial slot');
const lock=await load(resolve(root,'.suffice/native-evaluation.lock'));if(lock.pid!==process.ppid||lock.kind!=='v4-coordinator')throw new Error('Requires serial coordinator');
const runDir=resolve(publicWorkspaceRoot(),id),gradeDirectory=resolve(publicWorkspaceRoot(),'grade-'+id),results=resolve(out,'attempts');
await mkdir(results,{recursive:true});await mkdir(runDir,{recursive:true});await mkdir(gradeDirectory,{recursive:true});
try{await readFile(resolve(results,id+'.summary.json'));throw new Error('Cannot overwrite attempt');}catch(e){if(e.code!=='ENOENT')throw e;}
const resource=async()=>{const disk=await statfs(root);return {at:new Date().toISOString(),freeRAM:freemem(),totalRAM:totalmem(),freeDisk:disk.bavail*disk.bsize,rss:process.memoryUsage().rss,cpuTemperatureC:null,maxConcurrent:1};};
const resources=[await resource()];let result,dispatched=false,timer,sampling=Promise.resolve();
try{
  if(resources[0].freeRAM<1.75*1024**3||resources[0].freeDisk<6*1024**3)throw new Error('RESOURCE_FLOOR');
  if(process.version!==protocol.node||process.platform!==protocol.platform||JSON.stringify(await sourceInputs(root))!==JSON.stringify(protocol.inputs))throw new Error('Frozen implementation drift');
  if(await binaryHash(sandboxExecutable())!==protocol.sandboxSha256)throw new Error('Sandbox runtime drift');
  const descriptor=protocol.tasks.find(t=>t.id===item.task),directory=resolve(root,'.suffice/intelligence-v4/tasks',item.task),gate=await load(resolve(out,'task-gates',item.task+'.json'));
  if(hash(await readFile(resolve(directory,'validation.json')))!==gate.validationSha256)throw new Error('Task gate drift');
  const recordBytes=await readFile(resolve(root,'.suffice/intelligence-v4/records',item.task+'.json'));if(hash(recordBytes)!==descriptor.recordSha256)throw new Error('Sealed record drift');
  const {task,validation,dependencies}=await createV4Task({directory,descriptor,record:JSON.parse(recordBytes),toolchain:protocol.toolchain,gradeDirectory});
  if(JSON.stringify(await repositorySnapshot(task.baseline))!==JSON.stringify(validation.baselineHashes))throw new Error('Baseline drift');
  if(hash(await readFile(resolve(dependencies,'package-lock.json')))!==validation.dependencyReceipt.lockSha256||hash(JSON.stringify(await dependencySnapshot(resolve(dependencies,'node_modules'))))!==validation.dependencyReceipt.contentSha256)throw new Error('Dependency drift');
  const runtime=await ModelRuntime.create({authPath:resolve(homedir(),'.suffice/auth.json'),modelsPath:null,allowModelNetwork:false});
  if(!runtime.isUsingSubscription('openai'))throw new Error('Subscription profile required; no fallback');
  const catalog=catalogEntry(runtime.getModel('openai',item.model));if(JSON.stringify(catalog)!==JSON.stringify(protocol.catalogs.find(c=>c.id===item.model)))throw new Error('Catalog drift');
  const config={...LIMITS,model:item.model,effort:item.effort,maxCost:COST_CEILINGS[item.model],requestReserveUsd:(payload,bytes)=>requestCostReserve(catalog,payload,bytes),exposeSessionEnvironment:false,bashOperations:lazySandboxOperations({toolchain:protocol.toolchain,readableRoots:[protocol.toolchain,resolve(dependencies,'node_modules')]})};
  await writeFile(resolve(results,id+'.manifest.json'),JSON.stringify({version:1,item,limits:LIMITS,maxCost:config.maxCost,catalog,protocolSha256:hash(await readFile(resolve(out,'protocol.json'))),gate,task:{id:task.id,prompt:task.prompt,revision:task.revision,baselineHashes:validation.baselineHashes},resources:resources[0],nativeShell:'PowerShell 7',gradingBoundary:'Separate precreated sibling denied to actor commands'},null,2),{flag:'wx'});
  entry.state='dispatched';entry.dispatchedAt=new Date().toISOString();await writeLedger(ledgerPath,ledger);dispatched=true;
  timer=setInterval(()=>{sampling=sampling.then(async()=>resources.push(await resource()));},10000);timer.unref();
  result=await runTrial({runtime,task,item,runDir,published:results,config});
  const events=(await readFile(resolve(results,id+'.events.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  result.receiptAudit=receiptAudit(events,item);
  if(result.receiptAudit.missingUsage){result.usage.costUnknown=true;result.totalEstimatedUsd=null;}
  result.configurationVerified=result.modelValid&&!result.receiptAudit.configurationMismatches;
  result.sourceStable=JSON.stringify(await sourceInputs(root))===JSON.stringify(protocol.inputs);
  result.classification=!result.sourceStable||result.receiptAudit.configurationMismatches?'experimental_invalidation':providerUnavailable(result)?'provider_interruption':providerFailure(result)?'provider_failure':[result.acceptance.status,result.regression.status].includes('invalid_result')?'evaluator_failure':result.status;
  result.providerRequests=result.receiptAudit.requests;
  result.completionReason=events.filter(e=>e.type==='task_end').at(-1)?.reason??null;
  result.bindingGuards=events.filter(e=>e.type==='provider_request_blocked').map(e=>({reason:e.reason,bytes:e.bytes,limit:e.limit,reserveUsd:e.reserveUsd,meteredTokens:e.meteredTokens}));
  await cp(resolve(gradeDirectory,'grading'),resolve(results,id+'.grading'),{recursive:true});
}catch(error){
  let events=[];try{const files=await allFiles(resolve(runDir,'home/events')),file=files.find(p=>p.endsWith('.jsonl'));if(file){const path=resolve(runDir,'home/events',file);events=(await readFile(path,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);await cp(path,resolve(results,id+'.events.jsonl'));}}catch{}
  try{const files=await allFiles(resolve(runDir,'home/sessions')),file=files.filter(p=>p.endsWith('.jsonl')).at(-1);if(file)await cp(resolve(runDir,'home/sessions',file),resolve(results,id+'.session.jsonl'));}catch{}
  const totals=events.filter(e=>e.type==='task_end').at(-1)?.totals??{input:0,cacheRead:0,cacheWrite:0,output:0,modelCalls:0,estimatedApiUsd:0,costUnknown:dispatched};
  result={...item,runId:id,status:'infrastructure_error',classification:error.message.includes('RESOURCE_FLOOR')?'resource_stop':'infrastructure_or_evaluator_error',error:error.stack,success:false,patchAccepted:false,usage:totals,totalEstimatedUsd:totals.costUnknown?null:totals.estimatedApiUsd,providerRequests:events.filter(e=>e.type==='provider_request').length};
  if(!dispatched){result.usage.costUnknown=false;result.totalEstimatedUsd=0;}
}finally{clearInterval(timer);await sampling;resources.push(await resource());await writeFile(resolve(results,id+'.resources.json'),JSON.stringify(resources,null,2));}
result.engineeringAccepted=result.patchAccepted===true&&result.configurationVerified===true&&result.sourceStable===true;
result.normalTaskCompletion=result.status==='completed';result.cellId=cell;result.attempt=1;
await writeFile(resolve(results,id+'.json'),JSON.stringify(result,null,2));
const {patches,final,graphQueries,evidenceUptake,...summary}=result;await writeFile(resolve(results,id+'.summary.json'),JSON.stringify(summary,null,2));
entry.known=result.usage.estimatedApiUsd;entry.unknown=result.totalEstimatedUsd===null;entry.reserved=entry.unknown?Math.max(COST_CEILINGS[item.model],entry.known):result.totalEstimatedUsd;entry.state='finished';await writeLedger(ledgerPath,ledger);
// Preserve an exact Git binary patch before reclaiming only this attempt's clones.
try{
  const exec=promisify(execFile),workspace=resolve(runDir,'workspace');
  await exec('git',['-C',workspace,'add','--force','--all','--','.',':(exclude)node_modules',':(exclude)**/node_modules/**',':(exclude).v4-tmp'],{windowsHide:true,timeout:60000,maxBuffer:1024**2});
  const diff=await exec('git',['-C',workspace,'diff','--cached','--binary','HEAD'],{windowsHide:true,timeout:60000,maxBuffer:64*1024**2});
  await writeFile(resolve(results,id+'.patch'),diff.stdout);
  for(const target of [workspace,resolve(gradeDirectory,'independent-grade')]){
    const actual=await realpath(target),inside=relative(await realpath(publicWorkspaceRoot()),actual);
    if(isAbsolute(inside)||inside.startsWith('..')||!inside||actual.toLowerCase()!==target.toLowerCase())throw new Error('Refusing cleanup outside exact owned Public clone');
    const link=resolve(target,'node_modules');try{if((await lstat(link)).isSymbolicLink())await unlink(link);}catch(e){if(e.code!=='ENOENT')throw e;}
    await rm(target,{recursive:true,force:true});
  }
}catch(error){await writeFile(resolve(results,id+'.archive-error.json'),JSON.stringify({error:error.message,workspaceRetained:true},null,2));}
console.log(JSON.stringify({event:'v4_attempt_end',cell,classification:result.classification,accepted:result.engineeringAccepted,completed:result.normalTaskCompletion,cost:result.totalEstimatedUsd,error:result.error}));
