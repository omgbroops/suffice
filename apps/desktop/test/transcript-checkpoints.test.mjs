import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {transcriptMessages} from '../electron/transcript-messages.mjs';
import {createHarnessHost} from '../electron/worker.mjs';

test('saved compaction checkpoints distinguish automatic/manual and interruptions without summaries',()=>{
 const compact={type:'compaction',id:'c'},reason={type:'custom',customType:'suffice:compaction',data:{entryId:'c',reason:'threshold'}};
 const projection={entries:[{sourceEntry:compact,messages:[{role:'compactionSummary',summary:'Private summary'}]},{sourceEntry:reason,messages:[]},{sourceEntry:{type:'message'},messages:[{role:'assistant',content:[],stopReason:'aborted'}]},{sourceEntry:{type:'custom',customType:'suffice:interrupted'},messages:[]}]};
 assert.deepEqual(transcriptMessages(projection).map(m=>m.kind||m.role),['compacted','assistant','interrupted']);assert.equal(transcriptMessages(projection)[0].automatic,true);
 reason.data.reason='manual';assert.equal(transcriptMessages(projection)[0].automatic,false);
 const earlier={type:'message',id:'before'},later={type:'message',id:'after'};const sorted=transcriptMessages({entries:[{sourceEntry:compact,messages:[{role:'compactionSummary'}]},{sourceEntry:earlier,messages:[{role:'user'}]},{sourceEntry:later,messages:[{role:'assistant'}]}]},[earlier,compact,later]);assert.deepEqual(sorted.map(m=>m.kind||m.role),['user','compacted','assistant']);
});

test('worker forwards compaction and returns a normal interrupted result for user stop',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-checkpoint-host-')),sent=[],saved=[];let listener,rejectRun,started;
 const ready=new Promise(resolve=>started=resolve);
 const host=createHarnessHost({home,send:value=>sent.push(value),createRuntime:async()=>({isUsingSubscription:()=>true}),createSession:async()=>({session:{subscribe:fn=>listener=fn,sessionManager:{getEntries:()=>[{type:'compaction',id:'c'}],appendCustomEntry:(type,data)=>saved.push({type,data})}},sessionPath:()=>resolve(home,'fixture.jsonl'),abort:()=>rejectRun(new Error('Task stopped: cancelled')),run:()=>new Promise((resolve,reject)=>{rejectRun=reject;started();})})});
 await host({id:1,action:'status'});const run=host({id:2,action:'run',payload:{cwd:home,prompt:'test',effort:'low'}});await ready;
 listener({type:'compaction_start',reason:'threshold'});listener({type:'compaction_end',reason:'threshold',result:{summary:'not sent'},aborted:false});await host({id:3,action:'abort'});await run;
 assert.equal(sent.find(m=>m.event==='compaction_start').reason,'threshold');assert.equal(sent.find(m=>m.event==='compaction_end').completed,true);assert.equal(sent.find(m=>m.id===2).result.interrupted,true);assert.equal(sent.find(m=>m.id===2).ok,true);assert.deepEqual(saved.map(m=>m.type),['suffice:compaction','suffice:interrupted']);
});

test('live transcript checkpoints update in place and stopping preserves partial output',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-checkpoint-ui-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{const page=await app.firstWindow();await page.locator('.composer').waitFor();await app.evaluate(({ipcMain,BrowserWindow})=>{
  for(const name of ['run','threads','abort'])ipcMain.removeHandler('suffice:'+name);ipcMain.handle('suffice:threads',()=>[]);
  ipcMain.handle('suffice:run',(_e,payload)=>new Promise((resolve,reject)=>{globalThis.finishRun=resolve;globalThis.rejectRun=reject;BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'thread_started',id:'fixture',clientId:payload.clientId});}));
  ipcMain.handle('suffice:abort',()=>globalThis.rejectRun(new Error('Task stopped: cancelled')));
 });await page.reload();await page.locator('#prompt').fill('Checkpoint fixture');await page.locator('.composer').evaluate(el=>el.requestSubmit());await page.getByRole('button',{name:'Stop task',exact:true}).waitFor();
 const emit=event=>app.evaluate(({BrowserWindow},event)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{threadId:'fixture',...event}),event);
 await emit({event:'text',text:'Partial response survives.'});await emit({event:'compaction_start',reason:'threshold'});await page.locator('.thread-divider').filter({hasText:'Compacting context'}).waitFor();
 await emit({event:'compaction_end',reason:'threshold',completed:true});await page.locator('.thread-divider').filter({hasText:'Context automatically compacted'}).waitFor();assert.equal(await page.locator('.thread-divider').count(),1);
 await emit({event:'compaction_start',reason:'manual'});await emit({event:'compaction_end',reason:'manual',completed:true});await page.locator('.thread-divider').filter({hasText:/^Context compacted$/}).waitFor();
 await page.getByRole('button',{name:'Stop task',exact:true}).click();await page.locator('.thread-divider').filter({hasText:'Interrupted'}).waitFor();assert.match(await page.locator('.thread-messages').innerText(),/Partial response survives/);assert.doesNotMatch(await page.locator('.thread-messages').innerText(),/Error invoking|Task stopped/);
 for(const theme of ['light','dark']){await page.locator('html').evaluate((el,theme)=>el.dataset.theme=theme,theme);await page.screenshot({path:resolve(home,'checkpoints-'+theme+'.png')});}
 console.log('Checkpoint screenshots: '+home);
 }finally{await app.close();}
});
