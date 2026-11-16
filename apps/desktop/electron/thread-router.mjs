import {createJsRunRegistry} from './run-registry.mjs';

// The registry owns live IDs and lifecycle. This router keeps the actual Pi
// callbacks and replay data in the worker that produced them.
export function createThreadRouter({send,createHost,createRuntime,savedCatalog,registry=createJsRunRegistry()}) {
 const records=new Set(),hosts=new Map();
 let selectedSlot=null,viewedThread=null,selectionRevision=0,runtimePromise;
 const runtime=options=>runtimePromise??=createRuntime(options);
 function create(slot=null){
  const pending=new Map();let sequence=0;
  const record={slot,events:[],approvals:new Map(),eventSequence:0,baseMessages:[]};
  record.emit=(message,state=slot===null?null:registry.state(slot)??record.shutdownTurn)=>{
   const event={...message,sequence:++record.eventSequence,threadId:state?.threadId??null,
    clientId:state?.clientId??(record.emptyClient?'':record.omittedClient?undefined:null)};
   if(message.event==='approval')record.approvals.set(message.requestId,event);
   if(message.event==='approval_resolved')record.approvals.delete(message.requestId);
   if(state?.busy&&['turn_started','assistant_start','text','reasoning','tool_start','tool_output','tool_end','changes','compaction_start','compaction_end','approval','approval_resolved'].includes(message.event)){
    const last=record.events.at(-1);
    if(last&&last.event===event.event&&['text','reasoning'].includes(event.event)){last.text+=event.text||'';last.sequence=event.sequence;}else record.events.push({...event});
   }
   send(event);
  };
  const receive=createHost({createRuntime:runtime,send:message=>{
   if(message.event){
    if(message.event==='thread_started'){
     const {runGeneration,...visible}=message;
     const generation=runGeneration??(registry.requiresGeneration?null:registry.state(slot)?.generation);
     if(generation==null){
      if(registry.requiresGeneration&&!registry.stopped)throw new Error('Missing live run generation');
      return;
     }
     const bound=registry.bind(slot,generation,message.id);
     if(bound)record.emit(visible,bound);
    }else record.emit(message);
   }else{
    const response=pending.get(message.id);
    if(response){pending.delete(message.id);message.ok?response.resolve(message.result):response.reject(new Error(message.error));}
   }
  }});
  record.request=(action,payload,runGeneration)=>new Promise((resolve,reject)=>{
   const id=++sequence;pending.set(id,{resolve,reject});
   const fail=error=>{if(pending.delete(id))reject(error);};
   try{Promise.resolve(receive({id,action,payload,...(runGeneration==null?{}:{runGeneration})})).catch(fail);}catch(error){fail(error);}
  });
  records.add(record);if(slot!==null)hosts.set(slot,record);
  record.ready=record.request('status');
  return record;
 }
 function forget(record){
  records.delete(record);hosts.delete(record.slot);
  if(selectedSlot===record.slot)selectedSlot=null;
 }
 const catalog=savedCatalog??create();
 let modelHost=savedCatalog?null:catalog;
 return async ({id,action,payload={}})=>{
  try{
   let result;
   if(action==='shutdown'){
    if(!registry.stopped){
     // Pi may deliver its interrupted result while shutdown drains. Retain
     // only its emission identity; the registry revokes all routing first.
     for(const record of hosts.values()){
      const state=registry.state(record.slot);
      if(state?.busy)record.shutdownTurn={generation:state.generation,threadId:state.threadId,clientId:state.clientId};
     }
     registry.shutdown();selectionRevision++;
    }
    await Promise.all([savedCatalog?.request('shutdown'),...[...records].map(record=>record.request('shutdown'))]);result=null;
   }else if(registry.stopped)throw new Error('Harness is shutting down');
   else if(action==='status'||action==='models'){modelHost??=create();await modelHost.ready;result=await modelHost.request(action,payload);}
   else if(action==='threads'){
    await catalog.ready;result=await catalog.request(action,payload);
    result=result.map(thread=>{
     const state=registry.resolve(thread.id),run=hosts.get(state?.slot);
     return run?{...thread,status:state.busy?(run.approvals.size?'approval':'working'):state.failed?'failed':thread.status,startedAt:run.startedAt,provider:run.provider??thread.provider,model:run.model??thread.model}:thread;
    });
   }else if(['delete-thread','release-thread'].includes(action)){
    const state=registry.resolve(payload.id);
    const target=hosts.get(state?.slot);
    const ticket=state&&registry.beginRelease(state.slot,state.generation);
    if(state&&ticket==null)throw new Error('Thread changed during release');
    let resetting,disposed=false;
    const resetHost=target?()=>resetting??=target.request('reset').then(()=>{disposed=true;}):undefined;
    try{
     await catalog.ready;
     result=await catalog.request(savedCatalog?'release-location':'thread-location',payload,resetHost);
     await resetHost?.();
    }finally{
     if(state&&registry.endRelease(state.slot,ticket,disposed)&&disposed)forget(target);
    }
    if(viewedThread===payload.id){selectionRevision++;viewedThread=null;await catalog.request(savedCatalog?'clear-view':'reset');}
   }else if(action==='thread-location'){await catalog.ready;result=await catalog.request(action,payload);}
   else if(action==='thread'){
    const revision=++selectionRevision,state=registry.resolve(payload.id),live=hosts.get(state?.slot);
    if(state?.busy){
     await live.snapshotReady;
     const current=registry.state(state.slot);
     if(current?.busy&&current.generation===state.generation){
      if(revision===selectionRevision){selectedSlot=state.slot;viewedThread=payload.id;}
      result={id:payload.id,title:live.title,cwd:live.cwd,messages:[...live.baseMessages,{role:'user',timestamp:live.startedAt,attachments:live.attachments,content:[{type:'text',text:live.prompt},...live.images]}],running:true,runtime:{startedAt:live.startedAt,provider:live.provider,model:live.model,sequence:live.eventSequence,events:live.events.map(event=>({...event})),approvals:[...live.approvals.values()]}};
      send({id,ok:true,result});return;
     }
    }
    result=await catalog.request('thread',payload);
    if(revision===selectionRevision){selectedSlot=registry.resolve(payload.id)?.slot??null;viewedThread=payload.id;}
    result={...result,running:false};
   }else if(action==='reset'){selectionRevision++;selectedSlot=null;viewedThread=null;await savedCatalog?.request('reset');result=null;}
   else if(action==='run'){
    const resumeId=payload.threadId||(!payload.clientId?viewedThread:null);
    const selection=payload.threadId||payload.clientId?null:selectedSlot;
    if(typeof payload.prompt!=='string'||!payload.prompt.trim()||payload.prompt.length>1000000){
     const state=selection===null?registry.resolve(resumeId):registry.state(selection);
     if(state?.busy||registry.resolve(payload.clientId)?.busy)throw new Error('A task is already running in this thread');
     throw new Error('A valid prompt is required');
    }
    const admission=registry.admit(resumeId||null,payload.clientId||null,selection);
    const {slot,generation,created}=admission;
    let target,failed=false,failure;
    const snapshot=Promise.withResolvers();
    try{
     target=created?create(slot):hosts.get(slot);
     selectedSlot=slot;target.snapshotReady=snapshot.promise;target.emptyClient=payload.clientId==='';target.omittedClient=payload.clientId===undefined;
     target.startedAt=Date.now();target.provider=payload.provider;target.model=payload.model;target.cwd=payload.cwd;
     target.prompt=payload.displayPrompt??payload.prompt;target.title=payload.prompt.slice(0,90);
     target.attachments=payload.attachmentMetadata||[];target.images=payload.images||[];
     target.baseMessages=[];target.events=[];target.approvals.clear();
     await target.ready;
     if(registry.stopped)throw new Error('Harness is shutting down');
     if(resumeId){
      const view=await (created?target:catalog).request('thread',{id:resumeId});
      target.baseMessages=view.messages||[];target.title=view.title||target.title;
     }
     if(registry.stopped)throw new Error('Harness is shutting down');
     snapshot.resolve();
     result=await target.request('run',{...payload,turnStartedAt:target.startedAt},generation);
    }catch(error){failed=true;failure=error;}
    finally{snapshot.resolve();}
    const settled=registry.settle(slot,generation,failed);
    const finalState=settled?.state??(registry.stopped&&target?.shutdownTurn?.generation===generation?target.shutdownTurn:null);
    if(!finalState)throw new Error(registry.stopped?'Harness is shutting down':'Stale run completion');
    if(target){
     target.emit(failed?{event:'run_completed',error:failure.message}:{event:'run_completed',result},finalState);
     target.events=[];target.approvals.clear();target.shutdownTurn=null;
     if(settled?.forgotten){forget(target);await target.request('shutdown').catch(()=>{});}
    }
    if(failed)throw failure;
   }else{
    const state=payload.threadId?registry.resolve(payload.threadId):payload.clientId||selectedSlot===null?null:registry.state(selectedSlot);
    const record=hosts.get(state?.slot);
    if(action==='usage'){result=record?await record.request('usage'):viewedThread?await catalog.request('usage'):null;}
    else if(['abort','steer','approval-answer','extension-answer'].includes(action)){
     if(!record||state.retiring)throw new Error('No active thread');
     result=await record.request(action,payload);
     if(action==='steer'&&registry.state(state.slot)?.generation===state.generation)record.events.push({event:'steering',text:payload.displayPrompt??payload.prompt,attachments:payload.attachmentMetadata,images:payload.images,timestamp:Date.now(),sequence:++record.eventSequence});
    }else throw new Error('Unknown harness action');
   }
   send({id,ok:true,result});
  }catch(error){send({id,ok:false,error:error.message});}
 };
}
