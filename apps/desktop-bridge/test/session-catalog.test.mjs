import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,appendFile,readFile,rm,rename,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createNativeSessionCatalog} from '../session-catalog.mjs';

const stamp='2026-01-01T00:00:00.000Z';
const rows=[{type:'session',version:3,id:'fixture',timestamp:stamp,cwd:'/fixture'},{type:'custom',id:'turn',parentId:null,timestamp:stamp,customType:'suffice:turn-start',data:{id:'turn',displayPrompt:'Visible',attachments:[]}},{type:'message',id:'user',parentId:'turn',timestamp:stamp,message:{role:'user',content:'internal',timestamp:1}},{type:'message',id:'assistant',parentId:'user',timestamp:stamp,message:{role:'assistant',provider:'fixture',model:'model',content:'answer',usage:{input:3,output:2,cacheRead:0,cacheWrite:0,totalTokens:5,cost:{total:.01}}}},{type:'session_info',id:'name',parentId:'assistant',timestamp:stamp,name:'Native fixture'}];
async function fixture(){const base=await mkdtemp(join(tmpdir(),'suffice-native-catalog-'));const root=join(base,'sessions');await mkdir(join(root,'group'),{recursive:true});const file=join(root,'group','saved.jsonl');await writeFile(file,rows.map(JSON.stringify).join('\n')+'\n');return {base,root,file};}

test('real native catalog keeps IDs private and validates cache/model views without writes',async()=>{
 const f=await fixture();let store;
 try{
  const before=await readFile(f.file);store=await createNativeSessionCatalog(f.root,{resolveModel:(provider,model)=>{assert.equal(provider,'fixture');assert.equal(model,'model');return {contextWindow:1000};}});
  const list=await store.list();assert.equal(list.sessions.length,1);assert.equal(list.sessions[0].nativeEligible,true);assert.equal(list.sessions[0].title,'Native fixture');assert.deepEqual(list.skipped,[]);assert.equal(list.sessions[0].token,undefined);assert.equal(list.sessions[0].path,undefined);
  await assert.rejects(store.open('../escape'),/not found/);
  const id=list.sessions[0].id,view=await store.open(id);assert.equal(view.messages[0].displayText,'Visible');assert.equal(view.usage.windowPercent,.5);assert.equal(view.path,undefined);
  assert.strictEqual(await store.open(id),view);await store.list();assert.strictEqual(await store.open(id),view);
  assert.deepEqual(await readFile(f.file),before);
  const appended={type:'message',id:'later',parentId:'name',timestamp:stamp,message:{role:'user',content:'new'}};await appendFile(f.file,JSON.stringify(appended)+'\n');
  const changed=await store.open(id);assert.notStrictEqual(changed,view);assert.equal(changed.messages.at(-1).content[0].text,'new');
 }finally{await store?.close();await rm(f.base,{recursive:true,force:true});}
});

test('close drains, resume releases handles and reopen requires a fresh known catalog',async()=>{
 const f=await fixture();let store;
 try{
  store=await createNativeSessionCatalog(f.root);const {sessions}=await store.list();await store.open(sessions[0].id);
  const prepared=await store.prepareResume(sessions[0].id);assert.ok(prepared.absolutePath.endsWith('saved.jsonl'));assert.equal(typeof prepared.identityToken,'string');assert.equal(typeof prepared.version,'string');await assert.rejects(store.open(sessions[0].id),/closed/);
  await rename(f.root,join(f.base,'moved'));await rename(join(f.base,'moved'),f.root);
  await store.reopen();await assert.rejects(store.open(sessions[0].id),/not found/);const list=await store.list();assert.equal((await store.open(list.sessions[0].id)).id,sessions[0].id);
  const pending=store.open(sessions[0].id).catch(error=>error);await Promise.all([store.close(),store.close()]);assert.ok(await pending instanceof Error);await assert.rejects(store.list(),/closed/);
 }finally{await store?.close();await rm(f.base,{recursive:true,force:true});}
});

test('legacy journals retain their qualified compatibility projection',async()=>{
 const f=await fixture();let store;
 try{const legacy=rows.map(entry=>entry.type==='session'?{...entry,version:2}:entry);await writeFile(f.file,legacy.map(JSON.stringify).join('\n')+'\n');store=await createNativeSessionCatalog(f.root);const {sessions}=await store.list();assert.equal(sessions[0].projectionBackend,'pi-compatibility');assert.equal((await store.open(sessions[0].id)).messages[0].displayText,'Visible');}
 finally{await store?.close();await rm(f.base,{recursive:true,force:true});}
});

