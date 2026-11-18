import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {deriveFollowups} from '../src/followups.js';
test('derive chips from the run',()=>{
 assert.deepEqual(deriveFollowups([]),[]);
 const longReply=Array(60).fill('word').join(' ');
 assert.deepEqual(deriveFollowups([{name:'read',input:{}}],false,longReply),['Summarize what you found','Go deeper']);
 assert.deepEqual(deriveFollowups([{name:'read',input:{}}],false,'Hello. What are you working on?'),[],'small talk and questions back get no chips');
 assert.deepEqual(deriveFollowups([{name:'read',input:{}}],false,'Hello.'),[],'a short reply gets no read-only chips');
 assert.deepEqual(deriveFollowups([{name:'edit',input:{}}],false,'Which file should I change?'),[],'a question back gets no chips');
 assert.deepEqual(deriveFollowups([{name:'edit',input:{}}]),['Run the tests','Commit this','Explain the diff']);
 assert.deepEqual(deriveFollowups([{name:'edit'},{name:'bash',input:{command:'node --test tests'}}]),['Commit this','Explain the diff','Review for bugs']);
 assert.deepEqual(deriveFollowups([{name:'bash',input:{command:'ls'},isError:true}]),['Fix the error','Explain what failed']);
});
test('followup chips: shown after a run, click fills, Tab accepts first, cleared on next run',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-followups-'));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_SESSIONS_SOCKET:'sfx-pre-followups',SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('.composer').waitFor();page.setDefaultTimeout(8000);
  await app.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.runs=[];const send=e=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',e);globalThis.sendEv=send;
   for(const a of ['run','thread','threads','models'])ipcMain.removeHandler('suffice:'+a);
   ipcMain.handle('suffice:models',()=>[{id:'fixture',provider:'openai',name:'Fixture',available:true,efforts:['low']}]);
   ipcMain.handle('suffice:threads',()=>[]);ipcMain.handle('suffice:thread',(_e,id)=>({id,title:'Initial',cwd:process.cwd(),messages:[]}));
   ipcMain.handle('suffice:run',(_e,p)=>new Promise(resolve=>{globalThis.runs.push({p,resolve});send({event:'thread_started',id:'fx',threadId:'fx',clientId:p.clientId});}));
  });
  await page.reload();await page.locator('#prompt').fill('Add a retry to the fetch helper');await page.locator('.composer').evaluate(f=>f.requestSubmit());
  await page.getByRole('button',{name:'Stop task',exact:true}).waitFor();
  await app.evaluate(()=>{const b={threadId:'fx',clientId:'fx'};sendEv({...b,event:'tool_start',id:'t1',name:'edit',input:{path:'src/fetch.js'}});sendEv({...b,event:'tool_end',id:'t1',result:'ok',isError:false});});
  assert.equal(await page.locator('.thread-followups').count(),0,'no chips while running');
  await app.evaluate(()=>runs[0].resolve({threadId:'fx',text:'Added a retry with backoff to fetch.js.'}));
  await page.locator('.followup-chip').first().waitFor();
  assert.deepEqual(await page.locator('.followup-chip').evaluateAll(c=>c.map(x=>x.firstChild.textContent)),['Run the tests','Commit this','Explain the diff']);
  await page.setViewportSize?.({width:1440,height:900});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  for(const theme of ['dark','light']){
   await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(1500);
   const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
   await writeFile(`/Users/abhayg/suffice-desktop-wt/ui-shots/forge/final/followups/followups-${theme}.png`,Buffer.from(png,'base64'));
  }
  await page.locator('.followup-chip').nth(1).click();assert.equal(await page.locator('#prompt').inputValue(),'Commit this');
  await page.locator('#prompt').fill('');await page.locator('#prompt').focus();await page.keyboard.press('Tab');
  assert.equal(await page.locator('#prompt').inputValue(),'Run the tests');
  await page.locator('.composer').evaluate(f=>f.requestSubmit());await page.getByRole('button',{name:'Stop task',exact:true}).waitFor();
  assert.equal(await page.locator('.thread-followups').count(),0,'cleared on next run');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
