import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

// Notification is replaced by a recorder under SUFFICE_TEST_HIDE_WINDOW; nothing real is shown. Hidden window only.
test('notify-badge: unfocused Needs-you events notify + badge the dock, toggles gate them, click opens the thread',{timeout:120000},async()=>{
 const shots=resolve(process.env.SHOT_DIR||'/Users/abhayg/suffice-desktop-wt/ui-shots/forge/feat/notify-badge');await mkdir(shots,{recursive:true});
 const home=await mkdtemp(resolve(tmpdir(),'sfx-notify-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:`sfx-feat-notify-badge-${process.pid}`,SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'sfx-notify-h-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 const stderr=[];app.process().stderr.on('data',d=>stderr.push(String(d)));
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.focused=false;const win=BrowserWindow.getAllWindows()[0];win.isFocused=()=>globalThis.focused;win.show=win.focus=()=>{};
   for(const a of ['thread','threads'])ipcMain.removeHandler('suffice:'+a);
   ipcMain.handle('suffice:threads',()=>[{id:'alpha',title:'Alpha thread',modified:Date.now(),messages:1},{id:'beta',title:'Beta thread',modified:Date.now(),messages:1}]);
   ipcMain.handle('suffice:thread',(_e,id)=>({id,title:id==='alpha'?'Alpha thread':'Beta thread',messages:[]}));
  });
  await page.reload();await page.locator('.composer').waitFor();
  const emit=event=>app.evaluate((_,e)=>globalThis.sufficeTestHarnessEvent(e),event);
  const state=()=>app.evaluate(({app})=>({badge:app.getBadgeCount(),notes:(globalThis.sufficeTestNotifications||[]).map(n=>n.options.body)}));
  const until=async fn=>{for(let i=0;i<40;i++){const s=await state();if(fn(s))return s;await page.waitForTimeout(100);}throw new Error('timeout '+JSON.stringify(await state()));};
  const shot=async name=>{for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(300);const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(b,'base64'));}await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});};
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  // Focused window: no notification, no badge.
  await app.evaluate(()=>{globalThis.focused=true;});
  await emit({event:'approval',threadId:'alpha',requestId:1,name:'bash',input:{command:'ls'}});await page.waitForTimeout(400);
  assert.deepEqual(await state(),{badge:0,notes:[]});
  // Unfocused approval: notification + badge 1.
  await app.evaluate(()=>{globalThis.focused=false;});
  await emit({event:'approval',threadId:'alpha',requestId:2,name:'bash',input:{command:'ls'}});
  assert.deepEqual((await until(s=>s.badge===1)).notes,['Agent needs approval']);
  // A run finishes on another thread: the badge counts threads.
  await app.evaluate(()=>globalThis.sufficeTestNotify('finished','Agent finished','beta'));
  assert.equal((await until(s=>s.badge===2)).notes.at(-1),'Agent finished');await shot('thread-list');
  // Toggle off "Agent encountered an error" in real settings; a failure then stays silent, while a failure with the toggle on notifies.
  await app.evaluate(()=>globalThis.sufficeTestNotify('failed','Agent encountered an error','gamma'));
  assert.equal((await until(s=>s.badge===3)).notes.at(-1),'Agent encountered an error');
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('suffice-open-settings',{detail:{section:'notifications'}})));
  const toggle=page.locator('.settings-main').getByRole('switch',{name:/Agent encountered an error/});await toggle.waitFor();await shot('settings-notifications');
  await toggle.click();await page.waitForTimeout(400);await shot('settings-failed-off');
  await page.keyboard.press('Escape');
  await app.evaluate(()=>globalThis.sufficeTestNotify('failed','Agent encountered an error','delta'));await page.waitForTimeout(500);
  assert.equal((await state()).badge,3);
  // Clicking the finished notification opens beta and clears that thread from the badge.
  await app.evaluate(()=>{const n=globalThis.sufficeTestNotifications;n.find(x=>x.options.body==='Agent finished').on_click();});
  await page.locator('.thread-row[data-thread=beta]').waitFor();
  await page.waitForFunction(()=>sessionStorage.getItem('suffice-active-thread')==='beta');
  await shot('thread-opened');
  assert.equal((await state()).badge,2);
  // Focusing the window clears the badge.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].emit('focus'));
  await until(s=>s.badge===0);
  assert.deepEqual(errors,[]);assert.equal(stderr.join('').includes('[no-dialog]'),false,stderr.join(''));
 }finally{await app.close();}
});
