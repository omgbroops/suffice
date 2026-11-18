import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const shots=process.env.CHAT_SHOTS;
test('live workflow card, one left column, action bar, toast and peek card never overlap the chat or composer',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-cl-')),hist=await mkdtemp(resolve(tmpdir(),'suffice-cl-h-'));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fix2-chat',SUFFICE_HISTORY_HOME:hist};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{const page=await app.firstWindow();page.setDefaultTimeout(10000);await page.locator('.composer').waitFor();
 await app.evaluate(({ipcMain,BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setContentSize(1440,900);
  ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>[{provider:'anthropic',id:'claude-haiku',name:'Claude Haiku',available:true,efforts:['low','medium','high']}]);
  ipcMain.removeHandler('suffice:threads');ipcMain.handle('suffice:threads',()=>[{id:'a',title:'Fix double charge on retried webhooks',project:'Halo Pay',provider:'anthropic',model:'claude-sonnet',status:'done',modified:Date.now()-600000}]);
  ipcMain.removeHandler('suffice:thread');ipcMain.handle('suffice:thread',(e,id)=>({id,title:id,messages:[{role:'user',content:[{type:'text',text:'Add retry jitter'}]},{role:'assistant',content:[{type:'text',text:'Added backoff.'}]}]}));
  ipcMain.removeHandler('suffice:run');ipcMain.handle('suffice:run',()=>new Promise(r=>{globalThis.__fin=r;}));});
 const send=v=>app.evaluate(({BrowserWindow},v)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',v),v);
 const snap=async n=>{if(!shots)return;await mkdir(shots,{recursive:true});const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,n),Buffer.from(png,'base64'));};
 const box=sel=>page.locator(sel).last().evaluate(e=>{const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom};});
 const apart=(a,b,msg)=>assert.ok(a.b<=b.t+0.5||b.b<=a.t+0.5||a.r<=b.l+0.5||b.r<=a.l+0.5,msg);
 await page.evaluate(t=>{localStorage.setItem('suffice-theme',t);localStorage.setItem('suffice-model',JSON.stringify({provider:'anthropic',model:'claude-haiku',effort:'medium'}));},process.env.CHAT_THEME||'dark');await page.reload();await page.locator('.composer').waitFor();
 await page.locator('#prompt').fill('Fix the failing retry test');await page.locator('#prompt').press('Enter');await page.locator('.thread-status').waitFor();
 await send({event:'thread_started',id:'chat-1'});
 await send({event:'tool_start',id:'a',name:'bash',input:{command:'npm test'}});await send({event:'tool_output',id:'a',result:{content:[{type:'text',text:'1 failed'}]}});await send({event:'tool_end',id:'a'});
 await send({event:'text',text:'I changed the retry delay.'});
 await send({event:'tool_start',id:'d',name:'workflow',input:{name:'release-check'}});await send({event:'tool_output',id:'d',result:{content:[{type:'text',text:'step 2 of 5: build'}]}});
 const live=page.locator('.thread-live',{hasText:'step 2 of 5'});await live.waitFor({state:'visible'});
 assert.match(await live.locator('.thread-live-name').innerText(),/workflow/i);
 assert.match(await live.locator('.thread-live-step').innerText(),/step 2 of 5: build/);
 await page.waitForFunction(()=>/^\d+:\d\d$/.test(document.querySelector('.thread-live:not([hidden]) .thread-live-time')?.textContent||''));
 const t1=await live.locator('.thread-live-time').innerText();await page.waitForTimeout(1300);assert.notEqual(await live.locator('.thread-live-time').innerText(),t1,'elapsed ticks');
 await live.getByRole('button',{name:/^Stop/}).waitFor();
 // one left column: user message, tool lines, assistant text share a left edge
 const left=await page.evaluate(()=>[...document.querySelectorAll('.thread-user,.thread-assistant,.thread-live')].filter(e=>e.offsetParent).map(e=>Math.round(e.getBoundingClientRect().left)));
 assert.ok(left.length>=3&&Math.max(...left)-Math.min(...left)<=2,'messages share one left edge: '+left);
 // toast sits above the composer, horizontally inside its column
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('suffice-toast',{detail:'Copied path'})));await page.locator('.toast .toast-message').waitFor();await page.waitForTimeout(400);
 const toast=await box('.toast'),comp=await box('.composer');assert.ok(toast.b<=comp.t,'toast above composer');apart(toast,comp,'toast/composer');assert.ok(toast.l>=comp.l-1&&toast.r<=comp.r+1,'toast inside composer column');
 apart(await box('.thread-live:not([hidden])'),comp,'live card/composer');await snap('chat-run.png');
 // peek card beside the sidebar row, never over messages
 await page.evaluate(()=>document.querySelectorAll('.toast .toast-dismiss').forEach(b=>b.click()));
 const row=page.locator('[data-thread="a"]');await row.hover();const card=page.locator('.thread-hover-card');await card.locator('.thread-peek').waitFor({timeout:4000});
 const cb=await box('.thread-hover-card'),rb=await row.boundingBox();
 assert.ok(cb.l>=rb.x+rb.width-1,'peek card beside row');
 const msgs=await page.evaluate(()=>[...document.querySelectorAll('.thread-user,.thread-assistant,.thread-live')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom};}));
 for(const m of msgs)apart(cb,m,'peek card never over a message');
 await snap('chat-peek.png');await page.mouse.move(700,500);
 // finish: action bar in flow under the agent message, with copy, fork, code, time, model; never overlapping message or composer
 await send({event:'tool_end',id:'d'});
 await app.evaluate(()=>globalThis.__fin({text:'I changed the retry delay. All green.',presentation:{provider:'anthropic',model:'claude-haiku',modelName:'Claude Haiku',effort:'medium',startedAt:Date.now()-65000,endedAt:Date.now()}}));
 const abar=page.locator('.message-actions-slot[data-role=assistant] .message-toolbar').last();await abar.waitFor({state:'visible'});
 for(const n of ['Copy full response','Fork from here'])await abar.getByRole('button',{name:n,exact:true}).waitFor();
 await abar.locator('.message-turn-model').waitFor();assert.equal(await abar.locator('.message-turn-model').count(),1);assert.equal(await abar.locator('.message-turn-duration').count(),1);assert.equal(await abar.locator('.message-turn-model img').count(),0,'no provider dot');
 assert.equal(await page.locator('.thread-live:not([hidden])').count(),0,'live card removed when run ends');
 const am=await box('.thread-assistant'),ab=await box('.message-actions-slot[data-role=assistant]');
 assert.ok(Math.abs(ab.l-am.l)<=2,'bar left-aligned with message');assert.ok(ab.t>=am.b-1,'bar under the message');apart(ab,await box('.composer'),'bar/composer');
 assert.match(await abar.evaluate(e=>getComputedStyle(e).position),/^(static|relative)$/,'bar in normal flow');
 const um=await box('.thread-user');assert.ok(Math.abs(um.l-am.l)<=2,'user left-aligned');
 await snap('chat-done.png');
 }finally{await app.close().catch(()=>{});}
});
