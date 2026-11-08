import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createAgentSession,DefaultResourceLoader,SettingsManager,SessionManager,createCodemodeExtension} from '@earendil-works/pi-coding-agent';
import {workspaceTools,readText} from './workspace.mjs';
import {boundedRuntime} from './semantic-benchmark.mjs';
import {ACTIVATED_PROTOCOL,ARM_INSTRUCTIONS,InvestigationGate} from './semantic-activation.mjs';
import {createNavigation} from '../packages/cli/src/navigation.mjs';
import {createSemanticTools} from '../packages/cli/src/semantic-tools.mjs';

export async function runActivatedAttempt({runtime,budget,workspace,sourceFiles,directory,task,arm}) {
  await mkdir(directory,{recursive:true});budget.begin();const events=[],disposers=[],sourceReads=[];let receipt=Promise.resolve(),receiptError,session,reason,calls=0,turns=0;
  const start=performance.now(),startedAt=Date.now(),cpuStart=process.cpuUsage();
  const log=e=>{events.push({at:new Date().toISOString(),...e});};
  const gate=new InvestigationGate({arm,sourceFiles,readSource:path=>readText(workspace,path),log});let editTail=Promise.resolve();
  const stop=why=>{reason??=why;void session?.abort();};
  const timer=setTimeout(()=>stop('timeout'),ACTIVATED_PROTOCOL.timeoutMs);
  const totals={input:0,cacheRead:0,cacheWrite:0,output:0,totalTokens:0,estimatedApiUsd:0,modelCalls:0,costUnknown:false};
  let tools=workspaceTools({workspace,artifactsDir:resolve(directory,'artifacts'),log});
  if(arm==='ast-assisted')tools.push(...createNavigation({workspace,includeTypeScript:true,log}));
  if(['semantic-assisted','semantic-optional'].includes(arm))tools.push(...createSemanticTools({workspace,log,onDispose:fn=>disposers.push(fn)}));
  tools=tools.map(tool=>({...tool,execute(id,args,...rest){
    const run=async()=>{
      if(reason)throw new Error('Attempt stopped');
      const mutation=['file_edit','file_write'].includes(tool.name),startEpoch=gate.epoch;
      let authorization;if(mutation)authorization=await gate.authorize(tool.name,args);
      const toolStart=performance.now();
      try {
        const result=await tool.execute(id,args,...rest),data=result.structuredContent;
        if(mutation&&!result.isError)gate.completed(authorization,data);
        if(tool.name==='file_read')sourceReads.push({path:data.path,bytes:Buffer.byteLength(data.text),lines:data.text.split('\n').length});
        if(tool.name==='search')for(const match of data)sourceReads.push({path:match.path,bytes:Buffer.byteLength(match.text),lines:1});
        if(tool.name==='symbol_read'&&data?.text)sourceReads.push({path:data.path,bytes:Buffer.byteLength(data.text)+Buffer.byteLength(data.imports.map(i=>i.text).join('\n')),lines:data.text.split('\n').length+data.imports.length});
        if(!result.isError&&['symbols','symbol_read','symbol_references','semantic_symbols','symbol_dependencies','symbol_callers','impact_analysis','affected_tests'].includes(tool.name))await gate.observe(tool.name,args,data,{callId:id,startEpoch});
        log({type:'tool_result',name:tool.name,callId:id,args,data,isError:!!result.isError,latencyMs:performance.now()-toolStart});return result;
      } catch(error){log({type:'tool_error',name:tool.name,callId:id,args,error:error.message});throw error;}
    };
    if(!['file_edit','file_write'].includes(tool.name))return run();const pending=editTail.then(run);editTail=pending.catch(()=>{});return pending;
  }}));
  const observer=pi=>{pi.on('tool_call',e=>{calls++;log({type:'tool_call',name:e.toolName,args:e.input});if(calls>ACTIVATED_PROTOCOL.maxTools||reason){queueMicrotask(()=>stop('tool_limit'));return {block:true,reason:'Attempt allowance exhausted'};}});};
  const names=tools.map(t=>t.name),settings=SettingsManager.inMemory({compaction:{enabled:false},retry:{enabled:false,maxRetries:0,provider:{maxRetries:0}},cacheWarming:'off',defaultTools:[...names,'codemode'],codemode:{mode:'only',inlineBudget:2000},transport:'sse',enableAnalytics:false,enableInstallTelemetry:false});
  const loader=new DefaultResourceLoader({cwd:workspace,agentDir:resolve(directory,'empty-agent'),settingsManager:settings,noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true,systemPrompt:ACTIVATED_PROTOCOL.prompt+"\n"+ARM_INSTRUCTIONS[arm],extensionFactories:[createCodemodeExtension({mode:'only',models:false,inlineBudget:2000}),observer]});
  let final='',error;
  try {
    await loader.reload();const wrapped=boundedRuntime(runtime,budget,log,async()=>{await receipt;if(receiptError)throw receiptError;}),model=runtime.getModel('openai',ACTIVATED_PROTOCOL.model);
    const created=await createAgentSession({cwd:workspace,agentDir:resolve(directory,'empty-agent'),modelRuntime:wrapped,model,thinkingLevel:ACTIVATED_PROTOCOL.effort,resourceLoader:loader,settingsManager:settings,sessionManager:SessionManager.inMemory(workspace),tools:[...names,'codemode'],customTools:tools});
    session=created.session;await session.bindExtensions({});if(created.extensionsResult.errors.length)throw new Error('Extension setup failed');
    if(session.thinkingLevel!==ACTIVATED_PROTOCOL.effort)throw new Error('Requested reasoning effort unavailable');
    log({type:'startup',arm,tools:session.getActiveToolNames(),systemPrompt:session.systemPrompt,effort:session.thinkingLevel,model:model.id});
    session.subscribe(e=>{if(e.type!=='message_end'||e.message.role!=='assistant')return;
      const m=e.message;turns++;totals.modelCalls++;for(const k of ['input','cacheRead','cacheWrite','output','totalTokens'])totals[k]+=m.usage?.[k]??0;
      if(Number.isFinite(m.usage?.cost?.total))totals.estimatedApiUsd+=m.usage.cost.total;else totals.costUnknown=true;
      if(['error','aborted'].includes(m.stopReason))totals.costUnknown=true;
      log({type:'assistant',model:m.model,usage:m.usage,stopReason:m.stopReason,content:m.content.filter(c=>c.type!=='thinking'),error:m.errorMessage});
      receipt=receipt.then(()=>budget.settle(m)).catch(e=>{receiptError=e;stop('receipt_error');});
      if(turns>=ACTIVATED_PROTOCOL.maxTurns&&m.content.some(c=>c.type==='toolCall'))stop('turn_limit');
    });
    await session.prompt(task.prompt);await receipt;if(receiptError)throw receiptError;
    const last=[...session.messages].reverse().find(m=>m.role==='assistant');if(!last||['error','aborted','length'].includes(last.stopReason))throw new Error(last?.errorMessage??`Response ${last?.stopReason??'missing'}`);
    final=session.getLastAssistantText();
  } catch(e) {error=String(e.message).replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+/g,'[redacted]').slice(0,600);}
  finally {
    clearTimeout(timer);await receipt;
    if(budget.pending){budget.unknown=true;totals.costUnknown=true;}
    if(session){await writeFile(resolve(directory,'transcript.json'),JSON.stringify(session.messages));session.dispose();}disposers.forEach(fn=>fn());
  }
  const semantic=events.filter(e=>e.type==='semantic'),updates=semantic.flatMap(e=>e.updates),navigation=events.filter(e=>e.type==='navigation');
  totals.assistantMessages=totals.modelCalls;totals.modelCalls=events.filter(e=>e.type==='provider_request').length;
  const firstEdit=events.findIndex(e=>e.type==='activated_edit'),investigation=events.slice(0,firstEdit<0?events.length:firstEdit).filter(e=>e.type==='assistant');
  const result={activation:gate.summary(),initialInvestigation:{modelCalls:investigation.length,knownEstimatedUsd:investigation.reduce((n,e)=>n+(e.usage?.cost?.total??0),0),wallMs:firstEdit<0?null:Date.parse(events[firstEdit].at)-startedAt},attemptedTools:Object.fromEntries([...new Set(events.filter(e=>e.type==='tool_call').map(e=>e.name))].map(name=>[name,events.filter(e=>e.type==='tool_call'&&e.name===name).length])),status:reason??(error?'error':'completed'),error,final,totals,wallMs:performance.now()-start,cpuMicros:process.cpuUsage(cpuStart),toolCalls:calls,
    sourceRetrieval:{files:[...new Set(sourceReads.map(r=>r.path))],bytes:sourceReads.reduce((n,r)=>n+r.bytes,0),lines:sourceReads.reduce((n,r)=>n+r.lines,0),events:sourceReads},
    navigation:{calls:navigation.length,latencyMs:navigation.reduce((n,e)=>n+e.latencyMs,0)},
    graph:{calls:semantic.length,toolLatencyMs:semantic.reduce((n,e)=>n+e.latencyMs,0),updates,indexingMs:updates.reduce((n,e)=>n+e.indexingMs,0),io:{scans:semantic.reduce((n,e)=>n+e.io.scans,0),bytes:semantic.reduce((n,e)=>n+e.io.bytes,0),files:semantic.reduce((n,e)=>n+e.io.files,0),scanMs:semantic.reduce((n,e)=>n+e.io.scanMs,0)},peakObservedHeapBytes:updates.length?Math.max(...updates.map(e=>e.heapUsedBytes)):null},
    actualModels:[...new Set(events.filter(e=>e.type==='assistant').map(e=>e.model))],endedAt:new Date().toISOString()};
  await writeFile(resolve(directory,'events.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');return result;
}
