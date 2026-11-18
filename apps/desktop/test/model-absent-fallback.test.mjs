import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

test('a stored model absent from the catalog falls back to the first available model and send works',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-model-absent-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-conv-fix-start-model-send',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();page.setDefaultTimeout(10000);
  await app.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.runs=[];for(const a of ['run','thread','threads','models'])ipcMain.removeHandler('suffice:'+a);
   ipcMain.handle('suffice:models',()=>[{id:'fixture',provider:'openai',name:'Fixture',available:true,efforts:['low']}]);
   ipcMain.handle('suffice:threads',()=>[]);
   ipcMain.handle('suffice:run',(_e,p)=>new Promise(resolve=>{globalThis.runs.push({p,resolve});BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'thread_started',id:'fx',threadId:'fx',clientId:p.clientId});}));
  });
  await page.evaluate(()=>localStorage.setItem('suffice-model',JSON.stringify({provider:'deepseek',model:'deepseek-flash',effort:'high'})));await page.reload();
  await page.waitForFunction(()=>document.querySelector('.composer')?.modelSelection?.model==='fixture');
  assert.equal(await page.locator('.composer').evaluate(el=>el.modelsDisabled),false);
  await page.locator('#prompt').fill('hello');await page.locator('.composer').evaluate(f=>f.requestSubmit());
  await page.getByRole('button',{name:'Stop task',exact:true}).waitFor();
  assert.equal(await app.evaluate(()=>runs[0].p.model),'fixture');
 }finally{await app.close();}
});
