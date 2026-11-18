import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

const SHOTS=process.env.R2_SHOTS||'';
test('composer run state: empty Enter never aborts, rejected send is not refilled, failures are styled, stale toast clears',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-runstate-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-r2-threads-ui-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.runs=new Map();globalThis.aborts=[];globalThis.reject=null;
   for(const action of ['run','thread','threads','steer','abort'])ipcMain.removeHandler('suffice:'+action);
   ipcMain.handle('suffice:threads',()=>[]);
   ipcMain.handle('suffice:thread',(_e,id)=>({id,title:id,cwd:process.cwd(),messages:[]}));
   ipcMain.handle('suffice:steer',()=>{});
   ipcMain.handle('suffice:abort',(_e,id)=>{globalThis.aborts.push(id);});
   ipcMain.handle('suffice:run',(_e,payload)=>new Promise((resolve,reject)=>{if(globalThis.reject)return reject(new Error(globalThis.reject));const id=payload.prompt;globalThis.runs.set(id,{resolve,reject});BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'thread_started',id,threadId:id,clientId:payload.clientId});}));
  });
  const emit=event=>app.evaluate(({BrowserWindow},event)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',event),event);
  const shot=async n=>{if(SHOTS){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({x:0,y:0,width:1440,height:900}));await page.waitForTimeout(400);await page.screenshot({path:resolve(SHOTS,n+'.png')});}};
  await page.reload();await page.locator('.composer').waitFor();
  const submit=()=>page.locator('.composer').evaluate(el=>el.requestSubmit());
  // rejected send stays in the transcript with Retry; the composer is not refilled
  await app.evaluate(()=>{globalThis.reject='No provider is connected'});
  await page.locator('#prompt').fill('keep me');await submit();
  await page.locator('.thread-run-error').waitFor();await page.waitForFunction(()=>document.querySelector('.composer').dataset.running==='false'&&document.querySelector('#prompt').value==='',{},{timeout:3000});
  await shot('01-reject-draft-kept');
  await app.evaluate(()=>{globalThis.reject=null});
  // Retry after a rejected send re-sends the failed text
  await page.locator('.thread-run-error').getByRole('button',{name:'Retry'}).click();
  await page.waitForFunction(()=>true);
  await page.waitForTimeout(500);
  assert.deepEqual(await app.evaluate(()=>[...globalThis.runs.keys()]),['keep me'],'Retry must start exactly one run');
  await page.getByRole('button',{name:'New session',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.workspace').classList.contains('thread-view'));
  await page.evaluate(()=>{document.querySelector('#prompt').value='';});
  // stale toast clears when a run starts
  await page.evaluate(()=>{const t=document.querySelector('.toast');t.hidden=false;t.setAttribute('popover','manual');t.innerHTML='<div class="toast-content"><span class="toast-message">Connect a provider to start chatting</span><button type="button" class="toast-dismiss">Okay</button></div>';t.querySelector('button').onclick=()=>{t.hidePopover();t.hidden=true;};t.showPopover();});
  await page.locator('#prompt').fill('run1');await submit();
  await page.locator('.thread-row').filter({hasText:'run1'}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.toast').matches(':popover-open'),{},{timeout:2000});
  // empty Enter while busy must not abort
  await page.locator('#prompt').focus();await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert.deepEqual(await app.evaluate(()=>globalThis.aborts),[],'Enter on an empty draft must not stop the run');
  // stop button still aborts
  await page.getByRole('button',{name:'Stop task',exact:true}).click();
  assert.deepEqual(await app.evaluate(()=>globalThis.aborts),['run1']);
  // mid-stream failure is styled with retry, and no spinner stays
  await emit({event:'assistant_start',threadId:'run1'});await emit({event:'text',threadId:'run1',text:'partial answer'});
  await app.evaluate(()=>globalThis.runs.get('run1').reject(new Error('Provider stream failed')));
  await page.waitForFunction(()=>document.querySelector('.composer').dataset.running==='false');
  await shot('02-midstream-fail');
  const err=page.locator('.thread-run-error');await err.waitFor({timeout:2000});
  assert.match(await err.innerText(),/Provider stream failed/);
  assert.equal(await err.getByRole('button',{name:'Retry'}).count(),1);
  const spinning=await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations===Infinity&&a.playState==='running').map(a=>a.effect.target?.className||a.effect.target?.tagName));
  assert.deepEqual(spinning,[],'no infinite animation may keep running after failure');
 }finally{await app.close();}
});
