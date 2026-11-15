import {readFile,writeFile,mkdir,cp,rm,statfs} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createRuntime,stateDir,root} from '../src/runtime.mjs';
import {realTasks,repository,baseRevision} from '../benchmarks/real/tasks.mjs';
import {REAL_ARMS,parseReview,aggregatePhases,reviewEligible,phaseCompletion,escalationNeeded} from '../src/real-policy.mjs';
import {runRealAgent,sourceSnapshot} from '../src/real-agent.mjs';
import {filesIn,hash,runNodeTests} from '../src/workspace.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return i<0?[s,true]:[s.slice(0,i),s.slice(i+1)];}));
const campaign=args['--campaign'];if(!/^[a-zA-Z0-9_-]+$/.test(campaign??''))throw new Error('Unique --campaign required');
const chosen=String(args['--arms']??REAL_ARMS.map(a=>a.id).join(',')).split(',');if(chosen.some(a=>!REAL_ARMS.some(v=>v.id===a)))throw new Error('Unknown arm');
const arms=chosen.map(a=>REAL_ARMS.find(v=>v.id===a)),tasks=realTasks.filter(t=>!args['--task']||t.id===args['--task']);
const reps=Number(args['--repetitions']??2);if(!Number.isInteger(reps)||reps<1||reps>3||!tasks.length)throw new Error('Invalid selection');
const schedule=[];for(let r=0;r<reps;r++)for(const [i,t]of tasks.entries()){
  const order=[...arms],shift=(i+r*2)%arms.length;order.push(...order.splice(0,shift));if(r%2)order.reverse();
  for(const arm of order)schedule.push({task:t.id,arm:arm.id,repetition:r});
}
const directory=resolve(stateDir,'real-runs',campaign);await mkdir(directory,{recursive:true});
const inputs={};
for(const file of ['package.json','bun.lock','scripts/prepare-real.mjs','scripts/real-experiment.mjs','scripts/real-report.mjs','docs/REAL-EXPERIMENT.md',...(await filesIn(resolve(root,'src'))).map(p=>`src/${p}`),...(await filesIn(resolve(root,'benchmarks/real'))).map(p=>`benchmarks/real/${p}`)])inputs[file]=hash(await readFile(resolve(root,file)));
const baselineHashes={};for(const t of tasks){baselineHashes[t.id]={};for(const file of await filesIn(t.workspaceDir))baselineHashes[t.id][file]=hash(await readFile(resolve(t.workspaceDir,file)));}
const config={version:1,campaign,repository,baseRevision,schedule,arms,effort:'low',workerTimeoutMs:360000,reviewTimeoutMs:180000,repairTimeoutMs:240000,maxTurns:24,estimatedCostStopUsd:12,inputs,baselineHashes};
if(args['--resume']){
  const existing=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
  for(const key of ['schedule','arms','inputs','baselineHashes'])if(JSON.stringify(existing[key])!==JSON.stringify(config[key]))throw new Error(`Frozen ${key} changed`);
}else{
  await writeFile(resolve(directory,'manifest.json'),JSON.stringify({...config,startedAt:new Date().toISOString()},null,2),{flag:'wx'});
  for(const file of Object.keys(inputs)){const dest=resolve(directory,'frozen-source',file);await mkdir(dirname(dest),{recursive:true});await cp(resolve(root,file),dest);}
}
const runtime=await createRuntime();if(!runtime.isUsingSubscription('openai'))throw new Error('Subscription authorization unavailable; no paid fallback');
let knownCost=0,consecutiveErrors=0;
for(const [index,item]of schedule.entries()){
  const runId=`${String(index+1).padStart(3,'0')}-${item.task}-${item.arm}-r${item.repetition}`,runDir=resolve(directory,runId);
  if(args['--resume']){try{const old=JSON.parse(await readFile(resolve(runDir,'result.json'),'utf8'));knownCost+=old.knownEstimatedUsd;continue;}catch(e){if(e.code!=='ENOENT')throw e;}}
  const disk=await statfs(root);if(disk.bavail*disk.bsize<5*1024**3||knownCost>=12)throw new Error('Storage or estimated usage cap reached');
  if(args['--resume'])await rm(runDir,{recursive:true,force:true}); // partial run without result.json; redo it
  await mkdir(runDir);const task=tasks.find(t=>t.id===item.task),arm=arms.find(a=>a.id===item.arm);
  const validation=JSON.parse(await readFile(resolve(dirname(task.workspaceDir),'validation.json'),'utf8'));
  const workspace=resolve(runDir,'workspace');await cp(task.workspaceDir,workspace,{recursive:true});
  console.log(JSON.stringify({event:'run_start',runId,index:index+1,total:schedule.length}));
  const params={runtime,workspace,baseline:task.workspaceDir,sourceFiles:validation.sourceFiles,task,arm};
  const worker=await runRealAgent({...params,runDir:resolve(runDir,'worker')});
  await writeFile(resolve(runDir,'worker.json'),JSON.stringify(worker,null,2));
  const phases=[worker];let review=null,preReviewWorkspace=null;
  if(arm.escalate&&escalationNeeded(worker)){
    await rm(workspace,{recursive:true});await cp(task.workspaceDir,workspace,{recursive:true});
    phases.push(await runRealAgent({...params,arm:REAL_ARMS.find(a=>a.id==='sol'),runDir:resolve(runDir,'escalation')}));
  }
  if(arm.review&&reviewEligible(worker.status)){
    preReviewWorkspace=resolve(runDir,'before-review');await cp(workspace,preReviewWorkspace,{recursive:true});
    const assessment=await runRealAgent({...params,arm:{...arm,state:false,prune:false,repro:false},phase:'review',runDir:resolve(runDir,'review'),timeoutMs:180000,maxTurns:12,
      feedback:`Review the existing attempted repair. The worker ended with status ${worker.status}. The original task above is authoritative. Read the patch with patch_read and return the structured verdict.`});
    phases.push(assessment);review=parseReview(assessment.final,{patchReads:assessment.patchReads});
    await writeFile(resolve(runDir,'review.json'),JSON.stringify({assessment,review},null,2));
    if(assessment.status==='completed'&&review.valid&&review.verdict==='repair'){
      const repair=await runRealAgent({...params,arm:{...arm,state:false,prune:false,repro:false},phase:'repair',runDir:resolve(runDir,'repair'),timeoutMs:240000,maxTurns:16,
        feedback:`A reviewer identified these possible problems. Verify them against the original task and repair concrete issues; avoid unnecessary changes. ${JSON.stringify(review.findings)}`});
      phases.push(repair);
    }
  }
  // All hidden grading occurs only after model work and cannot influence review or repair.
  const acceptance=await runNodeTests(workspace,task.acceptancePath),regression=await runNodeTests(workspace,resolve(workspace,'tests/visible.test.mjs'));
  const beforeReviewAcceptance=preReviewWorkspace?await runNodeTests(preReviewWorkspace,task.acceptancePath):null;
  const afterFiles=await filesIn(workspace),allowed=new Set(validation.sourceFiles),originalFiles=baselineHashes[task.id];
  const immutableIntact=afterFiles.filter(p=>!allowed.has(p)).length===Object.keys(originalFiles).filter(p=>!allowed.has(p)).length&&
    (await Promise.all(Object.keys(originalFiles).filter(p=>!allowed.has(p)).map(async p=>hash(await readFile(resolve(workspace,p)))===originalFiles[p]))).every(Boolean);
  if(hash(await readFile(task.acceptancePath))!==inputs[`benchmarks/real/${task.id}.test.mjs`])throw new Error('Acceptance changed');
  const aggregate=aggregatePhases(phases),patchAccepted=acceptance.status==='passed'&&regression.status==='passed'&&immutableIntact;
  const completion=phaseCompletion(phases,arm,review),completed=completion==='completed';
  const original=await sourceSnapshot(task.workspaceDir,validation.sourceFiles),current=await sourceSnapshot(workspace,validation.sourceFiles);
  const changed=validation.sourceFiles.filter(p=>original[p]!==current[p]);
  const result={runId,...item,...aggregate,status:completion,success:completed&&patchAccepted,escalated:phases.length>1&&!!arm.escalate,patchAccepted,immutableIntact,changed,
    phases,review,acceptance:{...acceptance,stdout:undefined,stderr:undefined},regression:{...regression,stdout:undefined,stderr:undefined},
    beforeReviewAccepted:beforeReviewAcceptance?.status==='passed',endedAt:new Date().toISOString()};
  await writeFile(resolve(runDir,'acceptance.json'),JSON.stringify({acceptance,regression,beforeReviewAcceptance},null,2));
  await writeFile(resolve(runDir,'patch.json'),JSON.stringify(changed.map(path=>({path,before:original[path],after:current[path]})),null,2));
  await writeFile(resolve(runDir,'result.json'),JSON.stringify(result,null,2));knownCost+=aggregate.knownEstimatedUsd;
  console.log(JSON.stringify({event:'run_end',runId,success:result.success,status:result.status,cost:result.totalEstimatedUsd,turns:aggregate.turns,review:review?.verdict,pruned:worker.prunedRequests,repro:worker.reproduction?.after}));
  const authorizationFailure=phases.some(p=>(p.errors??[]).some(e=>/unauthoriz|authentication|invalid.*token|expired.*token|quota|usage.limit|subscription|insufficient|rate.limit/i.test(e)));
  if(authorizationFailure){console.log(JSON.stringify({event:'campaign_stopped',reason:'authorization_or_usage_limit'}));process.exitCode=3;break;}
  const providerProblem=(arm.escalate?phases.slice(-1):phases).some(p=>p.status==='provider_error'||p.status==='harness_error');consecutiveErrors=providerProblem?consecutiveErrors+1:0;
  if(consecutiveErrors>=2){console.log(JSON.stringify({event:'campaign_stopped',reason:'two_provider_or_harness_failures'}));process.exitCode=2;break;}
}
console.log(JSON.stringify({event:process.exitCode?'campaign_partial':'campaign_complete',directory,knownCost}));
