// Restart the transport only for a later explicit request. Never retry a sent action.
exports.createWorkerClient=({fork,onEvent=()=>{},onStderr=()=>{}})=>{
 let current=null,sequence=0,stopped=false;
 const pending=new Map();
 function fail(worker,error){
  if(current===worker)current=null;
  for(const [id,item] of pending)if(item.worker===worker){pending.delete(id);clearTimeout(item.timer);item.reject(error);}
 }
 function start(){
  if(stopped)throw new Error('Harness is shutting down');
  if(current)return current;
  const worker=fork();current=worker;
  worker.on('message',message=>{
   if(current!==worker)return;
   if(message.event){onEvent(message);return;}
   const item=pending.get(message.id);if(!item||item.worker!==worker)return;
   pending.delete(message.id);clearTimeout(item.timer);message.ok?item.resolve(message.result):item.reject(new Error(message.error));
  });
  worker.on('exit',()=>fail(worker,new Error('Harness process exited. The interrupted action was not retried.')));
  worker.on('error',()=>{fail(worker,new Error('Harness process failed'));worker.kill();});
  worker.stderr?.on('data',onStderr);return worker;
 }
 function send(worker,action,payload){
  if(current!==worker)return Promise.reject(new Error('Harness process exited'));
  return new Promise((resolve,reject)=>{
   const id=++sequence,item={worker,resolve,reject};pending.set(id,item);
   if(action!=='run')item.timer=setTimeout(()=>{pending.delete(id);reject(new Error('Harness request timed out: '+action));},30000);
   try{worker.postMessage({id,action,payload});}catch(error){pending.delete(id);clearTimeout(item.timer);reject(error);}
  });
 }
 return {
  async request(action,payload){
   const worker=start();
   if(action==='thread'||action==='run'&&payload?.threadId){worker.historyReady??=send(worker,'threads');await worker.historyReady;}
   return send(worker,action,payload);
  },
  stop(){stopped=true;const worker=current;if(worker){fail(worker,new Error('Harness is shutting down'));worker.kill();}},
  get worker(){return current;}
 };
};
