import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const SHOTS=process.env.R2_SHOTS||'';
test('run errors: no IPC prefix, no stale rows, a rejected send is not duplicated into the composer',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-runerr-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fixc-runerr-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.runs=new Map();globalThis.reject=null;
   for(const action of ['run','thread','threads','steer','abort'])ipcMain.removeHandler('suffice:'+action);
   ipcMain.handle('suffice:threads',()=>[]);ipcMain.handle('suffice:thread',(_e,id)=>({id,title:id,cwd:process.cwd(),messages:[]}));ipcMain.handle('suffice:steer',()=>{});ipcMain.handle('suffice:abort',()=>{});
   ipcMain.handle('suffice:run',(_e,payload)=>new Promise((resolve,reject)=>{if(globalThis.reject)return reject(new Error(globalThis.reject));const id=payload.prompt;globalThis.runs.set(id,{resolve,reject});BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'thread_started',id,threadId:id,clientId:payload.clientId});}));
  });
  await page.reload();await page.locator('.composer').waitFor();
  const submit=()=>page.locator('.composer').evaluate(el=>el.requestSubmit());
  const errs=()=>page.locator('.thread-run-error').allTextContents();
  await app.evaluate(()=>{globalThis.reject='Connect a provider in Settings first'});
  await page.locator('#prompt').fill('draft one');await submit();
  await page.locator('.thread-run-error').waitFor();
  const first=await errs();
  assert.equal(first.length,1);assert.ok(!/Error invoking remote method/.test(first[0]),'raw IPC prefix shown: '+first[0]);
  assert.equal(await page.locator('#prompt').inputValue(),'','rejected send must not restore the text next to its transcript copy');
  assert.equal(await page.locator('.thread-user').count(),1);
  // Retry while the run is live: the old error row is gone
  await app.evaluate(()=>{globalThis.reject=null});
  await page.locator('.thread-run-error').getByRole('button',{name:'Retry'}).click();
  await page.waitForFunction(()=>document.querySelector('.composer').dataset.running==='true');
  assert.equal((await errs()).length,0,'old error row must clear when the retry starts');
  // A later failure leaves exactly one row
  await app.evaluate(()=>globalThis.runs.get('draft one').reject(new Error('Provider stream failed')));
  await page.locator('.thread-run-error').waitFor();
  const after=await errs();assert.equal(after.length,1);assert.ok(!/Error invoking/.test(after[0]),after[0]);
  if(SHOTS)await page.screenshot({path:resolve(SHOTS,'after-fail.png')});
  const moving=await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.target?.isConnected&&a.effect.target.getBoundingClientRect().width>0).map(a=>a.effect.target.className+'|'+a.animationName));
  console.log('RUNNING ANIMS',JSON.stringify(moving));
 }finally{await app.close();}
});
