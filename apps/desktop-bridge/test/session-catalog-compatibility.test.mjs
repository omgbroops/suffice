import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {appendFile,copyFile,mkdtemp,mkdir,open,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeSessionCatalog} from '../session-catalog.mjs';
import {createThreadStore} from '../../desktop/electron/threads.mjs';

const stamp='2026-01-01T00:00:00.000Z';
const header=(version=3)=>({type:'session',version,id:'history',timestamp:stamp,cwd:''});
const message=(id,parentId,role,content)=>({type:'message',timestamp:stamp,id,parentId,message:{role,content}});
const encode=rows=>rows.map(row=>JSON.stringify(row)).join('\n')+'\n';
const wire=value=>JSON.parse(JSON.stringify(value));
async function fixture(t,options){
 const base=await mkdtemp(join(tmpdir(),'suffice-history-compat-'));
 const root=join(base,'sessions'),group=join(root,'group'),file=join(group,'journal.jsonl');
 await mkdir(group,{recursive:true});
 const catalog=await createNativeSessionCatalog(root,options);
 t.after(async()=>{await catalog.close();await rm(base,{recursive:true,force:true});});
 return {base,root,group,file,catalog,original:createThreadStore(base)};
}
async function digest(file){
 const hash=createHash('sha256');
 for await(const bytes of createReadStream(file))hash.update(bytes);
 return hash.digest('hex');
}
async function compare(f){
 const originalRows=await f.original.list();
 const {sessions}=await f.catalog.list();
 assert.deepEqual(sessions.map(({id,title,cwd,modified})=>({id,title,cwd,modified})),originalRows.map(({id,title,cwd,modified})=>({id,title,cwd,modified})));
 assert.equal(sessions.length,1);assert.equal(sessions[0].projectionBackend,'pi-compatibility');
 const row=sessions[0],view=await f.catalog.open(row.id);
 const {path,...originalView}=await f.original.open(row.id);
 assert.deepEqual(wire(view),wire(originalView));
 return {view,row};
}

for(const [name,source] of [
 ['v1 entries without IDs',encode([header(1),message(undefined,undefined,'user','First'),message(undefined,undefined,'assistant','Last')])],
 ['v2 hookMessage role',encode([header(2),message('u',null,'user','First'),message('hook','u','hookMessage','hook payload')])],
 ['future entries with a retained branch',encode([header(7),message('u',null,'user','First'),{type:'future',id:'f',parentId:'u',timestamp:stamp},message('a','f','assistant','Answer')])],
 ['unpaired UTF-16 in the only message and session name',encode([header(),message('u',null,'user','before\ud800after'),{type:'session_info',id:'name',parentId:'u',timestamp:stamp,name:'x\udfff'}])],
 ['V8 number overflow in the only visible message',encode([header(),message('u',null,'user','Preserve me')]).replace('"Preserve me"','"Preserve me","timestamp":1e500')],
 ['V8 legacy Date header and entry grammar',encode([{...header(),timestamp:'Thursday, 12-31-2020 23:00:00 GMT'}, {...message('u',null,'user','legacy date'),timestamp:'12/25/99 23:00:00 GMT'}])],
 ['invalid UTF-8 decoded like the original Node stream',Buffer.concat([Buffer.from(encode([header(),message('u',null,'user','X')]).split('"X"')[0]+'"'),Buffer.from([255]),Buffer.from('"}}\n')])],
 ['positive submillisecond Date clipping',encode([header(),{...message('u',null,'user','submillisecond'),message:{role:'user',content:'submillisecond',timestamp:0.3}}])],
 ['JS text coercion for unusual blocks',encode([header(),message('u',null,'user',[{type:'text',text:27}])])],
 ['V8 session name whitespace',encode([header(),message('u',null,'user','First'),{type:'session_info',id:'s',parentId:'u',timestamp:stamp,name:'\ufefftrimmed\ufeff'}])],
 ['incomplete crash tail',encode([header(),message('u',null,'user','Valid prefix')])+'{"partial"'],
]){
 test('installed Pi/Desktop parity for '+name,async t=>{
  const f=await fixture(t);await writeFile(f.file,source);
  const before=await digest(f.file);
  const {row}=await compare(f);
  assert.equal((await f.catalog.prepareResume(row.id)).identityToken,row.identityToken);
  assert.equal(await digest(f.file),before);
 });
}

