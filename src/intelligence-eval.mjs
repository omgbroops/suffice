import {readdir,readFile,writeFile,mkdir,cp,realpath} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hash,runNodeTests} from './workspace.mjs';
import {createSufficeSession} from '../packages/cli/src/session.mjs';
import {parseOptions} from '../packages/cli/src/options.mjs';
export const CONFIG=Object.freeze({model:'gpt-6-luna',effort:'xhigh',serviceTier:'default',maxOutputTokens:16384,maxCost:0.50,timeout:480,maxTurns:60,maxToolCalls:240,requestReserveUsd:0.15,retryCount:0,workspaceIsolation:'own-git-repository'});
const execute=promisify(execFile);
export async function initializeWorkspaceGit(workspace){
  const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_AUTHOR_DATE:'2000-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2000-01-01T00:00:00Z'};
  for(const k of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'])delete env[k];
  const git=async args=>(await execute('git',['-C',workspace,'-c','core.longpaths=true','-c','commit.gpgsign=false','-c','core.hooksPath=.git/no-hooks','-c','user.name=Suffice evaluation','-c','user.email=eval@localhost',...args],{env,windowsHide:true,timeout:60000,maxBuffer:1024**2})).stdout.trim();
  await git(['init','-q','--initial-branch=baseline']);
  for(const [key,value]of [['core.autocrlf','false'],['core.safecrlf','false'],['core.fileMode','false'],['core.longpaths','true'],['core.hooksPath','.git/no-hooks'],['commit.gpgsign','false']])await git(['config','--local',key,value]);
  await git(['add','--force','--all','--','.',':(exclude)node_modules',':(exclude)**/node_modules/**']);await git(['commit','-qm','Frozen evaluation input']);
  const root=await git(['rev-parse','--show-toplevel']),actual=await realpath(workspace);
  const normalize=p=>process.platform==='win32'?p.replaceAll('\\','/').toLowerCase():p;
  if(normalize(root)!==normalize(actual))throw new Error('Workspace inherited parent Git metadata');
  return {root,head:await git(['rev-parse','HEAD']),tree:await git(['rev-parse','HEAD^{tree}'])};
}
export const ARMS=[{id:'A',mode:'off'},{id:'B',mode:'guided'},{id:'C',mode:'on-demand'}];
export async function allFiles(root,directory=''){const out=[];for(const e of await readdir(resolve(root,directory),{withFileTypes:true})){if(e.isSymbolicLink()||['.git','node_modules'].includes(e.name))continue;const path=[directory,e.name].filter(Boolean).join('/');if(e.isDirectory())out.push(...await allFiles(root,path));else if(e.isFile())out.push(path);}return out.sort();}
export async function snapshot(root){const values={};for(const p of await allFiles(root))values[p]=hash(await readFile(resolve(root,p)));return values;}
export function random(seed){let value=seed>>>0;return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/2**32;};}
export function schedule(tasks,repetitions=2,seed=20261109){const rand=random(seed),shuffle=xs=>[...xs].sort(()=>0).map(v=>({v,k:rand()})).sort((a,b)=>a.k-b.k).map(x=>x.v),categories=['simple','cross-file','complex'],groups=categories.map(c=>shuffle(tasks.filter(t=>t.category===c))),ordered=[];for(let i=0;i<Math.max(...groups.map(g=>g.length));i++)for(const g of groups)if(g[i])ordered.push(g[i]);const blocks=[];for(const task of ordered)for(let repetition=0;repetition<repetitions;repetition++)blocks.push(shuffle(ARMS).map(arm=>({task:task.id,repetition,arm:arm.id,mode:arm.mode})));return blocks;}
export async function runTrial({runtime,task,item,runDir,published,config=CONFIG}){
  const workspace=resolve(runDir,'workspace');await mkdir(runDir,{recursive:true});await cp(task.baseline,workspace,{recursive:true,filter:p=>!p.split(/[\\/]/).includes('node_modules')});const original=await snapshot(workspace);
  if(task.baselineHashes&&JSON.stringify(original)!==JSON.stringify(task.baselineHashes))throw new Error('Task starting files drifted');
  const workspaceGit=await initializeWorkspaceGit(workspace);
  if(JSON.stringify(original)!==JSON.stringify(await snapshot(workspace)))throw new Error('Git initialization changed task contents');
  await task.setupWorkspace?.(workspace);
  const started=performance.now(),agent=await createSufficeSession({...parseOptions([]),...config,cwd:workspace,home:resolve(runDir,'home'),intelligence:item.mode},runtime);
  let status='completed',error=null,final='';
  try{final=await agent.run(task.prompt);}catch(e){status=/timeout|allowance|limit|length/i.test(e.message)?'budget_or_incomplete':'agent_error';error=e.message;}finally{await agent.dispose();}
  const latencyMs=performance.now()-started;
  const {acceptance,regression}=task.verify?await task.verify(workspace):{acceptance:await runNodeTests(workspace,task.preparedAcceptance),regression:await runNodeTests(workspace,resolve(workspace,'tests/visible.test.mjs'))};
  if(!task.verify&&hash(await readFile(task.preparedAcceptance))!==task.acceptanceHash)throw new Error('Frozen acceptance drift');
  const current=await snapshot(workspace),paths=[...new Set([...Object.keys(original),...Object.keys(current)])],changed=paths.filter(p=>original[p]!==current[p]);
  const allowed=new Set(task.sourceFiles),immutableIntact=changed.every(p=>task.allowsChange?task.allowsChange(p):allowed.has(p)&&original[p]&&current[p]);
  const events=(await readFile(agent.eventPath,'utf8')).trim().split('\n').map(JSON.parse),assistant=events.filter(e=>e.type==='assistant'),requests=events.filter(e=>e.type==='provider_request'),responses=events.filter(e=>e.type==='provider_usage');
  const modelValid=assistant.length>0&&assistant.every(e=>e.model===config.model)&&requests.length>0&&requests.every(e=>e.model===config.model&&e.reasoning?.effort===config.effort);
  const observedTiers=[...new Set(responses.map(e=>e.serviceTier??'unreported'))];
  const success=status==='completed'&&acceptance.status==='passed'&&regression.status==='passed'&&immutableIntact&&modelValid;
  const tools=events.filter(e=>e.type==='tool_call'),queries=events.filter(e=>e.type==='graph_query'),guidance=events.filter(e=>e.type==='graph_guidance'),overhead=events.filter(e=>e.type==='graph_refresh');
  const edits=tools.filter(e=>['edit','write'].includes(e.name)),checks=tools.filter(e=>e.name==='bash'&&/(--test|\btest\b)/.test(e.input.command??''));
  const reference=new Set(task.referenceFiles??[]),unrepairedReferenceFiles=[...reference].filter(p=>!changed.includes(p)),extraChangedFiles=changed.filter(p=>!reference.has(p));
  const uptake=[];for(const g of guidance){const at=events.indexOf(g),d=g.data,candidates=new Set([...(d.symbols??[]).map(s=>s.path),...(d.impact?.impacted??[]).map(s=>s.path),...(d.tests?.tests??[]).map(s=>s.path)]);const future=events.slice(at+1).filter(e=>e.type==='tool_call');uptake.push({phase:g.phase,reason:d.reason??null,candidatePaths:[...candidates],subsequentTouches:future.filter(e=>typeof e.input.path==='string'&&candidates.has(e.input.path.replaceAll('\\','/'))).map(e=>({tool:e.name,path:e.input.path,callId:e.callId})),subsequentTestCommands:future.filter(e=>e.name==='bash'&&[...candidates].some(p=>e.input.command?.includes(p))).map(e=>e.input.command),causalInfluence:'unestablished; temporal path overlap only'});}
  const patches=[];for(const path of changed)patches.push({path,before:original[path]?await readFile(resolve(task.baseline,path),'utf8'):null,after:current[path]?await readFile(resolve(workspace,path),'utf8'):null});
  const result={...item,category:task.category,kind:task.kind,workspaceGit,runId:runDir.split(/[\\/]/).at(-1),status,error,success,patchAccepted:acceptance.status==='passed'&&regression.status==='passed'&&immutableIntact,immutableIntact,modelValid,observedTiers,latencyMs,usage:agent.totals,totalEstimatedUsd:agent.totals.costUnknown?null:agent.totals.estimatedApiUsd,acceptance,regression,changed,unrepairedReferenceFiles,extraChangedFiles,proxyWarning:'Reference-path deviations are not proof of missed dependencies or unnecessary edits.',iterations:agent.totals.modelCalls,editCalls:edits.length,verificationCalls:checks.length,toolCalls:tools.length,graphQueries:queries,graphGuidance:guidance.map(g=>({phase:g.phase,reason:g.data.reason??null})),graphOverhead:overhead,evidenceUptake:uptake,patches,final,eventPath:agent.eventPath};
  await mkdir(published,{recursive:true});await writeFile(resolve(published,result.runId+'.json'),JSON.stringify(result,null,2));
  await writeFile(resolve(published,result.runId+'.events.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');
  await cp(agent.sessionPath(),resolve(published,result.runId+'.session.jsonl'));
  await writeFile(resolve(runDir,'result.json'),JSON.stringify(result,null,2));return result;
}
