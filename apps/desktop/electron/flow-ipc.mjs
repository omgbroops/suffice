import fs from 'node:fs';
import path from 'node:path';
import {createExec,createFakeRunner,createCommandRunner} from '../../../packages/backend/src/runner/index.mjs';
import {workflows} from '../../../packages/backend/src/app/workflows.mjs';

const MAX_TEXT=32000;
const str=v=>typeof v==='string'&&v.trim().length>0&&v.length<4096;
const text=(v,empty)=>{if(typeof v!=='string'||!v.trim())throw new Error(empty);if(v.length>MAX_TEXT)throw new Error(`Keep it under ${MAX_TEXT} characters`);return v.trim();};
const RUN_ID=/^[A-Za-z0-9._-]+$/;
export const FLOWS=[
 {id:'plan-build-review',name:'Plan, build, review',note:'Plan, build, run the test command, repair once, review.',fields:['task','test','cwd']},
 {id:'plan-approve-build',name:'Plan, approve, build',note:'Plan, then wait for your approval before building.',fields:['task','test','cwd']},
 {id:'best-of-n',name:'Best of three',note:'Three attempts run the test command; the smallest passing one wins.',fields:['task','test','cwd']},
 {id:'research-relay',name:'Research relay',note:'Two lanes research a topic and hand off, then a summary.',fields:['topic']},
].filter(f=>workflows[f.id]);

// Real backend flow engine behind the Workflows page: the real Claude Code CLI as the agent, the fake runner only when SUFFICE_FLOW_RUNNER=fake (tests).
export function createFlow({dataDir,env=process.env,send}){
 const exec=createExec(),runsDir=path.join(dataDir,'runs');
 const runner=env.SUFFICE_FLOW_RUNNER==='fake'
  ?createFakeRunner(()=>({ok:true,text:'done',usage:{inputTokens:900,outputTokens:300}}))
  :createCommandRunner({exec,command:env.SUFFICE_FLOW_COMMAND||'claude',args:['-p','--permission-mode','acceptEdits'],timeoutMs:600000});
 const limit=Number(env.SUFFICE_FLOW_RUN_TOKENS)>=0&&env.SUFFICE_FLOW_RUN_TOKENS!==undefined&&env.SUFFICE_FLOW_RUN_TOKENS!==''?Number(env.SUFFICE_FLOW_RUN_TOKENS):1000000;
 const pending=new Map(),errors=new Map();let n=0;
 const poke=()=>send({type:'flow'});
 const approve=({name,details,runId})=>new Promise(res=>{pending.set('ap'+(++n),{runId,name,details,res});poke();});
 // a cancelled run's question is dropped unanswered, so a resume asks again instead of replaying a denial
 const drop=runId=>{for(const [id,p] of pending)if(p.runId===runId)pending.delete(id);};
 let backend=null;
 const meta=id=>{try{return JSON.parse(fs.readFileSync(path.join(runsDir,id+'.meta.json'),'utf8'));}catch{return null;}};
 const sum=(id,events,row)=>{const listed=row.state;
  const m=meta(id),end=events.findLast(e=>e.type==='run.end'),ask=[...pending].find(([,p])=>p.runId===id);
  let tokens=0,reason=null;const timeline=[];
  for(const e of events){
   const u=e.data?.usage;if(u)tokens+=(u.inputTokens??0)+(u.outputTokens??0);
   if(e.type==='phase')timeline.push({kind:'phase',text:e.data.title,ts:e.ts});
   else if(e.type==='gate')timeline.push({kind:e.data.ok?'ok':'bad',text:`Gate ${e.data.name} ${e.data.ok?'passed':'failed, exit '+e.data.code}`,ts:e.ts});
   else if(e.type==='approval')timeline.push({kind:e.data.approved===undefined?'ask':e.data.approved?'ok':'bad',text:`Approval ${e.data.name} ${e.data.approved===undefined?'requested':e.data.approved?'granted':'denied'}`,ts:e.ts});
   else if(e.type==='budget'){reason=e.data.reason;timeline.push({kind:'bad',text:'Budget refused a step',ts:e.ts});}
   else if(e.type==='log')timeline.push({kind:'phase',text:e.data.message,ts:e.ts});
  }
  const denied=events.findLast(e=>e.type==='approval'&&e.data.approved===false),badGate=events.findLast(e=>e.type==='gate'&&!e.data.ok);
  const cancelled=!!end?.data?.cancelled,failed=end&&!end.data.ok&&!cancelled;
  if(failed&&!reason)reason=denied?`Approval ${denied.data.name} was denied`:badGate?`Gate ${badGate.data.name} failed with exit code ${badGate.data.code}`:errors.get(id)||'The run failed';
  const state=ask?'approval':listed==='running'?'running':cancelled?'cancelled':failed?'failed':end?'ended':'interrupted';
  return {runId:id,workflow:row.workflow,title:m?.args?.task||m?.args?.topic||m?.workflow||id,state,tokens,limit,reason:state==='failed'||state==='interrupted'?reason:null,
   approval:ask?{id:ask[0],name:ask[1].name,details:ask[1].details}:null,last:events.at(-1)?.ts??0,timeline};
 };
 const argsOf=p=>{
  const f=FLOWS.find(x=>x.id===p?.workflow);if(!f)throw new Error('Unknown workflow');
  if(f.fields.includes('topic')){return {topic:text(p.topic,'Describe the topic')};}
  const task=text(p.task,'Describe the task');
  const [cmd,...args]=str(p.test)?p.test.trim().split(/\s+/):[];if(!cmd)throw new Error('Enter the test command that gates the run');
  if(p.cwd!==undefined&&p.cwd!==''&&(!str(p.cwd)||!path.isAbsolute(p.cwd)))throw new Error('Folder must be an absolute path');
  return {task,test:{cmd,args},...(str(p.cwd)&&{cwd:p.cwd})};
 };
 const track=id=>{backend.wait(id).then(r=>{if(!r?.ok&&r?.error)errors.set(id,r.error);},()=>{}).finally(poke);};
 const run=id=>{if(!RUN_ID.test(String(id||'')))throw new Error('Invalid run');return id;};
 return {
  approve,exec,runners:{default:runner},limits:[{name:'run',period:'run',tokens:limit}],
  attach(b){backend=b;},
   handlers:{
   'flow-workflows':()=>({flows:FLOWS,limit}),
   'flow-start':p=>{const id=backend.startRun(p.workflow,argsOf(p));track(id);return {runId:id};},
   'flow-list':async()=>{const rows=await backend.listRuns(),out=[];for(const r of rows){const s=sum(r.runId,await backend.events(r.runId),r);delete s.timeline;out.push(s);}return {limit,runs:out.sort((a,b)=>b.last-a.last)};},
   'flow-detail':async id=>{const r=(await backend.listRuns()).find(x=>x.runId===run(id));if(!r)throw new Error('Unknown run');return sum(r.runId,await backend.events(r.runId),r);},
   'flow-approve':p=>{const e=pending.get(p?.id);if(!e)throw new Error('That approval was already answered');pending.delete(p.id);e.res(!!p.approved);poke();return true;},
   'flow-cancel':id=>{run(id);const ok=backend.cancelRun(id);drop(id);poke();return ok;},
   'flow-resume':async id=>{await backend.resumeRun(run(id));track(id);poke();return true;},
  },
 };
}