test('an existing native selection switches projection on an append and rejects a subsequent unviewed edit',async t=>{
 const f=await fixture(t);
 await writeFile(f.file,encode([header(),message('u',null,'user','Original')]));
 const {sessions:[row]}=await f.catalog.list();assert.equal(row.projectionBackend,'rust');
 await f.catalog.open(row.id);
 await appendFile(f.file,encode([message('a','u','hookMessage','appended legacy')]));
 assert.equal((await f.catalog.open(row.id)).messages.at(-1).content[0].text,'appended legacy');
 await appendFile(f.file,encode([message('b','a','user','changed')]));
 await assert.rejects(f.catalog.prepareResume(row.id),/changed since qualification/);
});

test('a completed malformed line stays in the catalog but preserves the original open error',async t=>{
 const f=await fixture(t);
 await writeFile(f.file,encode([header(),message('u',null,'user','Valid')])+'BROKEN\n');
 const [{id}]=await f.original.list();assert.equal((await f.catalog.list()).sessions[0].id,id);
 await assert.rejects(f.original.open(id),/invalid JSON at line 3/);
 await assert.rejects(f.catalog.open(id),/invalid JSON at line 3/);
 await assert.rejects(f.catalog.prepareResume(id),/not qualified/);
});

test('20 MiB product image survives catalog, full original projection and verified resume',async t=>{
 const f=await fixture(t),size=20*1024*1024;
 const data=Buffer.alloc(size,0x67).toString('base64');
 await writeFile(f.file,encode([header(),message('u',null,'user',[{type:'text',text:'Full image'},{type:'image',mimeType:'image/png',data}])]));
 const before=await digest(f.file);
 const {row,view}=await compare(f);
 assert.equal(view.messages[0].content[1].data,data);
 assert.equal((await f.catalog.prepareResume(row.id)).version.length>0,true);
 assert.equal(await digest(f.file),before);
});

test('a journal beyond the 64 MiB native scan budget remains browsable using source pages',async t=>{
 const f=await fixture(t);
 const file=await open(f.file,'w');
 try{
  await file.writeFile(encode([header(),message('u',null,'user','A long original journal')]));
  const line=encode([{type:'custom',id:'padding',parentId:'u',timestamp:stamp,customType:'padding',data:'x'.repeat(64*1024)}]);
  const batch=line.repeat(16);
  for(let i=0;i<64;i++)await file.writeFile(batch);
  await file.writeFile(encode([message('a','u','assistant','End of long journal')]));
 }finally{await file.close();}
 assert.ok((await stat(f.file)).size>64*1024*1024);
 const before=await digest(f.file);
 const {view,row}=await compare(f);assert.equal(view.messages.at(-1).content[0].text,'End of long journal');
 await f.catalog.prepareResume(row.id);
 assert.equal(await digest(f.file),before);
});

test('a replacement between compatibility pages revokes the catalog before data is exposed',async t=>{
 const require=createRequire(import.meta.url);
 const {PersistentSessionReader}=require(join(import.meta.dirname,'../native',`suffice-session-${process.platform}-${process.arch}.node`));
 let swap;
 class ReplacingReader extends PersistentSessionReader {
  async sourceChunk(req){
   const bytes=await super.sourceChunk(req);
   if(swap){const action=swap;swap=null;await action();}
   return bytes;
  }
 }
 const f=await fixture(t,{load:async()=>({PersistentSessionReader:ReplacingReader})});
 await writeFile(f.file,encode([header(2),message('u',null,'user','Original'),{type:'custom',id:'padding',parentId:'u',data:'x'.repeat(2*1024*1024)}]));
 const {sessions:[row]}=await f.catalog.list();
 swap=async()=>{await rename(f.file,f.file+'.original');await writeFile(f.file,encode([header(2),message('u',null,'user','Foreign')]));};
 await assert.rejects(f.catalog.open(row.id),/identity changed/);
 await assert.rejects(f.catalog.list(),/closed/);
});

