// One session host per chat; all hosts share the authenticated model runtime.
export function createThreadRouter({send,createHost,createRuntime}) {
 const records=new Set(),byThread=new Map();let selected=null,viewedThread=null,selectionRevision=0,runtimePromise;
 const runtime=options=>runtimePromise??=createRuntime(options);
 function create(){
  const pending=new Map();let sequence=0;
  const record={busy:false,threadId:null,clientId:null};records.add(record);
  const receive=createHost({createRuntime:runtime,send:message=>{
   if(message.event){
    if(message.event==='thread_started'){record.threadId=message.id;byThread.set(message.id,record);}
    send({...message,threadId:record.threadId,clientId:record.clientId});
   }else{const response=pending.get(message.id);if(response){pending.delete(message.id);message.ok?response.resolve(message.result):response.reject(new Error(message.error));}}
  }});
  record.request=(action,payload)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});void receive({id,action,payload});});
  record.ready=record.request('status');return record;
 }
 const catalog=create();
 return async ({id,action,payload={}})=>{
  try{
   let result;
   if(action==='shutdown'){await Promise.all([...records].map(record=>record.request('abort')));result=null;}
   else if(['status','models','threads'].includes(action)){await catalog.ready;result=await catalog.request(action,payload);if(action==='threads')result=result.map(thread=>{const run=byThread.get(thread.id);return run?{...thread,status:run.busy?'working':run.failed?'failed':thread.status,startedAt:run.startedAt,provider:run.provider??thread.provider,model:run.model??thread.model}:thread;});}
   else if(action==='thread'){
    const revision=++selectionRevision,live=byThread.get(payload.id);
    if(live?.busy){selected=live;viewedThread=payload.id;result={id:payload.id,title:live.title,cwd:live.cwd,messages:[],running:true};send({id,ok:true,result});return;}
    // Viewing a transcript is read-only. Start/resume its harness only on Send.
    result=await catalog.request('thread',payload);
    if(revision===selectionRevision){selected=byThread.get(payload.id)??null;viewedThread=payload.id;}
    result={...result,running:false};
   }else if(action==='reset'){selectionRevision++;selected=null;viewedThread=null;result=null;}
   else {
    const record=payload.threadId?byThread.get(payload.threadId):payload.clientId?null:selected;
    if(action==='run'){
     if(record?.busy)throw new Error('A task is already running in this thread');
     const target=record??create();selected=target;target.busy=true;target.clientId=payload.clientId;target.startedAt=Date.now();target.provider=payload.provider;target.model=payload.model;target.failed=false;target.cwd=payload.cwd;target.title=payload.prompt.slice(0,90);if(payload.clientId)byThread.set(payload.clientId,target);
     try{await target.ready;const resumeId=payload.threadId||(!payload.clientId?viewedThread:null);if(!record&&resumeId){await target.request('thread',{id:resumeId});target.threadId=resumeId;byThread.set(resumeId,target);}result=await target.request('run',payload);}catch(error){target.failed=true;throw error;}finally{target.busy=false;}
    }else if(action==='usage'){result=record?await record.request('usage'):viewedThread?await catalog.request('usage'):null;}
    else if(['abort','steer'].includes(action)){if(!record)throw new Error('No active thread');result=await record.request(action,payload);}
    else throw new Error('Unknown harness action');
   }
   send({id,ok:true,result});
  }catch(error){send({id,ok:false,error:error.message});}
 };
}