test('cached views still reject a replacement symlink', {skip:process.platform==='win32'},async()=>{
 const f=await fixture();let store;
 try{store=await createNativeSessionCatalog(f.root);const {sessions}=await store.list();await store.open(sessions[0].id);await rename(f.file,join(f.base,'original.jsonl'));const outside=join(f.base,'outside.jsonl');await writeFile(outside,'outside');await symlink(outside,f.file);await assert.rejects(store.open(sessions[0].id),/identity|changed|symbolic|symlink|link/i);assert.equal(await readFile(outside,'utf8'),'outside');}
 finally{await store?.close();await rm(f.base,{recursive:true,force:true});}
});

test('catalog construction requires an explicit root',async()=>{await assert.rejects(createNativeSessionCatalog('relative'),/absolute/);});

test('close also cancels an open that already entered the real native method',async()=>{
 const f=await fixture();let store;const require=createRequire(import.meta.url),native=require(join(import.meta.dirname,'../native',`suffice-session-${process.platform}-${process.arch}.node`));
 let ready;const entered=new Promise(resolve=>ready=resolve);
 class ObservedReader {
  constructor(root){this.reader=new native.PersistentSessionReader(root);}
  list(){return this.reader.list();}
  readView(request){const result=this.reader.readView(request);ready();return result;}
  close(){return this.reader.close();}
  reopen(){return this.reader.reopen();}
 }
 try{store=await createNativeSessionCatalog(f.root,{load:async()=>({PersistentSessionReader:ObservedReader})});const {sessions}=await store.list();const pending=store.open(sessions[0].id).catch(error=>error);await entered;await store.close();assert.ok(await pending instanceof Error);}
 finally{await store?.close();await rm(f.base,{recursive:true,force:true});}
});

test('a later close wins over a pending reopen',async()=>{
 const f=await fixture();let store;
 try{store=await createNativeSessionCatalog(f.root);await store.list();await store.close();const reopening=store.reopen().catch(error=>error);await store.close();assert.ok(await reopening instanceof Error);await assert.rejects(store.list(),/closed/);}
 finally{await store?.close();await rm(f.base,{recursive:true,force:true});}
});

test('validated location leaves the reader usable and an explicit grant is needed for a replacement root', async t => {
 const f=await fixture();
 const store=await createNativeSessionCatalog(f.root);
 t.after(async()=>{await store.close();await rm(f.base,{recursive:true,force:true});});
 const {sessions:[first]}=await store.list();
 assert.equal((await store.location(first.id)).identityToken,first.identityToken);
 assert.equal((await store.open(first.id)).id,first.id);
 await assert.rejects(store.location('unknown'),/not found/);
 const location=await store.location(first.id);
 assert.deepEqual(await store.prepareResume(first.id),location);
 await store.reopen();
 assert.equal((await store.list()).sessions[0].identityToken,first.identityToken);
 await store.close();
 await rename(f.root,join(f.base,'original'));
 await mkdir(join(f.root,'group'),{recursive:true});
 await writeFile(f.file,rows.map(JSON.stringify).join('\n')+'\n');
 await assert.rejects(store.reopen(),/root identity changed/);
 await assert.rejects(store.reopen(),/root identity changed/);
 await assert.rejects(store.list(),/closed/);
 await store.reopen({allowRootRebind:true});
 const replacement=(await store.list()).sessions[0];
 assert.equal(replacement.id,first.id);
 assert.notEqual(replacement.identityToken,first.identityToken);
});

test('a validated cache hit recomputes usage against the current model registry',async t=>{
 const f=await fixture();
 let contextWindow;
 const store=await createNativeSessionCatalog(f.root,{resolveModel:()=>contextWindow?{contextWindow}:undefined});
 t.after(async()=>{await store.close();await rm(f.base,{recursive:true,force:true});});
 const {sessions:[first]}=await store.list();
 const withoutModel=await store.open(first.id);
 assert.equal(withoutModel.usage.windowPercent,null);
 contextWindow=1000;
 const withModel=await store.open(first.id);
 assert.equal(withModel.usage.windowPercent,.5);
 assert.strictEqual(withModel.messages,withoutModel.messages);
 contextWindow=2000;
 assert.equal((await store.open(first.id)).usage.windowPercent,.25);
});

