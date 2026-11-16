// One session host per chat; all hosts share the authenticated model runtime.
export function createThreadRouter({send,createHost,createRuntime,savedCatalog}) {
 const records=new Set(),byThread=new Map();let selected=null,viewedThread=null,selectionRevision=0,runtimePromise;
 const runtime=options=>runtimePromise??=createRuntime(options);
 function create(){
  const pending=new Map();let sequence=0;
  const record={busy:false,started:false,threadId:null,clientId:null,events:[],approvals:new Map(),eventSequence:0,baseMessages:[]};records.add(record);
  record.emit=message=>{
   const event={...message,sequence:++record.eventSequence,threadId:record.threadId,clientId:record.clientId};
   if(message.event==='approval')record.approvals.set(message.requestId,event);
   if(message.event==='approval_resolved')record.approvals.delete(message.requestId);
   if(record.busy&&['turn_started','assistant_start','text','reasoning','tool_start','tool_output','tool_end','changes','compaction_start','compaction_end','approval','approval_resolved'].includes(message.event)){
    const last=record.events.at(-1);if(last&&last.event===event.event&&['text','reasoning'].includes(event.event)){last.text+=event.text||'';last.sequence=event.sequence;}else record.events.push({...event});
   }
   send(event);
  };
  const receive=createHost({createRuntime:runtime,send:message=>{
   if(message.event){
    if(message.event==='thread_started'){record.started=true;record.threadId=message.id;byThread.set(message.id,record);}
    record.emit(message);
   }else{const response=pending.get(message.id);if(response){pending.delete(message.id);message.ok?response.resolve(message.result):response.reject(new Error(message.error));}}
  }});
  record.request=(action,payload)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});void receive({id,action,payload});});
  record.ready=record.request('status');return record;
 }
 function forget(record){
  for(const [key,value] of byThread)if(value===record)byThread.delete(key);
  records.delete(record);
  if(selected===record)selected=null;
 }
 const catalog=savedCatalog??create();
 let modelHost=savedCatalog?null:catalog,stopped=false;
 return async ({id,action,payload={}})=>{
  try{
   let result;
   if(action==='shutdown'){stopped=true;selectionRevision++;await Promise.all([savedCatalog?.request('shutdown'),...[...records].map(record=>record.request('shutdown'))]);result=null;}
   else if(stopped)throw new Error('Harness is shutting down');
   else if(action==='status'||action==='models'){modelHost??=create();await modelHost.ready;result=await modelHost.request(action,payload);}
   else if(action==='threads'){await catalog.ready;result=await catalog.request(action,payload);result=result.map(thread=>{const run=byThread.get(thread.id);return run?{...thread,status:run.busy?(run.approvals.size?'approval':'working'):run.failed?'failed':thread.status,startedAt:run.startedAt,provider:run.provider??thread.provider,model:run.model??thread.model}:thread;});}
   else if(['delete-thread','release-thread'].includes(action)){
    const target=byThread.get(payload.id);if(target?.busy)throw new Error('Stop this thread before deleting it');
    await catalog.ready;result=await catalog.request(savedCatalog?'release-location':'thread-location',payload);
    if(target){await target.request('reset');forget(target);}
    if(viewedThread===payload.id){selectionRevision++;viewedThread=null;await catalog.request(savedCatalog?'clear-view':'reset');}
   }
   else if(action==='thread-location'){await catalog.ready;result=await catalog.request(action,payload);}
   else if(action==='thread'){
    const revision=++selectionRevision,live=byThread.get(payload.id);
    if(live?.busy){await live.snapshotReady;if(live.busy){selected=live;viewedThread=payload.id;result={id:payload.id,title:live.title,cwd:live.cwd,messages:[...live.baseMessages,{role:'user',timestamp:live.startedAt,attachments:live.attachments,content:[{type:'text',text:live.prompt},...(live.images||[])]}],running:true,runtime:{startedAt:live.startedAt,provider:live.provider,model:live.model,sequence:live.eventSequence,events:live.events.map(event=>({...event})),approvals:[...live.approvals.values()]}};send({id,ok:true,result});return;}}
    // Viewing a transcript is read-only. Start/resume its harness only on Send.
    result=await catalog.request('thread',payload);
    if(revision===selectionRevision){selected=byThread.get(payload.id)??null;viewedThread=payload.id;}
    result={...result,running:false};
   }else if(action==='reset'){selectionRevision++;selected=null;viewedThread=null;await savedCatalog?.request('reset');result=null;}
   else {
    const record=payload.threadId?byThread.get(payload.threadId):payload.clientId?null:selected;
    if(action==='run'){
     const resumeId=payload.threadId||(!payload.clientId?viewedThread:null);
     const existing=record??byThread.get(resumeId);
     if(existing?.busy||byThread.get(payload.clientId)?.busy)throw new Error('A task is already running in this thread');
     if(typeof payload.prompt!=='string'||!payload.prompt.trim()||payload.prompt.length>1000000)throw new Error('A valid prompt is required');
     const target=existing??create();
     const snapshot=Promise.withResolvers();
     selected=target;
     target.busy=true;
     target.snapshotReady=snapshot.promise;
     target.clientId=payload.clientId;
     target.startedAt=Date.now();
     target.provider=payload.provider;
     target.model=payload.model;
     target.failed=false;
     target.cwd=payload.cwd;
     target.prompt=payload.displayPrompt??payload.prompt;
     target.title=payload.prompt.slice(0,90);
     target.attachments=payload.attachmentMetadata||[];
     target.images=payload.images||[];
     target.baseMessages=[];
     target.events=[];
     target.approvals.clear();
     // Reserve both spellings before status or saved projection can yield.
     if(!existing&&resumeId){target.threadId=resumeId;byThread.set(resumeId,target);}
     if(payload.clientId)byThread.set(payload.clientId,target);
     try{
      await target.ready;
      if(stopped)throw new Error('Harness is shutting down');
      if(resumeId){
       const view=await (existing?catalog:target).request('thread',{id:resumeId});
       target.baseMessages=view.messages||[];
       target.title=view.title||target.title;
      }
      if(stopped)throw new Error('Harness is shutting down');
      snapshot.resolve();
      result=await target.request('run',{...payload,turnStartedAt:target.startedAt});
      target.busy=false;
      target.emit({event:'run_completed',result});
     }catch(error){
      target.failed=true;
      target.busy=false;
      target.emit({event:'run_completed',error:error.message});
      if(!existing&&!target.started){
       forget(target);
       snapshot.resolve();
       if(!stopped)await target.request('shutdown').catch(()=>{});
      }
      throw error;
     }finally{
      snapshot.resolve();
      target.busy=false;
      target.events=[];
      target.approvals.clear();
     }
    }else if(action==='usage'){result=record?await record.request('usage'):viewedThread?await catalog.request('usage'):null;}
    else if(['abort','steer','approval-answer','extension-answer'].includes(action)){if(!record)throw new Error('No active thread');result=await record.request(action,payload);if(action==='steer')record.events.push({event:'steering',text:payload.displayPrompt??payload.prompt,attachments:payload.attachmentMetadata,images:payload.images,timestamp:Date.now(),sequence:++record.eventSequence});}
    else throw new Error('Unknown harness action');
   }
   send({id,ok:true,result});
  }catch(error){send({id,ok:false,error:error.message});}
 };
}
