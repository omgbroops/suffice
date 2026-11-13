// The viewed session's harness process: request/response over its message port, event forwarding,
// and a restart with backoff when it dies. Background sessions have their own workers (background-tasks.cjs).
function createHarness({fork,entry,emit,openUrl,now=Date.now,wait=setTimeout,maxCrashes=5,windowMs=60000}){
 let worker=null,sequence=0,closing=false,loginUrl=null,crashes=[];
 const pending=new Map();
 function spawn(){
  const mine=worker=fork(entry,[],{serviceName:'Suffice harness',stdio:'pipe'});
  mine.on('message',message=>{
   if(message.event==='login_url'){try{if(new URL(message.url).protocol==='https:'){loginUrl=message.url;void openUrl(loginUrl);}}catch{}}
   if(message.event){emit(message);return;}
   const request=pending.get(message.id);if(!request)return;
   pending.delete(message.id);
   message.ok?request.resolve(message.result):request.reject(new Error(message.error));
  });
  mine.on('exit',()=>{
   if(worker===mine)worker=null;
   for(const request of pending.values())request.reject(new Error('Harness process exited'));
   pending.clear();
   if(closing)return;
   crashes=crashes.filter(at=>now()-at<windowMs);crashes.push(now());
   if(crashes.length>maxCrashes){console.error('Harness process keeps crashing; not restarting');return;}
   wait(()=>{if(!closing&&!worker)spawn();},Math.min(250*2**(crashes.length-1),5000));
  });
  mine.stderr?.on('data',data=>process.stderr.write(data));
 }
 function request(action,payload){
  if(!worker)return Promise.reject(new Error('Harness process is not available'));
  return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,action,payload});});
 }
 spawn();
 return {
  request,
  loginUrl:()=>loginUrl,
  clearLoginUrl:()=>{loginUrl=null;},
  setClosing:()=>{closing=true;},
  kill:()=>worker?.kill(),
 };
}
module.exports={createHarness};
