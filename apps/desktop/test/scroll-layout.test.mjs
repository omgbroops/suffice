import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';

test('transcript follows output across layout clamps and preserves upward intent', {timeout:30000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-scroll-layout-'));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const electron=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await electron.firstWindow();await page.locator('.composer').waitFor();
  await electron.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:run');ipcMain.handle('suffice:run',()=>new Promise(resolve=>{globalThis.finishScrollLayout=resolve;}));});
  const send=text=>electron.evaluate(({BrowserWindow},text)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'text',text}),text);
  const metrics=()=>page.locator('.thread-transcript').evaluate(el=>({top:el.scrollTop,height:el.scrollHeight,viewport:el.clientHeight,gap:el.scrollHeight-el.scrollTop-el.clientHeight}));
  const atBottom=()=>page.waitForFunction(()=>{const el=document.querySelector('.thread-transcript');return el.scrollHeight-el.scrollTop-el.clientHeight<2;},null,{timeout:5000});
  await page.locator('#prompt').fill('Streaming layout fixture');await page.locator('#prompt').press('Enter');await page.locator('.thread-status').waitFor();
  await send('First response');await page.locator('.thread-assistant').filter({hasText:'First response'}).waitFor();
  await electron.evaluate(()=>globalThis.finishScrollLayout({text:'First response',threadId:null}));await page.locator('.thread-status').waitFor({state:'detached'});
  await page.locator('#prompt').fill('Second message '+ 'with enough text to wrap. '.repeat(50));
  await page.waitForFunction(()=>document.querySelector('#prompt').clientHeight>200);
  await page.locator('#prompt').press('Enter');await page.locator('.thread-status').waitFor();
  await page.waitForFunction(()=>document.querySelector('#prompt').clientHeight===64);
  await send('A paragraph of streamed text.\n\n'.repeat(70));
  await page.waitForFunction(()=>document.querySelector('.thread-assistant:last-of-type')?.querySelectorAll('p').length===70);
  await atBottom();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  // Capture browser scroll events and real layout metrics before changing geometry.
  await page.evaluate(()=>{const el=document.querySelector('.thread-transcript');window.scrollLayoutEvents=[];el.addEventListener('scroll',()=>window.scrollLayoutEvents.push({top:el.scrollTop,height:el.scrollHeight,viewport:el.clientHeight,time:performance.now()}));});
  // A padding reduction clamps scrollTop before the next observer callback can run.
  // This reproduces the layout effect of the composer shrinking after submit.
  const before=await metrics();
  await page.locator('.thread-transcript').evaluate(el=>new Promise(resolve=>requestAnimationFrame(()=>{el.style.setProperty('--transcript-bottom-space','0px');void el.scrollHeight;resolve();})));
  await page.waitForFunction(()=>window.scrollLayoutEvents.length>0);
  const clamped=await metrics();assert.ok(clamped.height<before.height,JSON.stringify({before,clamped}));assert.ok(clamped.top<before.top);assert.ok(clamped.gap<2);
  await send('\n\nOutput after the layout clamp');
  await page.locator('.thread-assistant').filter({hasText:'Output after the layout clamp'}).waitFor();
  const after=await metrics();console.log(JSON.stringify({before,clamped,after,events:await page.evaluate(()=>window.scrollLayoutEvents)}));
  await atBottom();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  // Native viewport growth also clamps the position without resizing the history.
  const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
  await electron.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height+80),viewport);
  await page.waitForFunction(height=>innerHeight===height+80,viewport.height);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const viewportClamp=await metrics();
  assert.equal(viewportClamp.height,after.height);assert.ok(viewportClamp.viewport>after.viewport);assert.ok(viewportClamp.top<after.top);assert.ok(viewportClamp.gap<2);
  console.log(JSON.stringify({viewportClamp,events:await page.evaluate(()=>window.scrollLayoutEvents)}));
  await send('\n\nOutput after viewport growth');await page.locator('.thread-assistant').filter({hasText:'Output after viewport growth'}).waitFor();await atBottom();
  // An explicit upward gesture releases following even when it cannot move far.
  await page.locator('.thread-transcript').evaluate(el=>{el.dispatchEvent(new WheelEvent('wheel',{deltaY:-1,bubbles:true}));el.scrollTop-=1;el.dispatchEvent(new Event('scroll'));});
  const reading=await metrics();await send('\n\nOutput while reading earlier content');
  await page.locator('.thread-assistant').filter({hasText:'Output while reading earlier content'}).waitFor();
  assert.equal((await metrics()).top,reading.top);
  await page.locator('.thread-transcript').evaluate(el=>{el.scrollTop=el.scrollHeight;});await atBottom();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await send('\n\nOutput after scrolling down to the end');await page.locator('.thread-assistant').filter({hasText:'Output after scrolling down to the end'}).waitFor();await atBottom();
  await electron.evaluate(()=>globalThis.finishScrollLayout({text:'Finished',threadId:null}));
 }finally{await electron.close();}
});
