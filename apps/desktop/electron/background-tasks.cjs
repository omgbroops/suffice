// Each background session owns a host, so it cannot replace the viewed session.
function createBackgroundTasks({fork,entry,emit}){
 const workers=new Set(),sessions=new Map();
 async function run(payload){
  const worker=fork(entry,[],{serviceName:'Suffice background session',stdio:'pipe'});workers.add(worker);
  let sequence=0;const pending=new Map();
  const request=(action,payload)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,action,payload});});
  const route={request};sessions.set(worker,route);if(payload.clientId)sessions.set(payload.clientId,route);
  worker.on('message',message=>{if(message.event){if(message.event==='thread_started'){route.threadId=message.id;sessions.set(message.id,route);}if(['approval','extension_ui'].includes(message.event)){emit({...message,threadId:route.threadId,clientId:payload.clientId});return;}if(message.event==='thread_started')emit({event:'background_started',threadId:message.id,clientId:payload.clientId,title:payload.prompt.slice(0,90),project:require('node:path').basename(payload.cwd||'Project')});return;}const response=pending.get(message.id);if(response){pending.delete(message.id);message.ok?response.resolve(message.result):response.reject(new Error(message.error));}});
  worker.on('exit',()=>{workers.delete(worker);for(const response of pending.values())response.reject(new Error('Background session exited'));pending.clear();});
  worker.stderr?.on('data',data=>process.stderr.write(data));
  try{await request('status');const result=await request('run',payload);emit({event:'background_completed',threadId:result.threadId});return result;}
  finally{await Promise.race([request('shutdown').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))]);for(const [key,value] of sessions)if(value===route)sessions.delete(key);worker.kill();workers.delete(worker);}
 }
 async function stop(){await Promise.all([...new Set(sessions.values())].map(session=>Promise.race([session.request('shutdown').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))])));for(const worker of workers)worker.kill();workers.clear();sessions.clear();}
 return {run,stop,request:(action,payload)=>sessions.get(payload?.threadId||payload?.clientId)?.request(action,payload)};
}
module.exports={createBackgroundTasks};
