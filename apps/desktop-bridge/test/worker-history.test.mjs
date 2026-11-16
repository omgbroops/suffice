import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,realpath,rename,rm,symlink,writeFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createDesktopWorker} from '../../desktop/electron/worker-dispatch.mjs';

const timestamp='2026-01-01T00:00:00.000Z';
const idFor=path=>createHash('sha256').update(process.platform==='win32'?path.toLowerCase():path).digest('hex').slice(0,32);
async function fixture(t,version=3){
 const base=await realpath(await mkdtemp(join(tmpdir(),'suffice-history-worker-')));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const home=join(base,'home'),cwd=join(base,'project'),root=join(home,'sessions'),group=join(root,'group');
 await mkdir(group,{recursive:true});await mkdir(cwd);
 const file=join(group,'history.jsonl');
 const rows=[
  {type:'session',version,id:'fixture',timestamp,cwd},
  {type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:'Saved question',timestamp:1}},
  {type:'message',id:'assistant',parentId:'user',timestamp,message:{role:'assistant',content:[{type:'text',text:'Saved answer'}],provider:'fixture',model:'small',stopReason:'stop',timestamp:2,usage:{input:15,output:5,cacheRead:0,cacheWrite:0,totalTokens:20,cost:{total:.03}}}},
  {type:'session_info',id:'title',parentId:'assistant',timestamp,name:'Desktop history fixture'},
 ];
 const source=rows.map(row=>JSON.stringify(row)).join('\n')+'\n';
 await writeFile(file,source);
 return {home,cwd,root,group,file,base,source,id:idFor(file)};
}
async function worker(f,options={}){
 const events=[];let sequence=0;
 const receive=await createDesktopWorker({home:f.home,backend:'rust',send:value=>events.push(value),...options});
 return {events,async request(action,payload){
  const id=++sequence;
  await receive({id,action,payload});
  const reply=events.find(value=>!value.event&&value.id===id);
  assert.ok(reply,'worker replied to '+action);
  if(!reply.ok)throw new Error(reply.error);
  return reply.result;
 }};
}

test('desktop history reads Rust rows and cached views before loading any live host or Pi SDK',async t=>{
 const f=await fixture(t);
 const diff={scope:'chat',files:2,added:8,removed:1};
 await mkdir(join(f.home,'chat-git'));await mkdir(join(f.home,'chat-changes'));
 await writeFile(join(f.home,'chat-git',f.id+'.json'),JSON.stringify({version:1,scope:'chat',root:f.cwd,branch:'fixture-branch',worktree:true}));
 await writeFile(join(f.home,'chat-changes',f.id+'.summary.json'),JSON.stringify(diff));
 const hooks=registerHooks({resolve(specifier,context,next){
  if(specifier==='@suffice/harness'||specifier.includes('@earendil-works/')||specifier.endsWith('/worker.mjs'))throw Error('Unexpected engine import '+specifier);
  return next(specifier,context);
 }});
 t.after(()=>hooks.deregister());
 const desktop=await worker(f,{loadHost(){throw Error('Unexpected live host');},createRuntime(){throw Error('Unexpected model runtime');}});
 try{
  await assert.rejects(desktop.request('thread',{id:f.id}),/not found/i);
  const [row]=await desktop.request('threads');
  assert.equal(row.id,f.id);assert.equal(row.title,'Desktop history fixture');assert.equal(row.project,'project');
  assert.equal(row.model,'small');assert.deepEqual(row.providerHistory,['fixture']);assert.equal(row.status,'done');
  assert.equal(row.gitUnknown,false);assert.equal(row.branch,'fixture-branch');assert.equal(row.worktree,true);assert.deepEqual(row.diff,diff);assert.equal(row.path,undefined);assert.equal(row.identityToken,undefined);
  for(const id of ['../outside',f.file])await assert.rejects(desktop.request('thread',{id}),/not found/i);
  const view=await desktop.request('thread',{id:f.id});
  assert.equal(view.running,false);assert.equal(view.path,undefined);assert.equal(view.messages[1].content[0].text,'Saved answer');
  assert.equal(view.usage.totalTokens,20);assert.equal(view.usage.windowPercent,null);
  const cached=await desktop.request('thread',{id:f.id});assert.deepEqual(cached,view);
  assert.equal(await desktop.request('thread-location',{id:f.id}),f.file);
  assert.deepEqual(await desktop.request('usage'),view.usage);
  assert.equal(await readFile(f.file,'utf8'),f.source);
 }finally{await desktop.request('shutdown');}
 await assert.rejects(desktop.request('threads'),/shutting down/);
});

