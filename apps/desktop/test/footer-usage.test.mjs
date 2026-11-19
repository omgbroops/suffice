import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,basename} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

// Fake backend: the thread has no inspectable context, but its run reported usage. The footer must show that count and the thread's project.
test('footer shows the run token count and the thread project name',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-fu-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-fu-proj-'));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-st-chat-fu-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain},cwd)=>{
   for(const action of ['thread','threads','context','usage'])ipcMain.removeHandler('suffice:'+action);
   ipcMain.handle('suffice:threads',()=>[{id:'t1',title:'Used tokens',project:'x',cwd,modified:Date.now(),status:'done'}]);
   ipcMain.handle('suffice:thread',(_e,id)=>({id,title:'Used tokens',cwd,messages:[{role:'user',timestamp:1,content:[{type:'text',text:'hi'}]},{role:'assistant',timestamp:5,content:[{type:'text',text:'hello'}]}]}));
   ipcMain.handle('suffice:context',()=>null);
   ipcMain.handle('suffice:usage',()=>({cost:0.02,totalTokens:4321,windowTokens:900,windowPercent:1}));
  },cwd);
  await page.reload();await page.locator('.thread-row').first().click();await page.locator('.thread-assistant').waitFor();
  await page.waitForFunction(()=>document.querySelector('.context-chip')?.textContent.trim()==='4.3k');
  assert.equal(await page.locator('.project-picker .project-name').textContent(),basename(cwd));
 }finally{await app.close();}
});
