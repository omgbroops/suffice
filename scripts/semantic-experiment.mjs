import {mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {semanticTasks,semanticReportDirectory} from '../benchmarks/semantic/tasks.mjs';
import {SEMANTIC_PROTOCOL,CampaignBudget,runSemanticAttempt} from '../src/semantic-benchmark.mjs';
import {filesIn,hash,runNodeTests} from '../src/workspace.mjs';
import {root,stateDir} from '../src/runtime.mjs';

const mode=process.argv[2];if(!['--freeze','--run'].includes(mode))throw new Error('Use --freeze, then --run after committing the frozen manifest');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const manifestPath=resolve(semanticReportDirectory,'manifest.json');
const sourcePaths=['package.json','package-lock.json','packages/cli/package.json','packages/cli/npm-shrinkwrap.json','benchmarks/semantic/tasks.mjs','scripts/semantic-experiment.mjs','scripts/prepare-semantic-benchmark.mjs','src/semantic-benchmark.mjs','src/workspace.mjs','src/runtime.mjs',
  'packages/cli/src/navigation.mjs','packages/cli/src/workspace.mjs','packages/cli/src/semantic-tools.mjs','packages/cli/src/semantic/graph.mjs','packages/cli/src/semantic/recipes.mjs',
  'tests/semantic-graph.test.mjs','tests/semantic-benchmark.test.mjs','scripts/semantic-report.mjs','scripts/semantic-microbenchmark.mjs','benchmarks/verify-tasks.mjs','pnpm-lock.yaml'];
const inputs={};for(const path of sourcePaths)inputs[path]=hash(await readFile(resolve(root,path)));
const taskInputs=[];
for(const task of semanticTasks){
  const validation=JSON.parse(await readFile(resolve(dirname(task.workspaceDir),'validation.json'),'utf8'));
  if(validation.baseline.status!=='failed'||validation.fixed.status!=='passed'||validation.regression.status!=='passed'||validation.fixedRegression.status!=='passed')throw new Error('Invalid task validation receipt');
  const hashes={};for(const path of await filesIn(task.workspaceDir))hashes[path]=hash(await readFile(resolve(task.workspaceDir,path)));
  if(JSON.stringify(hashes)!==JSON.stringify(validation.hashes))throw new Error('Prepared task snapshot changed');
  if(hash(await readFile(task.acceptancePath))!==validation.acceptanceHash)throw new Error('Acceptance changed');
  taskInputs.push({id:task.id,role:task.role,provenance:task.provenance,base:task.base,fix:task.fix,prompt:task.prompt,hashes,sourceFiles:validation.sourceFiles,acceptanceHash:validation.acceptanceHash});
}
const runtime=await ModelRuntime.create({authPath:resolve(homedir(),'.suffice/auth.json'),modelsPath:null,modelsStorePath:resolve(homedir(),'.suffice/catalog.json'),allowModelNetwork:false});
const model=runtime.getModel('openai',SEMANTIC_PROTOCOL.model);if(!model||!runtime.isUsingSubscription('openai'))throw new Error('Frozen subscription model unavailable; no paid-key or alternate model fallback');
if(model.api!=='openai-responses')throw new Error('Budget enforcement only supports the frozen Responses payload');
const schedule=[];
for(let r=0;r<SEMANTIC_PROTOCOL.repetitions;r++)for(const [i,task]of semanticTasks.entries()){
  const order=[...SEMANTIC_PROTOCOL.arms],shift=(i+r)%order.length;order.push(...order.splice(0,shift));if(r%2)order.reverse();
  for(const arm of order)schedule.push({task:task.id,arm,repetition:r});
}
const configuration={protocol:SEMANTIC_PROTOCOL,inputs,tasks:taskInputs,schedule,prices:model.cost,modelApi:model.api};
await mkdir(semanticReportDirectory,{recursive:true});
if(mode==='--freeze'){
  if(git('status','--porcelain').length)throw new Error('Commit source and tests before freezing');
  const manifest={...configuration,sourceCommit:git('rev-parse','HEAD'),sourceBranch:git('branch','--show-current'),frozenAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,pi:'1.2.0',typescript:'5.9.3'},
    scoring:'Independent acceptance AND visible regression pass; production-only patch, frozen immutable files intact. Completed agent status reported separately.',
    contamination:'Tools can read only the isolated worker snapshot. Hidden acceptance, reference repairs, manifests and evaluator output remain outside it. No shell tool. Test subprocesses use Node permission boundaries.',
    caveats:['Two synthetic tasks and one reused historical task; no fresh holdout claim.','No automatic recipe tools in any arm.','No guarantee of savings; all scheduled attempts retained.','API-equivalent estimates from frozen local catalog; subscription invoice is not measured.']};
  await writeFile(manifestPath,JSON.stringify(manifest,null,2),{flag:'wx'});
  for(const task of semanticTasks)await cp(resolve(dirname(task.workspaceDir),'validation.json'),resolve(semanticReportDirectory,`validation-${task.id}.json`));
  console.log(JSON.stringify({event:'frozen',sourceCommit:manifest.sourceCommit,schedule:schedule.length,manifestHash:hash(await readFile(manifestPath))}));
}else{
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  for(const key of Object.keys(configuration))if(JSON.stringify(configuration[key])!==JSON.stringify(manifest[key]))throw new Error(`Frozen ${key} differs`);
  if(git('status','--porcelain').length)throw new Error('Working tree must be committed before scoring');
  const directory=resolve(stateDir,'semantic-runs-v1');await mkdir(directory); // Existing campaign is never overwritten or silently reset.
  const ledger=resolve(directory,'budget.jsonl');await writeFile(ledger,'',{flag:'wx'});
  const budget=new CampaignBudget({path:ledger,prices:manifest.prices}),runs=[];
  let stopReason;
  for(const [index,item]of manifest.schedule.entries()){
    if(budget.unknown){stopReason='unknown_usage';break;}
    if(budget.used>=manifest.protocol.capUsd){stopReason='campaign_budget';break;}
    const task=semanticTasks.find(t=>t.id===item.task),frozen=manifest.tasks.find(t=>t.id===item.task),id=`${String(index+1).padStart(3,'0')}-${item.task}-${item.arm}-r${item.repetition}`;
    const runDir=resolve(directory,id),workspace=resolve(runDir,'workspace');await mkdir(runDir);await cp(task.workspaceDir,workspace,{recursive:true});
    console.log(JSON.stringify({event:'start',id,usedUsd:budget.used}));
    const worker=await runSemanticAttempt({runtime,budget,workspace,sourceFiles:frozen.sourceFiles,directory:resolve(runDir,'worker'),task,arm:item.arm});
    const acceptance=await runNodeTests(workspace,task.acceptancePath),regression=await runNodeTests(workspace,resolve(workspace,'tests/visible.test.mjs'));
    if(hash(await readFile(task.acceptancePath))!==frozen.acceptanceHash)throw new Error('Acceptance changed during campaign');
    const actual=await filesIn(workspace),mutable=new Set(frozen.sourceFiles);let immutableIntact=actual.filter(p=>!mutable.has(p)).length===Object.keys(frozen.hashes).filter(p=>!mutable.has(p)).length;
    for(const [p,h]of Object.entries(frozen.hashes))if(!mutable.has(p)){try{if(hash(await readFile(resolve(workspace,p)))!==h)immutableIntact=false;}catch{immutableIntact=false;}}
    const patch=[];for(const path of frozen.sourceFiles){let after;try{after=await readFile(resolve(workspace,path),'utf8');}catch{after=null;}const before=await readFile(resolve(task.workspaceDir,path),'utf8');if(after!==before)patch.push({path,before,after});}
    const modelValid=worker.actualModels.length>0&&worker.actualModels.every(id=>id===manifest.protocol.model);
    const accepted=acceptance.status==='passed'&&regression.status==='passed'&&immutableIntact&&modelValid;
    const result={id,...item,...worker,patchAccepted:accepted,completed:worker.status==='completed',success:accepted&&worker.status==='completed',immutableIntact,modelValid,changed:patch.map(p=>p.path),
      totalEstimatedUsd:worker.totals.costUnknown?null:worker.totals.estimatedApiUsd,budgetConsumedUsd:budget.attempt,
      totalWallMs:worker.wallMs+acceptance.latencyMs+regression.latencyMs,
      acceptance:{...acceptance,stdout:undefined,stderr:undefined},regression:{...regression,stdout:undefined,stderr:undefined},executionCommit:git('rev-parse','HEAD')};
    await writeFile(resolve(runDir,'result.json'),JSON.stringify(result,null,2));await writeFile(resolve(runDir,'patch.json'),JSON.stringify(patch,null,2));await writeFile(resolve(runDir,'acceptance.json'),JSON.stringify({acceptance,regression},null,2));
    const published=resolve(semanticReportDirectory,id);await mkdir(published);for(const name of ['result.json','patch.json','acceptance.json'])await cp(resolve(runDir,name),resolve(published,name));
    for(const name of ['events.jsonl','transcript.json']){try{await cp(resolve(runDir,'worker',name),resolve(published,name));}catch(e){if(e.code!=='ENOENT')throw e;}}
    runs.push(result);console.log(JSON.stringify({event:'end',id,status:worker.status,accepted,cost:result.totalEstimatedUsd,usedUsd:budget.used,graph:worker.graph.calls}));
    if(/auth|invalid.grant|unauthorized|quota|subscription.*unavailable/i.test(worker.error??'')){stopReason='authentication_or_provider_limit';break;}
    if(runs.length>=2&&runs.slice(-2).every(r=>r.status==='error')){stopReason='consecutive_errors';break;}
  }
  const unrun=manifest.schedule.slice(runs.length),completion={scheduled:manifest.schedule.length,executed:runs.length,unrun,stopReason:stopReason??null,budgetConsumedUsd:budget.used,usageUnknown:budget.unknown,capUsd:budget.capUsd,manifestHash:hash(await readFile(manifestPath)),executionCommit:git('rev-parse','HEAD'),endedAt:new Date().toISOString()};
  await cp(ledger,resolve(semanticReportDirectory,'budget.jsonl'));await writeFile(resolve(semanticReportDirectory,'completion.json'),JSON.stringify(completion,null,2));console.log(JSON.stringify({event:'campaign_end',...completion}));
}
