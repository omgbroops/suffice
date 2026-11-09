import {mkdir,cp,readFile,writeFile,readdir,statfs} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {root,stateDir} from '../src/runtime.mjs';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {tasks} from '../benchmarks/tasks.mjs';
import {filesIn,hash,runNodeTests} from '../src/workspace.mjs';
import {parseOptions} from '../packages/cli/src/options.mjs';
import {createSufficeSession} from '../packages/cli/src/session.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return i<0?[s,true]:[s.slice(0,i),s.slice(i+1)];}));
const campaign=args['--campaign'];if(!/^[a-zA-Z0-9_-]+$/.test(campaign??''))throw new Error('Use --campaign=unique-name');
const selected=String(args['--tasks']??'dependency-aliases,cursor-pagination,layered-config').split(',').map(id=>{const task=tasks.find(t=>t.id===id);if(!task)throw new Error(`Unknown task ${id}`);return task;});
const repetitions=Number(args['--repetitions']??1);if(!Number.isInteger(repetitions)||repetitions<1||repetitions>3)throw new Error('Use 1-3 repetitions');
const arms=[{id:'A',mode:'off'},{id:'B',mode:'tools'},{id:'C',mode:'guided'}];
const budget={model:'gpt-6.1-sol',effort:'low',maxCost:1,timeout:180,maxTurns:60,maxToolCalls:240};
const schedule=[];for(let rep=0;rep<repetitions;rep++)for(const [i,task]of selected.entries())for(let j=0;j<3;j++)schedule.push({task:task.id,arm:arms[(j+i+rep)%3].id,repetition:rep});
const directory=resolve(stateDir,'intelligence-runs',campaign),published=resolve(root,'reports/repository-intelligence-v1',campaign);
await mkdir(directory,{recursive:true});await mkdir(published,{recursive:true});
const inputs={};
const sourcePaths=['scripts/intelligence-benchmark.mjs','package.json','package-lock.json','src/runtime.mjs','src/workspace.mjs','benchmarks/tasks.mjs',...(await filesIn(resolve(root,'packages/cli/src'))).map(p=>'packages/cli/src/'+p)];
for(const path of sourcePaths)inputs[path]=hash(await readFile(resolve(root,path)));
const taskInputs={};for(const t of selected){const sources={};for(const p of await filesIn(t.workspaceDir))sources[p]=hash(await readFile(resolve(t.workspaceDir,p)));taskInputs[t.id]={sources,prompt:t.prompt,acceptance:hash(await readFile(t.acceptancePath))};}
const manifest={version:1,campaign,base:'124e0e194d526064a6b66b951faf4c4d64853f5a',sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),budget,arms,schedule,inputs,taskInputs,limitations:['Existing AI-authored synthetic tasks, previously used in repository experiments; not an unseen real-repository benchmark.','One repetition by default; descriptive smoke comparison only, no causal or statistical efficacy claim.','Same CLI session factory, model, effort, prompt, native tools and allowances in all arms; graph tool descriptions and guided evidence differ.','Model cache warmth is observed, not controlled.','Costs are API-equivalent catalog estimates, not invoices.','Native bash is not an OS sandbox; evaluator checks frozen non-src inputs after execution.','All attempts retained; unknown usage stops further inference and is not zero.']};
await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});await writeFile(resolve(published,'manifest.json'),JSON.stringify(manifest,null,2));
for(const path of sourcePaths){const target=resolve(directory,'frozen-source',path);await mkdir(dirname(target),{recursive:true});await cp(resolve(root,path),target);}
const authHome=resolve(String(args['--auth-home']??parseOptions([]).home));
const runtime=await ModelRuntime.create({authPath:resolve(authHome,'auth.json'),modelsPath:null,modelsStorePath:resolve(authHome,'catalog.json'),allowModelNetwork:false});
if(!runtime.isUsingSubscription('openai'))throw new Error('Subscription unavailable; select the signed-in CLI directory with --auth-home=PATH. No API-key fallback');
if(!runtime.getModel('openai',budget.model))throw new Error('Requested model absent from catalog');
const results=[];let spent=0;
for(const [index,item]of schedule.entries()){
  if(spent>=9)throw new Error('Campaign cost allowance exhausted');
  const disk=await statfs(root);if(disk.bavail*disk.bsize<1024**3)throw new Error('Insufficient scratch space');
  for(const [p,h]of Object.entries(inputs))if(hash(await readFile(resolve(root,p)))!==h)throw new Error('Frozen source changed during campaign: '+p);
  const task=selected.find(t=>t.id===item.task),arm=arms.find(a=>a.id===item.arm),runId=`${index+1}-${item.task}-${item.arm}-r${item.repetition}`;
  const runDir=resolve(directory,runId),workspace=resolve(runDir,'workspace');await mkdir(runDir);await cp(task.workspaceDir,workspace,{recursive:true});
  const originals=taskInputs[task.id].sources;for(const [p,h]of Object.entries(originals))if(hash(await readFile(resolve(workspace,p)))!==h)throw new Error('Task input drift');
  const initial=await runNodeTests(workspace,task.acceptancePath);if(initial.status!=='failed')throw new Error('Task no longer fails baseline acceptance');
  console.log(JSON.stringify({event:'run_start',runId,total:schedule.length}));
  const options={...parseOptions([]),...budget,cwd:workspace,home:resolve(runDir,'home'),intelligence:arm.mode};
  const started=performance.now(),agent=await createSufficeSession(options,runtime);let status='completed',error=null,final='';
  try{final=await agent.run(task.prompt);}catch(e){status='failed';error=e.message;}finally{await agent.dispose();}
  const latencyMs=performance.now()-started;
  const acceptance=await runNodeTests(workspace,task.acceptancePath),regression=await runNodeTests(workspace,resolve(workspace,'tests/visible.test.mjs'));
  if(hash(await readFile(task.acceptancePath))!==taskInputs[task.id].acceptance)throw new Error('Acceptance drift');
  const actual=await filesIn(workspace),immutable=Object.keys(originals).filter(p=>!p.startsWith('src/'));let immutableIntact=actual.filter(p=>!p.startsWith('src/')).length===immutable.length;
  for(const p of immutable)try{if(hash(await readFile(resolve(workspace,p)))!==originals[p])immutableIntact=false;}catch{immutableIntact=false;}
  const events=(await readFile(agent.eventPath,'utf8')).trim().split('\n').map(JSON.parse),assistant=events.filter(e=>e.type==='assistant');
  const actualModels=[...new Set(assistant.map(e=>e.model))],modelValid=actualModels.length>0&&actualModels.every(m=>m===budget.model);
  const toolCalls=events.filter(e=>e.type==='tool_call'),graphCalls=toolCalls.filter(e=>e.name.startsWith('get_'));
  const patches=[];for(const p of [...new Set([...Object.keys(originals),...actual])].filter(p=>p.startsWith('src/'))){let after=null,before=null;try{after=await readFile(resolve(workspace,p),'utf8');}catch{}try{before=await readFile(resolve(task.workspaceDir,p),'utf8');}catch{}if(after!==before)patches.push({path:p,before,after});}
  const result={runId,...item,status,error,success:status==='completed'&&acceptance.status==='passed'&&regression.status==='passed'&&immutableIntact&&modelValid,patchAccepted:acceptance.status==='passed'&&regression.status==='passed'&&immutableIntact,immutableIntact,modelValid,actualModels,latencyMs,usage:agent.totals,totalEstimatedUsd:agent.totals.costUnknown?null:agent.totals.estimatedApiUsd,toolCalls:toolCalls.length,graphToolCalls:graphCalls.length,graphGuidance:events.filter(e=>e.type==='graph_guidance').map(e=>e.phase),graphMetrics:events.filter(e=>e.type==='graph_refresh'),acceptance,regression,patches,final};
  await writeFile(resolve(runDir,'result.json'),JSON.stringify(result,null,2));await writeFile(resolve(published,runId+'.json'),JSON.stringify(result,null,2));
  const receipts=events.filter(e=>['assistant','provider_usage','tool_call','graph_refresh','graph_guidance_error','task_end'].includes(e.type)).map(e=>e.type==='assistant'?{...e,content:undefined}:e);
  await writeFile(resolve(published,runId+'.receipts.jsonl'),receipts.map(e=>JSON.stringify(e)).join('\n')+'\n');
  results.push(result);spent+=agent.totals.estimatedApiUsd;console.log(JSON.stringify({event:'run_end',runId,success:result.success,seconds:latencyMs/1000,cost:result.totalEstimatedUsd,graphTools:graphCalls.length,guidance:result.graphGuidance}));
  const sum=k=>rows=>rows.reduce((n,r)=>n+r[k],0);
  const summary=arms.map(a=>{const rows=results.filter(r=>r.arm===a.id),known=rows.filter(r=>r.totalEstimatedUsd!==null);return {arm:a.id,mode:a.mode,attempts:rows.length,passed:rows.filter(r=>r.success).length,acceptedPatches:rows.filter(r=>r.patchAccepted).length,seconds:sum('latencyMs')(rows)/1000,meanSeconds:rows.length?sum('latencyMs')(rows)/rows.length/1000:null,totalEstimatedUsd:known.length===rows.length?sum('totalEstimatedUsd')(known):null,usage:rows.reduce((n,r)=>{for(const k of ['input','output','cacheRead','cacheWrite','modelCalls'])n[k]=(n[k]??0)+r.usage[k];return n;},{}),graphToolCalls:sum('graphToolCalls')(rows),graphGuidance:rows.flatMap(r=>r.graphGuidance).length};});
  await writeFile(resolve(published,'summary.json'),JSON.stringify({manifest,completed:results.length,summary},null,2));
  if(agent.totals.costUnknown){console.log(JSON.stringify({event:'campaign_stopped',reason:'unknown_usage',completed:results.length}));process.exitCode=2;break;}
}
