import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHarnessHost} from '../electron/worker.mjs';

test('host streams events, reuses a session, prevents overlapping tasks, cancels, and disposes',async()=>{
 const messages=[];let created=0,disposed=0,subscriber,release,runOptions;
 const agent={session:{getSessionStats:()=>({cost:.12,tokens:{total:4000},contextUsage:{tokens:2000,percent:2}}),subscribe:fn=>{subscriber=fn;},setThinkingLevel:()=>{}},totals:{},sessionPath:()=>'/test/session',run:async(_prompt,options)=>{runOptions=options;subscriber({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'hello'}});return new Promise(resolve=>{release=()=>resolve('hello');});},abort:()=>release(),dispose:async()=>{disposed++;}};
 const host=createHarnessHost({send:message=>messages.push(message),createRuntime:async()=>({isUsingSubscription:()=>true}),createSession:async()=>{created++;return agent;}});
 const cwd=await mkdtemp(resolve(tmpdir(),'suffice-host-test-'));
 await host({id:1,action:'status'});
 const run=host({id:2,action:'run',payload:{prompt:'hello',effort:'low',cwd,images:[{type:'image',data:'fixture',mimeType:'image/png'}]}});
 while(!release)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(runOptions.images[0].data,'fixture');
 await host({id:31,action:'threads'});assert.equal(messages.find(message=>message.id===31).ok,true);
 subscriber({type:'message_update',assistantMessageEvent:{type:'thinking_delta',delta:'Inspecting'}});
 subscriber({type:'tool_execution_start',toolCallId:'code-1',toolName:'codemode',args:{code:'return 42;'}});
 subscriber({type:'tool_execution_update',toolCallId:'code-1',partialResult:{content:[{type:'text',text:'partial'}]}});
 subscriber({type:'tool_execution_end',toolCallId:'code-1',result:{content:[{type:'text',text:'42'}]},isError:false});
 assert.ok(messages.some(m=>m.event==='reasoning'&&m.text==='Inspecting'));
 assert.ok(messages.some(m=>m.event==='tool_start'&&m.input.code==='return 42;'));
 assert.ok(messages.some(m=>m.event==='tool_output'&&m.id==='code-1'));
 assert.ok(messages.some(m=>m.event==='tool_end'&&m.result.content[0].text==='42'));
 await host({id:30,action:'usage'});
 assert.equal(messages.find(m=>m.id===30).result.windowTokens,2000);
 assert.equal(messages.find(m=>m.id===30).result.totalTokens,4000);
 await host({id:3,action:'run',payload:{prompt:'duplicate',effort:'low',cwd}});
 assert.match(messages.find(m=>m.id===3).error,/already running/);
 await host({id:4,action:'reset'});assert.equal(disposed,0);
 await host({id:5,action:'abort'});await run;
 assert.equal(messages.find(m=>m.id===2).result.text,'hello');
 assert.ok(messages.some(m=>m.event==='text'&&m.text==='hello'));
 await host({id:6,action:'reset'});assert.equal(created,1);assert.equal(disposed,1);
});

test('host rejects malformed and unauthenticated tasks without executing the harness',async()=>{
 const messages=[];let created=0;
 const host=createHarnessHost({send:m=>messages.push(m),createRuntime:async()=>({isUsingSubscription:()=>false}),createSession:async()=>{created++;}});
 await host({id:1,action:'status'});
 await host({id:2,action:'run',payload:{prompt:'hello',effort:'low',cwd:process.cwd()}});
 await host({id:30,action:'usage'});
 assert.equal(messages.find(m=>m.id===30).result,null);
 await host({id:3,action:'run',payload:{prompt:'',effort:'low'}});
 assert.match(messages.find(m=>m.id===2).error,/Sign in/);assert.equal(created,0);
 assert.equal(messages.find(m=>m.id===3).ok,false);
});

test('two quick sign-in requests start one login',{timeout:5000},async()=>{
 const messages=[];let logins=0;
 const home=await mkdtemp(resolve(tmpdir(),'suffice-login-test-'));
 const runtime={isUsingSubscription:()=>false,async login(_provider,_type,{prompt}){logins++;await prompt({message:'Paste'});}};
 const host=createHarnessHost({send:message=>messages.push(message),createRuntime:async()=>runtime,home});
 await host({id:1,action:'status'});
 const first=host({id:2,action:'login'});const second=host({id:3,action:'login'});
 await second;
 assert.match(messages.find(m=>m.id===3).error,/already in progress/);
 while(!messages.some(m=>m.event==='login_prompt'))await new Promise(r=>setTimeout(r,1));
 await host({id:4,action:'login-input',payload:{text:'code'}});
 await first;
 assert.equal(messages.find(m=>m.id===2).ok,true);
 assert.equal(logins,1);
});
