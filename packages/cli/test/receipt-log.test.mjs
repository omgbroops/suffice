import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createReceiptLog} from '../src/receipt-log.mjs';

test('default receipt log matches the frozen seven-event JSONL format and samples references on dequeue',async t=>{
  const home=await mkdtemp(join(tmpdir(),'suffice-receipt-log-'));
  t.after(()=>rm(home,{recursive:true,force:true}));
  const file=join(home,'events.jsonl');
  const at='2025-03-01T02:03:04.000Z';
  t.mock.method(Date.prototype,'toISOString',()=>at);
  const ref={costUnknown:false,modelCalls:1};
  const events=[
    {type:'startup',tools:['codemode'],version:'fixture'},
    {type:'provider_request',bytes:JSON.stringify({input:'😀'}).length},
    {type:'provider_usage',responseId:'fixture',usage:{output:1}},
    {type:'tool_call',name:'codemode',input:{code:'\ud800'},parentCallId:undefined},
    {type:'tool_result',content:[{text:'first\nnext'}],details:{cost:Infinity}},
    {type:'assistant',usage:undefined,error:undefined,content:[{text:'☃️'}]},
    {type:'task_end',totals:ref},
  ];
  const log=createReceiptLog(home,file,undefined,()=>assert.fail('unexpected log error'));
  for(const event of events)log.log(event);
  ref.costUnknown=true;
  await log.drain('flush');
  const expected=events.map(event=>JSON.stringify({at,...event})+'\n').join('');
  assert.deepEqual(await readFile(file),Buffer.from(expected));
  assert.equal(log.error,undefined);
  if(process.platform!=='win32')assert.equal((await stat(file)).mode&0o777,0o600);
});

test('writing resumes after rejected records, aborts for each error and preserves the first failure through drain',async()=>{
  const first=Error('first write rejected'), calls=[], operations=[];
  let aborted=0;
  const log=createReceiptLog('/fixture','/fixture/events/file',()=>({
    append(line){
      const {n}=JSON.parse(line);calls.push(n);
      if(n===1)return Promise.reject(first);
    },
    flush(){operations.push('flush');throw Error('flush rejected');},
    close(){operations.push('close');},
  }),()=>aborted++);
  log.log({n:1});log.log({n:2});log.log({big:1n});log.log({n:4});
  await log.tail;
  assert.deepEqual(calls,[1,2,4]);assert.equal(aborted,2);assert.equal(log.error,first);
  await assert.rejects(log.drain('flush'),error=>error===first);
  await assert.rejects(log.drain('close'),error=>error===first);
  assert.deepEqual(operations,['flush','close']);
});

test('a late task_end write failure keeps the settled Pi answer, aborts once and surfaces on flush/dispose',async t=>{
  const {ModelRuntime}=await import('@earendil-works/pi-coding-agent');
  const {createAssistantMessageEventStream}=await import('@earendil-works/pi-ai');
  const {createSufficeSession}=await import('../src/session.mjs');
  const {parseOptions}=await import('../src/options.mjs');
  const home=await mkdtemp(join(tmpdir(),'suffice-late-receipt-'));
  t.after(()=>rm(home,{force:true,recursive:true}));
  const runtime=await ModelRuntime.create({authPath:join(home,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
  runtime.hasConfiguredAuth=()=>true;
  runtime.checkAuth=async()=>true;
  runtime.streamSimple=async model=>{
    const stream=createAssistantMessageEventStream();
    const message={role:'assistant',api:model.api,provider:model.provider,model:model.id,timestamp:Date.now(),
      stopReason:'stop',content:[{type:'text',text:'Completed'}],
      usage:{input:3,output:1,cacheRead:0,cacheWrite:0,totalTokens:4,cost:{}}};
    stream.push({type:'done',reason:'stop',message});stream.end(message);return stream;
  };
  const late=Error('late task_end append'),events=[];
  const client=await createSufficeSession({...parseOptions([]),home,cwd:home,access:'read',browser:false,desktop:false},
    runtime,{createReceiptWriter:()=>({append(line){
      const event=JSON.parse(line);events.push(event);
      if(event.type==='task_end')return Promise.reject(late);
    }})});
  let aborts=0;
  const abort=client.session.abort.bind(client.session);
  t.mock.method(client.session,'abort',()=>{aborts++;return abort();});
  assert.equal(await client.run('local answer'),'Completed');
  assert.equal(aborts,1);assert.equal(events.at(-1).totals.costUnknown,true);
  assert.equal(events.at(-1).totals.estimatedApiUsd,0);
  await assert.rejects(client.flush(),e=>e===late);
  await assert.rejects(client.dispose(),e=>e===late);
});
