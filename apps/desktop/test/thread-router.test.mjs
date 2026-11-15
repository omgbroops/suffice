import test from 'node:test';
import assert from 'node:assert/strict';
import {createThreadRouter} from '../electron/thread-router.mjs';
test('router isolates concurrent sessions, steering, cancellation and view selection',async()=>{
 const messages=[],hosts=[];let runtimes=0;
 const route=createThreadRouter({send:m=>messages.push(m),createRuntime:async()=>{runtimes++;return {};},createHost:({send,createRuntime})=>{
  const host={};hosts.push(host);
  return async({id,action,payload={}})=>{
   if(action==='status'){await createRuntime({});send({id,ok:true,result:{authenticated:true}});}
   else if(action==='threads')send({id,ok:true,result:[]});
   else if(action==='thread')send({id,ok:true,result:{id:payload.id,title:payload.id,messages:[]}});
   else if(action==='run'){host.thread=payload.prompt;send({event:'thread_started',id:host.thread});await new Promise(resolve=>host.finish=resolve);send({id,ok:true,result:{threadId:host.thread,text:host.thread}});}
   else if(action==='steer'){host.steering=payload.prompt;send({id,ok:true});}
   else if(action==='abort'){host.finish?.();send({id,ok:true});}
   else if(action==='usage')send({id,ok:true,result:host.thread});
  };
 }});
 await route({id:1,action:'status'});
 const first=route({id:2,action:'run',payload:{prompt:'one',clientId:'pending:one'}});
 while(!hosts.some(h=>h.thread==='one'))await new Promise(r=>setTimeout(r,1));
 await route({id:3,action:'reset'});
 const second=route({id:4,action:'run',payload:{prompt:'two',clientId:'pending:two'}});
 while(!hosts.some(h=>h.thread==='two'))await new Promise(r=>setTimeout(r,1));
 await route({id:5,action:'thread',payload:{id:'one'}});assert.equal(messages.find(m=>m.id===5&&!m.event).result.running,true);
 await route({id:50,action:'delete-thread',payload:{id:'one'}});assert.match(messages.find(m=>m.id===50&&!m.event).error,/Stop this thread/);
 await route({id:6,action:'steer',payload:{threadId:'one',prompt:'inspect tests'}});
 assert.equal(hosts.find(h=>h.thread==='one').steering,'inspect tests');assert.equal(hosts.find(h=>h.thread==='two').steering,undefined);
 await route({id:7,action:'abort',payload:{threadId:'two'}});await second;
 assert.equal(messages.some(m=>m.id===2&&!m.event),false);
 hosts.find(h=>h.thread==='one').finish();await first;
 assert.equal(runtimes,1);assert.equal(messages.find(m=>m.event==='thread_started'&&m.id==='two').clientId,'pending:two');
});

test('opening a saved transcript never creates another host or lists every thread',async()=>{
 const messages=[],calls=[],hosts=[];
 const route=createThreadRouter({send:value=>messages.push(value),createRuntime:async()=>({}),createHost:({send,createRuntime})=>{const index=hosts.length;hosts.push(index);return async({id,action,payload={}})=>{calls.push({index,action});if(action==='status')await createRuntime({});const result=action==='thread'?{id:payload.id,title:'Saved thread',cwd:'/workspace',messages:[{role:'user',content:[]}]}:action==='run'?{threadId:payload.threadId,text:'resumed'}:action==='threads'?[]:null;send({id,ok:true,result});};}});
 await route({id:1,action:'thread',payload:{id:'saved'}});assert.equal(hosts.length,1);assert.equal(calls.filter(call=>call.action==='threads').length,0);assert.equal(calls.filter(call=>call.action==='thread').length,1);assert.equal(messages.find(message=>message.id===1).result.title,'Saved thread');
 await route({id:2,action:'run',payload:{threadId:'saved',prompt:'Continue'}});assert.equal(hosts.length,2);assert.equal(calls.filter(call=>call.index===1&&call.action==='thread').length,1);assert.equal(calls.filter(call=>call.action==='threads').length,0);assert.equal(messages.find(message=>message.id===2).ok,true);
});
