import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createThreadStore} from '../electron/threads.mjs';
import {createHarnessHost} from '../electron/worker.mjs';

test('saved transcripts are read without modification and resume their original engine context',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-thread-test-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-thread-project-'));
 const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});const file=resolve(dir,'thread.jsonl');
 const now=new Date().toISOString();
 const source=[{type:'session',version:3,id:'fixture',timestamp:now,cwd},{type:'message',id:'user',parentId:null,timestamp:now,message:{role:'user',content:[{type:'text',text:'Remember the earlier context'}],timestamp:Date.now()}}].map(e=>JSON.stringify(e)).join('\n')+'\n';await writeFile(file,source);
 const store=createThreadStore(home),threads=await store.list();assert.equal(threads.length,1);
 const transcript=await store.open(threads[0].id);assert.equal(transcript.messages[0].content[0].text,'Remember the earlier context');assert.equal(await readFile(file,'utf8'),source);
 await assert.rejects(store.open('../auth.json'),/not found/);
 let opened;const messages=[];
 const host=createHarnessHost({home,send:m=>messages.push(m),createRuntime:async()=>({isUsingSubscription:()=>true}),createSession:async options=>{
  opened=options.sessionManager;return {session:{subscribe:()=>{}},run:async()=>'continued',sessionPath:()=>opened.getSessionFile(),totals:{}};
 }});
 await host({id:1,action:'status'});await host({id:2,action:'threads'});await host({id:3,action:'thread',payload:{id:threads[0].id}});await host({id:4,action:'run',payload:{prompt:'Continue',effort:'low',cwd}});
 assert.equal(opened.getSessionFile(),file);assert.equal(opened.buildSessionProjection().messages[0].content[0].text,'Remember the earlier context');assert.equal(messages.find(m=>m.id===4).result.text,'continued');
});
