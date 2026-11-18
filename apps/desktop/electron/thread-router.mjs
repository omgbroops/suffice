// One session host per chat; all hosts share the authenticated model runtime.
export function createThreadRouter({send,createHost,createRuntime}) {
 const records=new Set(),byThread=new Map();let selected=null,viewedThread=null,selectionRevision=0,runtimePromise;
 const runtime=options=>runtimePromise??=createRuntime(options);
 function create(){
  const pending=new Map();let sequence=0;
  const record={busy:false,threadId:null,clientId:null,events:[],approvals:new Map(),eventSequence:0,baseMessages:[]};records.add(record);
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
    if(message.event==='thread_started'){record.threadId=message.id;byThread.set(message.id,record);}
    record.emit(message);
   }else{const response=pending.get(message.id);if(response){pending.delete(message.id);message.ok?response.resolve(message.result):response.reject(new Error(message.error));}}
  }});
  record.request=(action,payload)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});void receive({id,action,payload});});
  record.ready=record.request('status');return record;
 }
 const catalog=create();
 return async ({id,action,payload={}})=>{
  try{
   let result;
   if(action==='shutdown'){await Promise.all([...records].map(record=>record.request('shutdown')));result=null;}
   else if(['status','models','threads','review'].includes(action)){await catalog.ready;result=await catalog.request(action,payload);if(action==='threads')result=result.map(thread=>{const run=byThread.get(thread.id);return run?{...thread,status:run.busy?(run.approvals.size?'approval':'working'):run.failed?'failed':thread.status,startedAt:run.startedAt,provider:run.provider??thread.provider,model:run.model??thread.model}:thread;});}
   else if(['delete-thread','release-thread'].includes(action)){
    const target=byThread.get(payload.id);if(target?.busy)throw new Error('Stop this thread before deleting it');
    await catalog.ready;result=await catalog.request('thread-location',payload);
    if(target){await target.request('reset');for(const [key,value] of byThread)if(value===target)byThread.delete(key);records.delete(target);if(selected===target)selected=null;}
    if(viewedThread===payload.id){selectionRevision++;viewedThread=null;await catalog.request('reset');}
   }
   else if(action==='side-release'){const target=byThread.get(payload.threadId);if(target?.busy)throw new Error('Stop the side chat before ending it');if(target){await target.request('reset');for(const [key,value] of byThread)if(value===target)byThread.delete(key);records.delete(target);if(selected===target)selected=null;}result=null;}
   else if(action==='thread-location'){await catalog.ready;result=await catalog.request(action,payload);}
   else if(action==='thread'){
    const revision=++selectionRevision,live=byThread.get(payload.id);
    if(live?.busy){await live.snapshotReady;if(live.busy){selected=live;viewedThread=payload.id;result={id:payload.id,title:live.title,cwd:live.cwd,messages:[...live.baseMessages,{role:'user',timestamp:live.startedAt,attachments:live.attachments,content:[{type:'text',text:live.prompt},...(live.images||[])]}],running:true,runtime:{startedAt:live.startedAt,provider:live.provider,model:live.model,sequence:live.eventSequence,events:live.events.map(event=>({...event})),approvals:[...live.approvals.values()]}};send({id,ok:true,result});return;}}
    // Viewing a transcript is read-only. Start/resume its harness only on Send.
    result=await catalog.request('thread',payload);
    if(revision===selectionRevision){selected=byThread.get(payload.id)??null;viewedThread=payload.id;}
    result={...result,running:false};
   }else if(action==='reset'){selectionRevision++;selected=null;viewedThread=null;result=null;}
   else {
    let record=payload.threadId?byThread.get(payload.threadId):payload.clientId?null:selected;
    if(action==='run'&&payload.side&&!record){const side=create();await side.ready;await side.request('attach',{path:payload.sidePath,cwd:payload.cwd});byThread.set(payload.threadId,side);record=side;}
    if(action==='run'){
     if(record?.busy)throw new Error('A task is already running in this thread');
     const target=record??create();selected=target;target.busy=true;target.events=[];target.approvals.clear();target.prompt=payload.displayPrompt??payload.prompt;target.attachments=payload.attachmentMetadata||[];target.images=payload.images||[];let snapshotReady;target.snapshotReady=new Promise(resolve=>snapshotReady=resolve);target.clientId=payload.clientId;target.startedAt=Date.now();target.provider=payload.provider;target.model=payload.model;target.failed=false;target.cwd=payload.cwd;target.title=payload.prompt.slice(0,90);if(payload.clientId)byThread.set(payload.clientId,target);
     try{await target.ready;const resumeId=payload.threadId||(!payload.clientId?viewedThread:null);target.baseMessages=[];if(resumeId&&!payload.side){const view=await (record?catalog:target).request('thread',{id:resumeId});target.baseMessages=view.messages||[];target.title=view.title||target.title;if(!record){target.threadId=resumeId;byThread.set(resumeId,target);}}snapshotReady();result=await target.request('run',{...payload,turnStartedAt:target.startedAt});target.busy=false;target.emit({event:'run_completed',result});}catch(error){target.failed=true;target.busy=false;target.emit({event:'run_completed',error:error.message});throw error;}finally{snapshotReady();target.busy=false;target.events=[];target.approvals.clear();}
    }else if(['usage','context'].includes(action)){result=record?await record.request(action):viewedThread?await catalog.request(action):null;}
    else if(['abort','steer','approval-answer','extension-answer'].includes(action)){if(!record)throw new Error('No active thread');result=await record.request(action,payload);if(action==='steer')record.events.push({event:'steering',text:payload.displayPrompt??payload.prompt,attachments:payload.attachmentMetadata,images:payload.images,timestamp:Date.now(),sequence:++record.eventSequence});}
    else throw new Error('Unknown harness action');
   }
   send({id,ok:true,result});
  }catch(error){send({id,ok:false,error:error.message});}
 };
}
