import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as settle} from 'node:timers/promises';
import {createThreadRouter} from '../electron/thread-router.mjs';

function fixture({rejectFirstView=false,rejectFirstRun=false}={}){
 const replies=[],opened=[],runs=[];
 const gate=Promise.withResolvers();
 let hosts=0;
 const receive=createThreadRouter({
  send:message=>replies.push(message),
  savedCatalog:{request:async(action,payload)=>action==='thread'?{id:payload.id,messages:[]}:null},
  createRuntime:async()=>({}),
  createHost({send}){
   const host=++hosts;
   return async({id,action,payload={}})=>{
    if(action==='thread'){
     opened.push({host,id:payload.id});
     if(rejectFirstView){rejectFirstView=false;send({id,ok:false,error:'View unavailable'});return;}
     send({id,ok:true,result:{id:payload.id,title:payload.id,messages:[]}});
    }else if(action==='run'){
     runs.push({host,id:payload.threadId});
     if(rejectFirstRun){rejectFirstRun=false;send({id,ok:false,error:'Resume unavailable'});return;}
     send({event:'thread_started',id:payload.threadId});await gate.promise;send({id,ok:true,result:{threadId:payload.threadId}});
    }else send({id,ok:true});
   };
  },
 });
 const run=(id,threadId,clientId)=>receive({id,action:'run',payload:{prompt:'Continue',threadId,clientId}});
 const reply=id=>replies.find(item=>!item.event&&item.id===id);
 return {run,receive,reply,runs,opened,gate};
}

test('first Send reserves a saved ID and its pending alias while independent IDs run concurrently',async()=>{
 const router=fixture();
 const first=router.run(1,'saved-A','pending:alias');
 const duplicate=router.run(2,'saved-A');
 const independent=router.run(3,'saved-B');
 const duplicateAlias=router.run(4,'pending:alias');
 try{
  await settle();
  assert.deepEqual(router.runs.map(run=>run.id),['saved-A','saved-B']);
  assert.match(router.reply(2)?.error??'',/already running/);
  assert.match(router.reply(4)?.error??'',/already running/);
  await router.receive({id:5,action:'thread',payload:{id:'saved-A'}});
  assert.equal(router.reply(5).result.running,true);
 }finally{router.gate.resolve();await Promise.all([first,duplicate,independent,duplicateAlias]);}
 assert.equal(router.reply(1).ok,true);assert.equal(router.reply(3).ok,true);
});

for(const failure of ['view','resume'])test('failed '+failure+' admission releases the saved ID so retry opens its own host',async()=>{
 const router=fixture({rejectFirstView:failure==='view',rejectFirstRun:failure==='resume'});
 await router.run(1,'saved','pending:alias');
 assert.equal(router.reply(1).ok,false);
 router.gate.resolve();await router.run(2,'saved','pending:alias');
 assert.equal(router.reply(2).ok,true);
 assert.deepEqual(router.opened,[{host:1,id:'saved'},{host:2,id:'saved'}]);
 assert.equal(router.runs.at(-1).host,2);
});
