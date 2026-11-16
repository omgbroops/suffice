import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {appendFile,mkdtemp,readFile,rename,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const addon=join(import.meta.dirname,'../../../apps/desktop-bridge/native',`suffice-session-${process.platform}-${process.arch}.node`);
const {ReceiptWriter,receiptWriterProtocolVersion}=createRequire(import.meta.url)(addon);
const name='1780000000000-01234567-89ab-4def-8123-456789abcdef.jsonl';
const other='1780000000001-cafecafe-89ab-4def-a123-456789abcdef.jsonl';
async function fixture(t) {
 const home=await mkdtemp(join(tmpdir(),'suffice-writer-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const writer=new ReceiptWriter(home,name);
 return {home,writer,path:join(home,'events',name)};
}

test('real N-API writer creates a private directory early and appends Node-exact opaque bytes lazily',async t=>{
 const {home,writer,path}=await fixture(t);
 assert.equal(receiptWriterProtocolVersion(),1);assert.equal(writer.version,1);
 await writer.flush();await assert.rejects(stat(path),{code:'ENOENT'});
 const oracle=join(home,'expected');
 const events=[{type:'startup',unicode:'𝄞',lone:'\ud800'}, {type:'provider_request',bytes:2,ignored:undefined},
  {type:'tool_call',n:1e-7},{type:'tool_result',content:[null,NaN]}, {type:'provider_usage',usage:{foo:3}},
  {type:'assistant',costUnknown:true},{type:'task_end',missing:undefined}];
 const at='2026-01-01T00:00:00.000Z';
 for(const e of events){
  const line=JSON.stringify({at,...e})+'\n';await appendFile(oracle,line,{mode:0o600});await writer.appendPage(line,true);
 }
 const opaque='raw\u0000text\r\n';
 await writer.appendPage(opaque);await appendFile(oracle,opaque);
 await writer.close();assert.deepEqual(await readFile(path),await readFile(oracle));
 if(process.platform!=='win32'){assert.equal((await stat(path)).mode&0o077,0);assert.equal((await stat(join(home,'events'))).mode&0o077,0);}
});

test('close drains accepted writes and rejects later pages while independent receipts proceed',async t=>{
 const {writer,home,path}=await fixture(t);const sibling=new ReceiptWriter(home,other);
 const lines=Array.from({length:20},(_,index)=>JSON.stringify({index})+'\n');
 const writes=lines.map(line=>writer.appendPage(line));
 const barrier=writer.flush(),closed=writer.close(),again=writer.close();
 await assert.rejects(writer.appendPage('late\n'),/closed/);
 await Promise.all([...writes,barrier,closed,again,sibling.appendPage('independent\n')]);
 await sibling.close();await writer.flush();
 assert.equal(await readFile(path,'utf8'),lines.join(''));
 assert.equal(await readFile(join(home,'events',other),'utf8'),'independent\n');
});

test('native admission bounds pages and keeps a close slot even when data is saturated',async t=>{
 const {writer,path}=await fixture(t),page='x'.repeat(1024*1024);
 await assert.rejects(writer.appendPage(page+'x'),/page size/);
 await assert.rejects(writer.appendPage('\ud83d'),/utf-16|surrogate/i);
 const accepted=Array.from({length:4},()=>writer.appendPage(page));
 const over=assert.rejects(writer.appendPage('x'),/byte limit/),closed=writer.close();
 await Promise.all([...accepted,over,closed]);assert.equal((await stat(path)).size,4*page.length);
});

test('a rejected continuation never permits an independent record to complete a torn prefix',async t=>{
 const {writer,path}=await fixture(t);
 const prefix=writer.appendPage('{"prefix":',false);
 const invalid=assert.rejects(writer.appendPage('\ud800',true),/utf-16|surrogate/i);
 const future=assert.rejects(writer.appendPage('{"another":1}\n'),/utf-16|surrogate/i);
 await Promise.all([prefix,invalid,future]);await assert.rejects(writer.flush());await assert.rejects(writer.close());
 assert.equal(await readFile(path,'utf8'),'{"prefix":');
});

test('streamed large Unicode receipt exactly matches the original Node file',async t=>{
 const {home,writer,path}=await fixture(t),oracle=join(home,'oracle');
 const record=JSON.stringify({type:'tool_result',details:'😀'.repeat(1200000),other:'\ud800'})+'\n';
 await appendFile(oracle,record,'utf8');
 for(let start=0;start<record.length;){
  let end=Math.min(start+256*1024,record.length);
  if(end<record.length&&/[\uD800-\uDBFF]/.test(record[end-1]))end--;
  await writer.appendPage(record.slice(start,end),end===record.length);
  start=end;
 }
 await writer.close();assert.deepEqual(await readFile(path),await readFile(oracle));
});

test('file substitution fails without adding bytes to either replacement or original',{skip:process.platform==='win32'},async t=>{
 const {home,writer,path}=await fixture(t);await writer.appendPage('first\n');
 const moved=path+'.saved',foreign=join(home,'foreign');await writeFile(foreign,'foreign\n');
 await rename(path,moved);await symlink(foreign,path);
 await assert.rejects(writer.appendPage('unexpected\n'));await assert.rejects(writer.close());
 assert.equal(await readFile(foreign,'utf8'),'foreign\n');assert.equal(await readFile(moved,'utf8'),'first\n');
});

test('an abruptly terminated writer preserves exactly its completed prefix; a fresh writer cannot replay it',{timeout:15_000},async t=>{
 const home=await mkdtemp(join(tmpdir(),'suffice-receipt-crash-'));t.after(()=>rm(home,{force:true,recursive:true}));
 const program=`const {ReceiptWriter}=require(process.argv[1]);const w=new ReceiptWriter(process.argv[2],process.argv[3]);
 (async()=>{await w.appendPage('{"complete":1}\\n');await w.appendPage('{"partial":',false);process.send('written');setInterval(()=>{},60000);})().catch(e=>{process.stderr.write(String(e));process.exit(1);});`;
 const child=spawn(process.execPath,['-e',program,addon,home,name],{stdio:['ignore','ignore','inherit','ipc']});
 const exit=once(child,'exit');t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 assert.equal((await once(child,'message'))[0],'written');child.kill('SIGKILL');await exit;
 const path=join(home,'events',name),before=await readFile(path,'utf8');assert.equal(before,'{"complete":1}\n{"partial":');
 const duplicate=new ReceiptWriter(home,name);await assert.rejects(duplicate.appendPage('{"replayed":1}\n'));await assert.rejects(duplicate.close());
 const fresh=new ReceiptWriter(home,other);await fresh.appendPage('{"new":1}\n');await fresh.close();assert.equal(await readFile(path,'utf8'),before);
});

test('saturated full-record and torn-record writers share exactly one close promise',async t=>{
 for(const torn of [false,true]){
  const {writer,path}=await fixture(t);
  const writes=Array.from({length:32},(_,i)=>writer.appendPage(i+'\n',!(torn&&i===31)));
  const close=writer.close(),again=writer.close();
  assert.strictEqual(again,close);assert.strictEqual(writer.flush(),close);
  const outcomes=await Promise.allSettled([close,again]);
  assert.deepEqual(outcomes.map(o=>o.status),torn?['rejected','rejected']:['fulfilled','fulfilled']);
  if(torn){assert.strictEqual(outcomes[0].reason,outcomes[1].reason);assert.match(outcomes[0].reason.message,/incomplete record/);}
  await Promise.all(writes);
  assert.equal(await readFile(path,'utf8'),Array.from({length:32},(_,i)=>i+'\n').join(''));
  assert.strictEqual(writer.close(),close);
 }
});

test('writer construction is lexical; asynchronous initialization failure releases its permit',async t=>{
 const {mkdir}=await import('node:fs/promises');
 const home=await mkdtemp(join(tmpdir(),'suffice-writer-init-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const future=join(home,'delayed');
 const writer=new ReceiptWriter(future,name); // no filesystem lookup on the JS thread
 await mkdir(future);await writer.flush();
 await assert.rejects(stat(join(future,'events',name)),{code:'ENOENT'});await writer.close();
 for(let i=0;i<40;i++){
  const bad=new ReceiptWriter(join(home,'missing-'+i),name);
  await assert.rejects(bad.flush(),/No such file|cannot find/i);
  await assert.rejects(bad.close());
 }
 assert.throws(()=>new ReceiptWriter('relative',name),/Invalid receipt home/);
});

test('process-wide cap also covers worker isolates and returns capacity after close or terminal fault',async t=>{
 const {Worker}=await import('node:worker_threads');
 const home=await mkdtemp(join(tmpdir(),'suffice-writer-cap-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const writers=Array.from({length:32},(_,i)=>new ReceiptWriter(home,name.replace('1780000000000',String(1000+i))));
 await Promise.all(writers.map(w=>w.flush()));
 assert.throws(()=>new ReceiptWriter(home,other),/Active receipt writer limit reached/);
 const probe=new Worker(`const {workerData,parentPort}=require('node:worker_threads');
 const {ReceiptWriter}=require(workerData.addon);try{new ReceiptWriter(workerData.home,workerData.name);parentPort.postMessage('unexpected');}
 catch(e){parentPort.postMessage(e.message);}`,{eval:true,workerData:{addon,home,name}});
 const exit=once(probe,'exit');
 assert.match((await once(probe,'message'))[0],/Active receipt writer limit reached/);await exit;
 const first=writers[0];await first.appendPage('protected\n');
 const path=join(home,'events',name.replace('1780000000000','1000'));await writeFile(path,'short');
 await assert.rejects(first.flush(),/identity or length changed/);
 const replacement=new ReceiptWriter(home,other); // the faulted wrapper is still retained
 assert.throws(()=>new ReceiptWriter(home,other),/Active receipt writer limit reached/);
 await writers[1].close();
 const recycled=new ReceiptWriter(home,name);await recycled.close();
 await replacement.close();await Promise.all(writers.slice(2).map(w=>w.close()));
 await assert.rejects(first.close());
});

test('garbage collection releases an abandoned writer and finalized close-promise references',{timeout:15_000},async t=>{
 const home=await mkdtemp(join(tmpdir(),'suffice-writer-gc-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const source=`const {ReceiptWriter}=require(process.argv[1]),home=process.argv[2],name=process.argv[3];
 (async()=>{
  const live=Array.from({length:32},()=>new ReceiptWriter(home,name));
  await Promise.all(live.map(w=>w.flush()));
  live.shift();
  let replacement;
  for(let i=0;i<100&&!replacement;i++){
   global.gc();await new Promise(resolve=>setTimeout(resolve,5));
   try{replacement=new ReceiptWriter(home,name);}catch(e){if(!/writer limit/.test(e.message))throw e;}
  }
  if(!replacement)throw Error('writer permit retained after GC');
  await replacement.close();await Promise.all(live.map(w=>w.close()));
  live.length=0;replacement=null;
  for(let i=0;i<3;i++){global.gc();await new Promise(resolve=>setImmediate(resolve));}
 })().catch(e=>{console.error(e);process.exitCode=1;});`;
 const child=spawn(process.execPath,['--expose-gc','-e',source,addon,home,name],{stdio:['ignore','ignore','inherit']});
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 const [code,signal]=await once(child,'exit');assert.equal(signal,null);assert.equal(code,0);
});
