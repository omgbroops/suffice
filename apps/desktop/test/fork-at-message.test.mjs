import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {forkSavedThread} from '../electron/fork-thread.mjs';import {createThreadStore} from '../electron/threads.mjs';
const ts=new Date().toISOString(),now=Date.now();
const user=(id,parentId,text)=>({type:'message',id,parentId,timestamp:ts,message:{role:'user',content:[{type:'text',text}],timestamp:now}});
const assistant=(id,parentId,content)=>({type:'message',id,parentId,timestamp:ts,message:{role:'assistant',content,api:'x',provider:'p',model:'m',usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:now}});
const result=(id,parentId)=>({type:'message',id,parentId,timestamp:ts,message:{role:'toolResult',toolCallId:'c1',toolName:'read',content:[{type:'text',text:'file'}],isError:false,timestamp:now}});
async function fixture(){
 const home=await mkdtemp(resolve(tmpdir(),'suffice-fork-at-')),dir=resolve(home,'sessions','fixture'),cwd=resolve(home,'project');await mkdir(dir,{recursive:true});await mkdir(cwd);
 const path=resolve(dir,'2026-01-01T00-00-00-000Z_source.jsonl');
 const lines=[{type:'session',version:3,id:'source',timestamp:ts,cwd},user('u1',null,'first question'),assistant('a1','u1',[{type:'text',text:'let me look'},{type:'toolCall',id:'c1',name:'read',arguments:{path:'x'}}]),result('t1','a1'),assistant('a2','t1',[{type:'text',text:'first answer'}]),user('u2','a2','second question'),assistant('a3','u2',[{type:'text',text:'second answer'}])];
 await writeFile(path,lines.map(JSON.stringify).join('\n')+'\n');return {home,cwd,path};
}
const ids=async(home,id)=>{const store=createThreadStore(home);await store.list();return (await store.open(id)).messages.map(m=>m.entryId);};
test('fork at an assistant message keeps history up to it, keeps tool results paired and links back',async()=>{
 const {home,cwd,path}=await fixture();
 const fork=await forkSavedThread({sourcePath:path,cwd,home,title:'Original',entryId:'a1'});
 assert.deepEqual(await ids(home,fork.id),['u1','a1','t1']);
 const store=createThreadStore(home),threads=await store.list(),source=threads.find(t=>t.title==='first question'),child=threads.find(t=>t.id===fork.id);
 assert.ok(source&&child);assert.equal(child.parent,source.id);assert.equal(source.parent,undefined);assert.equal(child.title,'Fork of Original');
 const middle=await forkSavedThread({sourcePath:path,cwd,home,entryId:'a2'});assert.deepEqual(await ids(home,middle.id),['u1','a1','t1','a2']);
});
test('fork before a user message ends at the previous answer and refuses the first message',async()=>{
 const {home,cwd,path}=await fixture();
 const fork=await forkSavedThread({sourcePath:path,cwd,home,entryId:'u2',before:true});assert.deepEqual(await ids(home,fork.id),['u1','a1','t1','a2']);
 await assert.rejects(forkSavedThread({sourcePath:path,cwd,home,entryId:'u1',before:true}),/nothing before/);
 await assert.rejects(forkSavedThread({sourcePath:path,cwd,home,entryId:'missing'}),/Message not found/);
});
test('a side-chat snapshot lives outside the thread list and leaves the source untouched',async()=>{
 const {home,cwd,path}=await fixture();const before=await readFile(path,'utf8');
 const side=await forkSavedThread({sourcePath:path,cwd,home,area:'side-chats',label:'Side chat of ',title:'thread'});
 assert.ok(side.path.includes('side-chats'));assert.equal(await readFile(path,'utf8'),before);
 const list=await createThreadStore(home).list();assert.equal(list.length,1);assert.equal((await readdir(resolve(home,'sessions','fixture'))).length,1);
});
