import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {setImmediate as settle} from 'node:timers/promises';
import {createNativeRunRegistry} from '../live-registry.mjs';
import {createJsRunRegistry} from '../../desktop/electron/run-registry.mjs';
import {createThreadRouter} from '../../desktop/electron/thread-router.mjs';
import {runTrace} from './fixtures/run-trace.mjs';

// Golden replay generated with the original router from checkpoint 2a139be.
// Preserve undefined values, including optional keys on IPC objects.
const digest=trace=>createHash('sha256').update(JSON.stringify(trace,(_,v)=>v===undefined?{'$undefined':true}:v)).digest('hex');
test('Native and JS routes reproduce the ordered checkpoint IPC, events and single-dispatch host calls',async()=>{
 const original=await runTrace(createThreadRouter);
 const native=await runTrace(createThreadRouter,await createNativeRunRegistry());
 assert.deepEqual(native,original);
 assert.equal(digest(original),'d383c8604ee0a58b8e0c21f01f11f69e54e75157639a70e3e320842c084e6c52');
 const started=original.filter(([kind])=>kind==='call').filter(([, , ,action])=>action==='run');
 assert.equal(started.length,7);
 assert.equal(original.filter(item=>item[0]==='out'&&item[1].error==='A task is already running in this thread').length,1);
});

test('stale notifications and completions cannot rebind, release or replay a newer native turn',async()=>{
 const registry=await createNativeRunRegistry(),events=[],gates=[],epochs=[];
 let emit,count=0;
 const receive=createThreadRouter({registry,savedCatalog:{request:async()=>({messages:[]})},send:m=>events.push(m),createHost({send}){
  emit=send;return async({id,action,runGeneration})=>{
   if(action==='run'){
    count++;epochs.push(runGeneration);const gate=Promise.withResolvers();gates.push(gate);
    send({event:'thread_started',runGeneration,id:'saved'});await gate.promise;
   }
   send({id,ok:true,result:action==='thread'?{messages:[]}:null});
  };
 }});
 const run=id=>receive({id,action:'run',payload:{prompt:'Fixture',threadId:'saved'}});
 const first=run(1);await settle();gates[0].resolve();await first;
 const next=run(2);await settle();
 const state=registry.resolve('saved');
 emit({event:'thread_started',runGeneration:epochs[0],id:'stale'});
 assert.equal(registry.resolve('stale'),null);assert.equal(registry.settle(state.slot,epochs[0],true),null);
 assert.equal(registry.resolve('saved').busy,true);
 await run(3);assert.match(events.find(e=>e.id===3).error,/already running/);
 gates[1].resolve();await next;assert.equal(count,2);
 await receive({id:4,action:'shutdown'});
});

test('a native state failure after Pi dispatch is surfaced and never replays Send',async()=>{
 const registry=await createNativeRunRegistry(),out=[];
 let calls=0;registry.settle=()=>{throw Error('Simulated settlement failure');};
 const route=createThreadRouter({registry,savedCatalog:{request:async()=>null},send:m=>out.push(m),createHost:({send})=>async({id,action})=>{
  if(action==='run')calls++;send({id,ok:true});
 }});
 await route({id:1,action:'run',payload:{prompt:'Only once',clientId:'pending:S'}});
 await route({id:2,action:'run',payload:{prompt:'Duplicate',clientId:'pending:S'}});
 assert.equal(calls,1);assert.match(out.find(m=>m.id===1).error,/settlement failure/);assert.match(out.find(m=>m.id===2).error,/already running/);
 assert.equal(out.some(m=>m.event==='run_completed'),false);
 await route({id:3,action:'shutdown'});
});

test('public draft aliases preserve distinct UTF-16 identities across the native binding',async()=>{
 const native=await createNativeRunRegistry();
 const ids=['~prefix','\ud800','\ud801','\ufffd','😃'];
 for(const registry of [native,createJsRunRegistry()]){
  const slots=ids.map(id=>registry.admit(null,id,null).slot);
  assert.equal(new Set(slots).size,ids.length);assert.deepEqual(ids.map(id=>registry.resolve(id).clientId),ids);
  registry.shutdown();
 }
});

test('native and JS registries reject an idle canonical alias collision without mutating either host',async()=>{
 for(const registry of [createJsRunRegistry(),await createNativeRunRegistry()]){
  const a=registry.admit('A','pending:A',null);registry.bind(a.slot,a.generation,'A');registry.settle(a.slot,a.generation,false);
  const b=registry.admit('B','pending:B',null);
  assert.throws(()=>registry.bind(b.slot,b.generation,'A'),{message:'Thread ID belongs to another live host'});
  assert.equal(registry.resolve('A').slot,a.slot);assert.equal(registry.resolve('B').threadId,'B');
  registry.shutdown();
 }
});

test('a Pi adapter that omits the protocol generation cannot dispatch a native turn',async()=>{
 const registry=await createNativeRunRegistry(),out=[];let dispatched=0;
 const route=createThreadRouter({registry,savedCatalog:{request:async()=>null},send:m=>out.push(m),createHost:({send})=>async({id,action})=>{
  if(action==='run'){send({event:'thread_started',id:'unbound'});dispatched++;}
  send({id,ok:true});
 }});
 await route({id:1,action:'run',payload:{prompt:'Fixture',clientId:'pending:A'}});
 assert.equal(dispatched,0);assert.equal(out.find(m=>m.id===1).error,'Missing live run generation');
 assert.equal(registry.resolve('pending:A'),null);assert.equal(registry.resolve('unbound'),null);
 await route({id:2,action:'shutdown'});
});

test('release retains the host and its aliases across a failed reset and blocks overlapping Sends',async()=>{
 for(const registry of [createJsRunRegistry(),await createNativeRunRegistry()]){
  const events=[],resets=[];let hosts=0,shutdowns=0;
  const route=createThreadRouter({registry,savedCatalog:{request:async()=>'/fixture'},send:m=>events.push(m),createHost:({send})=>{
   hosts++;
   return async({id,action,runGeneration})=>{
    if(action==='run')send({event:'thread_started',id:'saved',runGeneration});
    if(action==='reset'){
     const gate=Promise.withResolvers();resets.push(gate);
     if(!await gate.promise){send({id,ok:false,error:'Temporary reset failure'});return;}
    }
    if(action==='shutdown')shutdowns++;
    send({id,ok:true});
   };
  }});
  const run=id=>route({id,action:'run',payload:{prompt:'Fixture',clientId:'pending:draft'}});
  await run(1);
  const first=route({id:2,action:'release-thread',payload:{id:'saved'}});await settle();
  await run(3);assert.match(events.find(m=>m.id===3).error,/already running/);assert.equal(hosts,1);
  resets[0].resolve(false);await first;
  assert.equal(events.find(m=>m.id===2).error,'Temporary reset failure');
  assert.equal(registry.resolve('saved').slot,registry.resolve('pending:draft').slot);
  const retry=route({id:4,action:'release-thread',payload:{id:'saved'}});await settle();
  resets[1].resolve(true);await retry;
  assert.equal(events.find(m=>m.id===4).ok,true);assert.equal(registry.resolve('saved'),null);assert.equal(registry.resolve('pending:draft'),null);
  await run(5);const last=route({id:6,action:'release-thread',payload:{id:'saved'}});await settle();
  resets[2].resolve(false);await last;await route({id:7,action:'shutdown'});assert.equal(shutdowns,1);
 }
});
