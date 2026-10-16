import {readFile,writeFile,mkdir,readdir,cp,stat,statfs} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createRuntime} from '../src/runtime.mjs';
import {hash,runNodeTests} from '../src/workspace.mjs';
import {runFrictionAgent} from '../src/friction-agent.mjs';

const mode=process.argv[2];if(!['pilot','scored'].includes(mode))throw new Error('mode pilot|scored');
const root=resolve('.suffice/friction-runs'),directory=resolve(root,mode+'-v1');
const tasks=JSON.parse(await readFile('benchmarks/friction/tasks.json','utf8'));
const limits={maxAttempts:14,maxKnownTotalUsd:2,maxCostUsd:.12,maxTurns:18,maxCalls:80,timeoutMs:180000,maxArtifactBytes:80*1024**2,minFreeBytes:1024**3};
const schedule=mode==='pilot'?['A','B'].map(arm=>({task:'pilot',arm,repetition:0})):Array.from({length:2},(_,r)=>['json5','dotenv','flatted'].flatMap((task,i)=>((i+r)%2?['B','A']:['A','B']).map(arm=>({task,arm,repetition:r})))).flat();
async function walk(d){const out=[];for(const e of await readdir(d,{withFileTypes:true})){if(e.isSymbolicLink())throw new Error('Unexpected fixture symlink');const p=resolve(d,e.name);if(e.isDirectory())out.push(...await walk(p));else if(e.isFile())out.push(p);}return out.sort();}
async function fingerprints(d){return Object.fromEntries(await Promise.all((await walk(d)).map(async p=>[p.slice(resolve(d).length+1).replaceAll('\\','/'),hash(await readFile(p))])));}
async function accounting(){let attempts=0,known=0;try{for(const p of await walk(root))if(p.endsWith('result.json')){const r=JSON.parse(await readFile(p,'utf8'));attempts++;known+=r.knownEstimatedUsd;}}catch(e){if(e.code!=='ENOENT')throw e;}return {attempts,known};}
const inputs={};for(const f of ['package.json','package-lock.json','scripts/friction-experiment.mjs','src/friction-agent.mjs','src/friction-policy.mjs','src/runtime.mjs','src/workspace.mjs','src/symbol-navigation.mjs','scripts/prepare-friction.py','tests/friction-policy.test.mjs',...(await walk(resolve('benchmarks/friction'))).map(p=>p.slice(process.cwd().length+1).replaceAll('\\','/'))])inputs[f]=hash(await readFile(f));
const baselines={};for(const t of tasks)baselines[t.id]=await fingerprints(t.workspaceDir);
const manifest={mode,model:'gpt-6.1-sol',effort:'low',node:process.versions.node,arms:{A:'unmodified tool descriptions/errors',B:'descriptions + path argument descriptions + actionable EISDIR errors for search/symbols/symbol_references only'},limits,schedule,inputs,baselines,scope:'Bounded historical-library repairs new to Suffice, independent authored acceptance, not full upstream suites or contamination-free tasks. Synthetic pilot excluded from scoring. Directory-aware search unchanged/unsupported in both arms. Known cost does not include engineering inference; in-flight overshoot remains ineligible. Cache warmth uncontrolled; order counterbalanced, receipts retained.'};
await mkdir(directory,{recursive:true});const manifestPath=resolve(directory,'manifest.json');
if(process.argv.includes('--resume')){if(JSON.stringify(JSON.parse(await readFile(manifestPath,'utf8')))!==JSON.stringify(manifest))throw new Error('Frozen inputs changed');}
else{await writeFile(manifestPath,JSON.stringify(manifest,null,2),{flag:'wx'});for(const f of Object.keys(inputs)){const target=resolve(directory,'frozen-source',f);await mkdir(dirname(target),{recursive:true});await cp(f,target);}}
if(process.argv.includes('--freeze-only')){console.log(JSON.stringify({event:'frozen',mode,attempts:schedule.length}));process.exit(0);}
await writeFile(resolve(directory,'process.json'),JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
const runtime=await createRuntime();
for(const [index,item] of schedule.entries()){
  const id=String(index+1).padStart(3,'0')+'-'+item.task+'-'+item.arm+'-r'+item.repetition,runDir=resolve(directory,id);
  if(process.argv.includes('--resume')){try{await readFile(resolve(runDir,'result.json'));continue;}catch(e){if(e.code!=='ENOENT')throw e;}try{await stat(runDir);throw new Error('Partial attempt exists; preserve and resolve before resuming');}catch(e){if(e.code!=='ENOENT')throw e;}}
  const totals=await accounting(),disk=await statfs(process.cwd());if(totals.attempts>=limits.maxAttempts||totals.known+limits.maxCostUsd>limits.maxKnownTotalUsd||disk.bavail*disk.bsize<limits.minFreeBytes)throw new Error('Resource admission stopped');
  let bytes=0;for(const p of await walk(root))bytes+=(await stat(p)).size;if(bytes>limits.maxArtifactBytes)throw new Error('Artifact bound');
  const task=tasks.find(t=>t.id===item.task);if(JSON.stringify(await fingerprints(task.workspaceDir))!==JSON.stringify(baselines[task.id]))throw new Error('Baseline drift');
  await mkdir(runDir);const workspace=resolve(runDir,'workspace');await cp(task.workspaceDir,workspace,{recursive:true});console.log(JSON.stringify({event:'start',mode,id}));
  const worker=await runFrictionAgent({runtime,workspace,task,arm:item.arm,runDir:resolve(runDir,'worker'),limits});await writeFile(resolve(runDir,'worker.json'),JSON.stringify(worker,null,2));
  const acceptance=await runNodeTests(workspace,task.acceptancePath),regression=await runNodeTests(workspace,resolve(workspace,'tests/visible.test.mjs'));await writeFile(resolve(runDir,'acceptance.json'),JSON.stringify({acceptance,regression},null,2));
  const actual=await fingerprints(workspace),keys=Object.keys(actual);let intact=keys.length===Object.keys(baselines[task.id]).length;
  for(const [p,h] of Object.entries(baselines[task.id]))if(!task.sourceFiles.includes(p)&&actual[p]!==h)intact=false;
  const patch=[];for(const p of task.sourceFiles)if(actual[p]!==baselines[task.id][p])patch.push({path:p,before:await readFile(resolve(task.workspaceDir,p),'utf8'),after:await readFile(resolve(workspace,p),'utf8')});await writeFile(resolve(runDir,'patch.json'),JSON.stringify(patch,null,2));
  const events=(await readFile(resolve(runDir,'worker/events.jsonl'),'utf8')).split('\n').filter(Boolean).map(JSON.parse),models=[...new Set(events.filter(e=>e.type==='assistant').map(e=>e.model))],modelValid=models.length>0&&models.every(m=>m==='gpt-6.1-sol');
  const requests=events.filter(e=>e.type==='provider_request'),effortValid=requests.length>0&&requests.every(e=>e.reasoning?.effort==='low');
  let messages=[];try{messages=JSON.parse(await readFile(resolve(runDir,'worker/transcript.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}const toolErrors=[];let correctionTurns=0;
  for(let i=0;i<messages.length;i++){const m=messages[i];const ns=m.nestedCalls?.calls??[];for(const n of ns)if(n.status==='error')toolErrors.push({parentCallId:m.toolCallId,tool:n.name,path:n.arguments?.path??null,error:n.error,kind:/EISDIR|path must identify one existing FILE/.test(n.error??'')?'directory-path':'other'});if(ns.some(n=>n.status==='error')&&messages.slice(i+1).some(n=>n.role==='assistant'))correctionTurns++;}
  const patchAccepted=acceptance.status==='passed'&&regression.status==='passed'&&intact&&modelValid&&effortValid,budgetEligible=!worker.usageCostUnknown&&worker.usage.estimatedApiUsd<=limits.maxCostUsd&&worker.turns<=limits.maxTurns;
  const result={id,...item,status:worker.status,patchAccepted,budgetEligible,success:patchAccepted&&budgetEligible&&worker.status==='completed',intact,models,modelValid,effortValid,usage:worker.usage,knownEstimatedUsd:worker.usage.estimatedApiUsd,totalEstimatedUsd:worker.usageCostUnknown?null:worker.usage.estimatedApiUsd,latencyMs:worker.latencyMs,turns:worker.turns,calls:worker.calls,toolErrors,correctionTurns,acceptanceStatus:acceptance.status,regressionStatus:regression.status,errors:worker.errors};
  await writeFile(resolve(runDir,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({event:'end',id,status:result.status,accepted:patchAccepted,budgetEligible,cost:result.totalEstimatedUsd,directoryErrors:toolErrors.filter(e=>e.kind==='directory-path').length}));
  if(worker.errors.some(e=>/usage limit|unauthorized|authentication|quota|rate limit|safety/i.test(e))){console.log(JSON.stringify({event:'provider_stop'}));break;}
}
console.log(JSON.stringify({event:'done',mode,...await accounting()}));
