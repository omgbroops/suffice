import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createDesktopWorker} from '../../desktop/electron/worker-dispatch.mjs';
import {createSufficeSession} from '../../../packages/cli/src/session.mjs';
import {loadDesktopBinding} from '../native-binding.mjs';

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'suffice-pi-receipts-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const cwd=join(root,'project'),home=join(root,'home');
  await Promise.all([mkdir(cwd),mkdir(home)]);
  const requests=[];
  const server=createServer(async(req,res)=>{
    let text='';for await(const chunk of req)text+=chunk;
    requests.push(text);
    const wantsTool=JSON.parse(text).messages.at(-1)?.role==='user';
    res.writeHead(200,{'content-type':'text/event-stream'});
    const chunk=(delta,finish_reason=null,usage)=>res.write('data: '+JSON.stringify({
      id:'receipt-local',object:'chat.completion.chunk',created:1,model:'local-model',
      choices:[{index:0,delta,finish_reason}],usage,
    })+'\n\n');
    if(wantsTool){
      chunk({role:'assistant',tool_calls:[{index:0,id:'fixture-call',type:'function',
        function:{name:'codemode',arguments:JSON.stringify({code:"text('receipt fixture');"})}}]});
    }else chunk({role:'assistant',content:'Receipt turn complete'});
    chunk({},wantsTool?'tool_calls':'stop',{prompt_tokens:5,completion_tokens:3,total_tokens:8});
    res.end('data: [DONE]\n\n');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  await writeFile(join(home,'models.json'),JSON.stringify({providers:{'local-script':{
    baseUrl:'http://127.0.0.1:'+server.address().port+'/v1',api:'openai-completions',apiKey:'offline-fixture',
    models:[{id:'local-model',name:'Local fixture',reasoning:false,input:['text'],contextWindow:32768,maxTokens:512}],
  }}}));
  const payload={cwd,provider:'local-script',model:'local-model',effort:'off',prompt:'Receipt fixture 🧪',
    desktopSettings:{'allow-network':false,naming:'First message'}};
  return {home,root,requests,payload};
}

async function worker(home,backend,wrapSession=createSufficeSession){
  const replies=new Map();let sequence=0,session;
  const dispatch=await createDesktopWorker({home,backend,send:m=>{if(!m.event)replies.set(m.id,m);},
    loadHost:async()=>{
      const {createHarnessHost}=await import('../../desktop/electron/worker.mjs');
      return {createHarnessHost:options=>createHarnessHost({...options,createSession:async(...args)=>{
        session=await wrapSession(...args);return session;
      }})};
    },
  });
  return {get session(){return session;},async request(action,payload={}){
    const id=++sequence;await dispatch({id,action,payload});const result=replies.get(id);replies.delete(id);
    if(!result?.ok)throw Error(result?.error||'Missing worker response');return result.result;
  }};
}

test('live Rust route appends all seven receipt types for a real loopback Pi turn and reload; a Node rollback preserves the journal', {timeout:30000},async t=>{
  const prior=process.env.PI_OFFLINE;process.env.PI_OFFLINE='1';
  t.after(()=>{if(prior===undefined)delete process.env.PI_OFFLINE;else process.env.PI_OFFLINE=prior;});
  const {home,root,requests,payload}=await fixture(t);
  const binding=await loadDesktopBinding();
  const prototype=binding.ReceiptWriter.prototype;
  const pages=[],states=[];
  for(const method of ['appendPage','flush','close']){
    const original=prototype[method];
    t.mock.method(prototype,method,function(...args){
      states.push(method);if(method==='appendPage')pages.push(args);
      return original.apply(this,args);
    });
  }
  const rust=await worker(home,'rust');
  await rust.request('status');assert.deepEqual(await rust.request('threads'),[]);
  await assert.rejects(readdir(join(home,'events')),{code:'ENOENT'});
  assert.deepEqual(states,[]);
  const result=await rust.request('run',payload);
  assert.equal(result.text,'Receipt turn complete');assert.equal(requests.length,2);
  // OpenAI-completions has no Responses API response.usage envelope. Deliver
  // that documented SDK event separately to cover the seventh receipt category.
  await rust.session.session.extensionRunner.emit({type:'provider_stream_event',data:{response:{
    id:'fixture-response',usage:{input_tokens:5,output_tokens:3},
  }}});
  await rust.session.flush();
  const flushed=states.filter(s=>s==='flush').length;
  await rust.session.session.reload();
  assert.ok(states.filter(s=>s==='flush').length>flushed);
  assert.equal(states.includes('close'),false);
  await rust.session.session.extensionRunner.emit({type:'provider_stream_event',data:{response:{
    id:'after-reload',usage:{input_tokens:2},
  }}});
  await rust.request('shutdown');
  assert.equal(states.filter(s=>s==='close').length,1);
  const [name]=await readdir(join(home,'events')),path=join(home,'events',name);
  const bytes=await readFile(path),records=bytes.toString().trimEnd().split('\n').map(JSON.parse);
  assert.deepEqual(new Set(records.map(r=>r.type)),new Set(['startup','provider_request','provider_usage','assistant','tool_call','tool_result','task_end']));
  assert.equal(records.at(-1).responseId,'after-reload');
  assert.ok(records.some(r=>r.type==='tool_call'&&r.name==='codemode'));
  const provider=records.filter(r=>r.type==='provider_request');
  assert.deepEqual(provider.map(r=>r.bytes),requests.map(r=>r.length));
  assert.ok(requests.some(r=>Buffer.byteLength(r)>r.length));
  const reference=join(root,'frozen-node-writer.jsonl');let record='';
  for(const [page,finalPage] of pages){
    record+=page;
    if(finalPage){await appendFile(reference,record,{mode:0o600});record='';}
  }
  assert.equal(record,'');assert.deepEqual(bytes,await readFile(reference));
  const nativePageCount=pages.length;
  const rollback=await worker(home,undefined);
  await rollback.request('status');const [row]=await rollback.request('threads');
  assert.equal(row.id,result.threadId);
  const view=await rollback.request('thread',{id:row.id});
  assert.equal(view.messages.at(-1).content[0].text,result.text);
  await rollback.request('run',payload);
  await rollback.request('shutdown');
  assert.equal(pages.length,nativePageCount);assert.deepEqual(await readFile(path),bytes);
  assert.equal((await readdir(join(home,'events'))).length,2);
});
