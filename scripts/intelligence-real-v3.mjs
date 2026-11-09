import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {mkdir,readFile,writeFile,cp,open,unlink,statfs} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {homedir,freemem} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hash} from '../src/workspace.mjs';
import {CAMPAIGN,REAL_CONFIG,realSchedule,cellId,runId,realSourceInputs,reserveWave,providerUnavailable,writeLedger} from '../src/real-intelligence-eval.mjs';
const exec=promisify(execFile),root=process.cwd(),base=resolve(root,'.suffice/intelligence-real-v3'),published=resolve(root,'reports/repository-intelligence-eval-v2/real-v3'),ledgerPath=resolve(root,'reports/repository-intelligence-eval-v2/spending.json');
const load=async path=>JSON.parse(await readFile(path,'utf8')),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cohort=await load(resolve(root,'benchmarks/intelligence-real-v3/cohort.json'));
await mkdir(published,{recursive:true});const tasks=[];
const adapterFingerprint=hash(JSON.stringify(await Promise.all(['native-tests.cjs','native-loader-base.cjs','native-compat.cjs'].map(async path=>hash(await readFile(resolve(root,'benchmarks/intelligence-real-v3',path)))))));
for(const task of cohort.tasks){const path=resolve(base,'tasks',task.id,'validation.json');let validation;try{validation=await load(path);}catch(error){if(error.code!=='ENOENT')throw error;}const current=validation?.nativeAdapterVersion===4&&validation.nativeAdapterSha256===adapterFingerprint;tasks.push({...task,valid:current&&validation.valid,validationSha256:current?hash(await readFile(path)):null,preparationClassification:current?validation.classification:'not_prepared_current_adapter'});}
if(process.argv.includes('--dry-run')){console.log(JSON.stringify({event:'real_dry_run',tasks:tasks.length,validated:tasks.filter(task=>task.valid).length,readyLeadingWaves:realSchedule(tasks).findIndex(wave=>wave.some(item=>!tasks.find(task=>task.id===item.task)?.valid))===-1?16:realSchedule(tasks).findIndex(wave=>wave.some(item=>!tasks.find(task=>task.id===item.task)?.valid)),cells:realSchedule(tasks).flat().length,config:REAL_CONFIG,modelRequests:0}));process.exit(0);}
// Each balanced wave requires its own immutable gates; later waves may be prepared later.
const lockPath=resolve(root,'.suffice/native-evaluation.lock'),lock=await open(lockPath,'wx');
await lock.writeFile(JSON.stringify({pid:process.pid,kind:'real-v3-coordinator',startedAt:new Date().toISOString()}));
let status='starting',providerStop=false,needsPreparation=[];
const state=async detail=>{await writeFile(resolve(published,'execution-status.json'),JSON.stringify({status,at:new Date().toISOString(),...detail},null,2));};
const releasePending=async()=>{const ledger=await load(ledgerPath);for(const entry of ledger.entries)if(entry.runId.startsWith(CAMPAIGN+'/')&&entry.state==='reserved'){entry.state='not_started';entry.reserved=0;entry.known=0;entry.unknown=false;}await writeLedger(ledgerPath,ledger);};
try{
  try{if(['provider_unavailable','provider_failure'].includes((await load(resolve(published,'execution-status.json'))).status)&&!process.argv.includes('--resume-provider'))throw new Error('Provider availability stopped this campaign; audit before explicit --resume-provider');}catch(error){if(error.code!=='ENOENT')throw error;}
  if((await load(ledgerPath)).entries.some(e=>e.state==='dispatched'))throw new Error('Dispatched/orphaned inference requires audit');
  await mkdir(resolve(published,'task-gates'),{recursive:true});
  for(const task of tasks.filter(task=>task.valid)){
    const gate={task:task.id,nativeAdapterVersion:4,nativeAdapterSha256:adapterFingerprint,validationSha256:task.validationSha256},path=resolve(published,'task-gates',task.id+'.json');
    try{if(JSON.stringify(await load(path))!==JSON.stringify(gate))throw new Error('Frozen task gate drift: '+task.id);}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(path,JSON.stringify(gate,null,2),{flag:'wx'});}
  }
  const inputs=await realSourceInputs(root);let protocol;
  try{protocol=await load(resolve(published,'protocol.json'));if(JSON.stringify(inputs)!==JSON.stringify(protocol.inputs)||JSON.stringify(cohort.tasks)!==JSON.stringify(protocol.tasks)||JSON.stringify(REAL_CONFIG)!==JSON.stringify(protocol.config))throw new Error('Frozen protocol drift; do not pool changed sources');}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    const runtime=await ModelRuntime.create({authPath:resolve(homedir(),'.suffice/auth.json'),modelsPath:null,modelsStorePath:resolve(homedir(),'.suffice/catalog.json'),allowModelNetwork:false,refreshOnCreate:false});
    if(!runtime.isUsingSubscription('openai'))throw new Error('Subscription required; no paid API fallback');
    const model=runtime.getModel('openai',REAL_CONFIG.model),catalog={id:model.id,api:model.api,contextWindow:model.contextWindow,maxTokens:model.maxTokens,cost:model.cost};
    const source=resolve(base,'frozen',hash(JSON.stringify(inputs)));for(const [path,expected]of Object.entries(inputs)){const destination=resolve(source,path);await mkdir(dirname(destination),{recursive:true});await cp(resolve(root,path),destination);if(hash(await readFile(destination))!==expected)throw new Error('Source changed during freeze');}
    const archive=resolve(published,'frozen-source.tar.gz');await exec('tar',['-czf',archive,'-C',source,'.'],{windowsHide:true,timeout:60000});
    protocol={version:2,taskGatePolicy:'Immutable per-task validation manifest saved before its first inference; later balanced waves may be prepared after earlier waves run.',campaign:CAMPAIGN,phase:'main-prospective-real-cohort',createdAt:new Date().toISOString(),model:REAL_CONFIG.model,effort:REAL_CONFIG.effort,config:REAL_CONFIG,catalog,inputs,tasks:cohort.tasks,schedule:realSchedule(cohort.tasks),sourceArchiveSha256:hash(await readFile(archive)),node:process.version,platform:process.platform,arch:process.arch,resourcePolicy:{maxConcurrent:1,temperatureC:null,temperaturePolicy:'No reliable automatic telemetry: concurrency always one',minWorkerFreeRAMGiB:1.75,parentStartupFreeRAMGiB:2,minFreeDiskGiB:6,projectHeapMiB:384},replacementPolicy:{maxInfrastructureReplacements:1,providerCooldownSeconds:900,eligible:'Explicit provider unavailability or a no-model resource preflight. Never coding failure, test failure, or a spent model budget.',preserveOriginals:true},limits:['One repository family and correlated issues; no population-wide model ranking.','All target/regression labels retained, including non-runtime snapshots.','Native adaptation and known unscored failures remain explicit in task receipts.','Whole category-balanced waves are reserved before dispatch; a cap may stop a balanced subset.','All costs are API-equivalent estimates; unknown usage remains reserved.']};
    await writeFile(resolve(published,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});
  }
  const resourceReady=async()=>{
    for(let waited=0;waited<=900;waited+=20){const disk=await statfs(root);if(disk.bavail*disk.bsize<6*1024**3)return false;if(freemem()>=2*1024**3)return true;status='waiting_for_resources';await state({freeRAM:freemem(),waitedSeconds:waited});await sleep(20000);}return false;
  };
  const readAttempt=async(item,attempt)=>{try{return await load(resolve(published,runId(item,attempt)+'.summary.json'));}catch(error){if(error.code!=='ENOENT')throw error;}try{return await load(resolve(published,runId(item,attempt)+'.json'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  status='running';await state({scheduledCells:144});
  outer:for(const wave of protocol.schedule){
    needsPreparation=[...new Set(wave.map(item=>item.task))].filter(id=>!tasks.find(task=>task.id===id)?.valid);
    if(needsPreparation.length){status='additional_preparation_required';break;}
    // A provider failure releases unstarted reservations before its cooldown.
    while(true){
      const pending=[];
      for(const item of wave){
        const descriptor=tasks.find(task=>task.id===item.task);if(!descriptor.valid)continue;
        const first=await readAttempt(item,0),replacement=await readAttempt(item,1);
        if(!first)pending.push({...item,attempt:0});
        else if(!replacement&&(providerUnavailable(first)||first.classification==='resource_stop'))pending.push({...item,attempt:1});
      }
      if(!pending.length)break;
      if(!await resourceReady()){status='resource_limited';break outer;}
      const ledger=await load(ledgerPath),fresh=pending.filter(item=>item.attempt===0),replacements=pending.filter(item=>item.attempt===1);
      if(!reserveWave(ledger,fresh)){status='spending_cap';break outer;}
      for(const item of replacements){const key=CAMPAIGN+'/'+runId(item,1),old=ledger.entries.find(e=>e.runId===key);if(old&&!(old.state==='not_started'&&old.reserved===0&&!old.unknown))throw new Error('Orphaned replacement reservation');if(old)ledger.entries.splice(ledger.entries.indexOf(old),1);ledger.entries.push({runId:key,reserved:REAL_CONFIG.maxCost,known:0,unknown:true,state:'reserved'});}
      if(ledger.entries.reduce((sum,e)=>sum+e.reserved,0)>ledger.cap){status='spending_cap';break outer;}
      await writeLedger(ledgerPath,ledger);let cooldown=false;
      for(const item of pending){
        if(!await resourceReady()){status='resource_limited';break outer;}
        status='running';await state({cell:cellId(item),attempt:item.attempt});
        const workerStarted=performance.now(),startedAt=new Date().toISOString();
        try{const output=await exec(process.execPath,['--max-old-space-size=768','scripts/intelligence-real-v3-worker.mjs','--cell='+cellId(item),'--attempt='+item.attempt],{cwd:root,windowsHide:true,timeout:1800000,maxBuffer:1024**2});if(output.stdout.trim())console.log(output.stdout.trim());}
        catch(error){console.error(JSON.stringify({event:'worker_exit',cell:cellId(item),attempt:item.attempt,error:error.message}));const saved=await readAttempt(item,item.attempt),savedEntry=(await load(ledgerPath)).entries.find(entry=>entry.runId===CAMPAIGN+'/'+runId(item,item.attempt));if(!saved||savedEntry?.state!=='finished'){status='worker_failure';break outer;}}
        const result=await readAttempt(item,item.attempt);
        await writeFile(resolve(published,runId(item,item.attempt)+'.execution.json'),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),workerWallMs:performance.now()-workerStarted},null,2));
        if(!result)throw new Error('Worker did not persist a result');
        if(['experimental_invalidation','infrastructure_or_evaluator_error','model_start_failure'].includes(result.classification)){status='evaluator_or_source_failure';break outer;}
        if(result.classification==='provider_failure'){status='provider_failure';providerStop=true;break outer;}
        if(providerUnavailable(result)||result.classification==='resource_stop'){
          await releasePending();
          if(item.attempt===1){status=providerUnavailable(result)?'provider_unavailable':'resource_limited';providerStop=true;break outer;}
          status=providerUnavailable(result)?'provider_cooldown':'waiting_for_resources';await state({cell:cellId(item),cooldownSeconds:providerUnavailable(result)?900:0});
          if(providerUnavailable(result))for(let i=0;i<45;i++)await sleep(20000);
          cooldown=true;break;
        }
      }
      if(!cooldown)break;
    }
  }
  if(status==='running')status='finished';await state({providerStop,scheduledCells:144,needsPreparation});
}finally{await releasePending();await lock.close();await unlink(lockPath);}
console.log(JSON.stringify({event:'real_campaign_stopped',status,providerStop}));
