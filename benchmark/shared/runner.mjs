import {readFile,writeFile,mkdir,readdir,stat,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {executeIsolated} from './execution.mjs';
const ROOT=resolve(import.meta.dirname,'../..'),STATE=resolve(ROOT,'.suffice/shared-core-v1');
const DATA='/home/eric_qin/suffice-field-v1/experiments/luna-sol-field-v1/evaluator-data.py';
const DEP='/home/eric_qin/suffice-general-runtime/app/node_modules';
const limits={maxCostUsd:.25,timeoutMs:300000,maxTurns:40,maxCalls:160};
const arms={B:{},O:{outputControl:true},V:{repairs:true},OV:{outputControl:true,repairs:true},P:{preparedContext:true},N:{notices:true}};
const strata={sol:{model:'gpt-6.1-sol',effort:'medium'},luna:{model:'gpt-6-luna',effort:'high'}};
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=p=>readFile(p,'utf8').then(JSON.parse);
const exists=p=>stat(p).then(()=>true,()=>false);
const save=async(p,v)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(v,null,2)+'\n');};
async function walk(folder){const a=[];for(const e of await readdir(folder,{withFileTypes:true})){const p=resolve(folder,e.name);if(e.isDirectory())a.push(...await walk(p));else if(e.isFile())a.push(p);}return a;}
const taskFile=id=>resolve(STATE,'tasks',id,'task.json');
function data(mode,t,out,extra){const r=spawnSync('python3',['-I',DATA,mode,taskFile(t.id),out,...extra?[extra]:[]],{encoding:'utf8',timeout:120000,maxBuffer:64*1024**2});if(r.status!==0)throw Error(r.stderr||r.stdout);return JSON.parse(r.stdout);}
async function command(t,workspace,receipts,argv,{network=false,input='',timeoutMs=90000,model,effort}={}) {
 return executeIsolated({workspace,receipts,command:argv,input,network,timeoutMs,
   gitMetadata:[DEP,t.dependencyDir,resolve(t.baseDir,'.git')],dependencyCache:resolve(t.dependencyDir,'.cache'),observerLimits:limits,model,effort});
}
async function grade(t,label,patch) {
 const out=resolve(STATE,'grading',label),workspace=resolve(out,'workspace');
 if(await exists(resolve(out,'grade.json')))return json(resolve(out,'grade.json'));
 data('grade',t,workspace,patch);const started=Date.now(),native=[],acceptance=[];
 for(const [i,c]of t.nativeCommands.entries())native.push(await command(t,workspace,resolve(out,'native-'+i),c));
 for(const x of t.graderOverlay){await copyFile(x.source,resolve(workspace,x.target));}
 for(const [i,c]of t.acceptanceCommands.entries())acceptance.push(await command(t,workspace,resolve(out,'acceptance-'+i),c));
 const passed=r=>r.exitCode===0&&!r.outputLimited&&!r.resourceStop;
 const result={nativePassed:native.every(passed),accepted:native.every(passed)&&acceptance.every(passed),
   native:native.map(r=>({exitCode:r.exitCode,resourceStop:r.resourceStop})),acceptance:acceptance.map(r=>({exitCode:r.exitCode,resourceStop:r.resourceStop})),latencyMs:Date.now()-started,protectedTestsRestored:true};
 await save(resolve(out,'grade.json'),result);return result;
}
async function controls(id,revision='r2') {
 const t=await json(taskFile(id)),empty=resolve(STATE,'controls',id,'empty.json');await save(empty,[]);
 const baseline=await grade(t,'control-'+id+'-'+revision+'-base',empty),reference=await grade(t,'control-'+id+'-'+revision+'-reference',t.referencePatchJson);
 const out={id,passed:baseline.nativePassed&&!baseline.accepted&&reference.accepted,baseline,reference};
 await save(resolve(STATE,'controls',id,'result-'+revision+'.json'),out);await save(resolve(STATE,'controls',id,'result.json'),out);if(!out.passed)throw Error('Controls failed '+id);return out;
}
async function catalog(){
 const {ModelRuntime}=await import(resolve(DEP,'@earendil-works/pi-coding-agent/dist/index.js'));
 const runtime=await ModelRuntime.create({authPath:'/home/eric_qin/suffice-field-v1/.suffice/pi/auth.json',modelsPath:null,allowModelNetwork:false});
 return Object.fromEntries(Object.values(strata).map(({model})=>{const m=runtime.getModel('openai',model);if(!m?.cost)throw Error('No model price');return [model,{provider:m.provider,cost:m.cost}];}));
}
async function freeze() {
 if(await exists(resolve(STATE,'manifest.json')))return verify();
 const cohort=await json(resolve(STATE,'cohort.json')),inputs={},external={},tasks={};
 for(const dir of ['src','packages/cli/src','benchmark/shared'])for(const p of await walk(resolve(ROOT,dir)))inputs[p.slice(ROOT.length+1)]=hash(await readFile(p));
 for(const name of ['package.json','package-lock.json','benchmark/broad/prepare.py'])inputs[name]=hash(await readFile(resolve(ROOT,name)));
 external[DATA]=hash(await readFile(DATA));
 external[resolve(DEP,'@earendil-works/pi-coding-agent/package.json')]=hash(await readFile(resolve(DEP,'@earendil-works/pi-coding-agent/package.json')));
 const policy='Work only in this public repository and temporary scratch space. Preserve documented behavior; implement the issue and verify appropriate project commands. Do not fetch external solutions, access other worktrees, call other models, commit, or contact maintainers. Dependencies are preinstalled read-only. You may inspect and run /public-contracts/'+ 'ID' +'.mjs, a public issue reproducer available equally to all configurations. Do not claim checks that did not run.';
 for(const t of cohort) {
  const spec=await json(taskFile(t.id));if(!(await json(resolve(STATE,'controls',t.id,'result.json'))).passed)throw Error('Controls required');
  for(const p of [taskFile(t.id),spec.referencePatchJson,resolve(spec.dependencyDir,'../package-lock.json'),...spec.graderOverlay.map(x=>x.source)])external[p]=hash(await readFile(p));
  const prompt=`Repository: ${spec.repository}\nIssue: ${spec.title}\n\n${spec.publicBody}\n\n${policy.replace('ID',t.id)}\nPrevalidated public project commands:\n${spec.nativeCommands.map(JSON.stringify).join('\n')}`;
  tasks[t.id]={...t,prompt,promptHash:hash(prompt),baseHashes:data('freeze',spec,spec.baseDir).baseHashes};
 }
 const jobs=[];Object.keys(tasks).forEach((id,i)=>{for(let n=0;n<6;n++)for(const s of (i+n)%2?['luna','sol']:['sol','luna'])jobs.push({id,arm:Object.keys(arms)[(i+n)%6],stratum:s});});
 const m={version:'shared-core-v1',created:new Date().toISOString(),inputs,external,tasks,arms,strata,jobs,limits,maxConcurrency:2,maxCampaignCostUsd:12,modelCatalog:await catalog(),protocol:'benchmark/shared/PROTOCOL.md',sourceStaging:await json(resolve(ROOT,'.suffice/staging.json'))};
 await save(resolve(STATE,'manifest.json'),m);return m;
}
async function verify() {
 const m=await json(resolve(STATE,'manifest.json'));
 for(const[p,h]of Object.entries(m.inputs))if(hash(await readFile(resolve(ROOT,p)))!==h)throw Error('Source changed '+p);
 for(const[p,h]of Object.entries(m.external))if(hash(await readFile(p))!==h)throw Error('Evaluator changed '+p);
 if(JSON.stringify(await catalog())!==JSON.stringify(m.modelCatalog))throw Error('Prices changed');return m;
}
async function boundaryProbe() {
 const t=await json(taskFile('b01')),actor=resolve(STATE,'boundary-probe-actor');
 if(!await exists(actor))data('actor',t,actor);
 const script="const fs=require('node:fs');for(const p of ['/runtime/.suffice/shared-core-v1','/runtime/benchmark/shared/private','/home/eric_qin/suffice-field-v1/.suffice'])if(fs.existsSync(p))throw Error('private state exposed '+p);if(!fs.existsSync('/public-contracts/b01.mjs'))throw Error('public check missing');let blocked=false;try{fs.appendFileSync('/public-contracts/b01.mjs',' ')}catch{blocked=true}if(!blocked)throw Error('public check writable');console.log('private state masked; public checks read-only');";
 const r=await command(t,actor,resolve(STATE,'boundary-probe'),['node','-e',script],{network:true,timeoutMs:10000});
 if(r.exitCode!==0)throw Error(r.stderr||r.stdout);console.log(r.stdout);
}
async function attempt({id,arm,stratum}) {
 const m=await verify(),t=await json(taskFile(id)),key=`${id}-${stratum}-${arm}`,out=resolve(STATE,'attempts',key);
 if(await exists(resolve(out,'result.json')))return json(resolve(out,'result.json'));
 if(await exists(out))throw Error('Partial attempt preserved '+key);
 await mkdir(out,{recursive:true});const actor=resolve(STATE,'actors',key),prepared=data('actor',t,actor);
 if(JSON.stringify(prepared.trackedHashes)!==JSON.stringify(m.tasks[id].baseHashes))throw Error('Base changed');
 const config=m.strata[stratum],checks=t.nativeCommands.map(command=>({command,timeoutMs:60000,expectedExitCode:0}));
 const request={...config,experimental:true,strategy:'flexible',features:m.arms[arm],workspace:'/workspace',runDir:'/receipts',authPath:'/runtime/.suffice/pi/auth.json',prompt:m.tasks[id].prompt,checks,...limits,
   maxRepairAttempts:['V','OV'].includes(arm)?1:0,...(['V','OV'].includes(arm)?{contractVerification:t.contractVerification}:{})};
 await save(resolve(out,'request.json'),request);
 const processResult=await command(t,actor,resolve(out,'worker'),['node','/runtime/src/execution/entry.mjs'],{...config,network:true,input:JSON.stringify(request),timeoutMs:310000});
 const worker=await json(resolve(out,'worker/worker.json')).catch(()=>({status:'operational_failure',usage:{costUnknown:true},stages:[]}));
 const patch=data('capture',t,actor),patchFile=resolve(out,'patch.json');await save(patchFile,patch);
 const evaluation=await grade(t,key,patchFile),events=[];let partial=false;
 for(const p of (await walk(resolve(out,'worker'))).filter(p=>/\/events\/[^/]+\.jsonl$/.test(p)))for(const line of (await readFile(p,'utf8')).split('\n').filter(Boolean))try{events.push(JSON.parse(line));}catch{partial=true;}
 const assistants=events.filter(e=>e.type==='assistant'),requests=events.filter(e=>e.type==='provider_request'),raw=[...new Map(events.filter(e=>e.type==='provider_usage').map(e=>[e.responseId,e])).values()];
 const sum=k=>assistants.reduce((n,e)=>n+(e.usage?.[k]??0),0),knownCost=assistants.reduce((n,e)=>n+(e.usage?.cost?.total??0),0);
 const matched=!partial&&assistants.length>0&&requests.length===assistants.length&&raw.length===assistants.length&&Math.abs(knownCost-(worker.usage.estimatedApiUsd??0))<1e-9&&raw.reduce((n,e)=>n+(e.usage.input_tokens??0),0)===sum('input')+sum('cacheRead')+sum('cacheWrite')&&raw.reduce((n,e)=>n+(e.usage.output_tokens??0),0)===sum('output');
 const identity=requests.length>0&&requests.every(e=>e.model===config.model&&e.reasoning?.effort===config.effort&&JSON.stringify(e.toolNames)===JSON.stringify(['codemode']))&&events.filter(e=>e.type==='startup').every(e=>JSON.stringify(e.pricing)===JSON.stringify(m.modelCatalog[config.model].cost));
 const unknown=worker.usage.costUnknown||!matched;
 const eligible=worker.budgetEligible&&processResult.exitCode===0&&!processResult.resourceStop&&!unknown&&identity;
 const result={key,id,arm,stratum,...config,status:worker.status,accepted:evaluation.accepted,success:evaluation.accepted&&eligible,budgetEligible:!!eligible,costUnknown:!!unknown,knownCostUsd:knownCost,totalCostUsd:unknown?null:knownCost,
   usage:worker.usage,modelCalls:assistants.length,reasoningTokens:raw.reduce((n,e)=>n+(e.usage.output_tokens_details?.reasoning_tokens??0),0),receiptsMatched:matched,identity,latencyMs:worker.latencyMs??processResult.latencyMs,outerLatencyMs:processResult.latencyMs,gradingLatencyMs:evaluation.latencyMs,
   repairs:worker.repairs,notes:worker.notes,verification:worker.verification,evaluation,patchPaths:patch.map(x=>x.path),resourceStop:processResult.resourceStop};
 await save(resolve(out,'result.json'),result);console.log(JSON.stringify({key,accepted:result.accepted,success:result.success,cost:result.totalCostUsd,seconds:result.latencyMs/1000,repairs:result.repairs}));
 return result;
}
async function campaign(){
 const m=await verify();const completed=[],pending=[...m.jobs];let halt=false;
 async function worker(){while(pending.length&&!halt){
   if(completed.reduce((n,r)=>n+r.knownCostUsd,0)>=m.maxCampaignCostUsd){halt=true;break;}
   const job=pending.shift();try{const r=await attempt(job);completed.push(r);if(r.costUnknown||!r.identity)halt=true;}
   catch(error){halt=true;await save(resolve(STATE,'campaign-error.json'),{job,error:error.stack});throw error;}
 }}
 await Promise.all([worker(),worker()]);await save(resolve(STATE,'campaign.json'),{completed:completed.length,pending,halt,knownCostUsd:completed.reduce((n,r)=>n+r.knownCostUsd,0)});
}
const[mode,id]=process.argv.slice(2);
if(mode==='controls')console.log(JSON.stringify(await controls(id,process.argv[4])));
else if(mode==='freeze')console.log(JSON.stringify({jobs:(await freeze()).jobs.length}));
else if(mode==='run')await campaign();
else if(mode==='verify')console.log(JSON.stringify({verified:(await verify()).version}));
else if(mode==='boundary')await boundaryProbe();
else throw Error('controls ID | freeze | verify | run');