test('actual Pi migrations occur only after handoff, on an independent verified copy',async t=>{
 const {SessionManager}=await import('@earendil-works/pi-coding-agent');
 const f=await fixture(t),immutable=join(f.base,'archived.jsonl');
 await writeFile(immutable,encode([header(1),message(undefined,undefined,'user','Kept question'),message(undefined,undefined,'hookMessage','Kept hook'),message(undefined,undefined,'assistant','Kept answer')]));
 await copyFile(immutable,f.file);
 const before=await digest(immutable);assert.equal(await digest(f.file),before);
 const {row}=await compare(f);
 const receipt=await f.catalog.prepareResume(row.id);assert.equal(await digest(f.file),before);
 const session=SessionManager.open(receipt.absolutePath,f.group);
 assert.deepEqual(session.buildSessionProjection().messages.map(({role,content})=>[role,content]),[['user','Kept question'],['custom','Kept hook'],['assistant','Kept answer']]);
 assert.equal(JSON.parse((await readFile(f.file,'utf8')).split('\n')[0]).version,3);
 assert.equal(await digest(immutable),before);
});

test('a cyclic parent path in a legacy file rejects before Pi projection',async t=>{
 const f=await fixture(t);await writeFile(f.file,encode([header(2),message('loop','loop','user','Original')]));
 const {sessions:[row]}=await f.catalog.list();
 await assert.rejects(f.catalog.open(row.id),/parent cycle/);
 await assert.rejects(f.catalog.prepareResume(row.id),/not qualified/);
});

function observedPages(){
 const require=createRequire(import.meta.url);
 const {PersistentSessionReader}=require(join(import.meta.dirname,'../native',`suffice-session-${process.platform}-${process.arch}.node`));
 const totals={catalog:0,selection:0};
 class ObservedReader extends PersistentSessionReader {
  async sourceChunk(request){
   const bytes=await super.sourceChunk(request);
   totals[JSON.parse(request).purpose]+=bytes.length;
   return bytes;
  }
 }
 return {load:async()=>({PersistentSessionReader:ObservedReader}),totals};
}

test('catalog charges both passes, folds the sidebar tail once and exposes deferred selections',async t=>{
 const observed=observedPages();
 const source=encode([header(2),message('u',null,'user','Preserved'),{...message('a','u','assistant','Answer'),message:{role:'assistant',provider:'provider',content:'Answer'}}]);
 const length=Buffer.byteLength(source);
 const f=await fixture(t,{load:observed.load,limits:{catalogBytes:length*3}});
 await writeFile(f.file,source);await writeFile(join(f.group,'second.jsonl'),source);
 const listed=await f.catalog.list();
 assert.equal(listed.nativeBytesRead,2*length);
 assert.equal(listed.bytesRead,listed.nativeBytesRead+observed.totals.catalog);
 assert.equal(listed.bytesRead,3*length);
 assert.equal(listed.deferred,1);assert.equal(listed.limited,0);assert.equal(listed.sessions.length,2);
 const deferred=listed.sessions.find(row=>row.catalogState==='deferred');
 const loaded=listed.sessions.find(row=>!row.catalogState);
 assert.deepEqual(loaded.sidebar.providerHistory,['provider']);assert.match(deferred.title,/open to load/);
 assert.equal(deferred.messageCount,null);
 const view=await f.catalog.open(deferred.id);
 assert.equal(view.title,'Preserved');assert.equal(view.messages.length,2);
 assert.equal(observed.totals.selection,length,'deferred summary, sidebar and projection share a single source pass');
 const refreshed=await f.catalog.list();assert.equal(refreshed.deferred,0);
 assert.equal(refreshed.bytesRead,2*length);assert.equal(refreshed.sessions.find(row=>row.id===deferred.id).title,view.title);
 const path=(await f.catalog.location(deferred.id)).absolutePath;
 await appendFile(path,encode([message('n','a','user','Later')]));
 await assert.rejects(f.catalog.prepareResume(deferred.id),/not qualified|changed since qualification/);
});

