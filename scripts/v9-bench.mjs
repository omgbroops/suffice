import {readFile,writeFile,mkdir,readdir,realpath} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {executeV9} from '../src/v9/controller.mjs';
import {STRATEGIES,normalizeRequest,validateCommand} from '../src/v9/config.mjs';
import {captureTree,writeTree,treeHash,hash,gitRoot,inside} from '../src/v9/workspace.mjs';
import {runProcess} from '../src/v9/process.mjs';
import {resolveCodex} from '../src/v9/codex.mjs';
const save=(path,v,exclusive=false)=>writeFile(path,JSON.stringify(v,null,2)+'\n',{flag:exclusive?'wx':'w',mode:0o600});
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function runtimeHash(){
  const paths=(await readdir(join(project,'src/v9'))).filter(p=>p.endsWith('.mjs')).sort();
  const entries=[];for(const path of paths)entries.push([`src/v9/${path}`,hash(await readFile(join(project,'src/v9',path)))]);
  entries.push(['scripts/v9-bench.mjs',hash(await readFile(fileURLToPath(import.meta.url)))]);
  return hash(JSON.stringify(entries));
}
export function schedule(tasks,seed=42,repetitions=1){
  let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
  const ordered=[...tasks];for(let i=ordered.length-1;i>0;i--){const j=random()%(i+1);[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}
  const result=[];let offset=random()%STRATEGIES.length;
  for(let repeat=0;repeat<repetitions;repeat++)for(const task of ordered){
    for(let a=0;a<STRATEGIES.length;a++)result.push({id:`${task.id}-r${repeat+1}-${STRATEGIES[(a+offset)%STRATEGIES.length]}`,taskId:task.id,repeat:repeat+1,strategy:STRATEGIES[(a+offset)%STRATEGIES.length]});
    offset=(offset+1)%STRATEGIES.length;
  }
  return result;
}
export async function planBenchmark(manifestPath,planDir,{cliVersion}={}){
  const manifest=await read(manifestPath),base=dirname(resolve(manifestPath));
  const allowed=['id','seed','repetitions','limits','tasks','models','efforts','label'];
  if(Object.keys(manifest).some(k=>!allowed.includes(k)))throw Error('Public manifest cannot include grading fields or unknown settings');
  if(!/^[a-zA-Z0-9_-]{1,60}$/.test(manifest.id)||!Array.isArray(manifest.tasks)||!manifest.tasks.length)throw Error('Manifest needs an id and public tasks');
  const seed=manifest.seed??42,repetitions=manifest.repetitions??1;
  if(!Number.isInteger(seed)||!Number.isInteger(repetitions)||repetitions<1||repetitions>10)throw Error('Invalid schedule seed or repetitions');
  const limits=manifest.limits;
  if(!limits||Object.keys(limits).some(k=>!['maxCostUsd','timeoutMs','overallCostUsd'].includes(k))||['maxCostUsd','timeoutMs','overallCostUsd'].some(k=>!Number.isFinite(limits[k])||limits[k]<=0))throw Error('Explicit positive per-attempt, time and overall API-equivalent caps are required');
  planDir=resolve(planDir);await mkdir(planDir,{recursive:true});
  const tasks=[],ids=new Set();
  for(const task of manifest.tasks){
    if(Object.keys(task).some(k=>!['id','workspace','prompt','checks','protectedPaths','contextPaths','setup'].includes(k))||!/^[a-zA-Z0-9_-]{1,60}$/.test(task.id)||ids.has(task.id))throw Error('Invalid or duplicate public task');
    ids.add(task.id);
    const workspace=await gitRoot(resolve(base,task.workspace));
    if(inside(workspace,planDir))throw Error('Plan must live outside all actor source repositories');
    const r=normalizeRequest({workspace,prompt:task.prompt,runDir:join(planDir,'unused'),maxCostUsd:limits.maxCostUsd,timeoutMs:limits.timeoutMs,checks:task.checks,protectedPaths:task.protectedPaths??[],contextPaths:task.contextPaths??[],models:manifest.models,efforts:manifest.efforts});
    const setup=task.setup??[];if(!Array.isArray(setup)||setup.length>4)throw Error('At most four declared setup commands');setup.forEach(validateCommand);
    const tree=await captureTree(workspace),inputDir=join(planDir,'inputs',task.id);
    await writeTree(inputDir,tree);
    tasks.push({id:task.id,source:workspace,inputDir,sourceHash:treeHash(tree),prompt:r.prompt,checks:r.checks,protectedPaths:r.protectedPaths,contextPaths:r.contextPaths,setup});
  }
  if(!cliVersion){const cli=await resolveCodex();const p=await runProcess(cli.command,[...cli.prefix,'--version'],{timeoutMs:10_000});if(p.exitCode!==0)throw Error('Cannot pin Codex CLI version');cliVersion=p.stdout.trim();}
  const plan={version:'v9-benchmark-1',id:manifest.id,label:manifest.label??'development',seed,repetitions,limits,models:manifest.models,efforts:manifest.efforts,tasks,
    schedule:schedule(tasks,seed,repetitions),runtimeHash:await runtimeHash(),node:process.versions.node,cliVersion,
    grading:'Deferred only. Evaluator files/configuration must be introduced after execution closes; local paths are not an OS secrecy boundary.'};
  plan.fingerprint=hash(JSON.stringify(plan));
  await save(join(planDir,'plan.json'),plan,true);return plan;
}
async function verifyPlan(planDir){
  const p=await read(join(planDir,'plan.json')),{fingerprint,...body}=p;
  if(hash(JSON.stringify(body))!==fingerprint||await runtimeHash()!==p.runtimeHash)throw Error('Frozen plan/runtime changed');
  if(process.versions.node!==p.node)throw Error('Frozen Node runtime changed');
  const cli=await resolveCodex();const version=await runProcess(cli.command,[...cli.prefix,'--version'],{timeoutMs:10_000});
  if(version.exitCode!==0||version.stdout.trim()!==p.cliVersion)throw Error('Frozen Codex CLI version changed');
  for(const task of p.tasks){
    if(treeHash(await captureTree(task.source))!==task.sourceHash)throw Error(`Public source changed: ${task.id}`);
    // Inputs are copied without Git metadata, so initialize a local index for exact inventory checks.
    await initGit(task.inputDir);
    if(treeHash(await captureTree(task.inputDir))!==task.sourceHash)throw Error(`Frozen input changed: ${task.id}`);
  }
  return p;
}
async function initGit(workspace){const p=await runProcess('git',['init','--quiet'],{cwd:workspace,timeoutMs:10_000});if(p.exitCode!==0)throw Error('Could not initialize isolated task Git directory');}
export async function runBenchmark(planDir,{execute=executeV9}={}){
  planDir=resolve(planDir);const plan=await verifyPlan(planDir);
  await save(join(planDir,'execution-started.json'),{at:new Date().toISOString()},true);
  let spent=0,costKnown=true,stopped=false;const attempts=[];
  for(const item of plan.schedule){
    if(stopped||spent+plan.limits.maxCostUsd>plan.limits.overallCostUsd){attempts.push({...item,status:'not_started',costUsd:0,costKnown:true,reason:costKnown?'Campaign allowance exhausted':'Prior usage unknown'});continue;}
    const task=plan.tasks.find(t=>t.id===item.taskId),attemptDir=join(planDir,'attempts',item.id),workspace=join(attemptDir,'workspace');
    await writeTree(workspace,await captureTree(task.inputDir));await initGit(workspace);
    let result,inferenceStarted=false;
    try{
      for(const argv of task.setup){const prep=await runProcess(argv[0],argv.slice(1),{cwd:workspace,timeoutMs:120_000});if(prep.exitCode!==0||prep.timedOut)throw Error(`Declared setup failed: ${prep.stderr}`);}
      if(treeHash(await captureTree(workspace))!==task.sourceHash)throw Error('Setup modified frozen public source');
      inferenceStarted=true;
      result=await execute({workspace,prompt:task.prompt,runDir:join(attemptDir,'receipts'),strategy:item.strategy,maxCostUsd:plan.limits.maxCostUsd,timeoutMs:plan.limits.timeoutMs,
        checks:task.checks,protectedPaths:task.protectedPaths,contextPaths:task.contextPaths,models:plan.models,efforts:plan.efforts});
    }catch(error){result={status:'operational_failure',error:error.message,costUsd:inferenceStarted?null:0,costKnown:!inferenceStarted};}
    if(result.costKnown===true&&Number.isFinite(result.costUsd)&&result.costUsd>=0)spent+=result.costUsd;else {spent+=Number.isFinite(result.knownCostFloorUsd)&&result.knownCostFloorUsd>=0?result.knownCostFloorUsd:0;costKnown=false;stopped=true;}
    const row={...item,...result};attempts.push(row);
    await save(join(attemptDir,'attempt.json'),row,true);
    await save(join(planDir,'execution-progress.json'),{attempts,knownCostFloorUsd:spent,costKnown});
  }
  const record={planFingerprint:plan.fingerprint,attempts,knownCostFloorUsd:spent,costKnown,closed:true,at:new Date().toISOString()};
  await save(join(planDir,'execution-complete.json'),record,true);return record;
}
export async function gradeBenchmark(planDir,evaluatorPath,{run=runProcess}={}){
  planDir=resolve(planDir);
  const plan=await read(join(planDir,'plan.json')),execution=await read(join(planDir,'execution-complete.json'));
  const {fingerprint,...body}=plan;
  if(hash(JSON.stringify(body))!==fingerprint||!execution.closed||execution.planFingerprint!==plan.fingerprint||execution.attempts.length!==plan.schedule.length)throw Error('Execution must close completely before any evaluator is loaded');
  for(let i=0;i<plan.schedule.length;i++){
    const expected=plan.schedule[i],actual=execution.attempts[i];
    if(['id','taskId','strategy','repeat'].some(k=>actual[k]!==expected[k]))throw Error('Execution schedule identity mismatch');
    if(actual.snapshot&&(actual.snapshot!==join(planDir,'attempts',actual.id,'receipts','final-source')||actual.workspace!==join(planDir,'attempts',actual.id,'workspace')))throw Error('Execution source path mismatch');
  }
  // This file is intentionally not read by plan/run. Introduce private evaluator material only now.
  const evaluator=await read(evaluatorPath);
  if(!evaluator||Object.keys(evaluator).some(k=>!['checks','timeoutMs'].includes(k)))throw Error('Invalid external evaluator configuration');
  const grades=[];
  for(const attempt of execution.attempts){
    if(!attempt.snapshot){grades.push({id:attempt.id,status:'ungraded',accepted:null});continue;}
    const tree=await captureTree(attempt.workspace,{includeIgnored:true});
    if(treeHash(tree)!==attempt.sourceHash)throw Error(`Actor source was changed after completion: ${attempt.id}`);
    // Read the sealed source through a temporary Git index and verify it independently of the mutable actor tree.
    await initGit(attempt.snapshot);
    const frozen=await captureTree(attempt.snapshot,{includeIgnored:true});
    if(treeHash(frozen)!==attempt.sourceHash)throw Error(`Final snapshot was changed: ${attempt.id}`);
    const gradingDir=join(planDir,'grading',attempt.id);await writeTree(gradingDir,frozen);
    const command=validateCommand(evaluator.checks?.[attempt.taskId]);
    const args=command.map(x=>x.replaceAll('{workspace}',gradingDir));
    const out=await run(args[0],args.slice(1),{cwd:gradingDir,timeoutMs:evaluator.timeoutMs??120_000});
    grades.push({id:attempt.id,status:out.error||out.timedOut||out.overflow?'ungraded':'graded',accepted:out.error||out.timedOut||out.overflow?null:out.exitCode===0,
      exitCode:out.exitCode,output:(out.stdout+'\n'+out.stderr).slice(-12_000),sourceHash:attempt.sourceHash});
  }
  await save(join(planDir,'grades.json'),{planFingerprint:plan.fingerprint,grades},true);return grades;
}
async function main(){
  const [mode,a,b]=process.argv.slice(2);
  if(mode==='plan'&&a&&b){const p=await planBenchmark(a,b);console.log(JSON.stringify({plan:resolve(b),attempts:p.schedule.length,overallCostUsd:p.limits.overallCostUsd}));}
  else if(mode==='run'&&a){const r=await runBenchmark(a);console.log(JSON.stringify({attempts:r.attempts.length,costKnown:r.costKnown,knownCostFloorUsd:r.knownCostFloorUsd}));}
  else if(mode==='grade'&&a&&b){const r=await gradeBenchmark(a,b);console.log(JSON.stringify({graded:r.filter(g=>g.status==='graded').length,accepted:r.filter(g=>g.accepted).length}));}
  else throw Error('Usage: v9-bench.mjs plan <public-manifest.json> <new-plan-dir> | run <plan-dir> | grade <plan-dir> <external-evaluators.json>');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
