import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createThreadRouter} from '../electron/thread-router.mjs';
import {createHarnessHost} from '../electron/worker.mjs';
const {createOverlayFlow}=createRequire(import.meta.url)('../electron/overlay-flow.cjs');

// Real chain: overlay close -> flow abort -> router abort -> host abort -> agent.abort, with a stub agent that honours abort.
test('closing the overlay mid-run aborts the real run: starts=1 aborted=1 finished=0',async()=>{
 const cwd=await mkdtemp(resolve(tmpdir(),'suffice-ovabort-'));
 let starts=0,aborted=0,finished=0,stop,flow,route;
 const agent={session:{getSessionStats:()=>({cost:0,tokens:{total:0}}),subscribe:()=>{},setThinkingLevel:()=>{}},totals:{},sessionPath:()=>'/test/overlay-session.jsonl',
  run:()=>{starts++;return new Promise(res=>{stop=()=>{aborted++;res('aborted');};setTimeout(()=>{finished++;res('done');},3000).unref();});},
  abort:()=>stop(),dispose:async()=>{}};
 route=createThreadRouter({send:m=>{if(m.event)flow.onHarnessEvent(m);},createRuntime:async()=>({isUsingSubscription:()=>true}),
  createHost:o=>createHarnessHost({...o,home:tmpdir(),createRuntime:async()=>({isUsingSubscription:()=>true}),createSession:async()=>agent})});
 let seq=0;const request=(action,payload)=>route({id:++seq,action,payload});
 let open=false;
 const overlay={isOpen:()=>open,close:()=>{open=false;},open:()=>{open=true;},grab:async()=>({image:null,capture:null}),displayAt:()=>({bounds:{x:0,y:0,width:100,height:100}}),send:async()=>open,setTyping:()=>{}};
 flow=createOverlayFlow({overlay,status:()=>'denied',cursor:()=>({x:5,y:5}),parseReminder:()=>null,addReminder:r=>r,getThread:()=>null,
  abort:id=>request('abort',{threadId:id}),run:({prompt,image,threadId,clientId})=>request('run',{prompt,effort:'low',clientId,threadId,cwd})});
 await flow.toggle();
 const done=flow.submit('what is this');
 for(let i=0;i<200&&!starts;i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(starts,1);
 flow.close();
 await done.catch(()=>{});
 assert.deepEqual({starts,aborted,finished},{starts:1,aborted:1,finished:0});
});
