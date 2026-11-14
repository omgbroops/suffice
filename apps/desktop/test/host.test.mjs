import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHarnessHost} from '../electron/worker.mjs';

test('host streams events, reuses a session, prevents overlapping tasks, cancels, and disposes',async()=>{
 const messages=[];let created=0,disposed=0,subscriber,release,runOptions,steering;
 const agent={session:{steer:async(text,images)=>{steering={text,images};},getSessionStats:()=>({cost:.12,tokens:{total:4000},contextUsage:{tokens:2000,percent:2}}),subscribe:fn=>{subscriber=fn;},setThinkingLevel:()=>{}},totals:{},sessionPath:()=>'/test/session',run:async(_prompt,options)=>{runOptions=options;subscriber({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'hello'}});return new Promise(resolve=>{release=()=>resolve('hello');});},abort:()=>release(),dispose:async()=>{disposed++;}};
 const host=createHarnessHost({home:await mkdtemp(resolve(tmpdir(),'suffice-host-home-')),send:message=>messages.push(message),createRuntime:async()=>({isUsingSubscription:()=>true}),createSession:async()=>{created++;return agent;}});
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
 await host({id:32,action:'steer',payload:{prompt:'inspect tests first'}});assert.deepEqual(steering,{text:'inspect tests first',images:undefined});assert.equal(messages.find(m=>m.id===32).ok,true);
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
 const host=createHarnessHost({home:await mkdtemp(resolve(tmpdir(),'suffice-host-home-')),send:m=>messages.push(m),createRuntime:async()=>({isUsingSubscription:()=>false}),createSession:async()=>{created++;}});
 await host({id:1,action:'status'});
 await host({id:2,action:'run',payload:{prompt:'hello',effort:'low',cwd:process.cwd()}});
 await host({id:30,action:'usage'});
 assert.equal(messages.find(m=>m.id===30).result,null);
 await host({id:3,action:'run',payload:{prompt:'',effort:'low'}});
 assert.match(messages.find(m=>m.id===2).error,/Connect a provider/);assert.equal(created,0);
 assert.equal(messages.find(m=>m.id===3).ok,false);
});


test('desktop settings reach the harness and approvals wait for the matching answer',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-host-settings-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-engine-settings-')),path=resolve(home,'session.jsonl');
 await writeFile(path,JSON.stringify({type:'session',version:3,id:'settings',timestamp:new Date().toISOString(),cwd})+'\n');
 const messages=[],captured=[];let named,disposed=0;
 const host=createHarnessHost({home,send:message=>messages.push(message),createRuntime:async()=>({isUsingSubscription:()=>true}),createSession:async(options,hooksRuntime,hooks)=>{captured.push(options);return {session:{setSessionName:value=>{named=value;},subscribe(){},setThinkingLevel(){}},sessionPath:()=>path,dispose:async()=>{disposed++;},run:async()=>await hooks.onApproval('write',{path:'fixture.txt'})?'Allowed fixture':'Denied fixture'};}});
 await host({id:1,action:'status'});
 const prefs={'approval-mode':'Ask before every action','auto-compact':true,'compact-at':'70%','project-instructions':false,'allow-network':false,'execution-shell':'PowerShell',naming:'Untitled','remember-context':true};
 const pending=host({id:2,action:'run',payload:{prompt:'fixture',effort:'low',cwd,desktopSettings:prefs}});
 while(!messages.some(message=>message.event==='approval'))await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(messages.some(message=>message.id===2),false);
 assert.deepEqual(captured[0].desktopSettings,prefs);assert.equal(captured[0].browser,false);assert.equal(captured[0].desktop,false);assert.equal(named,'Untitled thread');
 const request=messages.find(message=>message.event==='approval');await host({id:3,action:'approval-answer',payload:{requestId:request.requestId,allow:true}});await pending;assert.equal(messages.find(message=>message.id===2).result.text,'Allowed fixture');
 const {projectContext}=await import('../electron/engine-settings.mjs');assert.match(await projectContext(home,cwd,{'remember-context':true}),/Allowed fixture/);
 const rerun=host({id:4,action:'run',payload:{prompt:'again',effort:'low',cwd,desktopSettings:{...prefs,'compact-at':'90%'}}});
 while(messages.filter(message=>message.event==='approval').length<2)await new Promise(resolve=>setTimeout(resolve,1));
 const second=messages.filter(message=>message.event==='approval').at(-1);await host({id:5,action:'approval-answer',payload:{requestId:second.requestId,allow:false}});await rerun;
 assert.equal(disposed,1);assert.equal(captured[1].desktopSettings['compact-at'],'90%');assert.equal(messages.find(message=>message.id===4).result.text,'Denied fixture');
});
