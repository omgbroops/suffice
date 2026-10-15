import pathlib
root=pathlib.Path(__file__).resolve().parents[1]/'.suffice/field-campaign-v1/tasks'
tests={
'l01':r'''import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const workerpool=require('./src/index.js');
const P=workerpool.Promise;
const observe=p=>new Promise((resolve,reject)=>p.then(resolve,reject));
const bounded=p=>Promise.race([observe(p),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Promise remained pending')),1000))]);
for (const pending of [false,true]) {
  test(`${pending?'pending':'settled'} fulfillment survives finally`,async()=>{
    let release;let calls=0;
    const p=new P(resolve=>{release=resolve;if(!pending)resolve(42)});
    const next=p.finally(()=>{calls++});
    if(pending)release(42);
    assert.equal(await bounded(next),42);assert.equal(calls,1);
  });
  test(`${pending?'pending':'settled'} rejection survives finally`,async()=>{
    const reason=new Error('task failed');let release;let calls=0;
    const p=new P((_,reject)=>{release=reject;if(!pending)reject(reason)});
    const next=p.finally(()=>{calls++});
    if(pending)release(reason);
    await assert.rejects(bounded(next),error=>error===reason);assert.equal(calls,1);
  });
}
test('finally waits for cleanup and retains task value',async()=>{
  let complete;let cleanupDone;let settled=false;
  const task=new P(resolve=>{complete=resolve});
  const cleanup=new P(resolve=>{cleanupDone=resolve});
  const next=task.finally(()=>cleanup);const checked=bounded(next).then(value=>{settled=true;return value});
  complete(17);await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
  cleanupDone('ignored');assert.equal(await checked,17);
});
test('a cleanup exception rejects the resulting promise',async()=>{
  let release;const reason=new Error('cleanup failed');
  const p=new P(resolve=>{release=resolve});const next=p.finally(()=>{throw reason});release(3);
  await assert.rejects(bounded(next),error=>error===reason);
});
test('pool exec with finally completes',async()=>{
 const pool=workerpool.pool({maxWorkers:1,workerType:'thread'});let calls=0;
 try {assert.equal(await bounded(pool.exec(n=>n*3,[7]).finally(()=>{calls++})),21);assert.equal(calls,1)}
 finally {await pool.terminate(true)}
});
''',
'l02':r'''import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import pWaitFor,{TimeoutError} from './index.js';
const outcome=p=>p.then(value=>({status:'fulfilled',value}),error=>({status:'rejected',error}));
async function soon(p) {const result=await Promise.race([p,delay(300).then(()=>({status:'pending'}))]);assert.notEqual(result.status,'pending','wait did not settle while condition was pending');return result}
test('abort settles a pending condition and late true cannot reverse rejection',async()=>{
 const controller=new AbortController();const reason=new Error('cancelled');let finish;let calls=0;
 const waiting=outcome(pWaitFor(()=>{calls++;return new Promise(resolve=>{finish=resolve})},{signal:controller.signal}));
 controller.abort(reason);const result=await soon(waiting);assert.equal(result.status,'rejected');assert.equal(result.error,reason);
 finish(true);await delay(20);assert.equal((await waiting).error,reason);assert.equal(calls,1);
});
test('timeout settles a never resolving condition',async()=>{
 const waiting=outcome(pWaitFor(()=>new Promise(()=>{}),{timeout:20}));const result=await soon(waiting);
 assert.equal(result.status,'rejected');assert.ok(result.error instanceof TimeoutError);
});
test('late rejection after abort is handled',async()=>{
 const controller=new AbortController();const reason=new Error('stop');let fail;
 const waiting=outcome(pWaitFor(()=>new Promise((_,reject)=>{fail=reject}),{signal:controller.signal}));
 controller.abort(reason);const result=await soon(waiting);assert.equal(result.error,reason);fail(new Error('late failure'));await delay(20);
});
test('ordinary asynchronous success and condition rejection remain intact',async()=>{
 let calls=0;await pWaitFor(async()=>++calls===2,{interval:1,timeout:500});assert.equal(calls,2);
 const reason=new Error('condition failed');await assert.rejects(pWaitFor(async()=>{throw reason}),error=>error===reason);
});
''',
'l03':r'''import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import pDebounce from './index.js';
test('slow leading invocation retains the same result for suppressed callers',async()=>{
 let finish;let calls=0;const debounced=pDebounce(()=>{calls++;return new Promise(resolve=>{finish=resolve})},10,{before:true});
 const first=debounced();let settled=false;const second=debounced().then(value=>{settled=true;return value});const third=debounced();
 await delay(60);const premature=settled;finish(42);const results=await Promise.all([first,second,third]);
 assert.equal(premature,false,'suppressed caller settled before the leading result');assert.deepEqual(results,[42,42,42]);assert.equal(calls,1);
});
test('overlapping leading windows keep their own pending results',async()=>{
 const finishes=[];let calls=0;const debounced=pDebounce(value=>{calls++;return new Promise(resolve=>finishes.push(()=>resolve(value)))},10,{before:true});
 const a=debounced('first');const b=debounced('ignored');await delay(60);
 const c=debounced('second');const d=debounced('ignored again');await delay(60);
 finishes[1]();finishes[0]();assert.deepEqual(await Promise.all([a,b,c,d]),['first','first','second','second']);assert.equal(calls,2);
});
test('normal leading and trailing result sharing stays intact',async()=>{
 let calls=0;const leading=pDebounce(async value=>{calls++;return value},10,{before:true});
 assert.deepEqual(await Promise.all([leading(7),leading(8)]),[7,7]);assert.equal(calls,1);
 const trailing=pDebounce(async value=>value,10);assert.deepEqual(await Promise.all([trailing(7),trailing(8)]),[8,8]);
});
'''}
for task,body in tests.items():
 folder=root/task/'grader';folder.mkdir(exist_ok=True)
 (folder/'acceptance.test.mjs').write_text(body,encoding='utf-8')
print('Wrote three private graders; no actor code created')
