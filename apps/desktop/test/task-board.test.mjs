import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard,openMore} from './electron-guard.mjs';

const shots=process.env.TASK_BOARD_SHOTS;
async function launch(){
 const home=await mkdtemp(resolve(tmpdir(),'suffice-task-board-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-agent-task-board-'+process.pid,SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-tb-history-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 const page=await app.firstWindow();await page.locator('.composer').waitFor();
 await app.evaluate(({ipcMain})=>{
  globalThis.runs=new Map();globalThis.aborts=[];
  for(const action of ['run-background','abort','usage','threads'])ipcMain.removeHandler('suffice:'+action);
  ipcMain.handle('suffice:threads',()=>[]);
  ipcMain.handle('suffice:abort',(_e,id)=>{globalThis.aborts.push(id);});
  ipcMain.handle('suffice:usage',(_e,id)=>({cost:id==='task-one'?0.0421:id==='task-two'?1.37:0}));
  ipcMain.handle('suffice:run-background',(event,payload)=>new Promise((resolve,reject)=>{const id=payload.prompt.replace(/\W+/g,'-').toLowerCase().slice(0,20);globalThis.runs.set(payload.prompt,{resolve,reject,payload,id});event.sender.send('suffice:event',{event:'thread_started',id,threadId:id,clientId:payload.clientId});}));
 });
 await page.reload();await page.locator('.composer').waitFor();
 const emit=event=>app.evaluate(({BrowserWindow},event)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',event),event);
 return {app,page,emit};
}
let appRef;
const shot=async(page,theme,name)=>{if(!shots)return;await mkdir(shots,{recursive:true});await page.waitForTimeout(300);const png=await appRef.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1440,900);await new Promise(r=>setTimeout(r,200));return (await w.webContents.capturePage()).toPNG().toString('base64');});await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(png,'base64'));};

for(const theme of shots?['dark','light']:['dark'])
test(`task board (${theme}): queue, limit, needs-you, cancel, retry, via sidebar and Cmd+K`,{timeout:90000},async()=>{
 const {app,page,emit}=await launch();appRef=app;
 try{
  await page.evaluate(t=>localStorage.setItem('suffice-theme',t),theme);await page.reload();await page.locator('.composer').waitFor();
  const board=page.getByRole('region',{name:'Tasks'});
  // Entry 1: sidebar button.
  await openMore(page);await page.getByRole('button',{name:'Tasks',exact:true}).click();await board.waitFor();
  assert.equal(await page.locator('#tb-text').evaluate(el=>document.activeElement===el),true);
  await shot(page,theme,'01-empty');
  // Escape closes, Cmd+K entry reopens.
  await page.keyboard.press('Escape');await board.waitFor({state:'hidden'});
  await page.keyboard.press('Control+k');const input=page.getByRole('combobox',{name:'Search threads and commands'});await input.fill('tasks');await input.press('Enter');await board.waitFor();
  // Queue 4 tasks, one per line, limit 2.
  await page.locator('#tb-text').fill('Task one\nTask two\n\nTask three\nTask four');await page.getByRole('button',{name:'Queue',exact:true}).click();
  const col=name=>page.locator(`[data-col="${name}"] .tb-card .tb-title`);
  await page.waitForFunction(()=>document.querySelectorAll('[data-col="running"] .tb-card').length===2);
  assert.deepEqual(await col('running').allTextContents(),['Task one','Task two']);assert.deepEqual(await col('queued').allTextContents(),['Task three','Task four']);
  assert.equal(await page.locator('.tb-limit output').textContent(),'2');
  await page.getByRole('button',{name:'More at once'}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-col="running"] .tb-card').length===3);
  await page.getByRole('button',{name:'Fewer at once'}).click();assert.equal(await col('running').count(),3);
  // Cost and elapsed are live.
  await page.waitForFunction(()=>/\$0\.04/.test(document.querySelector('[data-col="running"] .tb-cost')?.textContent||''),{},{timeout:8000});
  await page.waitForFunction(()=>/^0:0[1-9]/.test(document.querySelector('[data-col="running"] .tb-elapsed')?.textContent||''),{},{timeout:8000});
  // Approval moves a card to Needs you.
  await emit({event:'approval',threadId:'task-two',requestId:'r1'});
  await page.waitForFunction(()=>document.querySelectorAll('[data-col="needs"] .tb-card').length===1);
  assert.match(await page.locator('[data-col="needs"] .tb-state').textContent(),/approval/);
  await emit({event:'tool_start',threadId:'task-one',name:'bash',id:'x',input:{}});
  await page.waitForFunction(()=>/Running bash/.test(document.querySelector('[data-col="running"] .tb-state')?.textContent||''));
  await shot(page,theme,'02-live');
  // Finish one, cancel one, fail one.
  await app.evaluate(()=>globalThis.runs.get('Task one').resolve({threadId:'task-one',text:'ok'}));
  await page.waitForFunction(()=>document.querySelectorAll('[data-col="done"] .tb-card').length===1);
  await page.locator('[data-col="running"] .tb-card').filter({hasText:'Task three'}).getByRole('button',{name:/^Cancel/}).click();
  await page.waitForFunction(()=>document.querySelector('[data-col="done"]').textContent.includes('Cancelled'));
  assert.deepEqual(await app.evaluate(()=>globalThis.aborts),['task-three']);
  await app.evaluate(()=>globalThis.runs.get('Task four').reject(new Error('Provider returned 529')));
  await page.waitForFunction(()=>document.querySelectorAll('[data-col="needs"] .tb-card').length===2);
  await page.locator('.tb-issues').waitFor({state:'hidden'});await page.getByRole('button',{name:'From issues'}).click();await page.locator('#tb-repo').fill('bad');await page.getByRole('button',{name:'Import',exact:true}).click();
  await page.locator('.tb-error').filter({hasText:'owner/repo'}).waitFor();
  await shot(page,theme,'03-mixed');
  // Retry the failed task: it runs again with a new client id.
  await page.locator('[data-col="needs"] .tb-card').filter({hasText:'Task four'}).getByRole('button',{name:/^Retry/}).click();
  await page.waitForFunction(()=>document.querySelector('[data-col="running"]').textContent.includes('Task four'));
  assert.equal(await app.evaluate(()=>globalThis.runs.get('Task four').payload.prompt),'Task four');
  // Summary and sidebar badge track active work.
  assert.match(await page.locator('.tb-summary').textContent(),/running/);
  assert.equal(await page.locator('.tb-badge').isVisible(),true);
  await page.getByRole('button',{name:'Clear done'}).click();assert.equal(await page.locator('[data-col="done"] .tb-card').count(),0);
  await page.getByRole('button',{name:'Close tasks'}).click();await board.waitFor({state:'hidden'});
 }finally{await app.close();}
});
