import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskBoard,columnOf,splitTasks,fetchIssues,formatElapsed,formatCost} from '../src/task-board-engine.js';

function fake(){
 let t=1000,timers=[];const runs=[],aborts=[],store=new Map();
 const api={runBackground:p=>new Promise((resolve,reject)=>runs.push({p,resolve,reject})),abort:async id=>{aborts.push(id);},usage:async id=>({cost:api.cost?.[id]??null})};
 const clock={now:()=>t,setInterval:fn=>{timers.push(fn);return timers.length;},clearInterval:()=>{timers=[];},advance(ms){t+=ms;for(const fn of timers)fn();}};
 const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 const make=()=>createTaskBoard({api,selection:()=>({effort:'low',provider:'p',model:'m'}),...clock,storage});
 return {api,clock,runs,aborts,storage,make};
}
const flush=()=>new Promise(r=>setImmediate(r));
const cols=b=>b.tasks().map(t=>columnOf(t)+':'+t.text);

test('concurrency limit starts the queue in order and promotes on completion',async()=>{
 const f=fake(),b=f.make();b.setLimit(2);b.add(['a','b','c']);
 assert.deepEqual(cols(b),['running:a','running:b','queued:c']);await flush();assert.equal(f.runs.length,2);
 assert.equal(f.runs[0].p.prompt,'a');assert.equal(f.runs[0].p.model,'m');
 f.runs[0].resolve({threadId:'T1'});await flush();
 assert.deepEqual(cols(b),['done:a','running:b','running:c']);
 b.setLimit(3);b.add(['d']);assert.equal(columnOf(b.tasks()[3]),'running');
});

test('approval moves a task to Needs you and still holds its slot; failure and retry',async()=>{
 const f=fake(),b=f.make();b.setLimit(1);b.add(['a','b']);await flush();
 const cid=f.runs[0].p.clientId;
 b.handleEvent({event:'thread_started',id:'T1',clientId:cid});b.handleEvent({event:'approval',threadId:'T1',requestId:'r1'});
 assert.deepEqual(cols(b),['needs:a','queued:b']);
 b.handleEvent({event:'approval_resolved',threadId:'T1',requestId:'r1'});assert.equal(columnOf(b.tasks()[0]),'running');
 f.runs[0].reject(new Error("Error invoking remote method 'suffice:run-background': Error: boom"));await flush();
 assert.deepEqual(cols(b),['needs:a','running:b']);assert.equal(b.tasks()[0].error,'boom');
 b.retry(b.tasks()[0].id);assert.equal(b.tasks()[0].status,'queued');assert.equal(b.tasks()[0].attempts,2);
 f.runs[1].resolve({threadId:'T2'});await flush();assert.equal(columnOf(b.tasks()[0]),'running');
});

test('cancel: queued is dropped, running aborts its thread, late completion is ignored, before-thread cancel aborts on start',async()=>{
 const f=fake(),b=f.make();b.setLimit(1);b.add(['a','b','c']);await flush();
 b.handleEvent({event:'thread_started',id:'T1',clientId:f.runs[0].p.clientId});
 b.cancel(b.tasks()[2].id);assert.equal(b.tasks()[2].status,'cancelled');
 b.cancel(b.tasks()[0].id);assert.deepEqual(f.aborts,['T1']);assert.equal(b.tasks()[0].status,'cancelled');
 assert.equal(b.tasks()[1].status,'running');await flush();
 f.runs[0].resolve({threadId:'T1',text:'late'});await flush();assert.equal(b.tasks()[0].status,'cancelled');
 b.cancel(b.tasks()[1].id);assert.deepEqual(f.aborts,['T1']);
 b.handleEvent({event:'thread_started',id:'T9',clientId:f.runs[1].p.clientId});assert.deepEqual(f.aborts,['T1','T9']);
});

test('fake clock drives elapsed and cost polling; stops ticking when idle',async()=>{
 const f=fake(),b=f.make();b.add(['a']);await flush();const task=b.tasks()[0];
 b.handleEvent({event:'thread_started',id:'T1',clientId:task.clientId});f.api.cost={T1:0.0421};
 f.clock.advance(1000);f.clock.advance(1000);await flush();
 assert.equal(b.elapsed(task),2000);assert.equal(task.cost,0.0421);
 f.clock.advance(3000);f.runs[0].resolve({threadId:'T1'});await flush();
 assert.equal(task.status,'done');assert.equal(b.elapsed(task),5000);f.clock.advance(9000);assert.equal(b.elapsed(task),5000);
 assert.equal(formatElapsed(5000),'0:05');assert.equal(formatElapsed(3725000),'1h 02m');assert.equal(formatCost(0.0421),'$0.04');assert.equal(formatCost(null),'—');
});

test('state persists; a run cut off by closing comes back failed and retryable',async()=>{
 const f=fake(),b=f.make();b.add(['a','b']);b.setLimit(1);await flush();
 const again=f.make();assert.equal(again.limit(),1);assert.equal(again.tasks()[0].status,'failed');assert.match(again.tasks()[0].error,/Interrupted/);
 assert.equal(again.tasks().length,2);
});

test('splitTasks and issue import',async()=>{
 assert.deepEqual(splitTasks(' a \n\n b\n'),['a','b']);
 const urls=[];const fetcher=async url=>{urls.push(url);return {ok:true,json:async()=>[{number:7,title:'Crash'},{number:8,title:'PR',pull_request:{}}]};};
 assert.deepEqual(await fetchIssues('https://github.com/o/r/issues',fetcher),['Resolve o/r#7: Crash']);
 assert.match(urls[0],/repos\/o\/r\/issues\?state=open/);
 await assert.rejects(fetchIssues('nope',fetcher),/owner\/repo/);
 await assert.rejects(fetchIssues('o/r',async()=>({ok:false,status:403})),/403/);
});