test('native descriptor layer enforces aggregate catalog bytes even on repeated requests',async t=>{
 const f=await fixture(t);
 const source=encode([header(2),message('u',null,'user','Versioned')]);await writeFile(f.file,source);
 const length=Buffer.byteLength(source);
 const require=createRequire(import.meta.url);
 const {PersistentSessionReader}=require(join(import.meta.dirname,'../native',`suffice-session-${process.platform}-${process.arch}.node`));
 const native=new PersistentSessionReader(f.root,length*2);t.after(()=>native.close());
 const {revision,bytesRead,sessions:[entry]}=JSON.parse(await native.list());
 assert.equal(bytesRead,length);
 const request=JSON.stringify({revision,token:entry.token,version:entry.version,offset:0,purpose:'catalog'});
 assert.equal((await native.sourceChunk(request)).length,length);
 await assert.rejects(native.sourceChunk(request),/catalog byte allowance exhausted/);
});

test('malformed and blank physical records are charged and remain visible when limited',async t=>{
 const f=await fixture(t,{limits:{records:3}});
 const source=encode([header(2),message('u',null,'user','Valid')])+'\nBAD\n';
 await writeFile(f.file,source);
 const listed=await f.catalog.list();assert.equal(listed.limited,1);assert.equal(listed.bytesRead,2*Buffer.byteLength(source));
 const [row]=listed.sessions;assert.equal(row.catalogState,'limited');assert.match(row.limitReason,/3-record/);
 await assert.rejects(f.catalog.open(row.id),/3-record/);await assert.rejects(f.catalog.prepareResume(row.id),/not qualified/);
});

test('oversize raw record is counted in bytes before UTF-8 normalization, including malformed text',async t=>{
 const max=1024*1024+7,observed=observedPages();
 const f=await fixture(t,{load:observed.load,limits:{recordBytes:max}});
 const prefix=encode([header(2),message('u',null,'user','Valid')]);
 await writeFile(f.file,Buffer.concat([Buffer.from(prefix),Buffer.alloc(max+1,0xc3),Buffer.from('\n'),Buffer.alloc(2*1024*1024,0x61)]));
 const listed=await f.catalog.list();assert.equal(listed.limited,1);
 assert.equal(observed.totals.catalog,2*1024*1024,'later source pages were never read after the over-limit record');
 assert.equal(listed.bytesRead,listed.nativeBytesRead+observed.totals.catalog);
 await assert.rejects(f.catalog.open(listed.sessions[0].id),/1048583-byte/);
});

test('an over-budget journal keeps its identity and reason without reading compatibility pages',async t=>{
 const observed=observedPages(),f=await fixture(t,{load:observed.load,limits:{journalBytes:128}});
 await writeFile(f.file,encode([header(2),message('u',null,'user','Long enough to exceed the journal limit')]));
 const listed=await f.catalog.list(),[row]=listed.sessions;
 assert.equal(listed.limited,1);assert.equal(row.catalogState,'limited');assert.match(row.limitReason,/128-byte/);
 assert.equal(observed.totals.catalog,0);await assert.rejects(f.catalog.open(row.id),/128-byte/);
 assert.equal(observed.totals.selection,0);
 await assert.rejects(f.catalog.prepareResume(row.id),/not qualified/);
});

