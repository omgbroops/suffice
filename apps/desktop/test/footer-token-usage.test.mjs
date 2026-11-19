import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

// The footer count falls back to the run's reported usage when the context estimate is empty.
test('footer token count follows the run usage',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-ctx-usage-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-st-chat2-usage-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain})=>{
   for(const action of ['threads','thread','context','usage'])ipcMain.removeHandler('suffice:'+action);
   ipcMain.handle('suffice:threads',()=>[{id:'t1',title:'Used tokens',project:'app',cwd:process.cwd(),modified:Date.now(),status:'done'}]);
   ipcMain.handle('suffice:thread',(_e,id)=>({id,title:'Used tokens',cwd:process.cwd(),messages:[{role:'user',timestamp:1,content:[{type:'text',text:'hi'}]},{role:'assistant',timestamp:5,content:[{type:'text',text:'done'}]}]}));
   ipcMain.handle('suffice:context',()=>({window:200000,items:[],turns:[]}));
   ipcMain.handle('suffice:usage',()=>({cost:0.01,totalTokens:4321,windowTokens:2100,windowPercent:1}));
  });
  await page.reload();await page.locator('.composer').waitFor();
  assert.equal((await page.locator('.context-chip').textContent()).trim(),'0');
  await page.locator('.thread-row').filter({hasText:'Used tokens'}).click();
  await page.waitForFunction(()=>document.querySelector('.context-chip').textContent.trim()==='2.1k');
 }finally{await app.close();}
});
