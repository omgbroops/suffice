// Read-only native CLI observer plus the common benchmark stopping rules.
// No tool replacement, custom prompt, context edits, model routing or output filtering.
import {appendFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export default function(pi){
 const dir=process.env.SUFFICE_OBSERVER_DIR;if(!dir)throw new Error('Observer directory required');mkdirSync(dir,{recursive:true});
 const limits=JSON.parse(process.env.SUFFICE_OBSERVER_LIMITS);let turns=0,calls=0,cost=0,stopReason;
 const log=e=>appendFileSync(resolve(dir,'events.live.jsonl'),JSON.stringify({at:new Date().toISOString(),...e})+'\n');
 const stop=(reason,ctx)=>{if(stopReason)return;stopReason=reason;log({type:'benchmark_stop',reason});ctx.abort();};
 pi.on('session_start',(_e,ctx)=>{
  const m=ctx.model;
  log({type:'startup',model:m?{id:m.id,provider:m.provider,api:m.api,cost:m.cost,contextWindow:m.contextWindow,reasoning:m.reasoning}:null,activeTools:pi.getActiveTools(),allTools:pi.getAllTools().map(t=>({name:t.name,description:t.description,parameters:t.parameters})),systemPrompt:ctx.getSystemPrompt(),cwd:ctx.cwd});
 });
 pi.on('before_agent_start',(e)=>log({type:'initial_prompt',message:e.prompt??e.message,systemPrompt:e.systemPrompt}));
 pi.on('before_provider_request',(e,ctx)=>{
  const p=e.payload;
  log({type:'provider_request',model:p.model,reasoning:p.reasoning,tools:p.tools,toolsHash:hash(p.tools??[]),instructions:p.instructions,system:(p.input??[]).filter(m=>['system','developer'].includes(m.role)),users:(p.input??[]).filter(m=>m.role==='user'),bytes:JSON.stringify(p).length});
  if(p.model!=='gpt-6.1-sol'||p.reasoning?.effort!=='low')throw new Error('Frozen model or effort mismatch');
  if(stopReason||cost>=limits.maxCostUsd||turns>=limits.maxTurns){stop(stopReason??(cost>=limits.maxCostUsd?'cost_limit':'turn_limit'),ctx);throw new Error('Benchmark allowance exhausted');}
 });
 pi.on('after_provider_response',e=>log({type:'provider_response',status:e.status}));
 pi.on('provider_stream_event',e=>{const d=e.data;if(d?.response?.usage)log({type:'provider_usage',api:e.api,model:e.model,responseId:d.response.id,status:d.type,usage:d.response.usage});});
 pi.on('message_end',(e,ctx)=>{
  if(e.message.role!=='assistant')return;const m=e.message;turns++;cost+=m.usage?.cost?.total??0;
  log({type:'assistant',turn:turns,model:m.model,provider:m.provider,api:m.api,usage:m.usage,stopReason:m.stopReason,error:m.errorMessage,content:m.content});
  if(m.content.some(c=>c.type==='toolCall')){if(cost>=limits.maxCostUsd)stop('cost_limit',ctx);else if(turns>=limits.maxTurns)stop('turn_limit',ctx);}
 });
 pi.on('tool_call',(e,ctx)=>{calls++;log({type:'tool_call',name:e.toolName,input:e.input,callId:e.toolCallId,parentCallId:e.parentToolCallId});if(calls>limits.maxCalls){stop('tool_limit',ctx);return {block:true,reason:'Common benchmark tool-call allowance exhausted'};}});
 pi.on('tool_result',e=>log({type:'tool_result',name:e.toolName,callId:e.toolCallId,parentCallId:e.parentToolCallId,isError:e.isError,content:e.content,details:e.details}));
 pi.on('agent_end',e=>{writeFileSync(resolve(dir,'agent-messages.json'),JSON.stringify(e.messages));log({type:'agent_end'});});
}
