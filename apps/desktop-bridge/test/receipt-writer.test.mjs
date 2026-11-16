import assert from 'node:assert/strict';
import {appendFile, mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createNativeReceiptWriter,verifyReceiptWriter} from '../receipt-writer.mjs';
import {loadDesktopBinding} from '../native-binding.mjs';
import {createReceiptLog} from '../../../packages/cli/src/receipt-log.mjs';

const file='1780000000000-01234567-89ab-4def-8123-456789abcdef.jsonl';
async function setup(t){
 const home=await mkdtemp(join(tmpdir(),'suffice-receipt-adapter-'));
 t.after(()=>rm(home,{recursive:true,force:true}));
 return {home,eventPath:join(home,'events',file)};
}

test('preflight rejects a missing, obsolete, or incomplete receipt protocol',async()=>{
 const real=await loadDesktopBinding();
 verifyReceiptWriter(real);
 for(const incomplete of [{}, {...real,receiptWriterProtocolVersion:()=>0}, {...real,ReceiptWriter:class{}}]){
   assert.throws(()=>verifyReceiptWriter(incomplete),/receipt writer protocol 1/);
 }
});

test('multi-page UTF-16 seams yield exact Node bytes; flush and close retain the receipt for rollback',async t=>{
 const fixture=await setup(t);
 const binding=await loadDesktopBinding();
 const original=binding.ReceiptWriter.prototype.appendPage;
 const pages=[];
 t.mock.method(binding.ReceiptWriter.prototype,'appendPage',function(page,last){
   assert.ok(page.isWellFormed());
   assert.ok(Buffer.byteLength(page)<=1024*1024);
   pages.push([page.length,last]);
   return original.call(this,page,last);
 });
 const sink=createNativeReceiptWriter(fixture);
 await sink.flush();await assert.rejects(stat(fixture.eventPath),{code:'ENOENT'});
 const record='{"text":"'+'a'.repeat(256*1024-10)+'😀'+'界'.repeat(1024*1024)+'\\ud800"}\n';
 // The high surrogate is the final unit of what would be the first raw page.
 assert.equal(record.charCodeAt(256*1024-1),0xd83d);
 await sink.append(record);await sink.flush();
 const reference=join(fixture.home,'old-node-bytes');
 await appendFile(reference,record,{mode:0o600});
 assert.deepEqual(await readFile(fixture.eventPath),await readFile(reference));
 assert.deepEqual(pages[0],[256*1024-1,false]);
 assert.equal(pages.filter(([,final])=>final).length,1);assert.equal(pages.at(-1)[1],true);
 await sink.close();await sink.close();
 await assert.rejects(sink.append('{"no":"replay"}\n'),/closed/);
 assert.deepEqual(await readFile(fixture.eventPath),await readFile(reference));
});

test('an independent event after a transient pre-write error still reaches native admission',async t=>{
 const {home,eventPath}=await setup(t);
 const binding=await loadDesktopBinding(),original=binding.ReceiptWriter.prototype.appendPage;
 const ids=[];let aborts=0;
 t.mock.method(binding.ReceiptWriter.prototype,'appendPage',function(page,last){
   ids.push(JSON.parse(page).id);
   if(ids.length===1)return Promise.reject(Error('transient before bytes'));
   return original.call(this,page,last);
 });
 const log=createReceiptLog(home,eventPath,createNativeReceiptWriter,()=>aborts++);
 log.log({id:1});log.log({id:2});
 await assert.rejects(log.drain('close'),/transient before bytes/);
 assert.deepEqual(ids,[1,2]);assert.equal(aborts,1);
 assert.equal(JSON.parse(await readFile(eventPath,'utf8')).id,2);
});

test('native refuses subsequent records after identity loss mid-record without replay or path fallback',async t=>{
 const {home,eventPath}=await setup(t);
 const {rename,writeFile}=await import('node:fs/promises');
 const binding=await loadDesktopBinding(),original=binding.ReceiptWriter.prototype.appendPage;
 let calls=0,aborts=0;
 t.mock.method(binding.ReceiptWriter.prototype,'appendPage',async function(page,last){
   ++calls;
   if(calls===2){await rename(eventPath,eventPath+'.prefix');await writeFile(eventPath,'sentinel');}
   return original.call(this,page,last);
 });
 const log=createReceiptLog(home,eventPath,createNativeReceiptWriter,()=>aborts++);
 log.log({large:'z'.repeat(600000)});log.log({later:true});
 await assert.rejects(log.drain('close'));
 assert.equal(calls,3);assert.equal(aborts,2);
 assert.equal(await readFile(eventPath,'utf8'),'sentinel');
 const prefix=await readFile(eventPath+'.prefix','utf8');
 assert.equal(prefix.length,256*1024);assert.equal(prefix.includes('\n'),false);
});

test('concurrent first-use records stay whole, flush sees precisely its prefix, and close is a shared barrier',async t=>{
  const fixture=await setup(t);
  const binding=await loadDesktopBinding();
  const Original=binding.ReceiptWriter;
  const firstPage=Promise.withResolvers(),release=Promise.withResolvers();
  let constructions=0,writes=0,closes=0;
  const prefixAtFlush=[];
  // Wrap the real addon writer. Pausing its first page makes the order of
  // direct calls independent of machine speed or filesystem scheduling.
  class ObservedWriter extends Original {
    constructor(...args){super(...args);constructions++;}
    async appendPage(page,final){
      if(++writes===1){firstPage.resolve();await release.promise;}
      return super.appendPage(page,final);
    }
    async flush(){
      await super.flush();
      prefixAtFlush.push(await readFile(fixture.eventPath,'utf8'));
    }
    close(){closes++;return super.close();}
  }
  binding.ReceiptWriter=ObservedWriter;
  t.after(()=>{binding.ReceiptWriter=Original;});
  const sink=createNativeReceiptWriter(fixture);
  const first=JSON.stringify({first:'1'.repeat(650000)})+'\n';
  const second=JSON.stringify({second:'界'.repeat(650000)})+'\n';
  const writingFirst=sink.append(first);
  const flushing=sink.flush();
  const writingSecond=sink.append(second);
  const closing=sink.close();
  assert.equal(sink.close(),closing);
  assert.equal(sink.flush(),closing);
  await assert.rejects(sink.append('{"late":true}\n'),/closed/);
  await firstPage.promise;
  assert.equal(constructions,1);
  assert.equal(closes,0);
  release.resolve();
  await Promise.all([writingFirst,flushing,writingSecond,closing]);
  assert.deepEqual(prefixAtFlush,[first]);
  assert.equal(constructions,1);
  assert.equal(closes,1);
  assert.deepEqual(await readFile(fixture.eventPath),Buffer.from(first+second));
});
