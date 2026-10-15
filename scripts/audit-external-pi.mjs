// Supplemental audit of the completed comparison, not an agent policy change.
import {readFile,writeFile} from 'node:fs/promises';import {resolve,isAbsolute,relative,sep} from 'node:path';import {spawnSync} from 'node:child_process';
import {hash} from '../src/workspace.mjs';import {accountEvents} from './audit-benchmark-receipts.mjs';
const read=p=>readFile(p,'utf8').then(JSON.parse),dir=resolve('.suffice/external-pi-v1'),m=await read(resolve(dir,'manifest.json')),results=await read('reports/external-pi/results.json'),failures=[],rows=[],access=[];
const check=(v,s)=>{if(!v)failures.push(s);},near=(a,b)=>Math.abs(a-b)<1e-9;
const variants={suffice:{systems:new Set(),schemas:new Set()},'stock-pi':{systems:new Set(),schemas:new Set()}},costs={suffice:{input:0,cacheRead:0,output:0,cacheWrite:0},'stock-pi':{input:0,cacheRead:0,output:0,cacheWrite:0}},topCalls={suffice:0,'stock-pi':0};
for(const[p,h]of Object.entries(m.inputs)){check(hash(await readFile(p))===h,'current frozen input: '+p);check(hash(await readFile(resolve(dir,'frozen-source',p)))===h,'archived frozen input: '+p);}
check(hash(await readFile(m.cliPath))===m.cliSha256,'actual native CLI bytes');
const original=spawnSync('git',['show','a2745c6:src/benchmark-agent.mjs']);check(original.status===0&&hash(original.stdout)===m.inputs['src/benchmark-agent.mjs'],'unchanged historical Suffice module');
for(const r of results.rows){
 const start=failures.length,run=resolve(dir,r.id),worker=resolve(run,'worker'),es=(await readFile(resolve(worker,'events.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse),live=(await readFile(resolve(worker,'events.live.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
 check(JSON.stringify(es)===JSON.stringify(live),r.id+': complete durable events');
 const a=accountEvents(es),as=es.filter(e=>e.type==='assistant'),requests=es.filter(e=>e.type==='provider_request'),system=await read(resolve(run,'system.json'));
 variants[r.arm].systems.add(system.normalizedHash);requests.forEach(p=>variants[r.arm].schemas.add(p.toolsHash));
 check(requests.length===as.length,r.id+': all requests matched to finalized assistant events');check(!a.unknown&&r.totalEstimatedUsd!==null,r.id+': complete full costs');check(near(a.usage.estimatedApiUsd,r.totalEstimatedUsd),r.id+': cost sum');
 for(const e of as){topCalls[r.arm]+=e.content.filter(c=>c.type==='toolCall').length;for(const k of Object.keys(costs[r.arm]))costs[r.arm][k]+=e.usage.cost[k]??0;}
 let actualUser,rawUsageMatches=null;
 if(r.arm==='stock-pi'){
  const raw=es.filter(e=>e.type==='provider_usage'),unique=[...new Map(raw.map(e=>[e.responseId,e])).values()];
  rawUsageMatches=unique.length===as.length&&unique.every((e,i)=>{const u=e.usage,c=u.input_tokens_details?.cached_tokens??0,s=as[i].usage;return s.input===u.input_tokens-c&&s.cacheRead===c&&s.output===u.output_tokens&&s.totalTokens===u.total_tokens;});check(rawUsageMatches,r.id+': raw provider usage agrees with SDK costs');
  actualUser=requests[0].users.map(u=>typeof u.content==='string'?u.content:u.content.map(c=>c.text??'').join('\n')).join('\n');
  for(const p of requests){check(JSON.stringify(p.tools.map(t=>t.name))===JSON.stringify(['read','bash','edit','write']),r.id+': full native default declaration');const text=p.instructions??p.system.map(s=>typeof s.content==='string'?s.content:s.content.map(c=>c.text??'').join('\n')).join('\n');check(text===system.systemPrompt,r.id+': actual native system content equals saved stock prompt');}
 }else{
  const tr=await read(resolve(worker,'transcript.json')),u=tr.find(t=>t.role==='user');actualUser=typeof u.content==='string'?u.content:u.content.map(c=>c.text??'').join('\n');
  check(tr.filter(t=>t.role==='assistant').every(t=>t.model===m.model.model&&t.provider===m.model.provider),r.id+': saved actual Suffice provider/model');
 }
 check(hash(actualUser)===m.prompts[r.task].sha256,r.id+': actual common public task text');
 const source=resolve('benchmarks/benchmark-v1/tasks',r.task),task=await read(resolve(source,'task.json')),baseActor=resolve(source,task.workspaceDir),actor=resolve(run,'actor-final'),base=spawnSync('git',['rev-list','--max-parents=0','HEAD'],{cwd:actor,encoding:'utf8'}).stdout.trim();let initialChecked=0;
 const changed=await read(resolve(run,'patch.json'));
 for(const p of [...new Set(['README.md','tests/visible.test.mjs',...changed.map(p=>p.path)])]){const blob=spawnSync('git',['show',base+':'+p],{cwd:actor});check(blob.status===0&&hash(blob.stdout)===hash(await readFile(resolve(baseActor,p))),r.id+': initial committed actor bytes '+p);initialChecked++;}
 for(const e of es.filter(e=>e.type==='tool_call')){
  const path=e.input?.path,command=e.input?.command;let outside=false;
  if(typeof path==='string'){const target=resolve('.suffice/actors',r.id,path),rel=relative(resolve('.suffice/actors',r.id),target);outside=isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep);}
  check(!outside,r.id+': direct tool path outside workspace');
  access.push({id:r.id,arm:r.arm,name:e.name,path,command,outsideWorkspacePath:outside,shellNeedsReview:typeof command==='string'&&/(?:\.\.[/\\]|\.suffice|\.codex|auth\.json|benchmarks|private[/\\]|reference[/\\]|https?:\/\/|git\s+(fetch|pull|clone)|npm\s+(install|ci))/.test(command)});
 }
 rows.push({id:r.id,arm:r.arm,requests:requests.length,assistantReplies:as.length,rawUsageMatches,initialCommittedFilesChecked:initialChecked,passed:failures.length===start});
}
for(const arm of ['suffice','stock-pi']){check(variants[arm].systems.size===1,arm+': within-arm instructions stable except exact cwd');check(variants[arm].schemas.size===1,arm+': tool schemas stable');}
const result={at:new Date().toISOString(),passed:failures.length===0,failures,rows,costComponentsAllAttempts:costs,topLevelModelToolCalls:topCalls,parity:Object.fromEntries(Object.entries(variants).map(([arm,v])=>[arm,{normalizedInstructionVariants:v.systems.size,toolSchemaVariants:v.schemas.size}])),crossAgentInstructions:'Intentionally different native system/tool contracts. Actual common user text matches per task; no cross-product byte-parity pass claimed.',accessReview:{directOutsidePaths:access.filter(a=>a.outsideWorkspacePath).length,shellFlags:access.filter(a=>a.shellNeedsReview),note:'Raw shell commands preserved in access-review.json; parent must inspect them, not treat a lexical scan as OS isolation.'}};
await writeFile('reports/external-pi/access-review.json',JSON.stringify(access,null,2)+'\n');await writeFile('reports/external-pi/receipt-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
