import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const {createBackgroundTasks}=createRequire(import.meta.url)('../electron/background-tasks.cjs');
test('background sessions use separate hosts and never forward foreground stream events',async()=>{
 const workers=[],events=[];
 const tasks=createBackgroundTasks({entry:'fixture',emit:event=>events.push(event),fork:()=>{
  const worker=new EventEmitter();worker.kill=()=>{worker.killed=true;worker.emit('exit');};worker.postMessage=message=>queueMicrotask(()=>{if(['status','shutdown'].includes(message.action))worker.emit('message',{id:message.id,ok:true});else{worker.payload=message.payload;worker.emit('message',{event:'thread_started',id:'thread-'+workers.indexOf(worker)});worker.emit('message',{event:'text',text:'isolated'});worker.finish=()=>worker.emit('message',{id:message.id,ok:true,result:{threadId:'thread-'+workers.indexOf(worker)}});}});workers.push(worker);return worker;
 }});
 const first=tasks.run({prompt:'first'}),second=tasks.run({prompt:'second'});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(workers.length,2);assert.equal(workers[0].payload.prompt,'first');assert.equal(workers[1].payload.prompt,'second');workers[1].finish();await second;assert.equal(workers[0].killed,undefined);workers[0].finish();await first;assert.ok(events.every(event=>event.event.startsWith('background_')));assert.ok(workers.every(worker=>worker.killed));
});
