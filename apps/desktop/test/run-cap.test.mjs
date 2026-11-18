import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {runCaps,runCapExceeded} from '../electron/usage.mjs';
import {createHarnessHost} from '../electron/worker.mjs';

const SHOTS=process.env.RUN_CAP_SHOTS||'';

test('run caps: defaults, env overrides, strictly-greater comparison',()=>{
 assert.deepEqual(runCaps({}),{usd:5,tokens:2000000});
 assert.deepEqual(runCaps({SUFFICE_RUN_CAP_USD:'0.5',SUFFICE_RUN_CAP_TOKENS:'100'}),{usd:.5,tokens:100});
 assert.deepEqual(runCaps({SUFFICE_RUN_CAP_USD:'junk',SUFFICE_RUN_CAP_TOKENS:'-1'}),{usd:5,tokens:2000000});
 const caps={usd:5,tokens:1000},base={cost:1,totalTokens:500};
 assert.equal(runCapExceeded(base,{cost:6,totalTokens:1500},caps),null,'exactly at both caps continues');
 assert.match(runCapExceeded(base,{cost:1,totalTokens:1501},caps),/1K token cap \(spent \$0\.00, 1K tokens\)/,'one token over stops');
 assert.match(runCapExceeded(base,{cost:6.03,totalTokens:600},caps),/\$5\.00 cap \(spent \$5\.03, 100 tokens\)/,'cost over stops');
 assert.equal(runCapExceeded(base,{cost:null,totalTokens:1500},caps),null,'unknown cost is judged by tokens alone');
 assert.ok(runCapExceeded(base,{cost:null,totalTokens:1501},caps));
 assert.match(runCapExceeded({totalTokens:0},{totalTokens:1200000,cost:1},{usd:5,tokens:1000000}),/1M token cap.*1\.2M tokens/);
});

function fakeHost(steps,start={cost:0,totalTokens:0}){
 const messages=[];let subscriber,usage={...start},aborts=0;
 const agent={session:{getSessionStats:()=>({cost:usage.cost,tokens:{total:usage.totalTokens}}),subscribe:fn=>{subscriber=fn;},setThinkingLevel:()=>{}},totals:{},sessionPath:()=>'/test/session',
  run:async()=>{const seen=aborts;for(const step of steps){usage={...usage,...step};subscriber({type:'message_end'});if(aborts>seen)break;}return 'done';},
  abort:()=>{aborts++;},dispose:async()=>{}};
 const host=createHarnessHost({home:tmpdir(),send:m=>messages.push(m),createRuntime:async()=>({isUsingSubscription:()=>true}),createSession:async()=>agent});
 return {host,messages,aborts:()=>aborts};
}

test('worker stops a run over the cap with an error naming cap and spend; run at the cap continues',async()=>{
 const cwd=await mkdtemp(resolve(tmpdir(),'suffice-cap-'));
 process.env.SUFFICE_RUN_CAP_TOKENS='1000';
 try{
  const ok=fakeHost([{totalTokens:600},{totalTokens:1000}],{cost:0,totalTokens:0});
  await ok.host({id:1,action:'status'});await ok.host({id:2,action:'run',payload:{prompt:'x',effort:'low',cwd}});
  assert.equal(ok.aborts(),0);assert.equal(ok.messages.find(m=>m.id===2).ok,true);
  const over=fakeHost([{totalTokens:600},{totalTokens:1001},{totalTokens:9999}],{cost:0,totalTokens:0});
  await over.host({id:1,action:'status'});await over.host({id:2,action:'run',payload:{prompt:'x',effort:'low',cwd}});
  const reply=over.messages.find(m=>m.id===2);
  assert.equal(over.aborts(),1,'aborted once, at the first crossing');
  assert.equal(reply.ok,false);assert.match(reply.error,/Stopped: this run reached its 1K token cap \(spent \$0\.00, 1K tokens\)\./);
  // A second run on the same host starts from a fresh baseline
  await over.host({id:3,action:'run',payload:{prompt:'y',effort:'low',cwd}});
  assert.match(over.messages.find(m=>m.id===3).error,/token cap/);
 }finally{delete process.env.SUFFICE_RUN_CAP_TOKENS;}
});

