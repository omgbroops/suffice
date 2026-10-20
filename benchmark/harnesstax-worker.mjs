import {readFile,writeFile,mkdir,cp,copyFile,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';

const R='/receipts';
if(process.argv[2]==='preflight') {
  for(const p of ['/agent-auth/pi.json','/agent-auth/codex.json','/runtime/src/execution/entry.mjs','/codexruntime/node_modules/@openai/codex/bin/codex.js'])await access(p);
  const runtime=await ModelRuntime.create({authPath:'/agent-auth/pi.json',modelsPath:null,allowModelNetwork:false});
  for(const id of ['gpt-6.1-sol','gpt-6-luna']) {
    const m=runtime.getModel('openai',id);if(!m)throw Error('Missing model '+id);
    console.log(JSON.stringify({id:m.id,provider:m.provider,api:m.api,cost:m.cost}));
  }
  process.exit(0);
}
let input='';for await(const b of process.stdin)input+=b;
const r=JSON.parse(input);await mkdir(R,{recursive:true});
await mkdir('/agent-home/codex',{recursive:true,mode:0o700});
await mkdir('/agent-home/pi',{recursive:true,mode:0o700});
await copyFile('/agent-auth/codex.json','/agent-home/codex/auth.json');
await copyFile('/agent-auth/pi.json','/agent-home/pi/auth.json');
const persistAuth=async()=>{
  for(const [from,to] of [['/agent-home/pi/auth.json','/agent-auth/pi.json'],['/agent-home/codex/auth.json','/agent-auth/codex.json']])
    await copyFile(from,to);
};
if(r.arm==='codex') {
  // Reuse the previous campaign's native response ledger, with no prompt/tool
  // changes. This adapter file is generated from that committed source at freeze.
  const child=spawn('/runtime-bin/node',['/runtime/benchmark/harnesstax-native-worker.mjs'],{cwd:r.workspace,stdio:['pipe','inherit','inherit']});
  child.stdin.end(JSON.stringify({prompt:r.prompt,limits:r}));
  const code=await new Promise((yes,no)=>{child.on('error',no);child.on('close',yes);});
  await persistAuth();process.exitCode=code??1;
} else if(r.arm==='pi') {
  const start=Date.now();
  const extension=`import {appendFileSync,writeFileSync} from 'node:fs';
export default function(pi) {
 let turns=0,spent=0,calls=0,stopped=null;
 const log=e=>appendFileSync('/receipts/events.live.jsonl',JSON.stringify(e)+'\\n');
 pi.on('before_provider_request',e=>{if(turns>=100||spent>=5)throw Error('Task allowance exhausted');log({type:'provider_request',model:e.payload.model,reasoning:e.payload.reasoning,toolNames:(e.payload.tools??[]).map(t=>t.name)});});
 pi.on('provider_stream_event',e=>{if(e.data?.response?.usage)log({type:'provider_usage',responseId:e.data.response.id,usage:e.data.response.usage});});
 pi.on('tool_call',(e,ctx)=>{calls++;log({type:'tool_call',name:e.toolName,input:e.input});if(calls>240){stopped='tool_limit';ctx.abort();return {block:true,reason:'Task allowance exhausted'};}});
 pi.on('turn_end',(e,ctx)=>{turns++;spent+=e.message.usage?.cost?.total??0;log({type:'assistant',model:e.message.model,usage:e.message.usage,stopReason:e.message.stopReason});if(e.message.content.some(c=>c.type==='toolCall')&&(turns>=100||spent>=5)){stopped=turns>=100?'turn_limit':'cost_limit';ctx.abort();}writeFileSync('/receipts/pi-counter.json',JSON.stringify({turns,spent,calls,stopped}));});
}`;
  await writeFile('/agent-home/pi-observer.ts',extension);
  const args=['/runtime/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js',
    '--mode','json','--provider','openai','--model','gpt-6.1-sol','--thinking','high',
    '--no-extensions','--extension','/agent-home/pi-observer.ts','--session-dir','/receipts/pi-sessions','-p',r.prompt];
  await writeFile(R+'/native-command.json',JSON.stringify({executable:'node',args:args.slice(0,-1),promptOnArgv:true,version:'1.2.0'}));
  const child=spawn('/runtime-bin/node',args,{cwd:r.workspace,stdio:['ignore','pipe','pipe']});
  const out=[],err=[];let timedOut=false;
  child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},r.timeoutMs);
  const code=await new Promise((yes,no)=>{child.on('error',no);child.on('close',yes);});clearTimeout(timer);
  await writeFile(R+'/pi-events.jsonl',Buffer.concat(out));await writeFile(R+'/pi-stderr.txt',Buffer.concat(err));
  const rows=(await readFile(R+'/events.live.jsonl','utf8').catch(()=>'' )).split('\n').filter(Boolean).map(JSON.parse);
  const assistants=rows.filter(e=>e.type==='assistant'),requests=rows.filter(e=>e.type==='provider_request');
  const usage={input:0,cacheRead:0,cacheWrite:0,output:0,estimatedApiUsd:0,costUnknown:!assistants.length||requests.length!==assistants.length};
  for(const e of assistants){for(const k of ['input','cacheRead','cacheWrite','output'])usage[k]+=e.usage?.[k]??0;
    if(Number.isFinite(e.usage?.cost?.total))usage.estimatedApiUsd+=e.usage.cost.total;else usage.costUnknown=true;
    if(['error','aborted'].includes(e.stopReason))usage.costUnknown=true;}
  const counter=JSON.parse(await readFile(R+'/pi-counter.json','utf8').catch(()=>'{}'));
  const result={status:timedOut?'timeout':counter.stopped??(code===0?'completed':'provider_error'),usage,
    latencyMs:Date.now()-start,modelCalls:assistants.length,toolCalls:counter.calls??0,
    identity:requests.length>0&&requests.every(e=>e.model==='gpt-6.1-sol'&&e.reasoning?.effort==='high'),
    nativeExitCode:code,stockPromptAndToolsUnmodified:true};
  await writeFile(R+'/worker.json',JSON.stringify(result,null,2));await persistAuth();
} else {
  const {executeStrategy}=await import('../src/execution/strategies.mjs');
  const runtime=await ModelRuntime.create({authPath:'/agent-home/pi/auth.json',modelsPath:null,allowModelNetwork:false});
  const result=await executeStrategy({...r,strategy:r.arm==='v2'?'efficient':'flexible',experimental:true,
    model:r.arm==='v2'?'gpt-6-luna':'gpt-6.1-sol',effort:'high',runtime,runDir:R,
    checks:r.arm==='v2'?r.checks:[]});
  console.log(JSON.stringify({status:result.status,usage:result.usage,escalations:result.escalations}));
  await persistAuth();
}
