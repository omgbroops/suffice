import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';

test('threads keep independent live runs and accept steering without aborting',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-concurrent-')),env={...process.env,SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.runs=new Map();globalThis.steers=[];globalThis.aborts=[];
   for(const action of ['run','thread','threads','steer','abort'])ipcMain.removeHandler('suffice:'+action);
   ipcMain.handle('suffice:threads',()=>[]);
   ipcMain.handle('suffice:thread',(_e,id)=>({id,title:id,cwd:process.cwd(),messages:[]}));
   ipcMain.handle('suffice:steer',(_e,payload)=>{globalThis.steers.push(payload);});
   ipcMain.handle('suffice:abort',(_e,id)=>{globalThis.aborts.push(id);});
   ipcMain.handle('suffice:run',(_e,payload)=>new Promise(resolve=>{const id=payload.prompt;globalThis.runs.set(id,{resolve,payload});BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'thread_started',id,threadId:id,clientId:payload.clientId});}));
  });
  await page.reload();await page.locator('#prompt').fill('one');await page.locator('.composer').evaluate(el=>el.requestSubmit());
  await page.locator('.thread-row').filter({hasText:'one'}).waitFor();
  await page.getByRole('button',{name:'New session',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.workspace').classList.contains('thread-view'));
  await page.locator('#prompt').fill('two');await page.locator('.composer').evaluate(el=>el.requestSubmit());
  await page.locator('.thread-row').filter({hasText:'two'}).waitFor();
  const emit=event=>app.evaluate(({BrowserWindow},event)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',event),event);
  await emit({event:'text',threadId:'one',text:'First agent is still working'});
  assert.doesNotMatch(await page.locator('.thread-messages').innerText(),/First agent/);
  await page.locator('.thread-row').filter({hasText:'one'}).click();await page.locator('.thread-header').filter({hasText:'one'}).waitFor();
  await page.getByRole('button',{name:'Stop task',exact:true}).waitFor();
  assert.match(await page.locator('.thread-messages').innerText(),/First agent/);
  await page.locator('#prompt').fill('Check tests first');await page.getByRole('button',{name:'Steer agent',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#prompt').value==='',{},{timeout:2000});
  await app.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
  assert.deepEqual(await app.evaluate(()=>globalThis.steers.map(({threadId,prompt})=>({threadId,prompt}))),[{threadId:'one',prompt:'Check tests first'}]);
  assert.deepEqual(await app.evaluate(()=>globalThis.aborts),[]);
  await app.evaluate(()=>globalThis.runs.get('two').resolve({threadId:'two',text:'Second completed'}));
  await page.getByRole('button',{name:'Stop task',exact:true}).waitFor();
  await emit({event:'assistant_start',threadId:'one'});await emit({event:'text',threadId:'one',text:'Following your steering'});
  await app.evaluate(()=>globalThis.runs.get('one').resolve({threadId:'one',text:'Following your steering'}));
  await page.waitForFunction(()=>document.querySelector('.composer').dataset.running==='false');
  assert.match(await page.locator('.thread-messages').innerText(),/Following your steering/);
  const order=await page.locator('.thread-messages > .thread-message').allTextContents();
  assert.deepEqual(order.map(text=>text.trim()),['one','First agent is still working','Check tests first','Following your steering']);
  await page.locator('.thread-row').filter({hasText:'two'}).click();assert.match(await page.locator('.thread-messages').innerText(),/Second completed/);
 }finally{await app.close();}
});
