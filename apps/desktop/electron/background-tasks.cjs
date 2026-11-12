// Each background session owns a host, so it cannot replace the viewed session.
function createBackgroundTasks({fork,entry,emit}){
 const workers=new Set();
 async function run(payload){
  const worker=fork(entry,[],{serviceName:'Suffice background session',stdio:'pipe'});workers.add(worker);
  let sequence=0;const pending=new Map();
  const request=(action,payload)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,action,payload});});
  worker.on('message',message=>{if(message.event){if(message.event==='thread_started')emit({event:'background_started',threadId:message.id,clientId:payload.clientId,title:payload.prompt.slice(0,90),project:require('node:path').basename(payload.cwd||'Project')});return;}const response=pending.get(message.id);if(response){pending.delete(message.id);message.ok?response.resolve(message.result):response.reject(new Error(message.error));}});
  worker.on('exit',()=>{workers.delete(worker);for(const response of pending.values())response.reject(new Error('Background session exited'));pending.clear();});
  worker.stderr?.on('data',data=>process.stderr.write(data));
  try{await request('status');const result=await request('run',payload);emit({event:'background_completed',threadId:result.threadId});return result;}
  finally{worker.kill();workers.delete(worker);}
 }
 function stop(){for(const worker of workers)worker.kill();workers.clear();}
 return {run,stop};
}
module.exports={createBackgroundTasks};