test('summary CRLF across pages and split UTF-8 retain Pi semantics while journal parsing remains LF-only',async t=>{
 const f=await fixture(t);
 const first=JSON.stringify(header(2));
 const page=1024*1024;
 const padding=' '.repeat(page-1-Buffer.byteLength(first));
 const start=first+padding+'\r\n';
 const user=JSON.stringify(message('u',null,'user','start界end'));
 const index=user.indexOf('界'),spaces=' '.repeat(2*page-1-Buffer.byteLength(start)-index);
 await writeFile(f.file,start+spaces+user+'\r\n');
 const {view}=await compare(f);assert.equal(view.messages[0].content[0].text,'start界end');
 await writeFile(f.file,encode([header(2),message('u',null,'user','CR-only')]).replaceAll('\n','\r'));
 const reference=(await f.original.list())[0],row=(await f.catalog.list()).sessions[0];
 assert.equal(row.title,reference.title);
 const {path,...legacy}=await f.original.open(row.id);assert.deepEqual(wire(await f.catalog.open(row.id)),wire(legacy));
});

test('three full 20 MiB image turns survive one selected journal over 64 MiB',async t=>{
 const f=await fixture(t);const data=Buffer.alloc(20*1024*1024,0x48).toString('base64');
 const file=await open(f.file,'w');
 try{
  await file.writeFile(encode([header()]));
  for(let i=0;i<3;i++)await file.writeFile(encode([message(String(i),i?String(i-1):null,'user',[{type:'text',text:'Image '+i},{type:'image',mimeType:'image/png',data}])]));
 }finally{await file.close();}
 const before=await digest(f.file);assert.ok((await stat(f.file)).size>64*1024*1024);
 const [row]=(await f.catalog.list()).sessions,view=await f.catalog.open(row.id);
 assert.equal(view.messages.length,3);
 for(const [index,m] of view.messages.entries()){assert.equal(m.content[0].text,'Image '+index);assert.equal(m.content[1].data,data);}
 await f.catalog.prepareResume(row.id);assert.equal(await digest(f.file),before);
});

test('a native decoder that stops mid-file charges its buffered bytes ahead of the failed fallback',async t=>{
 const observed=observedPages(),f=await fixture(t,{load:observed.load,limits:{recordBytes:2*1024*1024}});
 const source=encode([header(2),message('u',null,'user','Valid')])+'x'.repeat(12*1024*1024)+'\n';
 await writeFile(f.file,source);
 const listed=await f.catalog.list();
 assert.equal(listed.limited,1);
 assert.ok(listed.nativeBytesRead>8*1024*1024&&listed.nativeBytesRead<Buffer.byteLength(source));
 assert.equal(observed.totals.catalog,3*1024*1024);
 assert.equal(listed.bytesRead,listed.nativeBytesRead+observed.totals.catalog);
});

test('a sparse journal past the production byte ceiling is listed without reading its body',async t=>{
 const observed=observedPages(),f=await fixture(t,{load:observed.load});
 const file=await open(f.file,'w');
 try{
  await file.writeFile(encode([header(2),message('u',null,'user','Retain the file')]));
  await file.truncate(256*1024*1024+1);
 }finally{await file.close();}
 const listed=await f.catalog.list();
 assert.equal(listed.bytesRead,0);assert.equal(listed.limited,1);assert.equal(listed.sessions.length,1);
 const [row]=listed.sessions;assert.match(row.title,/inspection limit reached/);assert.match(row.limitReason,/268435456-byte/);
 await assert.rejects(f.catalog.open(row.id),/268435456-byte/);
 assert.deepEqual(observed.totals,{catalog:0,selection:0});
});

test('a deferred non-session cannot grant a host mutation path or live handoff',async t=>{
 const source='{"type":"other"}\n';
 const f=await fixture(t,{limits:{catalogBytes:Buffer.byteLength(source)}});
 await writeFile(f.file,source);
 const [row]=(await f.catalog.list()).sessions;assert.equal(row.catalogState,'deferred');
 await assert.rejects(f.catalog.location(row.id),/no saved Pi thread/);
 await assert.rejects(f.catalog.open(row.id),/no saved Pi thread/);
 await assert.rejects(f.catalog.prepareResume(row.id),/not qualified/);
 assert.equal(await readFile(f.file,'utf8'),source);
});
