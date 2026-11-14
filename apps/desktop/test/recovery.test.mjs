import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createThreadStore} from '../electron/threads.mjs';
import {readTranscriptJournal} from '../electron/transcript-journal.mjs';
const require=createRequire(import.meta.url),{createWorkerClient}=require('../electron/worker-client.cjs'),{createTerminalManager}=require('../electron/terminals.cjs');
const {createViewStateStore}=require('../electron/view-state-store.cjs');

test('native view backups validate keys, serialize writes and restore independently of browser cache',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'suffice-view-backup-')),store=createViewStateStore(directory),key='suffice-thread-view-v1:'+'a'.repeat(32);
 await assert.rejects(store.save({key:'../../auth.json',value:'{}'}),/Invalid thread view/);await assert.rejects(store.save({key,value:'[]'}),/Invalid thread view/);
 await Promise.all([store.save({key,value:JSON.stringify({draft:'earlier',updatedAt:1})}),store.save({key,value:JSON.stringify({draft:'latest',updatedAt:2})})]);
 const restored=await createViewStateStore(directory).load();assert.equal(JSON.parse(restored[key]).draft,'latest');await store.save({key,value:null});assert.deepEqual(await store.load(),{});
});

test('worker exit rejects pending work, later requests restart, and sent actions are never replayed',async()=>{
 const workers=[];const client=createWorkerClient({fork:()=>{const worker=new EventEmitter();worker.sent=[];worker.postMessage=message=>worker.sent.push(message);worker.kill=()=>worker.emit('exit',0);workers.push(worker);return worker;}});
 const first=client.request('run',{prompt:'only once'});assert.equal(workers[0].sent.length,1);workers[0].emit('exit',1);await assert.rejects(first,/not retried/);
 const status=client.request('status');assert.equal(workers.length,2);assert.deepEqual(workers[1].sent.map(item=>item.action),['status']);const message=workers[1].sent[0];workers[1].emit('message',{id:message.id,ok:true,result:'recovered'});assert.equal(await status,'recovered');
 const pending=client.request('thread',{id:'saved'});const list=workers[1].sent.at(-1);assert.equal(list.action,'threads');workers[1].emit('message',{id:list.id,ok:true,result:[]});await new Promise(resolve=>setImmediate(resolve));const open=workers[1].sent.at(-1);assert.equal(open.action,'thread');workers[1].emit('message',{id:open.id,ok:true,result:{id:'saved'}});assert.deepEqual(await pending,{id:'saved'});
 client.stop();await assert.rejects(client.request('status'),/shutting down/);
});

test('interrupted final journal writes are readable without modifying saved bytes',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-journal-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});const file=resolve(dir,'session.jsonl'),timestamp=new Date().toISOString();
 const source=[{type:'session',version:3,id:'recovery-fixture',timestamp,cwd:home},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Keep this saved chat'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n'+ '{"type":"message","id":"interrupted';
 await writeFile(file,source);const store=createThreadStore(home),[thread]=await store.list();assert.ok(thread);const view=await store.open(thread.id);assert.equal(view.messages[0].content[0].text,'Keep this saved chat');assert.equal(await readFile(file,'utf8'),source);
 assert.throws(()=>readTranscriptJournal('{broken}\n{"type":"message"}\n'),/line 1/);
});

test('closing or disposing a pending terminal does not spawn an orphan',async()=>{
 const cwd=await mkdtemp(resolve(tmpdir(),'suffice-pending-'));let finish,spawns=0;
 const manager=createTerminalManager({resolveCwd:()=>new Promise(resolve=>finish=resolve),resolveShell:async()=>'/bin/bash',emit:()=>{},spawn:()=>{spawns++;throw new Error('Must not spawn');}});
 const id='terminal:11111111-1111-4111-8111-111111111111';const pending=manager.create({threadId:'saved',id});manager.dispose();finish(cwd);await assert.rejects(pending,/closed/);assert.equal(spawns,0);assert.equal(manager.count,0);
});
