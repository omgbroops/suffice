import {readFile,writeFile,mkdir,readdir,copyFile,stat,statfs} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {executeIsolated,stageRuntime,ROOT,LINUX_RUNTIME,linuxPath} from './general-execution.mjs';
import {verifyGeneral} from './freeze-general.mjs';
import {accountEvents} from './audit-benchmark-receipts.mjs';
import {runNodeTests} from '../src/workspace.mjs';
const FIELD=resolve(ROOT,'.suffice/field-v1'),DIR=resolve(ROOT,'.suffice/general-field-pilot-v1'),REPORT=resolve(ROOT,'reports/general-field-pilot-v1');
const mode=process.argv[2],json=p=>readFile(p,'utf8').then(JSON.parse),save=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n'),hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(REPORT,{recursive:true});
const tasks=await json(resolve(FIELD,'private/tasks.json')),profile=await json(resolve(ROOT,'configs/general-v1.json')),limits=profile.limits;
const schedule=[{id:'001',task:'h02',arm:'suffice'},{id:'002',task:'h02',arm:'stock-pi'},{id:'003',task:'l01',arm:'suffice'}];
const privateRoots=[resolve(FIELD,'private'),resolve(ROOT,'../github-field-test/research'),resolve(ROOT,'../github-field-test/.suffice/field/private'),resolve(ROOT,'../github-field-test/.suffice/field/actors/reference-h02')];
const readEvents=async run=>{try{return(await readFile(resolve(run,'events.live.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code==='ENOENT')return [];throw e;}};
function wsl(args,timeout=120000){const r=spawnSync('wsl.exe',['-d','Ubuntu','--',...args],{encoding:'utf8',windowsHide:true,timeout,maxBuffer:8*1024**2});if(r.status!==0)throw new Error(r.stderr||r.stdout||r.error?.message);return r.stdout;}
function git(workspace,...args){return wsl(['git','-C',linuxPath(workspace),...args]);}
async function hashes(workspace){const out={};for(const p of git(workspace,'ls-files','-z').split('\0').filter(Boolean))out[p]=hash(await readFile(resolve(workspace,p)));return out;}
const policy='Environment: complete upstream repository; project dependencies are preinstalled. Investigate and implement the issue, reproduce locally when possible, and run appropriate native tests/builds. Work in this repository and temporary scratch space; local test servers are allowed. Do not inspect other worktrees, retrieve external solutions, contact external services/maintainers, install dependencies, launch other agents/model requests, or submit commits/PRs. Patches and new tests are kept for human review. For older ts-node projects under Node24, built-in TypeScript stripping can be disabled using --no-experimental-strip-types. No artificial duration or edit-count target.';
const prompt=t=>`Repository: ${t.repository}\nIssue: ${t.title}\n\n${t.publicBody}\n\n${policy}`;
async function sourceInputs(){const out={};for(const p of ['scripts/general-field-pilot.mjs','scripts/prepare-general-field.py','scripts/copy-general-dependencies.py','scripts/repair-dependency-links.py','docs/general-v1/PILOT-PROTOCOL.md'])out[p]=hash(await readFile(resolve(ROOT,p)));for(const p of ['tasks.json','h02.test.mjs','l01-check.cjs','h02-reference-index.js'])out['private/'+p]=hash(await readFile(resolve(FIELD,'private',p)));for(const id of ['h02','l01'])out['base/'+id]=await hashes(resolve(FIELD,'bases',id));return out;}
async function frozen(){await verifyGeneral();const m=await json(resolve(DIR,'manifest.json'));if(JSON.stringify(m.inputs)!==JSON.stringify(await sourceInputs()))throw new Error('Frozen pilot input drift');return m;}
async function rows(){const out=[];for(const s of schedule){try{out.push(await json(resolve(DIR,s.id,'result.json')));}catch(e){if(e.code!=='ENOENT')throw e;}}return out;}
async function patchFrom(actor,base){const changed=new Set([...git(actor,'diff','--name-only','-z','HEAD').split('\0'),...git(actor,'ls-files','--others','--exclude-standard','-z').split('\0')].filter(Boolean));const out=[];for(const p of changed){let before=null,after=null;try{before=(await readFile(resolve(base,p))).toString('base64');}catch(e){if(e.code!=='ENOENT')throw e;}try{after=(await readFile(resolve(actor,p))).toString('base64');}catch(e){if(e.code!=='ENOENT')throw e;}out.push({path:p,before,after});}return out;}
async function gradeWorkspace(task,label,patch=[],reference=false){
 const base=resolve(FIELD,'bases',task),folder=resolve(DIR,'evaluation',label);await mkdir(folder,{recursive:true});
 // Native tests remain the original upstream files. Agent-authored tests are
 // preserved in the submission but cannot replace independent regression gates.
 const files=git(base,'ls-files','-z').split('\0').filter(Boolean);
 for(const p of files){const dest=resolve(folder,p);await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(base,p),dest);}
 const deps=spawnSync('C:/Python314/python.exe',['-I',resolve(ROOT,'scripts/copy-general-dependencies.py'),resolve(base,'node_modules'),resolve(folder,'node_modules'),'--hardlink'],{encoding:'utf8',windowsHide:true,timeout:120000});if(deps.status!==0)throw new Error(deps.stderr||deps.stdout);
 for(const p of patch.filter(p=>!/^tests?\//.test(p.path))){if(p.after===null)throw new Error('Deleted production file requires separate evaluation');await mkdir(dirname(resolve(folder,p.path)),{recursive:true});await writeFile(resolve(folder,p.path),Buffer.from(p.after,'base64'));}
 if(reference)await copyFile(resolve(FIELD,'private/h02-reference-index.js'),resolve(folder,'src/index.js'));
 return folder;
}
async function nativeGrade(folder,task,out){
 const cmd=task==='h02'?['node','node_modules/mocha/bin/mocha','--reporter','json']:['node','--no-experimental-strip-types','node_modules/mocha/bin/mocha.js','--require','ts-node/register','--ui','tdd','--reporter','json','test/*.ts'];
 const process=await executeIsolated({workspace:folder,receipts:out,command:cmd,privateRoots,timeoutMs:45000});let data;try{data=JSON.parse(process.stdout);}catch{}
 let buildAndLint=null;if(task==='l01'){const b=await executeIsolated({workspace:folder,receipts:resolve(out,'build-lint'),command:['bash','-c','npm run build && npm run lint'],privateRoots,timeoutMs:90000});buildAndLint={exitCode:b.exitCode,latencyMs:b.latencyMs,passed:b.exitCode===0};}
 const r={exitCode:process.exitCode,stats:data?.stats,failures:data?.failures?.map(f=>({title:f.fullTitle,error:f.err?.message})),valid:!!data?.stats&&Number.isInteger(process.exitCode),buildAndLint,latencyMs:process.latencyMs};await save(resolve(out,'native.json'),r);return r;
}
async function independentGrade(folder,task,out,liveFile='l01-check.cjs'){
 await mkdir(out,{recursive:true});
 if(task==='h02'){const r=await runNodeTests(folder,resolve(FIELD,'private/h02.test.mjs'));await save(resolve(out,'private.json'),r);return {passed:r.status==='passed',status:r.status,tests:r.tests};}
 const started=Date.now(),r=spawnSync(process.execPath,[resolve(FIELD,'private',liveFile)],{cwd:folder,env:{SystemRoot:process.env.SystemRoot??'',SUFFICE_WORKSPACE:folder},encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:100000});
 let done;try{done=JSON.parse((r.stdout??'').trim().split('\n').at(-1));}catch{}
 const result={exitCode:r.status,error:r.error?.code,stdout:r.stdout,stderr:r.stderr,complete:done?.accepted===true,latencyMs:Date.now()-started,passed:r.status===0&&done?.accepted===true};await save(resolve(out,'private.json'),result);return result;
}
if(mode==='validate'){
 await verifyGeneral();await stageRuntime();await mkdir(DIR,{recursive:true});
 const checks=[],stamp=new Date().toISOString().replaceAll(/[:.]/g,'-');
 for(const [task,label,reference]of [['h02','h02-before',false],['h02','h02-reference',true],['l01','l01-before',false]]){
  if(task==='h02'){
   try{const folder=resolve(DIR,'evaluation',label),native=await json(resolve(DIR,'controls',label,'native/native.json')),r=await json(resolve(DIR,'controls',label,'acceptance/private.json'));for(const[p,h]of Object.entries(await hashes(resolve(FIELD,'bases',task)))){const expected=reference&&p==='src/index.js'?hash(await readFile(resolve(FIELD,'private/h02-reference-index.js'))):h;if(hash(await readFile(resolve(folder,p)))!==expected)throw new Error('Historical control source changed');}checks.push({task,label,reference,native,independent:{passed:r.status==='passed',status:r.status,tests:r.tests},reusedVerifiedControl:true});continue;}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const folder=await gradeWorkspace(task,label+'-'+stamp,[],reference),out=resolve(DIR,'controls',stamp,label),native=await nativeGrade(folder,task,resolve(out,'native')),independent=await independentGrade(folder,task,resolve(out,'acceptance'));
  let smallCapacityControl;if(task==='l01'){const source=await readFile(resolve(FIELD,'private/l01-check.cjs'),'utf8');if(!source.includes('const huge=2147483628;'))throw new Error('Unexpected performance control source');await writeFile(resolve(FIELD,'private/l01-small-control.cjs'),source.replace('const huge=2147483628;','const huge=16;'));smallCapacityControl=await independentGrade(folder,task,resolve(out,'small-capacity-control'),'l01-small-control.cjs');}
  checks.push({task,label,reference,native,independent,smallCapacityControl});console.log(JSON.stringify({control:label,native:native.stats,acceptance:independent.status??independent.passed}));
 }
 const before=checks[0],reference=checks[1],live=checks[2],failureNames=r=>(r.native.failures??[]).map(f=>f.title).sort();
 const passed=before.independent.status==='failed'&&reference.independent.passed&&before.native.valid&&reference.native.valid&&JSON.stringify(failureNames(before))===JSON.stringify(failureNames(reference))&&before.native.stats.tests===reference.native.stats.tests&&live.native.valid&&live.native.stats.failures===0&&live.native.buildAndLint.passed&&!live.independent.passed&&live.smallCapacityControl.passed;
 await save(resolve(REPORT,'validation.json'),{at:new Date().toISOString(),checks,passed,inferenceCalls:0,scope:'Original historical parent fails intended leak check, exact upstream fix passes; original live source stalls at reported capacity. Full native suites recorded, with matched pre-existing historical failure identities.'});if(!passed)process.exitCode=1;
}else if(mode==='freeze'){
 const v=await json(resolve(REPORT,'validation.json'));if(!v.passed)throw new Error('Pilot validation gate required');const general=await verifyGeneral();await mkdir(DIR,{recursive:true});
 await writeFile(resolve(DIR,'manifest.json'),JSON.stringify({at:new Date().toISOString(),generalVersion:general.version,generalRevision:general.revision,schedule,limits,maxKnownUsd:3,stopOnUnknown:true,inputs:await sourceInputs(),prompts:Object.fromEntries(Object.entries(tasks).map(([id,t])=>[id,{text:prompt(t),sha256:hash(prompt(t))}])),design:'Two issue pilots only: one historical paired comparison and one Suffice live attempt. No automatic broad campaign or new optimization. All attempts including failures retained. Linux environment is separate from the earlier Windows pilot.'},null,2),{flag:'wx'});console.log(JSON.stringify({frozen:true,schedule}));
}else if(mode==='run'){
 if(!process.argv.includes('--resume'))throw new Error('--resume required');await frozen();await stageRuntime();
 const lock=resolve(DIR,'active.lock');await writeFile(lock,JSON.stringify({pid:process.pid,at:new Date().toISOString()}),{flag:'wx'});
 try{for(const s of schedule){
  const run=resolve(DIR,s.id);try{await stat(run);try{await json(resolve(run,'result.json'));continue;}catch{}throw new Error('Partial attempt preserved: '+s.id);}catch(e){if(e.code!=='ENOENT')throw e;}
  const previous=await rows(),space=await statfs(ROOT);if(previous.some(r=>r.totalEstimatedUsd===null)||previous.reduce((n,r)=>n+r.knownEstimatedUsd,0)+limits.maxCostUsd>3||space.bavail*space.bsize<1024**3){console.log('Admission stopped');break;}
  await frozen();const actor=resolve(FIELD,'actors',s.id),base=resolve(FIELD,'bases',s.task);await mkdir(run,{recursive:true});await save(resolve(run,'initial-hashes.json'),await hashes(actor));await save(resolve(run,'prompt.json'),{text:prompt(tasks[s.task]),sha256:hash(prompt(tasks[s.task]))});
  console.log(JSON.stringify({event:'start',...s}));
  const command=s.arm==='suffice'?['node','/runtime/src/general/entry.mjs']:['node','/runtime/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js','--mode','json','--provider','openai','--model','gpt-6.1-sol','--thinking','low','--offline','--no-session','-e','/runtime/src/external-pi-observer.mjs'];
  const process=await executeIsolated({workspace:actor,receipts:resolve(run,'worker'),command,input:s.arm==='suffice'?JSON.stringify({prompt:prompt(tasks[s.task]),limits}):prompt(tasks[s.task]),privateRoots,gitMetadata:[resolve(base,'.git')],timeoutMs:limits.timeoutMs+10000});
  const es=await readEvents(resolve(run,'worker')),a=accountEvents(es),requests=es.filter(e=>e.type==='provider_request'),missing=requests.length!==a.assistantEvents||requests.length===0,unknown=a.unknown||missing||process.exitCode!==0||process.outputLimited;
  const identity=requests.length>0&&requests.every(e=>e.model==='gpt-6.1-sol'&&e.reasoning?.effort==='low')&&es.filter(e=>e.type==='assistant').every(e=>e.model==='gpt-6.1-sol');
  const patch=await patchFrom(actor,base);await save(resolve(run,'patch.json'),patch);await writeFile(resolve(run,'tracked.patch'),git(actor,'diff','--binary','HEAD'));
  const graded=await gradeWorkspace(s.task,'attempt-'+s.id,patch),native=await nativeGrade(graded,s.task,resolve(run,'native-grade')),acceptance=await independentGrade(graded,s.task,resolve(run,'acceptance'));
  const control=(await json(resolve(REPORT,'validation.json'))).checks.find(c=>c.label===s.task+'-before'),allowedFailures=new Set((control.native.failures??[]).map(f=>f.title));
  const regressions=native.valid&&native.stats.tests===control.native.stats.tests&&native.stats.pending===control.native.stats.pending&&(native.failures??[]).every(f=>allowedFailures.has(f.title))&&(s.task!=='l01'||native.buildAndLint.passed);
  const accepted=identity&&acceptance.passed&&regressions,turns=a.assistantEvents,calls=es.filter(e=>e.type==='tool_call').length,eligible=!unknown&&a.usage.estimatedApiUsd<=limits.maxCostUsd&&turns<=limits.maxTurns&&calls<=limits.maxCalls&&process.latencyMs<=limits.timeoutMs;
  let sfWorker;try{if(s.arm==='suffice')sfWorker=await json(resolve(run,'worker/worker.json'));}catch{}
  const stop=es.find(e=>e.type==='benchmark_stop'),last=es.filter(e=>e.type==='assistant').at(-1),status=process.exitCode!==0?'operational_failure':sfWorker?.status??stop?.reason??(!last?'startup_error':['error','aborted'].includes(last?.stopReason)?'provider_error':'completed');
  const result={...s,status,accepted,budgetEligible:eligible,success:accepted&&eligible,identity,usage:a.usage,knownEstimatedUsd:a.usage.estimatedApiUsd,totalEstimatedUsd:unknown?null:a.usage.estimatedApiUsd,requests:requests.length,assistantEvents:a.assistantEvents,missingReceipt:missing,turns,calls,latencyMs:process.latencyMs,native,acceptance,regressions,patchPaths:patch.map(p=>p.path),codingFailure:status==='completed'&&!accepted,toolingOrOperationalFailure:status!=='completed',notes:s.task==='l01'?['Low recent upstream activity; independent performance and original priority/weight semantics required.']:['Pre-existing native failure identities retained; no exact exception-string requirements.']};
  await save(resolve(run,'result.json'),result);console.log(JSON.stringify({event:'end',...s,accepted,eligible,cost:result.totalEstimatedUsd,status}));if(unknown)break;
 }}finally{await (await import('node:fs/promises')).unlink(lock);}
}else if(mode==='report'){
 await frozen();const results=await rows(),historical={};for(const arm of ['suffice','stock-pi']){const selected=results.filter(r=>r.task==='h02'&&r.arm===arm),accepted=selected.filter(r=>r.accepted).length,unknown=selected.some(r=>r.totalEstimatedUsd===null),known=selected.reduce((n,r)=>n+r.knownEstimatedUsd,0);historical[arm]={attempts:selected.length,accepted,budgetEligibleSuccesses:selected.filter(r=>r.success).length,knownEstimatedUsd:known,totalEstimatedUsd:unknown?null:known,costPerAccepted:unknown||!accepted?null:known/accepted};}
 await save(resolve(REPORT,'results.json'),{at:new Date().toISOString(),configuration:'suffice-general-v1',scheduleComplete:results.length===schedule.length,historical,rows:results,knownEstimatedUsd:results.reduce((n,r)=>n+r.knownEstimatedUsd,0),unknownCosts:results.filter(r=>r.totalEstimatedUsd===null).length,claims:{prior28_9Transfers:false,broadSuperiority:false,capabilityImprovement:false},scope:'One historical pair and one live Suffice attempt; descriptive pilot only. Engineering/setup inference excluded; estimates are API-equivalent, not subscription spending.'});console.log(JSON.stringify({historical,attempts:results.length}));
}else throw new Error('validate|freeze|run --resume|report');
