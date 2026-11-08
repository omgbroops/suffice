import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createAgentSession,DefaultResourceLoader,SettingsManager,SessionManager,createCodemodeExtension} from '@earendil-works/pi-coding-agent';
import {workspaceTools} from './workspace.mjs';
import {boundedRuntime,SEMANTIC_PROTOCOL} from './semantic-benchmark.mjs';
import {implicitToolAdapter} from '../packages/cli/src/implicit-tools.mjs';

export const IMPLICIT_PROTOCOL=Object.freeze({...SEMANTIC_PROTOCOL,version:3,arms:['baseline','compact-ast','implicit-semantic','semantic-impact'],repetitions:2,capUsd:4.50,attemptCapUsd:0.50,priorCampaignUsd:1.000582,combinedCapUsd:8,maxTurns:24,maxTools:100,timeoutMs:300000,packetTokens:400,totalPacketTokens:1200,maxExpandedFiles:6,
  prompt:SEMANTIC_PROTOCOL.prompt,interventions:'Within ordinary tool results only. No navigation gates, specialized tools, recipes, helper models, retries or arm-specific instructions.'});

export async function runImplicitAttempt({runtime,budget,workspace,sourceFiles,directory,task,arm,testOptions}){
 await mkdir(directory,{recursive:true});budget.begin();const events=[],sourceReads=[];let receipt=Promise.resolve(),receiptError,session,reason,calls=0,turns=0;
 const start=performance.now(),cpuStart=process.cpuUsage(),heapStart=process.memoryUsage().heapUsed;
 const log=e=>events.push({at:new Date().toISOString(),...e}),stop=why=>{reason??=why;void session?.abort();};
 const timer=setTimeout(()=>stop('timeout'),IMPLICIT_PROTOCOL.timeoutMs),totals={input:0,cacheRead:0,cacheWrite:0,output:0,totalTokens:0,estimatedApiUsd:0,costUnknown:false};
 let tools=workspaceTools({workspace,artifactsDir:resolve(directory,'artifacts'),log,writeRoots:[task.sourceRoot],directorySearch:true,testOptions});
 tools=tools.map(tool=>({...tool,async execute(id,args,...rest){
  if(reason)throw new Error('Attempt stopped');if(['file_edit','file_write'].includes(tool.name)&&!sourceFiles.includes(args.path))throw new Error('Only existing production source may be changed');
  const started=performance.now();try{const result=await tool.execute(id,args,...rest),data=result.structuredContent;
   if(tool.name==='file_read')sourceReads.push({callId:id,path:data.path,offset:data.offset,bytes:Buffer.byteLength(data.text),lines:data.text.split('\n').length});
   if(tool.name==='search')for(const match of data)sourceReads.push({callId:id,path:match.path,offset:match.line,bytes:Buffer.byteLength(match.text),lines:1});
   log({type:'tool_result',name:tool.name,callId:id,args,data,isError:!!result.isError,latencyMs:performance.now()-started});return result;
  }catch(error){log({type:'tool_error',name:tool.name,callId:id,args,error:error.message});throw error;}
 }}));
 const adapter=implicitToolAdapter({workspace,tools,context:arm!=='baseline',impact:arm==='semantic-impact',verification:arm==='semantic-impact',mode:arm==='compact-ast'?'ast':'semantic',maxPacketTokens:IMPLICIT_PROTOCOL.packetTokens,maxTotalTokens:IMPLICIT_PROTOCOL.totalPacketTokens,maxFiles:IMPLICIT_PROTOCOL.maxExpandedFiles,deferToCodemode:true,log});tools=adapter.tools;
 const observer=pi=>{
  pi.on('tool_call',e=>{calls++;log({type:'tool_call',name:e.toolName,args:e.input,callId:e.toolCallId,parentCallId:e.parentToolCallId});if(calls>IMPLICIT_PROTOCOL.maxTools||reason){queueMicrotask(()=>stop('tool_limit'));return {block:true,reason:'Attempt allowance exhausted'};}});
  pi.on('tool_result',async e=>{const patch=await adapter.onToolResult(e);if(patch)log({type:'model_tool_result',callId:e.toolCallId,name:e.toolName,content:patch.content});return patch;});
 };
 const names=tools.map(t=>t.name),settings=SettingsManager.inMemory({compaction:{enabled:false},retry:{enabled:false,maxRetries:0,provider:{maxRetries:0}},cacheWarming:'off',defaultTools:[...names,'codemode'],codemode:{mode:'only',inlineBudget:2000},transport:'sse',enableAnalytics:false,enableInstallTelemetry:false});
 const loader=new DefaultResourceLoader({cwd:workspace,agentDir:resolve(directory,'empty-agent'),settingsManager:settings,noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true,systemPrompt:IMPLICIT_PROTOCOL.prompt,extensionFactories:[createCodemodeExtension({mode:'only',models:false,inlineBudget:2000}),observer]});
 let final='',error;
 try{
  await loader.reload();const wrapped=boundedRuntime(runtime,budget,log,async()=>{await receipt;if(receiptError)throw receiptError;}),model=runtime.getModel('openai',IMPLICIT_PROTOCOL.model);
  const created=await createAgentSession({cwd:workspace,agentDir:resolve(directory,'empty-agent'),modelRuntime:wrapped,model,thinkingLevel:IMPLICIT_PROTOCOL.effort,resourceLoader:loader,settingsManager:settings,sessionManager:SessionManager.inMemory(workspace),tools:[...names,'codemode'],customTools:tools});
  session=created.session;await session.bindExtensions({});if(created.extensionsResult.errors.length)throw new Error('Extension setup failed');if(session.thinkingLevel!==IMPLICIT_PROTOCOL.effort)throw new Error('Requested reasoning effort unavailable');
  log({type:'startup',arm,tools:session.getActiveToolNames(),systemPrompt:session.systemPrompt,effort:session.thinkingLevel,model:model.id});
  session.subscribe(e=>{if(e.type!=='message_end'||e.message.role!=='assistant')return;const m=e.message;turns++;for(const k of ['input','cacheRead','cacheWrite','output','totalTokens'])totals[k]+=m.usage?.[k]??0;
   if(Number.isFinite(m.usage?.cost?.total))totals.estimatedApiUsd+=m.usage.cost.total;else totals.costUnknown=true;if(['error','aborted'].includes(m.stopReason))totals.costUnknown=true;
   log({type:'assistant',model:m.model,usage:m.usage,stopReason:m.stopReason,content:m.content.filter(c=>c.type!=='thinking'),error:m.errorMessage});receipt=receipt.then(()=>budget.settle(m)).catch(e=>{receiptError=e;stop('receipt_error');});
   if(turns>=IMPLICIT_PROTOCOL.maxTurns&&m.content.some(c=>c.type==='toolCall'))stop('turn_limit');
  });
  await session.prompt(task.prompt);await receipt;if(receiptError)throw receiptError;const last=[...session.messages].reverse().find(m=>m.role==='assistant');if(!last||['error','aborted','length'].includes(last.stopReason))throw new Error(last?.errorMessage??`Response ${last?.stopReason??'missing'}`);final=session.getLastAssistantText();
 }catch(e){error=String(e.message).replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+/g,'[redacted]').slice(0,600);}
 finally{clearTimeout(timer);await receipt;if(budget.pending){budget.unknown=true;totals.costUnknown=true;}if(session){await writeFile(resolve(directory,'transcript.json'),JSON.stringify(session.messages));session.dispose();}await adapter.dispose();}
 totals.modelCalls=events.filter(e=>e.type==='provider_request').length;
 const analyses=events.filter(e=>e.type==='implicit_context'),deliveries=events.filter(e=>e.type==='implicit_delivery'),updates=analyses.flatMap(e=>e.updates??[]);
 const result={status:reason??(error?'error':'completed'),error,final,totals,wallMs:performance.now()-start,cpuMicros:process.cpuUsage(cpuStart),heapStart,toolCalls:calls,attemptedTools:Object.fromEntries([...new Set(events.filter(e=>e.type==='tool_call').map(e=>e.name))].map(n=>[n,events.filter(e=>e.type==='tool_call'&&e.name===n).length])),sourceRetrieval:{files:[...new Set(sourceReads.map(r=>r.path))],bytes:sourceReads.reduce((n,r)=>n+r.bytes,0),lines:sourceReads.reduce((n,r)=>n+r.lines,0),events:sourceReads},
  implicit:{analyses:analyses.length,deliveries:deliveries.length,packetTokens:deliveries.reduce((n,e)=>n+e.visibleTokens,0),extraToolResultTokens:deliveries.reduce((n,e)=>n+e.extraToolResultTokens,0),abstentions:Object.fromEntries([...new Set(analyses.filter(e=>!e.packetProposed).map(e=>e.reason))].map(reason=>[reason,analyses.filter(e=>!e.packetProposed&&e.reason===reason).length])),cpuMicros:analyses.reduce((n,e)=>n+(e.cpuMicros?.user??0)+(e.cpuMicros?.system??0),0),latencyMs:analyses.reduce((n,e)=>n+(e.latencyMs??0),0),updates,peakObservedHeapBytes:analyses.some(e=>e.heapUsedBytes)?Math.max(...analyses.filter(e=>e.heapUsedBytes).map(e=>e.heapUsedBytes)):null,cacheHits:analyses.reduce((n,e)=>n+(e.cacheHits??0),0),redundantFacts:analyses.reduce((n,e)=>n+(e.redundantFacts??0),0),unresolved:analyses.reduce((n,e)=>n+(e.unresolved??0),0),staleDetections:analyses.filter(e=>e.staleDetected).length},actualModels:[...new Set(events.filter(e=>e.type==='assistant').map(e=>e.model))],endedAt:new Date().toISOString()};
 await writeFile(resolve(directory,'events.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');return result;
}