test('cap error renders in the run-error alert with Retry and the agent is no longer streaming',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-runcap-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-forge-run-cap',SUFFICE_HISTORY_HOME:resolve(home,'history'),SUFFICE_RUN_CAP_TOKENS:'100'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  const cwd=await mkdtemp(resolve(tmpdir(),'suffice-cap-cwd-'));
  await app.evaluate(async({ipcMain,BrowserWindow},{workerPath,cwd})=>{
   const {createHarnessHost}=process.mainModule?.require?process.mainModule.require(workerPath):require(workerPath);
   const messages=[];let subscriber,usage={cost:0,totalTokens:0};globalThis.capAborts=0;globalThis.capStreaming=false;
   const agent={session:{getSessionStats:()=>({cost:usage.cost,tokens:{total:usage.totalTokens}}),subscribe:fn=>{subscriber=fn;},setThinkingLevel:()=>{}},totals:{},sessionPath:()=>null,
    run:async()=>{globalThis.capStreaming=true;try{for(const total of [60,160,400]){usage={cost:.02,totalTokens:total};subscriber({type:'message_end'});await new Promise(r=>setTimeout(r,20));if(globalThis.capAborts)break;}}finally{globalThis.capStreaming=false;}return '';},
    abort:()=>{globalThis.capAborts++;},dispose:async()=>{}};
   const win=()=>BrowserWindow.getAllWindows()[0];
   const host=createHarnessHost({home:cwd,send:m=>{if(m.event)win().webContents.send('suffice:event',{...m,threadId:'cap'});else messages.push(m);},createRuntime:async()=>({isUsingSubscription:()=>true}),createSession:async()=>agent});
   await host({id:0,action:'status'});
   for(const action of ['run','thread','threads','steer','abort'])ipcMain.removeHandler('suffice:'+action);
   ipcMain.handle('suffice:threads',()=>[]);ipcMain.handle('suffice:thread',(_e,id)=>({id,title:id,cwd,messages:[]}));ipcMain.handle('suffice:steer',()=>{});ipcMain.handle('suffice:abort',()=>{});
   ipcMain.handle('suffice:run',async(_e,payload)=>{win().webContents.send('suffice:event',{event:'thread_started',id:'cap',threadId:'cap',clientId:payload.clientId});const id=Math.random();await host({id,action:'run',payload:{prompt:payload.prompt,effort:'low',cwd}});const reply=messages.find(m=>m.id===id);if(!reply.ok)throw new Error(reply.error);return {threadId:'cap',text:reply.result?.text||''};});
  },{workerPath:resolve('apps/desktop/electron/worker.mjs'),cwd});
  await page.reload();await page.locator('.composer').waitFor();
  await page.locator('#prompt').fill('spend a lot');await page.locator('.composer').evaluate(el=>el.requestSubmit());
  const alert=page.locator('.thread-run-error');await alert.waitFor();
  if(SHOTS){await page.waitForFunction(()=>{for(let e=document.querySelector('.thread-run-error');e;e=e.parentElement)if(getComputedStyle(e).opacity!=='1')return false;return true;});await new Promise(r=>setTimeout(r,200));await writeFile(resolve(SHOTS,'cap-error.png'),Buffer.from(await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')),'base64'));}
  const text=await alert.innerText();
  assert.match(text,/Stopped: this run reached its 100 token cap \(spent \$0\.02, 160 tokens\)\./);
  await alert.getByRole('button',{name:'Retry'}).waitFor();
  assert.equal(await app.evaluate(()=>globalThis.capAborts),1);
  assert.equal(await app.evaluate(()=>globalThis.capStreaming),false,'agent no longer streaming');
  assert.equal(await page.locator('.composer').getAttribute('data-running'),'false');
 }finally{await app.close();}
});