test('sidebar tail uses the same byte window, malformed-line rules and provider order as desktop',async t=>{
 const {sessionMetadata}=await import('../../desktop/electron/sidebar-metadata.mjs');
 const f=await fixture();
 const store=await createNativeSessionCatalog(f.root);
 t.after(async()=>{await store.close();await rm(f.base,{recursive:true,force:true});});
 const assistant=(provider,stopReason='stop')=>({type:'message',id:provider,parentId:null,timestamp:stamp,message:{role:'assistant',provider,model:'m',stopReason,errorMessage:'diagnostic',content:'row'}});
 const before=[...rows,assistant('outside'),{type:'custom',data:'z'.repeat(530000)}].map(JSON.stringify);
 const tail=['malformed',JSON.stringify(assistant('a')),JSON.stringify(assistant('b')),JSON.stringify(assistant('a','length'))];
 await writeFile(f.file,[...before,...tail].join('\n')+'\n');
 const sidebar=(await store.list()).sessions[0].sidebar;
 assert.deepEqual(sidebar,JSON.parse(JSON.stringify(await sessionMetadata(f.file))));
 assert.deepEqual(sidebar.providerHistory,['a','b']);
 assert.equal(sidebar.status,'failed');
 await appendFile(f.file,'null\n');
 assert.deepEqual((await store.list()).sessions[0].sidebar,await sessionMetadata(f.file));
});

test('tied activity rows match the desktop store across groups, locale-sensitive names, and different mtimes',async t=>{
 const {createThreadStore}=await import('../../desktop/electron/threads.mjs');
 const {utimes}=await import('node:fs/promises');
 const base=await mkdtemp(join(tmpdir(),'suffice-native-order-'));
 const root=join(base,'sessions');
 const store=await createNativeSessionCatalog(root);
 t.after(async()=>{await store.close();await rm(base,{recursive:true,force:true});});
 const names=['z','Éclair','e\u0301lan','a','Aardvark'];
 for(const group of ['z-group','A-group']){
  await mkdir(join(root,group),{recursive:true});
  for(const [i,name] of names.entries()){
   const file=join(root,group,name+'.jsonl');
   const journal=rows.map(entry=>entry.type==='session'?{...entry,cwd:''}:entry.type==='session_info'?{...entry,name:group+'/'+name}:entry);
   await writeFile(file,journal.map(JSON.stringify).join('\n')+'\n');
   await utimes(file,10000+i,10000+i);
  }
 }
 const reference=await createThreadStore(base).list();
 const {sessions}=await store.list();
 assert.equal(reference.length,names.length*2);
 assert.deepEqual(sessions.map(row=>[row.id,row.title,row.modified]),reference.map(row=>[row.id,row.title,row.modified]));
});

test('resume requires a qualified version and a current saved view can qualify an append',async t=>{
 const f=await fixture();
 const store=await createNativeSessionCatalog(f.root);
 t.after(async()=>{await store.close();await rm(f.base,{recursive:true,force:true});});
 const {sessions:[initial]}=await store.list();
 await store.open(initial.id);
 const extra={type:'message',id:'extra',parentId:'name',timestamp:stamp,message:{role:'user',content:'append'}};
 await appendFile(f.file,JSON.stringify(extra)+'\n');
 await assert.rejects(store.prepareResume(initial.id),/changed since qualification/);
 await store.reopen();
 const {sessions:[refreshed]}=await store.list();
 await appendFile(f.file,JSON.stringify({...extra,id:'extra2',parentId:'extra'})+'\n');
 await store.open(refreshed.id);
 assert.equal((await store.prepareResume(refreshed.id)).identityToken,initial.identityToken);
 await store.reopen();
 await writeFile(f.file,rows.map(entry=>JSON.stringify(entry.type==='session'?{...entry,version:2}:entry)).join('\n')+'\n');
 const {sessions:[legacy]}=await store.list();
 assert.equal(legacy.nativeEligible,false);
 await assert.rejects(store.prepareResume(legacy.id),/not qualified/);
});

test('close drains a validated reopen that has already entered native code',async t=>{
 const f=await fixture();
 let enter,release;
 const entered=new Promise(resolve=>{enter=resolve;});
 const gate=new Promise(resolve=>{release=resolve;});
 const require=createRequire(import.meta.url);
 const {PersistentSessionReader}=require(join(import.meta.dirname,'../native',`suffice-session-${process.platform}-${process.arch}.node`));
 class PausedReopen {
  constructor(root){this.reader=new PersistentSessionReader(root);}
  list(){return this.reader.list();}
  close(){return this.reader.close();}
  async reopenValidated(){await this.reader.reopenValidated();enter();await gate;}
 }
 const store=await createNativeSessionCatalog(f.root,{load:async()=>({PersistentSessionReader:PausedReopen})});
 t.after(async()=>{release();await store.close();await rm(f.base,{recursive:true,force:true});});
 await store.list();await store.close();
 const opening=store.reopen().catch(error=>error);
 await entered;
 let drained=false;
 const closing=store.close().then(()=>{drained=true;});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(drained,false);
 release();
 assert.ok(await opening instanceof Error);
 await closing;
 await assert.rejects(store.list(),/closed/);
});
