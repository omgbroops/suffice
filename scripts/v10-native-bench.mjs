import {readFile,writeFile,mkdir,readdir,mkdtemp,realpath} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {executeV10} from '../src/v10/controller.mjs';
import {normalizeRequest,MODELS,EFFORTS} from '../src/v10/config.mjs';
import {inspectPi,piIdentity} from '../src/v10/pi.mjs';
import {createNativeAdapter,inspectNative,DEFAULT_NATIVE_BIN} from '../src/bench/native-codex.mjs';
import {captureTree,writeTree,treeHash,hash,gitRoot,protectedFiles,enforceChecks,inside} from '../src/v9/workspace.mjs';
import {runProcess} from '../src/v9/process.mjs';
import {runPublicCheck,verificationState} from '../src/v9/checks.mjs';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const save=(p,v,exclusive=false)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:exclusive?'wx':'w',mode:0o600});
const initGit=async cwd=>{const p=await runProcess('git',['init','--quiet'],{cwd,timeoutMs:10000});if(p.exitCode!==0)throw Error('Task Git initialization failed');};

export function pairedSchedule(tasks,seed=20261023){
 let state=seed>>>0;const random=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;
 const ordered=[...tasks];for(let i=ordered.length-1;i>0;i--){const j=random()%(i+1);[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}
 return ordered.flatMap(t=>(random()%2?['native','v10']:['v10','native']).map(strategy=>({id:t.id+'-r1-'+strategy,taskId:t.id,strategy,repeat:1})));
}
async function runtimeFiles(){
 const paths=[];for(const folder of ['src/v10','src/v9','src/bench'])for(const name of (await readdir(join(project,folder))).filter(p=>p.endsWith('.mjs')).sort())paths.push(folder+'/'+name);
 paths.push('src/runtime.mjs','src/workspace.mjs','src/symbol-navigation.mjs','src/tool-observations.mjs','package.json','package-lock.json','scripts/v10-native-bench.mjs','scripts/v10-native-fixtures.mjs','scripts/v10-native-grade.mjs');
 const entries=[];for(const path of paths)entries.push([path,hash(await readFile(join(project,path)))]);return entries;
}
export async function planComparison(manifestPath,planDir,{seed=20261023,timeoutMs=600000,nativeBin=DEFAULT_NATIVE_BIN}={}){
 const manifest=await read(manifestPath),base=dirname(resolve(manifestPath));planDir=resolve(planDir);
 if(!Array.isArray(manifest.tasks)||manifest.tasks.length!==15||new Set(manifest.tasks.map(t=>t.id)).size!==15)throw Error('This comparison requires exactly 15 distinct public tasks');
 if(!Number.isInteger(seed)||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw Error('Invalid seed/deadline');
 if(!(await inspectPi()).ready)throw Error('Pi sign-in/model preflight failed');
 const native=await inspectNative(nativeBin);if(!native.ready)throw Error(native.error);
 await mkdir(planDir,{recursive:true});const tasks=[];
 for(const t of manifest.tasks){
  if(!/^[a-zA-Z0-9_-]{1,60}$/.test(t.id))throw Error('Invalid task ID');
  const source=await gitRoot(resolve(base,t.workspace));if(inside(source,planDir))throw Error('Plan is inside public task source');
  const r=normalizeRequest({workspace:source,prompt:t.prompt,runDir:join(planDir,'unused'),checks:t.checks,protectedPaths:t.protectedPaths,contextPaths:t.contextPaths,maxCostUsd:Number.MAX_VALUE,timeoutMs});
  const original=await captureTree(source,{includeIgnored:true}),immutablePaths=t.immutablePaths??t.protectedPaths;
  if(!Array.isArray(immutablePaths)||immutablePaths.some(p=>!original.has(p)))throw Error('Invalid immutable original paths');
  const inputDir=join(planDir,'inputs',t.id);await writeTree(inputDir,original);await initGit(inputDir);
  tasks.push({id:t.id,source,inputDir,sourceHash:treeHash(original),prompt:r.prompt,checks:r.checks,protectedPaths:r.protectedPaths,immutablePaths,contextPaths:r.contextPaths,provenance:t.provenance??null});
 }
 const pricing=await read(join(base,'pricing.json')),files=await runtimeFiles();
 const actorRoot=await realpath(await mkdtemp(join(tmpdir(),'suffice-native15-')));
 const p={version:'v10-native-comparison-1',id:manifest.id,createdAt:new Date().toISOString(),label:'15 historical JS/TS development replays across six repositories; one paired repetition, not held-out efficacy evidence',seed,timeoutMs,monetaryCap:null,maxCostUsd:Number.MAX_VALUE,concurrency:2,actorRoot,nativeSandbox:'danger-full-access',models:{...MODELS,native:'gpt-6.1-sol'},efforts:{...EFFORTS,native:'high'},compactResponses:false,tasks,schedule:pairedSchedule(tasks,seed),node:process.versions.node,pi:await piIdentity(),native,pricing,runtimeFiles:files,runtimeHash:hash(JSON.stringify(files)),
  limits:'Same wall deadline per attempt. V10 retains its pinned per-stage 24-turn/80-tool limits and conservative context bound; native uses its own loop. No equal-compute claim.',
  grading:'External fixed graders are frozen separately, never passed to either actor; they load/run only after all attempts close. No private-feedback retries. Temp workspaces reduce accidental access but are not OS evaluator secrecy.'};
 p.fingerprint=hash(JSON.stringify(p));await save(join(planDir,'plan.json'),p,true);
 const {freezeEvaluators}=await import('./v10-native-grade.mjs');await freezeEvaluators(planDir);
 return p;
}
export async function verifyComparison(planDir){
 const p=await read(join(planDir,'plan.json')),{fingerprint,...body}=p;
 if(hash(JSON.stringify(body))!==fingerprint||process.versions.node!==p.node||JSON.stringify(await runtimeFiles())!==JSON.stringify(p.runtimeFiles))throw Error('Frozen plan/runtime changed');
 if(hash(await readFile(p.native.binary.path))!==p.native.binary.sha256)throw Error('Native executable changed');
 if(JSON.stringify(await piIdentity())!==JSON.stringify(p.pi))throw Error('Pi runtime changed');
 for(const t of p.tasks)if(treeHash(await captureTree(t.inputDir,{includeIgnored:true}))!==t.sourceHash)throw Error('Frozen task input changed: '+t.id);
 const freeze=await read(join(planDir,'grading-freeze.json'));
 if(freeze.planFingerprint!==p.fingerprint||freeze.planSha256!==hash(await readFile(join(planDir,'plan.json'))))throw Error('Evaluator freeze does not bind this plan');
 for(const f of [...freeze.sourceFiles,...freeze.entries.map(e=>({path:e.frozenPath,sha256:e.sha256})),...freeze.entries.map(e=>({path:e.acceptancePath,sha256:e.sha256}))])if(hash(await readFile(f.path))!==f.sha256)throw Error('Frozen evaluator changed');
 return p;
}
export async function finishSource({workspace,original,immutablePaths,snapshot}){
 const protectedTree=protectedFiles(original,immutablePaths),violations=await enforceChecks(workspace,original,protectedTree);
 const tree=await captureTree(workspace,{includeIgnored:true});await writeTree(snapshot,tree);await initGit(snapshot);
 return {violations,sourceHash:treeHash(tree),snapshot};
}
const timeoutCause=result=>result.status==='timeout'||result.process?.timedOut||result.stages?.some(s=>s.status==='timeout'||s.error?.includes('Task deadline reached'))||result.notes?.some(n=>/deadline|timeout/i.test(n.error??''));
export async function runComparison(planDir,{execute=executeV10,nativeCall}={}){
 planDir=resolve(planDir);const p=await verifyComparison(planDir);
 const gradingFreezeSha256=hash(await readFile(join(planDir,'grading-freeze.json')));
 await save(join(planDir,'execution-started.json'),{at:new Date().toISOString(),planFingerprint:p.fingerprint,gradingFreezeSha256},true);
 const callNative=nativeCall??createNativeAdapter({bin:p.native.binary.path,pricing:p.pricing.models[p.models.native]});
 const attempts=new Array(p.schedule.length);let next=0;
 async function attempt(item){
  const start=Date.now(),task=p.tasks.find(t=>t.id===item.taskId),attemptDir=join(planDir,'attempts',item.id),receipts=join(attemptDir,'receipts'),workspace=join(p.actorRoot,item.id);
  let result,original,inferenceStarted=false,closureError=null,finalized,publicChecks=[],actorStartedAt;
  try{
   original=await captureTree(task.inputDir,{includeIgnored:true});await writeTree(workspace,original);await initGit(workspace);await mkdir(receipts,{recursive:true});
   if(treeHash(await captureTree(workspace,{includeIgnored:true}))!==task.sourceHash)throw Error('Actor original source mismatch');
   inferenceStarted=true;actorStartedAt=Date.now();
   result=item.strategy==='v10'?await execute({workspace,prompt:task.prompt,runDir:join(receipts,'actor'),strategy:'v10',maxCostUsd:Number.MAX_VALUE,timeoutMs:p.timeoutMs,checks:task.checks,protectedPaths:task.protectedPaths,contextPaths:task.contextPaths,compactResponses:p.compactResponses,models:MODELS,efforts:EFFORTS}):await callNative({role:'implement',workspace,prompt:task.prompt,runDir:join(receipts,'actor'),model:p.models.native,effort:p.efforts.native,sandbox:p.nativeSandbox,maxCostUsd:Number.MAX_VALUE,timeoutMs:p.timeoutMs});
  }catch(error){result={status:'operational_failure',error:error.message,costKnown:!inferenceStarted,costUsd:inferenceStarted?null:0,knownCostFloorUsd:0};}
  const actorEndedAt=Date.now(),deadlineExceeded=Boolean(actorStartedAt&&actorEndedAt-actorStartedAt>p.timeoutMs);
  try{
   if(original){
    const raw=await captureTree(workspace,{includeIgnored:true});await writeTree(join(receipts,'raw-source'),raw);
    const precheckViolations=await enforceChecks(workspace,original,protectedFiles(original,task.immutablePaths));
    for(const check of task.checks)publicChecks.push(await runPublicCheck({workspace,check,timeoutMs:60000}));
    finalized=await finishSource({workspace,original,immutablePaths:task.immutablePaths,snapshot:join(receipts,'final-source')});
    finalized.violations=[...new Set([...precheckViolations,...finalized.violations])];
   }
  }catch(error){closureError=error.message;}
  const publicVerification=verificationState(publicChecks),internalViolations=result.notes?.filter(n=>n.kind==='protected_checks_restored')??[],violations=finalized?.violations??[];
  const rawStatus=result.status,status=closureError?'closure_failure':rawStatus==='completed'&&publicVerification!=='passed'?'verification_failed':rawStatus;
  const row={...item,workspace,status,actorStatus:rawStatus,publicVerification,publicChecks,protectionViolations:violations,internalProtectionViolations:internalViolations,closureError,
   costKnown:result.costKnown===true,costUsd:result.costKnown?result.costUsd:null,knownCostFloorUsd:result.knownCostFloorUsd??0,usage:result.usage??{},model:item.strategy==='native'?p.models.native:p.models.worker,
   repairs:result.repairs??0,takeovers:result.takeovers??0,actorLatencyMs:result.latencyMs??null,latencyMs:Date.now()-start,deadlineExceeded,timedOut:deadlineExceeded||Boolean(timeoutCause(result)),sourceHash:finalized?.sourceHash??null,snapshot:finalized?.snapshot??null,
   policyValid:status==='completed'&&!closureError&&publicVerification==='passed'&&!violations.length&&!internalViolations.length&&result.latencyMs<=p.timeoutMs,
   actorResultPath:join(receipts,'actor-result.json')};
  await mkdir(receipts,{recursive:true});await save(row.actorResultPath,result,true);await save(join(attemptDir,'attempt.json'),row,true);return row;
 }
 async function lane(){for(;;){const index=next++;if(index>=p.schedule.length)return;const row=await attempt(p.schedule[index]);attempts[index]=row;const progress={planFingerprint:p.fingerprint,attempts:attempts.filter(Boolean),completed:attempts.filter(Boolean).length,at:new Date().toISOString()};await save(join(planDir,`progress-${index}.json`),progress,true);console.log(JSON.stringify({completed:progress.completed,total:p.schedule.length,id:row.id,status:row.status,publicVerification:row.publicVerification,costUsd:row.costUsd,costKnown:row.costKnown}));}}
 await Promise.all([lane(),lane()]);
 const e={planFingerprint:p.fingerprint,gradingFreezeSha256,attempts,closed:true,at:new Date().toISOString(),costKnown:attempts.every(a=>a.costKnown),knownCostFloorUsd:attempts.reduce((n,a)=>n+(a.costKnown?a.costUsd:a.knownCostFloorUsd),0)};
 await save(join(planDir,'execution-complete.json'),e,true);return e;
}
export function summarizeComparison(execution,grading={grades:[]}){
 const arms=['v10','native'].map(strategy=>{
  const rows=execution.attempts.filter(a=>a.strategy===strategy),grades=grading.grades.filter(g=>rows.some(r=>r.id===g.id)),accepted=grades.filter(g=>g.accepted===true).length;
  const knownCostFloorUsd=rows.reduce((n,r)=>n+(r.costKnown?r.costUsd:r.knownCostFloorUsd??0),0),costKnown=rows.every(r=>r.costKnown);
  return {strategy,scheduled:rows.length,accepted,graded:grades.filter(g=>typeof g.accepted==='boolean').length,policyValidAccepted:grades.filter(g=>g.accepted&&rows.find(r=>r.id===g.id).policyValid).length,operationalFailures:rows.filter(r=>!['completed','verification_failed','unverified'].includes(r.status)).length,timeouts:rows.filter(r=>r.timedOut).length,unknownCosts:rows.filter(r=>!r.costKnown).length,costKnown,costUsd:costKnown?knownCostFloorUsd:null,knownCostFloorUsd,costPerAcceptedUsd:accepted&&costKnown?knownCostFloorUsd/accepted:null,meanLatencyMs:rows.length?rows.reduce((n,r)=>n+r.latencyMs,0)/rows.length:null,takeovers:rows.reduce((n,r)=>n+r.takeovers,0),repairs:rows.reduce((n,r)=>n+r.repairs,0)};
 });
 const tasks=[...new Set(execution.attempts.map(a=>a.taskId))],paired={bothPass:0,v10Only:0,nativeOnly:0,bothFail:0,ungraded:0};
 for(const id of tasks){const verdict=strategy=>{const row=execution.attempts.find(a=>a.taskId===id&&a.strategy===strategy);return grading.grades.find(g=>g.id===row?.id)?.accepted;};const a=verdict('v10'),b=verdict('native');if(typeof a!=='boolean'||typeof b!=='boolean')paired.ungraded++;else paired[a&&b?'bothPass':a?'v10Only':b?'nativeOnly':'bothFail']++;}
 return {arms,paired};
}
async function main(){
 const [mode,a,b]=process.argv.slice(2);if(mode==='plan'&&a&&b){const p=await planComparison(a,b);console.log(JSON.stringify({plan:resolve(b),attempts:p.schedule.length,actorRoot:p.actorRoot,runtimeHash:p.runtimeHash}));}
 else if(mode==='run'&&a){const e=await runComparison(a);console.log(JSON.stringify({closed:e.closed,attempts:e.attempts.length,costKnown:e.costKnown,knownCostFloorUsd:e.knownCostFloorUsd}));}
 else if(mode==='grade'&&a){const {gradeComparison}=await import('./v10-native-grade.mjs');const g=await gradeComparison(resolve(a));console.log(JSON.stringify(g));}
 else if(mode==='report'&&a){const e=await read(join(a,'execution-complete.json'));let g;try{g=await read(join(a,'grades.json'));}catch{}const s=summarizeComparison(e,g);await save(join(a,'summary.json'),s);console.log(JSON.stringify(s,null,2));}
 else throw Error('Usage: v10-native-bench.mjs plan <public-tasks.json> <new-plan-dir> | run <plan-dir> | grade <plan-dir> | report <plan-dir>');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.stack??e.message);process.exitCode=1;});