test('Send resumes the validated original Pi journal and preserves a second saved selection',async t=>{
 const f=await fixture(t),second=join(f.group,'other.jsonl');await writeFile(second,f.source);
 const home=join(f.base,'alias');
 await symlink(f.home,home,process.platform==='win32'?'junction':'dir');
 const listedId=idFor(join(home,'sessions','group','history.jsonl')),secondId=idFor(join(home,'sessions','group','other.jsonl'));
 let hostLoads=0,sessions=0,opened;
 const desktop=await worker({...f,home},{
  loadHost:async()=>{
   hostLoads++;
   const {createHarnessHost}=await import('../../desktop/electron/worker.mjs');
   return {createHarnessHost:options=>createHarnessHost({...options,createSession:async options=>{
    sessions++;opened=options.sessionManager;
    return {session:{subscribe(){},setThinkingLevel(){}},run:async()=>'Continued offline',abort(){},dispose:async()=>{},sessionPath:()=>opened.getSessionFile(),totals:{}};
   }})};
  },
  createRuntime:async()=>({isUsingSubscription:()=>true,getModel:()=>({contextWindow:1000})}),
 });
 try{
  await desktop.request('threads');await desktop.request('thread',{id:listedId});assert.equal(hostLoads,0);
  await desktop.request('status');assert.equal(sessions,0);
  const refreshed=await desktop.request('thread',{id:listedId});assert.equal(refreshed.usage.windowPercent,2);
  const result=await desktop.request('run',{threadId:listedId,prompt:'Continue',effort:'low',cwd:f.cwd});
  assert.equal(result.text,'Continued offline');assert.equal(result.threadId,listedId);assert.equal(result.sessionPath,undefined);assert.equal(sessions,1);assert.equal(opened.getSessionFile(),f.file);
  assert.equal(opened.buildSessionProjection().messages[0].content,'Saved question');
  assert.equal((await desktop.request('thread',{id:secondId})).id,secondId);
  assert.equal(sessions,1);
 }finally{await desktop.request('shutdown');}
});

test('a replaced root denies cached views, host locations and Send without ambient fallback',async t=>{
 const f=await fixture(t);let sessions=0;
 const desktop=await worker(f,{loadHost:async()=>{
  const {createHarnessHost}=await import('../../desktop/electron/worker.mjs');
  return {createHarnessHost:options=>createHarnessHost({...options,createSession:async()=>{sessions++;throw Error('Unexpected session');}})};
 },createRuntime:async()=>({isUsingSubscription:()=>true})});
 try{
  await desktop.request('threads');await desktop.request('thread',{id:f.id});
  const retired=join(f.base,'original');
  try{await rename(f.root,retired);}catch(error){
   if(process.platform!=='win32'||!['EBUSY','EACCES','EPERM'].includes(error.code))throw error;
   assert.equal(await readFile(f.file,'utf8'),f.source);await desktop.request('shutdown');
   await rename(f.root,retired);return;
  }
  await mkdir(f.group,{recursive:true});await writeFile(f.file,f.source.replace('Saved answer','Foreign answer'));
  await assert.rejects(desktop.request('thread',{id:f.id}),/root.*changed/i);
  await assert.rejects(desktop.request('thread-location',{id:f.id}),/closed|changed/i);
  await assert.rejects(desktop.request('run',{threadId:f.id,prompt:'Continue',effort:'low',cwd:f.cwd}),/closed|changed/i);
  assert.equal(sessions,0);assert.match(await readFile(f.file,'utf8'),/Foreign answer/);
 }finally{await desktop.request('shutdown');}
});

test('experimental desktop projects legacy journals without rewriting them',async t=>{
 const f=await fixture(t,2),desktop=await worker(f);
 try{
  const [row]=await desktop.request('threads');assert.equal(row.nativeEligible,false);assert.equal(row.projectionBackend,'pi-compatibility');
  assert.equal((await desktop.request('thread',{id:f.id})).messages[0].content[0].text,'Saved question');
  assert.equal(await readFile(f.file,'utf8'),f.source);
 }finally{await desktop.request('shutdown');}
});

test('reset lazily restores previously listed identities and release revokes a mutation target',async t=>{
 const f=await fixture(t),other=join(f.group,'other.jsonl');
 await writeFile(other,f.source);
 const desktop=await worker(f);
 try{
  await desktop.request('threads');await desktop.request('thread',{id:f.id});
  await desktop.request('reset');assert.equal(await desktop.request('usage'),null);
  assert.equal((await desktop.request('thread',{id:f.id})).id,f.id);
  assert.equal(await desktop.request('release-thread',{id:f.id}),f.file);
  await assert.rejects(desktop.request('thread',{id:f.id}),/not found/i);
  assert.equal((await desktop.request('thread',{id:idFor(other)})).id,idFor(other));
  await desktop.request('reset');
  const newFile=join(f.group,'new.jsonl');await writeFile(newFile,f.source);
  await assert.rejects(desktop.request('thread',{id:idFor(newFile)}),/not found/i);
  // Keep the old inode alive so the replacement cannot recycle its ID.
  await rename(other,join(f.base,'retired.jsonl'));await writeFile(other,f.source.replace('Saved answer','Replaced answer'));
  await assert.rejects(desktop.request('thread',{id:idFor(other)}),/identity changed/i);
  await assert.rejects(desktop.request('threads'),/closed/i);
 }finally{await desktop.request('shutdown');}
});

