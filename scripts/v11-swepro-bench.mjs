// V11/native SWEPro V2 orchestration. All actors close before any candidate
// verifier is invoked. Credentials are copied opaquely from a closed campaign.
import {readFile,writeFile,mkdir,access,copyFile,readdir,lstat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {hash} from '../src/v9/workspace.mjs';
import {runBox,closeRelay} from './v11-poly27-bench.mjs';
import {runtimeFiles} from './v11-swepro-build.mjs';
import {docker,save,upstreamTasks,verifiedTask,UPSTREAM_COMMIT,SEED} from './v11-swepro-prepare.mjs';
import {runVerifierWithRetries,assertClosedCohort,availablePatch,verifyClosedRoot,evidenceInventory,cachedGrade,verifierRetryCount} from './v11-swepro-grade.mjs';
import {summarizeCohort} from './v11-poly27-evaluate.mjs';
import {CANARY_ID,CANARY_PROMPT} from './v11-swepro-container-entry.mjs';

const project=resolve(import.meta.dirname,'..'),read=async path=>JSON.parse(await readFile(path,'utf8'));
const digest=async path=>hash(await readFile(path));
const successful=r=>r.exitCode===0&&!r.error&&!r.timedOut&&!r.overflow&&!r.aborted;
export function sweDockerArgs(args,{sourceWorkspace,taskName,mode}={}){
  const out=args.map(x=>x==='com.suffice.benchmark=v11-poly27-locked-20261023'?'com.suffice.benchmark=v11-swepro-v2':x);
  if(out[0]==='create'){const cpu=out.indexOf('--cpus'),memory=out.indexOf('--memory');if(cpu<0||memory<0)throw Error('Missing actor resource limits');out[cpu+1]='1';out[memory+1]='4g';if(mode==='canary'){if(out.at(-1)!=='run')throw Error('Unexpected canary entry mode');out[out.length-1]='canary';}}
  if(out[0]==='cp'&&sourceWorkspace&&taskName&&out[1]?.endsWith(':/work/'+taskName)){
    if(!['/app','/testbed','/tmp/'+CANARY_ID].includes(sourceWorkspace)||!/^[A-Za-z0-9_.-]+$/.test(taskName))throw Error('Unsafe SWEPro partial-source fallback');
    out[1]=out[1].slice(0,out[1].indexOf(':/work/'))+':'+sourceWorkspace;
  }
  return out;
}
async function sweDocker(args,options={},source={}){
  // Source/git-history inspection is setup, outside the 50-minute actor budget.
  if(args[0]==='start'&&options.timeoutMs===120_000)options={...options,timeoutMs:600_000};
  const effective=sweDockerArgs(args,source);
  if(args[0]==='create'&&source.evidenceDirectory)await save(join(source.evidenceDirectory,'effective-container-args.json'),{at:new Date().toISOString(),args:effective});
  return docker(effective,options);
}
async function notStarted(root){try{await access(join(root,'execution-started.json'));throw Error('Cannot mutate SWEPro setup after actors start');}catch(e){if(e.code!=='ENOENT')throw e;}}
export function assertCompletedOrigin(execution){
  if(execution?.closed!==true||execution.attempts?.length!==54||new Set(execution.attempts.map(x=>x.id)).size!==54||!['v11','native'].every(s=>execution.attempts.filter(x=>x.strategy===s).length===27)||execution.attempts.some(x=>x.cleanup?.safeToContinue!==true||x.cleanup?.removed!==true)||execution.relayCleanup?.removed!==true)throw Error('The prior27 campaign must be closed before SWEPro authentication clients can start');
}
async function credentialsFromCompleted(root,origin){
  const execution=await read(join(origin,'execution-complete.json'));assertCompletedOrigin(execution);
  const plan=await read(join(origin,'plan.json'));if(execution.planFingerprint!==plan.fingerprint||execution.planSha256!==await digest(join(origin,'plan.json')))throw Error('Prior27 closure is not bound to its frozen plan');
  const stores={};for(const strategy of['v11','native']){const target=join(root,'private-auth',strategy,'auth.json');await mkdir(dirname(target),{recursive:true});try{await access(target);}catch(e){if(e.code!=='ENOENT')throw e;await copyFile(join(origin,'private-auth',strategy,'auth.json'),target,1);}stores[strategy]=target;}
  return stores;
}
async function relay(image,directory){
  await mkdir(directory,{recursive:true});const name='suffice-swepro-relay-'+randomBytes(7).toString('hex');
  await docker(['run','--detach','--name',name,'--label','com.suffice.benchmark=v11-swepro-v2','--network','bridge','--cap-drop','ALL','--security-opt','no-new-privileges','--read-only','--entrypoint','node',image,'/opt/suffice/scripts/poly27-proxy.mjs']);
  return{name,close:()=>closeRelay({name,directory,dockerRun:docker})};
}
export async function inspectActors(root,origin){
  root=resolve(root);origin=resolve(origin);await notStarted(root);
  const images=await read(join(root,'actor-images.json'));if(!images.complete||images.tasks?.length!==8)throw Error('Eight actor overlays must be built before inspection');
  const stores=await credentialsFromCompleted(root,origin),directory=join(root,'inspections','run-'+Date.now()),proxy=await relay(images.runtimeImage,join(directory,'relay')),results=[];let cleanup;
  try{for(const task of images.tasks){
    const evidenceDirectory=join(directory,task.id),out=await runBox({image:task.actorImage,proxy,directory:evidenceDirectory,inspect:true,authStores:stores,dockerRun:(args,options)=>sweDocker(args,options,{evidenceDirectory})});
    const ready=out.ready&&out.source?.ready&&out.source.id===task.id&&out.source.sourceHash===task.publicTask.sourceHash;
    results.push({id:task.id,actorImage:task.actorImage,...out,ready});if(!ready)throw Error('Public source, model or isolation gate failed for '+task.id);
  }}finally{cleanup=await proxy.close();await save(join(directory,'relay','cleanup.json'),cleanup);await save(join(root,'inspection.json'),{at:new Date().toISOString(),ready:results.length===8&&results.every(x=>x.ready)&&cleanup.removed,origin,runtimeImage:images.runtimeImage,tasks:results,relayCleanup:cleanup,evidenceDirectory:directory});}
  return{ready:results.length===8&&results.every(x=>x.ready)&&cleanup.removed,tasks:results};
}
export function successfulCanary(result){return result?.status==='completed'&&result.sourceSealed===true&&result.canaryPassed===true&&result.costKnown===true&&Number.isFinite(result.costUsd)&&result.costUsd>=0&&result.cleanup?.safeToContinue===true&&result.cleanup?.removed===true&&result.cleanup?.authSync?.status==='updated';}
export function canarySetupAccounting(runs){
  const known=runs.length>0&&runs.every(x=>x?.setupCostKnown===true&&Number.isFinite(x.setupCostUsd)&&x.setupCostUsd>=0);
  const floor=runs.reduce((n,x)=>n+(x?.setupCostKnown===true&&Number.isFinite(x.setupCostUsd)&&x.setupCostUsd>=0?x.setupCostUsd:Number.isFinite(x?.setupKnownCostFloorUsd)&&x.setupKnownCostFloorUsd>=0?x.setupKnownCostFloorUsd:0),0);
  return{known,costUsd:known?floor:null,knownCostFloorUsd:floor};
}
async function canaryRuns(root){
  const base=join(root,'canaries'),rows=[];
  for(const entry of(await readdir(base,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(!entry.isDirectory()||!/^run-\d+$/.test(entry.name))throw Error('Unexpected canary evidence directory');
    const directory=join(base,entry.name);let receipt;try{receipt=await read(join(directory,'model-canary-run.json'));}catch(e){if(e.code!=='ENOENT')throw e;receipt={setupCostKnown:false,setupCostUsd:null,setupKnownCostFloorUsd:0,reason:'Interrupted canary run without final usage receipt'};}
    rows.push({directory,...receipt});
  }
  return rows;
}
export async function modelCanaries(root){
  root=resolve(root);await notStarted(root);const images=await read(join(root,'actor-images.json')),inspection=await read(join(root,'inspection.json'));
  if(!images.complete||images.tasks?.length!==8||!inspection.ready)throw Error('All8 local runtime/source/model/isolation inspections must pass before paid canaries');
  const stores=await credentialsFromCompleted(root,inspection.origin),base=join(root,'canaries','run-'+Date.now()),empty=join(base,'empty-input');await mkdir(empty,{recursive:true});
  const proxy=await relay(images.runtimeImage,join(base,'relay')),results=[];let cleanup,failure,dispatchFailure=false;
  try{for(const strategy of['native','v11']){
    const directory=join(base,strategy),task={id:CANARY_ID,taskId:CANARY_ID,name:CANARY_ID,lang:'python',prompt:CANARY_PROMPT,solutionFiles:['identity.py'],actorFiles:[],immutablePaths:[],workspace:empty};
    let result;try{result=await runBox({image:images.tasks[0].actorImage,proxy,directory,task,strategy,timeoutMs:300_000,pricing:inspection.tasks[0].pricing,authStores:stores,
      dockerRun:(args,options)=>sweDocker(args,options,{sourceWorkspace:'/tmp/'+CANARY_ID,taskName:CANARY_ID,mode:'canary',evidenceDirectory:directory})});}catch(e){dispatchFailure=true;throw e;}
    results.push({strategy,passed:successfulCanary(result),directory,result});await save(join(directory,'canary-result.json'),results.at(-1));if(!results.at(-1).passed)throw Error('Discarded public model/tool canary failed before official SWEPro actors');
  }}catch(e){failure=e;}
  finally{cleanup=await proxy.close();await save(join(base,'relay','cleanup.json'),cleanup);}
  const known=!dispatchFailure&&results.every(x=>x.result.costKnown===true&&Number.isFinite(x.result.costUsd)&&x.result.costUsd>=0);
  const floor=results.reduce((n,x)=>n+(x.result.costKnown&&Number.isFinite(x.result.costUsd)?x.result.costUsd:Number.isFinite(x.result.knownCostFloorUsd)?x.result.knownCostFloorUsd:0),0);
  const current={at:new Date().toISOString(),passed:!failure&&results.length===2&&results.every(x=>x.passed)&&cleanup.removed,actorImage:images.tasks[0].actorImage,runtimeImage:images.runtimeImage,publicPromptSha256:hash(CANARY_PROMPT),results,relayCleanup:cleanup,setupCostKnown:known,setupCostUsd:known?floor:null,setupKnownCostFloorUsd:floor,evidenceDirectory:base};
  await save(join(base,'model-canary-run.json'),current);const runs=await canaryRuns(root),total=canarySetupAccounting(runs);
  const value={...current,setupRuns:runs.map(x=>({directory:x.directory,setupCostKnown:x.setupCostKnown,setupCostUsd:x.setupCostUsd,setupKnownCostFloorUsd:x.setupKnownCostFloorUsd})),setupCostKnown:total.known,setupCostUsd:total.costUsd,setupKnownCostFloorUsd:total.knownCostFloorUsd};
  await save(join(root,'model-canaries.json'),value);if(failure)throw failure;if(!value.passed)throw Error('Canary relay closure failed');return value;
}
export function schedule(tasks){
  return tasks.flatMap(task=>(parseInt(hash(SEED+'\0arm\0'+task.id).slice(0,8),16)%2?['native','v11']:['v11','native']).map(strategy=>({id:task.id+'-r1-'+strategy,taskId:task.id,strategy,repeat:1})));
}
export async function runSerialSchedule(items,work,record=async()=>{}){
  const attempts=[];
  for(const item of items){
    const row=await work(item);attempts.push(row);await record(row,[...attempts]);
    if(row.cleanup?.safeToContinue!==true||row.cleanup?.removed!==true)return{attempts,halted:true};
  }
  return{attempts,halted:false};
}
export function publicActorTask(task,emptyDirectory){
  // runBox's public projection strips image/evaluator fields. Keep no gold- or
  // hidden-test-derived source paths, test lists, expected values or hints.
  return{id:task.id,taskId:task.id,name:task.id,lang:'swepro',prompt:task.instruction,solutionFiles:[],actorFiles:[],immutablePaths:[],workspace:emptyDirectory};
}
export function assertImageBinding(task){
  const binding=task.binding;
  if(!binding||binding.image!==task.actorImage||binding.codeSha256!==hash(JSON.stringify(binding.files))||JSON.stringify(binding.files?.map(x=>x.path))!==JSON.stringify(runtimeFiles))throw Error('Actor image code binding is incomplete or belongs to another image');
}
const hostFiles=['scripts/v11-swepro-prepare.mjs','scripts/v11-swepro-build.mjs','scripts/v11-swepro-container-entry.mjs','scripts/v11-swepro-bench.mjs','scripts/v11-swepro-grade.mjs','scripts/v11-poly27-evaluate.mjs','docs/V11-SWEBPRO.md'];
export async function freezePlan(root){
  root=resolve(root);await notStarted(root);
  const images=await read(join(root,'actor-images.json')),inspection=await read(join(root,'inspection.json')),validation=await read(join(root,'reference-validation.json')),
    eligibility=await read(join(root,'eligibility.json')),canaries=await read(join(root,'model-canaries.json'));
  if(!images.complete||images.tasks?.length!==8||!inspection.ready||inspection.tasks?.length!==8||!validation.valid||validation.tasks?.length!==8||!eligibility.complete||eligibility.selected?.length!==8)throw Error('All8 qualification, image, isolation, model and reference gates must pass');
  for(const rows of[images.tasks,inspection.tasks,validation.tasks,eligibility.selected])if(new Set(rows.map(x=>x.id)).size!==8)throw Error('Every prerequisite must cover eight distinct identical task IDs');
  if(!canaries.passed||canaries.results?.length!==2||!['v11','native'].every(s=>canaries.results.some(x=>x.strategy===s&&x.passed&&successfulCanary(x.result)))||canaries.actorImage!==images.tasks[0].actorImage||canaries.runtimeImage!==images.runtimeImage||canaries.publicPromptSha256!==hash(CANARY_PROMPT)||!canaries.relayCleanup.removed)throw Error('Both discarded public model/tool canaries must pass with known separate costs');
  if((await read(join(root,'reference-validation-started.json'))).eligibilitySha256!==await digest(join(root,'eligibility.json')))throw Error('Fixed task selection changed after reference validation started');
  const originPlan=await read(join(inspection.origin,'plan.json')),originExecution=await read(join(inspection.origin,'execution-complete.json'));assertCompletedOrigin(originExecution);
  if(images.runtimeImage!==originPlan.actorImage||images.tasks.some(x=>x.runtimeImage!==images.runtimeImage))throw Error('SWEPro must reuse the exact completed27 runtime image');
  const pinned=new Map(originPlan.runtimeFiles.map(x=>[resolve(x.path),x.sha256]));
  for(const[path,sha]of pinned)if(await digest(path)!==sha)throw Error('Completed27 runtime changed before SWE comparison');
  const runtimePaths=[...new Set([...pinned.keys(),...runtimeFiles.map(x=>join(project,x)),...hostFiles.map(x=>join(project,x))])].sort(),pinnedRuntime=await Promise.all(runtimePaths.map(async path=>({path,sha256:await digest(path)})));
  const upstream=await upstreamTasks(),evaluationFiles=[],tasks=[];
  const pricing=inspection.tasks[0].pricing;
  for(let i=0;i<images.tasks.length;i++){
    const image=images.tasks[i],row=eligibility.selected[i],observed=inspection.tasks.find(x=>x.id===image.id),reference=validation.tasks.find(x=>x.id===image.id);
    if(image.id!==row.id||image.verifierImage!==row.imageId||!observed?.ready||observed.actorImage!==image.actorImage||observed.source?.taskMetadataSha256!==image.publicTaskSha256||!reference?.valid||reference.gold.id!==image.id||reference.empty.id!==image.id||reference.gold.imageId!==image.verifierImage||reference.empty.imageId!==image.verifierImage||reference.gold.taskSha256!==image.taskSha256||reference.empty.taskSha256!==image.taskSha256||JSON.stringify(observed.pricing)!==JSON.stringify(pricing))throw Error('Mismatched task/model/reference gate');
    const task=await verifiedTask(upstream.upstream,image.id,upstream.expected);if(task.taskSha256!==image.taskSha256||task.instruction!==image.instruction)throw Error('Upstream task inputs changed');
    if(reference.gold.patchSha256!==await digest(join(task.directory,'solution/gold_patch.diff'))||reference.empty.patchSha256!==hash(''))throw Error('Reference patch receipts differ from pinned gold/empty patches');
    for(const purpose of['gold','empty']){
      const folder=join(root,'reference-validation',image.id,purpose);
      const expected={purpose,id:image.id,imageId:image.verifierImage,taskSha256:image.taskSha256,patchSha256:purpose==='gold'?await digest(join(task.directory,'solution/gold_patch.diff')):hash(''),closedCohortProofSha256:null,graderCodeSha256:await digest(join(project,'scripts/v11-swepro-grade.mjs')),timeoutMs:3000_000};
      const grade=await cachedGrade(folder,expected);if(JSON.stringify(grade)!==JSON.stringify(reference[purpose]))throw Error('Reference aggregate differs from authenticated verifier evidence');
      evaluationFiles.push({path:join(folder,'grade.json'),sha256:await digest(join(folder,'grade.json'))},...await evidenceInventory(folder));
    }
    for(const file of task.files)evaluationFiles.push({path:join(task.directory,file.path),sha256:file.sha256});
    assertImageBinding(image);for(const file of image.binding.files)if(await digest(join(project,file.path))!==file.sha256)throw Error('Actor image runtime differs from frozen source');
    tasks.push({...image,directory:task.directory,sourceHash:row.probe.core.sourceHash});
  }
  for(const name of['actor-images.json','inspection.json','model-canaries.json','reference-validation.json','reference-validation-started.json','eligibility.json','selection-rule.json'])evaluationFiles.push({path:join(root,name),sha256:await digest(join(root,name))});
  const setupRuns=await canaryRuns(root),setupCost=canarySetupAccounting(setupRuns);
  if(setupCost.known!==canaries.setupCostKnown||setupCost.costUsd!==canaries.setupCostUsd||setupCost.knownCostFloorUsd!==canaries.setupKnownCostFloorUsd)throw Error('Canary setup accounting differs from preserved run receipts');
  for(const row of setupRuns)for(const file of await evidenceInventory(row.directory))evaluationFiles.push(file);
  const emptyDirectory=join(root,'public-input');await mkdir(emptyDirectory,{recursive:true});if((await readdir(emptyDirectory)).length)throw Error('The actor public input mount must be empty; source comes from its image');
  const plan={version:'v11-swepro-v2-compatible8-1',at:new Date().toISOString(),upstreamCommit:UPSTREAM_COMMIT,cohort:'Eight publicly qualified compatible SWE-bench Pro V2 tasks; not the full642 score',
    origin:inspection.origin,originPlanSha256:await digest(join(inspection.origin,'plan.json')),runtimeImage:images.runtimeImage,tasks,pricing,timeoutMs:3000_000,resources:{cpus:1,memory:'4g'},
    monetaryCap:null,concurrency:1,setupCost:{known:canaries.setupCostKnown,costUsd:canaries.setupCostUsd,knownCostFloorUsd:canaries.setupKnownCostFloorUsd},maxVerifierInfrastructureRetries:2,actorUser:'root inside cap-dropped container, matching the original task toolchain environment',seed:SEED,schedule:schedule(tasks),runtimeFiles:pinnedRuntime,evaluationFiles,emptyDirectory};
  plan.fingerprint=hash(JSON.stringify(plan));await writeFile(join(root,'plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});return plan;
}
async function verifyPlan(root,plan){
  const{fingerprint,...body}=plan;if(hash(JSON.stringify(body))!==fingerprint)throw Error('Frozen SWEPro plan differs');
  if(plan.concurrency!==1||JSON.stringify(plan.schedule)!==JSON.stringify(schedule(plan.tasks)))throw Error('SWEPro actors must run serially in their frozen seeded pair order');
  for(const file of[...plan.runtimeFiles,...plan.evaluationFiles])if(await digest(file.path)!==file.sha256)throw Error('Frozen SWEPro input changed: '+file.path);
  if((await readdir(plan.emptyDirectory)).length)throw Error('Actor input mount must remain empty');
  for(const image of new Set([plan.runtimeImage,...plan.tasks.flatMap(x=>[x.actorImage,x.verifierImage])]))if((await docker(['image','inspect',image,'--format','{{.Id}}'])).stdout.trim()!==image)throw Error('Frozen immutable image is unavailable');
  return true;
}
export async function runCohort(root){
  root=resolve(root);const plan=await read(join(root,'plan.json'));await verifyPlan(root,plan);
  const stores=await credentialsFromCompleted(root,plan.origin),startedAt=new Date().toISOString();
  await writeFile(join(root,'execution-started.json'),JSON.stringify({at:startedAt,planFingerprint:plan.fingerprint,planSha256:await digest(join(root,'plan.json'))},null,2)+'\n',{flag:'wx'});
  const proxy=await relay(plan.runtimeImage,join(root,'execution-relay'));let outcome,relayCleanup,failure;let seenAttempts=[];
  try{outcome=await runSerialSchedule(plan.schedule,async item=>{
    const task=plan.tasks.find(x=>x.id===item.taskId),attemptPath=join(root,'attempts',item.id),began=Date.now();let result;
    try{result=await runBox({image:task.actorImage,proxy,directory:attemptPath,task:publicActorTask(task,plan.emptyDirectory),strategy:item.strategy,timeoutMs:plan.timeoutMs,pricing:plan.pricing,authStores:stores,
      dockerRun:(args,options)=>sweDocker(args,options,{sourceWorkspace:task.publicTask.workspace,taskName:task.id,evidenceDirectory:attemptPath})});}
    catch(e){result={status:'infrastructure_error',error:e.message,costKnown:false,costUsd:null,knownCostFloorUsd:0,cleanup:e.cleanup??{safeToContinue:false,errors:[{step:'unknown_closure',error:e.message}]}};}
    const patchPath=join(attemptPath,'patch.diff');let artifactStatus='missing',patchSha256=null;
    try{const info=await lstat(patchPath);if(!info.isFile()||info.isSymbolicLink())throw Error('Patch is not a regular file');patchSha256=await digest(patchPath);if(result.patchSha256&&result.patchSha256!==patchSha256)throw Error('Actor patch hash differs');artifactStatus='present';}
    catch(e){if(!['infrastructure_error','closure_failure','source_sealing_failure','operational_failure'].includes(result.status))result.status='source_sealing_failure';result.error=[result.error,e.code==='ENOENT'?'Sealed source patch unavailable':e.message].filter(Boolean).join('; ');}
    return{...result,...item,attemptPath,patchPath,artifactStatus,patchSha256,latencyMs:Date.now()-began,
      policyValid:result.status==='completed'&&result.sourceSealed===true&&result.cleanup?.safeToContinue===true&&!(result.protectionViolations??[]).length&&result.actorLatencyMs<=plan.timeoutMs};
  },async(row,attempts)=>{seenAttempts=[...attempts];await save(join(row.attemptPath,'scheduled-attempt.json'),row);await save(join(root,'progress-'+attempts.length+'.json'),{at:new Date().toISOString(),closed:false,attempts});console.log(JSON.stringify({completed:attempts.length,scheduled:16,id:row.id,status:row.status,costUsd:row.costUsd}));});}
  catch(e){failure=e;}
  finally{relayCleanup=await proxy.close();await save(join(root,'execution-relay','cleanup.json'),relayCleanup);}
  if(failure||outcome?.halted||!relayCleanup.removed){await save(join(root,'execution-halted.json'),{at:new Date().toISOString(),closed:false,error:failure?.message??null,attempts:outcome?.attempts??seenAttempts,relayCleanup});throw failure??Error('Unsafe actor or relay closure halted the SWEPro cohort');}
  await verifyPlan(root,plan);
  const execution={at:new Date().toISOString(),startedAt,closed:outcome.attempts.length===16,planFingerprint:plan.fingerprint,planSha256:await digest(join(root,'plan.json')),
    attempts:plan.schedule.map(s=>outcome.attempts.find(x=>x.id===s.id)),relayCleanup};
  assertClosedCohort(execution);await writeFile(join(root,'execution-complete.json'),JSON.stringify(execution,null,2)+'\n',{flag:'wx'});return execution;
}
export async function gradeCohort(root){
  root=resolve(root);const authenticated=await verifyClosedRoot(root),{plan,execution}=authenticated;await verifyPlan(root,plan);assertClosedCohort(execution);
  if(execution.planFingerprint!==plan.fingerprint||execution.planSha256!==await digest(join(root,'plan.json'))||execution.attempts.some(x=>!plan.schedule.some(s=>s.id===x.id&&s.taskId===x.taskId&&s.strategy===x.strategy)))throw Error('Execution does not belong to the frozen SWEPro plan');
  const grades=[];
  for(const attempt of execution.attempts){
    const task=plan.tasks.find(x=>x.id===attempt.taskId),directory=join(root,'candidate-grades',attempt.id);
    const grade=!availablePatch(attempt)||attempt.sourceSealed!==true?{id:task.id,purpose:'candidate',kind:'ungraded_infrastructure_failure',pass:false,rawOfficialPass:null,reason:'Complete sealed source unavailable'}:
      await runVerifierWithRetries(root,{task:{...task,imageId:task.verifierImage},patchPath:attempt.patchPath,directory,purpose:'candidate',cohortRoot:root,attemptId:attempt.id});
    grades.push({...grade,attemptId:attempt.id,strategy:attempt.strategy,policyValid:attempt.policyValid,verifierRetries:await verifierRetryCount(root,directory)});await save(join(root,'grades.json'),{at:new Date().toISOString(),complete:grades.length===16,grades});
    console.log(JSON.stringify({graded:grades.length,id:attempt.id,kind:grade.kind}));
  }
  if((await verifyClosedRoot(root)).proofSha256!==authenticated.proofSha256)throw Error('Cohort evidence changed while grading');
  const metrics=summarizeCohort(execution,grades.map(x=>({id:x.attemptId,accepted:x.kind==='pass'?true:['test_fail','patch_apply_failed'].includes(x.kind)?false:null})));
  const official=Object.fromEntries(['v11','native'].map(strategy=>{const rows=grades.filter(x=>x.strategy===strategy);return[strategy,{tasks:8,resolved:rows.filter(x=>x.rawOfficialPass===true).length,missingOfficialResult:rows.filter(x=>x.rawOfficialPass===null||x.rawOfficialPass===undefined).length,incomplete:rows.filter(x=>x.kind==='incomplete_verification').length,verifierRetries:rows.reduce((n,x)=>n+x.verifierRetries,0)}];}));
  const summary={at:new Date().toISOString(),cohort:plan.cohort,upstreamCommit:UPSTREAM_COMMIT,planFingerprint:plan.fingerprint,complete:true,setupCost:plan.setupCost,...metrics,official};await save(join(root,'summary.json'),summary);return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const[mode,root,origin]=process.argv.slice(2),action=mode==='inspect'?inspectActors(root,origin):mode==='canaries'?modelCanaries(root):mode==='plan'?freezePlan(root):mode==='run'?runCohort(root):mode==='grade'?gradeCohort(root):Promise.reject(Error('Expected inspect <root> <closed27root> | canaries|plan|run|grade <root>'));
  action.then(r=>console.log(JSON.stringify({ready:r.ready,closed:r.closed,fingerprint:r.fingerprint,complete:r.complete}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
}
