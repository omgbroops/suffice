import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {mkdir,readFile,writeFile,statfs,cp,open,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {homedir,freemem,totalmem} from 'node:os';
import {execFileSync} from 'node:child_process';
import {svelteTask} from '../src/svelte-intelligence-pilot.mjs';
const pilotRoot=resolve(process.cwd(),'.suffice/intelligence-svelte-outro-pilot');
const taskRecord=JSON.parse(await readFile(resolve(process.cwd(),'benchmarks/intelligence-svelte-outro-pilot/svelte-1428.json'),'utf8'));
const {task:pilotTask,receipt:validation,dependencies}=await svelteTask({directory:pilotRoot,taskRecord,promptNotes:'That command omits the Nightmare/Electron suite. Existing unscored legacy failures and skips are preserved in validation receipts.'});
import {CONFIG,ARMS,runTrial,snapshot,allFiles} from '../src/intelligence-eval.mjs';
import {hash} from '../src/workspace.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.split('=')));
const arm=ARMS.find(a=>a.id===(args['--arm']??'A'));if(!arm)throw new Error('Arm must be A, B or C');
const config={...CONFIG,timeout:1200,maxCost:0.75,maxTurns:90,maxToolCalls:400,requestReserveUsd:0.25,maxProviderPayloadBytes:1024**2};
const campaign='luna-xhigh-svelte-outro-pilot',runId=`${pilotTask.id}-${arm.id}-r0`,root=process.cwd();
const published=resolve(root,'reports/repository-intelligence-eval-v2/svelte-outro-pilot'),runDir=resolve(pilotRoot,'runs',runId);await mkdir(published,{recursive:true});
const lockPath=resolve(root,'.suffice/native-evaluation.lock'),lock=await open(lockPath,'wx');
try{
await lock.writeFile(JSON.stringify({pid:process.pid,runId,startedAt:new Date().toISOString()}));
try{await readFile(resolve(published,runId+'.json'));throw new Error('Run already exists; do not repeat scored inputs silently');}catch(e){if(e.code!=='ENOENT')throw e;}
if(!validation.valid)throw new Error('Svelte empty/reference gates required');
const resource=async()=>{const disk=await statfs(root);return {at:new Date().toISOString(),freeRAM:freemem(),totalRAM:totalmem(),freeDisk:disk.bavail*disk.bsize,harnessRSS:process.memoryUsage().rss,cpuTemperatureC:null,temperatureSource:'unavailable automatically; concurrency fixed at one'};};
const initial=await resource();if(initial.freeRAM<1.75*1024**3||initial.freeDisk<6*1024**3)throw new Error('Resource floor: need 1.75 GiB available RAM and 6 GiB disk before dispatch');
const sourcePaths=['package.json','package-lock.json','scripts/intelligence-svelte-outro-pilot.mjs','scripts/prepare-intelligence-svelte-outro-pilot.mjs','src/svelte-intelligence-pilot.mjs','benchmarks/intelligence-svelte-outro-pilot/native-tests.cjs','benchmarks/intelligence-svelte-pilot/reporter.cjs','benchmarks/intelligence-svelte-pilot/verify.cjs','benchmarks/intelligence-svelte-outro-pilot/dependency-package.json','benchmarks/intelligence-svelte-outro-pilot/dependency-lock.json','src/intelligence-eval.mjs','src/native-intelligence-eval.mjs','benchmarks/intelligence-svelte-outro-pilot/svelte-1428.json',...(await allFiles(resolve(root,'packages/cli/src'))).map(p=>'packages/cli/src/'+p)];
const inputs={};for(const p of sourcePaths)inputs[p]=hash(await readFile(resolve(root,p)));
const task=pilotTask;
if(JSON.stringify(await snapshot(task.baseline))!==JSON.stringify(validation.baselineHashes))throw new Error('Baseline drift');
if(hash(await readFile(resolve(dependencies,'package-lock.json')))!==validation.dependencyLockSha256)throw new Error('Dependency lock drift');
const runtime=await ModelRuntime.create({authPath:resolve(homedir(),'.suffice/auth.json'),modelsPath:null,modelsStorePath:resolve(homedir(),'.suffice/catalog.json'),allowModelNetwork:false});if(!runtime.isUsingSubscription('openai'))throw new Error('Subscription required; no model or paid API fallback');
const catalogModel=runtime.getModel('openai',config.model);
const manifest={version:1,catalog:{id:catalogModel.id,api:catalogModel.api,contextWindow:catalogModel.contextWindow,maxTokens:catalogModel.maxTokens,cost:catalogModel.cost},campaign,phase:'pilot-only',runId,arm,config,dispatchConcurrency:1,resourcePolicy:{minFreeRAMGiB:1.75,minFreeDiskGiB:6,temperatureCeilingRequested:85,temperatureEnforcement:'No automatic telemetry; strictly one concurrent attempt per user instruction',calibration:'Serial native worker headroom, 384 MiB heap cap for project build/test processes; no Docker or Electron.'},inputs,validationHash:hash(JSON.stringify(validation)),sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}),task:{id:task.id,repository:task.repository,revision:task.revision,prompt:task.prompt,baselineHashes:task.baselineHashes},initialResources:initial,limitations:validation.limitations};
await writeFile(resolve(published,runId+'.manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
for(const p of sourcePaths){const target=resolve(runDir,'frozen-source',p);await mkdir(dirname(target),{recursive:true});await cp(resolve(root,p),target);}
const ledgerPath=resolve(root,'reports/repository-intelligence-eval-v2/spending.json'),ledger=JSON.parse(await readFile(ledgerPath,'utf8')),ledgerKey=campaign+'/pilot/'+runId;
if(ledger.entries.some(e=>e.state==='dispatched'))throw new Error('Another inference attempt is dispatched; serialize all campaigns');
if(ledger.entries.some(e=>e.runId===ledgerKey))throw new Error('Existing/orphaned reservation requires audit');
if(ledger.entries.reduce((n,e)=>n+e.reserved,0)+config.maxCost>ledger.cap)throw new Error('Experiment-wide spending cap');
const entry={runId:ledgerKey,reserved:config.maxCost,known:0,unknown:true,state:'dispatched'};ledger.entries.push(entry);await writeFile(ledgerPath,JSON.stringify(ledger,null,2));
const resources=[initial];let sampling=Promise.resolve();const timer=setInterval(()=>{sampling=sampling.then(async()=>resources.push(await resource()));},10000);timer.unref();
console.log(JSON.stringify({event:'pilot_start',runId,config,resources:initial}));
let result;
try{result=await runTrial({runtime,task,item:{task:task.id,arm:arm.id,mode:arm.mode,repetition:0},runDir,published,config});}
catch(e){result={runId,status:'infrastructure_error',error:e.stack,success:false,totalEstimatedUsd:null,usage:{estimatedApiUsd:0,costUnknown:true}};await writeFile(resolve(published,runId+'.json'),JSON.stringify(result,null,2));}
finally{clearInterval(timer);await sampling;resources.push(await resource());await writeFile(resolve(published,runId+'.resources.json'),JSON.stringify(resources,null,2));}
entry.known=result.usage.estimatedApiUsd;entry.unknown=result.totalEstimatedUsd===null;entry.reserved=entry.unknown?config.maxCost:result.totalEstimatedUsd;entry.state='finished';await writeFile(ledgerPath,JSON.stringify(ledger,null,2));
console.log(JSON.stringify({event:'pilot_end',runId,status:result.status,success:result.success,patchAccepted:result.patchAccepted,cost:result.totalEstimatedUsd,seconds:result.latencyMs/1000,acceptance:result.acceptance?.status,regression:result.regression?.status,error:result.error}));

}finally{await lock.close();await unlink(lockPath);}
