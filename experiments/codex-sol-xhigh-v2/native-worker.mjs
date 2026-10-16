// Observation and allowance enforcement only; Codex's native prompts and tools are unchanged.
import {spawn} from 'node:child_process';
import {readFile,writeFile,readdir,appendFile} from 'node:fs/promises';
let input='';for await(const b of process.stdin)input+=b;
const {prompt,limits}=JSON.parse(input),dir='/receipts',home=process.env.CODEX_HOME;
const price={input:2,output:10,cacheRead:.1,cacheWrite:2.5,tiers:[{inputTokensAbove:272000,input:4,output:15,cacheRead:.2,cacheWrite:5}]};
const started=Date.now(),seen=new Set(),callsSeen=new Set(),contexts=[],records=[];
let reason=null,tail=Promise.resolve(),nativeOutput='',pending='',nativeErrors=[],scanning=false;
const usage={input:0,cacheRead:0,cacheWrite:0,output:0,totalTokens:0,estimatedApiUsd:0};
const log=e=>{tail=tail.then(()=>appendFile(dir+'/events.live.jsonl',JSON.stringify({at:new Date().toISOString(),...e})+'\n'));};
const command=['/codexruntime/node_modules/@openai/codex/bin/codex.js','exec','--json','--dangerously-bypass-approvals-and-sandbox','--skip-git-repo-check','--model','gpt-6.1-sol','-c','model_reasoning_effort="xhigh"','-'];
await writeFile(dir+'/native-command.json',JSON.stringify({executable:'node',args:command,stdinPrompt:true,nativePromptAndToolsUnmodified:true,cliVersion:'0.163.0'},null,2));
log({type:'startup',version:'native-codex-0.163.0',model:{id:'gpt-6.1-sol',cost:price},nativePromptAndToolsUnmodified:true});
const child=spawn('node',command,{stdio:['pipe','pipe','pipe']});
const stop=r=>{reason??=r;child.kill('SIGTERM');};
async function files(p){let out=[];try{for(const e of await readdir(p,{withFileTypes:true})){const q=p+'/'+e.name;if(e.isDirectory())out.push(...await files(q));else if(e.name.endsWith('.jsonl'))out.push(q);}}catch(e){if(e.code!=='ENOENT')throw e;}return out;}
async function scan(){
 if(scanning)return;scanning=true;
 try{for(const file of await files(home+'/sessions')){
  const bytes=await readFile(file,'utf8');
  for(const line of bytes.split('\n')){let row;try{row=JSON.parse(line);}catch{continue;}const p=row.payload??{};
   if(row.type==='turn_context'&&!contexts.some(c=>c.turnId===p.turn_id)){const c={turnId:p.turn_id,model:p.model,effort:p.effort};contexts.push(c);log({type:'native_context',...c});}
   if(row.type==='response_item'&&['function_call','custom_tool_call'].includes(p.type)&&!callsSeen.has(p.call_id)){
    callsSeen.add(p.call_id);log({type:'tool_call',name:p.name,callId:p.call_id,input:p.arguments??p.input,origin:'native-rollout'});
   }
   if(row.type!=='token_usage_record'||seen.has(p.response_id))continue;
   if(!p.response_id)throw Error('Missing native response identity');seen.add(p.response_id);records.push(p);
   const u=p.usage;if(!u||!Number.isFinite(u.input_tokens)||!Number.isFinite(u.output_tokens))throw Error('Incomplete native usage');
   const normalized={input:u.input_tokens-(u.cached_input_tokens??0)-(u.cache_write_input_tokens??0),cacheRead:u.cached_input_tokens??0,cacheWrite:u.cache_write_input_tokens??0,output:u.output_tokens,totalTokens:u.total_tokens};
   if(normalized.input<0)throw Error('Unsupported native token partition');
   const rates=u.input_tokens>272000?price.tiers[0]:price;
   normalized.cost={};for(const k of ['input','cacheRead','cacheWrite','output']){usage[k]+=normalized[k];normalized.cost[k]=normalized[k]*rates[k]/1e6;}
   normalized.cost.total=Object.values(normalized.cost).reduce((a,b)=>a+b,0);usage.totalTokens+=u.total_tokens;usage.estimatedApiUsd+=normalized.cost.total;
   log({type:'provider_usage',responseId:p.response_id,source:'native-token_usage_record',usage:{input_tokens:u.input_tokens,output_tokens:u.output_tokens,input_tokens_details:{cached_tokens:u.cached_input_tokens??0},output_tokens_details:{reasoning_tokens:u.reasoning_output_tokens??0}},nativeUsage:u});
   log({type:'assistant',turn:seen.size,model:'gpt-6.1-sol',usage:normalized,stopReason:'recorded_native_response',responseId:p.response_id,content:[],origin:'native-token_usage_record'});
  }
 }}finally{scanning=false;}
 if(usage.estimatedApiUsd>=limits.maxCostUsd)stop('cost_limit');
 else if(seen.size>=limits.maxTurns)stop('turn_limit');
 else if(callsSeen.size>=limits.maxCalls)stop('tool_limit');
}
const interval=setInterval(()=>void scan().catch(e=>{nativeErrors.push(String(e));stop('accounting_error');}),500);
const timer=setTimeout(()=>stop('timeout'),limits.timeoutMs);
child.stdout.on('data',b=>{nativeOutput+=b;pending+=b;let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);try{const e=JSON.parse(line);if(e.type==='error'||e.type==='turn.failed')nativeErrors.push(e.message??e.error?.message??'native error');}catch{} }});
const stderr=[];child.stderr.on('data',b=>stderr.push(b));child.stdin.on('error',()=>{});child.stdin.end(prompt);
const code=await new Promise(done=>{child.on('error',e=>{nativeErrors.push(String(e));done(null);});child.on('close',done);});
clearInterval(interval);clearTimeout(timer);while(scanning)await new Promise(r=>setTimeout(r,20));await scan();await tail;
await writeFile(dir+'/native-events.jsonl',nativeOutput);await writeFile(dir+'/native-stderr.txt',Buffer.concat(stderr));
const events=nativeOutput.split('\n').filter(Boolean).flatMap(l=>{try{return[JSON.parse(l)];}catch{return[];}}),completed=events.find(e=>e.type==='turn.completed');
const total=completed?.usage,recordTotals=records.reduce((a,p)=>{for(const k of ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens'])a[k]=(a[k]??0)+(p.usage[k]??0);return a;},{});
const matched=!!total&&Object.keys(recordTotals).every(k=>total[k]===recordTotals[k]);
const identity=contexts.length>0&&contexts.every(c=>c.model==='gpt-6.1-sol'&&c.effort==='xhigh');
const result={status:reason??(code===0&&completed?'completed':'provider_error'),turns:seen.size,calls:callsSeen.size,usage,usageCostUnknown:!matched||nativeErrors.length>0,errors:nativeErrors,latencyMs:Date.now()-started,nativeExitCode:code,identity,contexts,recordsMatchedFinalAggregate:matched,recordTotals,finalCliUsage:total??null,requestsObserved:false,nativePromptAndToolsUnmodified:true,commandExecutions:events.filter(e=>e.type==='item.completed'&&e.item?.type==='command_execution').length};
await writeFile(dir+'/worker.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
