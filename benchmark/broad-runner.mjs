// Sonion-only adapter. Reuses frozen task materialization, grading and OS boundary.
import {readFile,writeFile,mkdir,copyFile,readdir,stat,symlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const ROOT=resolve(import.meta.dirname,'..');
const OLD='/home/eric_qin/suffice-field-v1';
const TASKS=resolve(ROOT,'.suffice/broad-bench-v1/tasks');
const COHORT=resolve(ROOT,'benchmark/broad/cohort.json');
const DATA=OLD+'/experiments/luna-sol-field-v1/evaluator-data.py';
process.env.VARIANT='sol-low';
const {executeIsolated}=await import('./broad-execution.mjs');
const STATE=resolve(ROOT,'.suffice/broad-bench-v1');
const RUNTIME=resolve(ROOT,'.suffice/broad-runtime');
const DEP='/home/eric_qin/suffice-general-runtime/app/node_modules';
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=p=>readFile(p,'utf8').then(JSON.parse);
const exists=p=>stat(p).then(()=>true,()=>false);
const save=async(p,v)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(v,null,2)+'\n');};
const policy='Work only in the public repository and temporary scratch space. Investigate the original issue, preserve documented existing behavior, implement the requested repair, and verify it with appropriate project commands. Do not inspect other worktrees or fetch external solutions, call other model providers yourself, submit commits or contact maintainers. Public dependencies are preinstalled read-only. Node24 TypeScript stripping can be disabled with --no-experimental-strip-types when an older project loader requires it. No duration, edit-count or context-length target.';
function data(mode,task,out,extra) {
 const r=spawnSync('python3',['-I',DATA,mode,task,out,...extra?[extra]:[]],{encoding:'utf8',timeout:120000,maxBuffer:64*1024**2});
 if(r.status!==0)throw Error(r.stderr||r.stdout);return JSON.parse(r.stdout);
}
async function dependency(t){const p=t.dependencyDir;return p.endsWith('/node_modules')?p:resolve(p,'node_modules');}
async function runCommand(t,workspace,receipts,command,{network=false,input='',codexHome=null,extraMounts=[],timeoutMs=network?310000:180000,model='gpt-6.1-sol',effort='medium'}={}) {
 return executeIsolated({workspace,receipts,command,input,network,codexHome,timeoutMs,maxOutputBytes:8*1024**2,gitMetadata:[RUNTIME,DEP,await dependency(t),resolve(t.baseDir,'.git'),...extraMounts],dependencyCache:resolve(await dependency(t),'.cache'),observerLimits:{maxCostUsd:.25,maxTurns:40,maxCalls:160},model,effort});
}
function armConfig(mode) {
 if(!['codexSolMedium','v1SolMedium','v2LunaHigh','v1LunaHigh'].includes(mode))throw Error('Unknown arm');
 const enhanced=mode==='v2LunaHigh',luna=mode.includes('Luna');
 return {profile:enhanced?'thin':'baseline',model:luna?'gpt-6-luna':'gpt-6.1-sol',effort:luna?'high':'medium',features:{outputControl:enhanced,preparedContext:enhanced,guidance:enhanced,notices:enhanced,advice:enhanced?'on_failure':false,repairs:enhanced,solTakeover:enhanced}};
}
async function loadCatalog() {
 const {ModelRuntime}=await import(resolve(DEP,'@earendil-works/pi-coding-agent/dist/index.js'));
 const runtime=await ModelRuntime.create({authPath:resolve(OLD,'.suffice/pi/auth.json'),modelsPath:null,allowModelNetwork:false});
 return Object.fromEntries(['gpt-6.1-sol','gpt-6-luna'].map(id=>{
  const model=runtime.getModel('openai',id);if(!model?.cost)throw Error('Missing pinned model '+id);
  return [id,{id:model.id,provider:model.provider,reasoning:model.reasoning,cost:model.cost,requestedEfforts:id==='gpt-6.1-sol'?['medium','low']:['high']}];
 }));
}
function nativeVerdict(t,results) {
 return results.length===t.nativeCommands.length&&results.every((r,i)=>{
  if(r.outputLimited||r.resourceStop||r.exitCode!==(t.controls.nativeExitCodes?.[i]??0))return false;
  if(t.nativeParser==='mocha-json') {
   let j;try{j=JSON.parse(r.stdout);}catch{return false;}
   return j.stats?.tests>0&&JSON.stringify((j.failures??[]).map(f=>f.fullTitle).sort())===JSON.stringify([...(t.controls.nativeFailureNames??t.controls.knownNativeFailures??[])].sort());
  }
  return true;
 });
}
async function grade(id,label,patchPath,outputRoot=STATE) {
 const taskFile=resolve(TASKS,id,'task.json'),t=await json(taskFile),out=resolve(outputRoot,'grading',label),workspace=resolve(out,'workspace');
 if(await exists(resolve(out,'grade.json')))return json(resolve(out,'grade.json'));
 data('grade',taskFile,workspace,patchPath);
 const native=[];for(let i=0;i<t.nativeCommands.length;i++)native.push(await runCommand(t,workspace,resolve(out,'native-'+i),t.nativeCommands[i]));
 for(const x of t.graderOverlay??[]) {const p=resolve(workspace,x.target);if(!p.startsWith(workspace+'/'))throw Error('Overlay escape');await mkdir(dirname(p),{recursive:true});await copyFile(x.source,p);}
 const acceptance=[];for(let i=0;i<t.acceptanceCommands.length;i++)acceptance.push(await runCommand(t,workspace,resolve(out,'hidden-'+i),t.acceptanceCommands[i]));
 const result={nativePassed:nativeVerdict(t,native),accepted:nativeVerdict(t,native)&&acceptance.length>0&&acceptance.every(r=>r.exitCode===0&&!r.outputLimited&&!r.resourceStop),native:native.map(r=>({exit:r.exitCode,resource:r.resourceStop})),hidden:acceptance.map(r=>({exit:r.exitCode,resource:r.resourceStop})),protectedTestsRestored:true};
 await save(resolve(out,'grade.json'),result);return result;
}
async function freeze() {
 const file=resolve(STATE,'manifest.json');
 if(await exists(file))return verify();
 const cohort=await json(COHORT),ids=cohort.ids,inputs={},runtimeInputs={},externalInputs={};
 if(ids.length!==15||new Set(ids).size!==15||ids.some(id=>!/^b\d{2}$/.test(id)))throw Error('Expected fifteen unique broad task ids');
 inputs['benchmark/broad/cohort.json']=hash(await readFile(COHORT));
 for(const p of await walk(resolve(ROOT,'benchmark/broad')))inputs[p.slice(ROOT.length+1)]=hash(await readFile(p));
 for(const folder of ['src','packages/cli/src'])for(const p of await walk(resolve(ROOT,folder)))inputs[p.slice(ROOT.length+1)]=hash(await readFile(p));
 for(const name of ['broad-runner.mjs','broad-driver.py','broad-sonion.py','broad-execution.mjs','broad-native-worker.mjs','broad-plan.md'])inputs['benchmark/'+name]=hash(await readFile(resolve(ROOT,'benchmark',name)));
 for(const name of ['package.json','package-lock.json'])inputs[name]=hash(await readFile(resolve(ROOT,name)));
 for(const folder of ['src','packages/cli/src'])for(const p of await walk(resolve(ROOT,folder))) {
  const relative=p.slice(ROOT.length+1),expected=hash(await readFile(p));
  if(hash(await readFile(resolve(RUNTIME,relative)))!==expected)throw Error('Runtime copy differs: '+relative);
  runtimeInputs[relative]=expected;
 }
 runtimeInputs['package.json']=hash(await readFile(resolve(RUNTIME,'package.json')));
 for(const p of [DATA,resolve(OLD,'experiments/luna-sol-field-4g-v1/execution.mjs'),resolve(OLD,'experiments/luna-sol-field-v1/variants.json'),resolve(OLD,'experiments/luna-sol-field-v1/native-worker.mjs')])externalInputs[p]=hash(await readFile(p));
 for(const p of ['/home/eric_qin/suffice-codex-runtime-0163/node_modules/@openai/codex/package.json','/home/eric_qin/suffice-codex-runtime-0163/node_modules/@openai/codex/bin/codex.js','/home/eric_qin/suffice-codex-runtime-0163/node_modules/@openai/codex-linux-x64/package.json','/home/eric_qin/suffice-codex-runtime-0163/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex',resolve(DEP,'@earendil-works/pi-coding-agent/package.json')])externalInputs[p]=hash(await readFile(p));
 const tasks={};for(const id of ids) {
  const p=resolve(TASKS,id,'task.json'),t=await json(p);
  if(!t.ready)throw Error('Task preparation incomplete '+id);
  externalInputs[p]=hash(await readFile(p));
  const dep=await dependency(t),locks=[resolve(dep,'.package-lock.json'),resolve(dep,'../package-lock.json')];
  let locked=false;for(const lock of locks)if(await exists(lock)){externalInputs[lock]=hash(await readFile(lock));locked=true;}
  if(!locked)throw Error('Dependency lock receipt required '+id);
  const depManifest=resolve(dep,'../package.json');if(await exists(depManifest))externalInputs[depManifest]=hash(await readFile(depManifest));
  const frozen=data('freeze',p,t.baseDir);
  const text=`Repository: ${t.repository}\nIssue: ${t.title}\n\n${t.publicBody}\n\n${policy}\nPrevalidated public commands:\n${t.nativeCommands.map(c=>JSON.stringify(c)).join('\n')}`;
  for(const source of [t.referencePatchJson,...(t.graderOverlay??[]).map(x=>x.source)])externalInputs[source]=hash(await readFile(source));
  tasks[id]={taskHash:hash(await readFile(p)),baseHashes:frozen.baseHashes,prompt:text,promptHash:hash(text),routingText:`${t.title}\n${t.publicBody}`,repository:t.repository,issue:t.issue,title:t.title};
 }
 const modes=['codexSolMedium','v1SolMedium','v2LunaHigh','v1LunaHigh'],jobs=[];
 ids.forEach((id,i)=>{for(let j=0;j<modes.length;j++)jobs.push({id,mode:modes[(i+j)%modes.length]});});
 const manifest={modelCatalog:await loadCatalog(),version:'broad-bench-v1',created:new Date().toISOString(),inputs,runtimeInputs,externalInputs,tasks,jobs,limits:{maxCostUsd:.25,timeoutMs:300000,maxTurns:40,maxCalls:160,rss:4*1024**3},maxConcurrency:4,controlConcurrency:2,minAvailableMemoryBytes:2.5*1024**3,maxCampaignCostUsd:16,arms:Object.fromEntries(modes.map(mode=>[mode,armConfig(mode)])),scope:'Fifteen issues unused in prior local evaluation/development, across the frozen cohort repositories. Historical public issues may have appeared in model training; no training-unseen claim. Four arm, one attempt per issue/arm, counterbalanced issue blocks.',cost:'API-equivalent; all advice, repair, takeover and failed-response usage included. Engineering inference excluded.'};
 await save(file,manifest);return manifest;
}
async function walk(folder){const out=[];for(const e of await readdir(folder,{withFileTypes:true})){const p=resolve(folder,e.name);if(e.isDirectory())out.push(...await walk(p));else if(e.isFile())out.push(p);}return out;}
async function verify() {
 const m=await json(resolve(STATE,'manifest.json'));
 if(JSON.stringify(await loadCatalog())!==JSON.stringify(m.modelCatalog))throw Error('Frozen model catalog changed');
 for(const[p,h]of Object.entries(m.inputs))if(hash(await readFile(resolve(ROOT,p)))!==h)throw Error('Frozen source changed: '+p);
 for(const[p,h]of Object.entries(m.runtimeInputs))if(hash(await readFile(resolve(RUNTIME,p)))!==h)throw Error('Frozen runtime changed: '+p);
 for(const[p,h]of Object.entries(m.externalInputs))if(hash(await readFile(p))!==h)throw Error('Frozen evaluator input changed: '+p);
 return m;
}
async function controls(id,outputRoot=STATE,preflight=false) {
 if(!preflight)await verify();
 const taskFile=resolve(TASKS,id,'task.json'),t=await json(taskFile);
 const empty=resolve(outputRoot,'controls',id,'empty.json');await save(empty,[]);
 const baseline=await grade(id,'control-'+id+'-base',empty,outputRoot),reference=await grade(id,'control-'+id+'-reference',t.referencePatchJson,outputRoot);
 // Grading overlays can replace existing public test files. Network preflight
 // must use a fresh actor workspace, never a workspace already given graders.
 const actorControl=resolve(outputRoot,'control-actors',id);
 if(!await exists(actorControl))data('actor',taskFile,actorControl);
 const actorNetworkChecks=[];for(let i=0;i<t.nativeCommands.length;i++)actorNetworkChecks.push(await runCommand(t,actorControl,resolve(outputRoot,'controls',id,'network-'+i),t.nativeCommands[i],{network:true}));
 const result={id,passed:baseline.nativePassed&&!baseline.accepted&&reference.accepted&&nativeVerdict(t,actorNetworkChecks),baseline,reference,actorNetworkNativePassed:nativeVerdict(t,actorNetworkChecks)};await save(resolve(outputRoot,'controls',id,'result.json'),result);
 if(!result.passed)throw Error('Current controls failed: '+id);return result;
}
async function attempt(id,mode) {
 const manifest=await verify(),taskFile=resolve(TASKS,id,'task.json'),t=await json(taskFile),publicTask=manifest.tasks[id];
 if(!publicTask||hash(await readFile(taskFile))!==publicTask.taskHash)throw Error('Task changed');
 if(!(await json(resolve(STATE,'controls',id,'result.json'))).passed)throw Error('Controls required');
 const run=resolve(STATE,'attempts',id+'-'+mode),resultPath=resolve(run,'result.json');
 if(await exists(resultPath))return json(resultPath);
 if(await exists(run))throw Error('Partial attempt requires inspection: '+run);
 await mkdir(run,{recursive:true});const actor=resolve(STATE,'actors',id+'-'+mode);
 const prepared=data('actor',taskFile,actor);
 if(JSON.stringify(prepared.trackedHashes)!==JSON.stringify(publicTask.baseHashes))throw Error('Actor baseline mismatch');
 await save(resolve(run,'prompt.json'),{text:publicTask.prompt,sha256:publicTask.promptHash});
 const workerDir=resolve(run,'worker');
 const checks=t.nativeCommands.map((command,i)=>({command,expectedExitCode:t.controls.nativeExitCodes?.[i]??0}));
 const config=armConfig(mode);
 const request={...config,experimental:true,workspace:'/workspace',prompt:publicTask.prompt,runDir:'/receipts',authPath:'/runtime/.suffice/pi/auth.json',checks,maxRepairAttempts:mode==='v2LunaHigh'?1:0,...manifest.limits};
 await save(resolve(run,'request-public.json'),{...request,authPath:'[runtime subscription auth mount]'});
 let codexHome=null,extraMounts=[];
 if(mode==='codexSolMedium') {
  codexHome=resolve(run,'codex-home');await mkdir(codexHome,{recursive:true,mode:0o700});
  // Link and mount authentication without reading or copying its bytes.
  for(const name of ['auth.json','models_cache.json']) {
   const source=resolve(OLD,'.suffice/codex-native-home',name);
   await symlink(source,resolve(codexHome,name));extraMounts.push(source);
  }
 }
 const execution=await runCommand(t,actor,workerDir,mode==='codexSolMedium'?['node','/native-worker.mjs']:['node',resolve(RUNTIME,'src/pipeline/entry.mjs')],{network:true,codexHome,extraMounts,model:config.model,effort:config.effort,input:JSON.stringify(mode==='codexSolMedium'?{prompt:publicTask.prompt,limits:manifest.limits}:request)});
 const worker=await json(resolve(workerDir,'worker.json')).catch(()=>({status:'operational_failure',usage:{costUnknown:true,estimatedApiUsd:0},stages:[]}));
 const patch=data('capture',taskFile,actor);await save(resolve(run,'patch.json'),patch);
 const diff=spawnSync('git',['-C',actor,'diff','--binary','HEAD'],{encoding:'utf8',maxBuffer:8*1024**2});await writeFile(resolve(run,'tracked.patch'),diff.stdout??'');
 const grading=await grade(id,id+'-'+mode,resolve(run,'patch.json'));
 const ledger=[];let partialEvent=false;
 for(const p of (await walk(workerDir)).filter(p=>(/\/events\/[^/]+\.jsonl$/.test(p)||p.endsWith('/events.live.jsonl')))) {
  for(const line of (await readFile(p,'utf8')).split('\n').filter(Boolean)) {
   try{ledger.push({...JSON.parse(line),stage:p.slice(workerDir.length+1).split('/')[0]});}catch{partialEvent=true;}
  }
 }
 const assistants=ledger.filter(e=>e.type==='assistant'),requests=ledger.filter(e=>e.type==='provider_request'),raw=[...new Map(ledger.filter(e=>e.type==='provider_usage').map(e=>[e.responseId,e])).values()];
 const sum=k=>assistants.reduce((n,e)=>n+(e.usage?.[k]??0),0);
 const independentCost=assistants.reduce((n,e)=>n+(Number.isFinite(e.usage?.cost?.total)?e.usage.cost.total:0),0);
 const receiptsMatched=assistants.length>0&&(mode==='codexSolMedium'||requests.length===assistants.length)&&raw.length===assistants.length&&Math.abs(independentCost-(worker.usage.estimatedApiUsd??0))<1e-9&&raw.reduce((n,e)=>n+(e.usage.input_tokens??0),0)===sum('input')+sum('cacheRead')+sum('cacheWrite')&&raw.reduce((n,e)=>n+(e.usage.output_tokens??0),0)===sum('output');
 await save(resolve(run,'execution-summary.json'),{exitCode:execution.exitCode,resourceStop:execution.resourceStop,outputLimited:execution.outputLimited});
 const costUnknown=worker.usage.costUnknown||worker.usageCostUnknown||!receiptsMatched||partialEvent;
 const catalogPricesMatch=ledger.filter(e=>e.type==='startup').every(e=>{const id=typeof e.model==='string'?e.model:e.model?.id,price=e.pricing??e.model?.cost;return !!manifest.modelCatalog[id]&&JSON.stringify(price)===JSON.stringify(manifest.modelCatalog[id].cost);});
 const identity=catalogPricesMatch&&(mode==='codexSolMedium'?worker.identity===true:requests.length>0&&requests.every(e=>{
  const advisor=e.stage.startsWith('advice-'),takeover=e.stage==='sol-takeover';
  const expectedModel=advisor||takeover?'gpt-6.1-sol':config.model,expectedEffort=advisor||takeover?'low':config.effort;
  return e.model===expectedModel&&e.reasoning?.effort===expectedEffort&&JSON.stringify(e.toolNames)===JSON.stringify(advisor?[]:['codemode']);
 }));
 const eligible=(mode==='codexSolMedium'?worker.status==='completed'&&worker.turns<=manifest.limits.maxTurns&&worker.calls<=manifest.limits.maxCalls&&independentCost<=manifest.limits.maxCostUsd&&worker.latencyMs<=manifest.limits.timeoutMs:worker.budgetEligible)&&execution.exitCode===0&&!execution.resourceStop&&!costUnknown&&identity;
 const result={id,mode,repository:t.repository,issue:t.issue,status:worker.status,accepted:grading.accepted,budgetEligible:eligible,success:grading.accepted&&eligible,operationalFailure:worker.status==='operational_failure'||!!execution.resourceStop,costUnknown,knownCostUsd:independentCost,totalCostUsd:costUnknown?null:independentCost,usage:{...worker.usage,modelCalls:assistants.length,toolCalls:mode==='codexSolMedium'?worker.calls:worker.usage.toolCalls},receiptsMatched,identity,catalogPricesMatch,reasoningTokens:raw.reduce((n,e)=>n+(e.usage.output_tokens_details?.reasoning_tokens??0),0),modelCalls:assistants.length,latencyMs:worker.latencyMs??execution.latencyMs,outerLatencyMs:execution.latencyMs,peakRssBytes:execution.peakRssBytes,resourceStop:execution.resourceStop,features:config.features,profile:config.profile,model:config.model,effort:config.effort,adviceStages:worker.stages?.filter(s=>/advice/.test(s.label??s.id??'')).length,escalations:worker.escalations,verification:worker.verification,notes:worker.notes,patchPaths:patch.map(p=>p.path),grading};
 await save(resultPath,result);console.log(JSON.stringify({id,mode,accepted:result.accepted,success:result.success,cost:result.totalCostUsd,advice:result.adviceStages}));
 if(costUnknown||!identity)process.exitCode=2;
 return result;
}
async function preflight(id,revision) {
 if(!/^b\d{2}$/.test(id)||!revision||! /^[A-Za-z0-9_-]{1,60}$/.test(revision))throw Error('Expected preflight ID REV');
 const root=resolve(STATE,'preparation-checks',revision+'-'+id);
 if(await exists(root))throw Error('Preparation revision already exists; immutable receipts preserved');
 await mkdir(root,{recursive:true});await writeFile(resolve(root,'request.json'),JSON.stringify({id,revision,at:new Date().toISOString()}),{flag:'wx'});
 return controls(id,root,true);
}
const [mode,id,arm]=process.argv.slice(2);
if(mode==='preflight')console.log(JSON.stringify(await preflight(id,arm)));
else if(mode==='freeze')console.log(JSON.stringify(await freeze()));
else if(mode==='controls')console.log(JSON.stringify(await controls(id)));
else if(mode==='attempt')await attempt(id,arm);
else throw Error('preflight ID REV | freeze | controls ID | attempt ID codexSolMedium|v1SolMedium|v2LunaHigh|v1LunaHigh');