test('the desktop projection hides private compaction summaries and keeps context usage unknown',async t=>{
 const f=await fixture(t);
 const compact={type:'compaction',id:'compacted',parentId:'title',timestamp,summary:'PRIVATE_CONTEXT_FIXTURE',firstKeptEntryId:'user',tokensBefore:20};
 const bytes=f.source+JSON.stringify(compact)+'\n';await writeFile(f.file,bytes);
 const desktop=await worker(f);
 try{
  await desktop.request('threads');const view=await desktop.request('thread',{id:f.id});
  assert.doesNotMatch(JSON.stringify(view),/PRIVATE_CONTEXT_FIXTURE/);assert.ok(view.messages.some(message=>message.kind==='compacted'));
  assert.equal(view.usage.windowTokens,null);assert.equal(view.usage.windowPercent,null);
  assert.equal(await readFile(f.file,'utf8'),bytes);
 }finally{await desktop.request('shutdown');}
});

test('a concurrent append before handoff requires a fresh list and keeps the same file identity',async t=>{
 const f=await fixture(t);
 const {createNativeThreadStore}=await import('../../desktop/electron/threads-native.mjs');
 const store=createNativeThreadStore(f.home);
 try{
  await store.list();await store.open(f.id);
  const row={type:'message',id:'latest',parentId:'title',timestamp,message:{role:'user',content:'Other writer'}};
  await writeFile(f.file,f.source+JSON.stringify(row)+'\n');
  await assert.rejects(store.prepareResume(f.id),/changed since qualification/i);
  await assert.rejects(store.open(f.id),/refresh/i);
  await store.list();assert.equal((await store.open(f.id)).messages.at(-1).content[0].text,'Other writer');
  assert.equal((await store.prepareResume(f.id)).absolutePath,f.file);
 }finally{await store.close();}
});

test('worker Send is the first operation that migrates a v1 journal and preserves its original context',async t=>{
 const f=await fixture(t);
 const {copyFile}=await import('node:fs/promises');
 const archive=join(f.base,'immutable-original.jsonl');
 const original=[
  {type:'session',version:1,id:'legacy',timestamp,cwd:f.cwd},
  ...[['user','Before migration'],['hookMessage','Extension context'],['assistant','Previous answer']].map(([role,content])=>({type:'message',timestamp,message:{role,content}})),
 ].map(JSON.stringify).join('\n')+'\n';
 await writeFile(archive,original);await copyFile(archive,f.file);
 let opened;
 const desktop=await worker(f,{
  loadHost:async()=>{
   const {createHarnessHost}=await import('../../desktop/electron/worker.mjs');
   return {createHarnessHost:options=>createHarnessHost({...options,createSession:async options=>{
    opened=options.sessionManager;
    return {session:{subscribe(){},setThinkingLevel(){}},run:async()=>'Offline continuation',abort(){},dispose:async()=>{},sessionPath:()=>opened.getSessionFile(),totals:{}};
   }})};
  },
  createRuntime:async()=>({isUsingSubscription:()=>true,getModel:()=>undefined}),
 });
 try{
  const [row]=await desktop.request('threads');assert.equal(row.projectionBackend,'pi-compatibility');
  const view=await desktop.request('thread',{id:row.id});
  assert.equal(view.messages.at(-1).content[0].text,'Previous answer');
  await desktop.request('status');assert.equal(await readFile(f.file,'utf8'),original);
  const result=await desktop.request('run',{threadId:row.id,prompt:'Continue',effort:'low',cwd:f.cwd});
  assert.equal(result.threadId,row.id);assert.equal(result.text,'Offline continuation');
  assert.deepEqual(opened.buildSessionProjection().messages.slice(0,3).map(({role,content})=>[role,content]),[['user','Before migration'],['custom','Extension context'],['assistant','Previous answer']]);
  assert.equal(JSON.parse((await readFile(f.file,'utf8')).split('\n')[0]).version,3);
  assert.equal(await readFile(archive,'utf8'),original);
 }finally{await desktop.request('shutdown');}
});

test('a live reset failure preserves native history authority for a later release',async t=>{
 const f=await fixture(t);
 const {createNativeThreadStore}=await import('../../desktop/electron/threads-native.mjs');
 const store=createNativeThreadStore(f.home);
 try{
  await store.list();await store.open(f.id);
  await assert.rejects(store.releaseLocation(f.id,async()=>{throw Error('Fixture disposal failed');}),/disposal failed/);
  assert.equal((await store.open(f.id)).id,f.id);
  assert.equal(await store.releaseLocation(f.id,async()=>{}),f.file);
  await assert.rejects(store.open(f.id),/not found/);
 }finally{await store.close();}
});
