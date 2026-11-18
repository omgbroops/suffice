// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): the What's new sheet opens from Cmd+K, lists every entry, and Try it opens the feature.
// SHOT_DIR sets the screenshot folder. Private tmux socket only.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {guard} from './electron-guard.mjs';
import {WHATS_NEW} from '../src/whats-new-data.js';

test('whats-new data: unique ids, short copy, an entry point and a Try target each',()=>{
 assert.ok(WHATS_NEW.length>=10);
 assert.equal(new Set(WHATS_NEW.map(i=>i.id)).size,WHATS_NEW.length);
 for(const i of WHATS_NEW){assert.ok(i.title&&i.line.length<=70,i.id);assert.ok(i.entry.length&&Object.keys(i.try).length===1,i.id);}
});

test('whats-new sheet: Cmd+K entry, rows, Try it, shown once',{timeout:240000},async()=>{
 const shots=resolve(process.env.SHOT_DIR||'/Users/abhayg/suffice-desktop-wt/ui-shots/forge/final/whats-new');await mkdir(shots,{recursive:true});
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-wn-'))),SOCKET=`sfx-conv-whats-new-${process.pid}`;
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{PI_OFFLINE:'1',SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home});
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),`--user-data-dir=${data}`],env});
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.composer').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  const shot=async(name,theme)=>{await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.mouse.move(1000,880);await page.waitForTimeout(400);const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(b64,'base64'));};
  const sheet=page.locator('dialog.whats-new');
  // a hidden window never auto-opens it
  await page.evaluate(()=>localStorage.removeItem('suffice-whats-new-seen'));
  assert.equal(await sheet.isVisible(),false);
  // Cmd+K entry
  await page.keyboard.press('Control+k');await page.locator('#spotlight-query').fill("what's new");
  await page.locator('.spotlight-result',{hasText:"What's new"}).click();
  await sheet.waitFor();
  assert.equal(await sheet.locator('li').count(),WHATS_NEW.length);
  assert.equal(await sheet.locator('.whats-new-try').count(),WHATS_NEW.length);
  await shot('sheet','dark');await shot('sheet','light');await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
  // Esc closes and marks seen
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog.whats-new').open);
  assert.ok(await page.evaluate(()=>localStorage.getItem('suffice-whats-new-seen')));
  assert.equal(await page.evaluate(()=>window.sufficeWhatsNew.maybeShow()),false,'seen release does not reopen');
  // Try it: Tasks opens the palette filtered to the command; Automations opens its settings page
  await page.evaluate(()=>window.sufficeWhatsNew.open());
  await sheet.locator('li[data-id=tasks] .whats-new-try').click();
  await page.waitForFunction(()=>!document.querySelector('dialog.whats-new').open);
  assert.equal(await page.locator('#spotlight-query').inputValue(),'Tasks');
  assert.ok(await page.locator('.spotlight-result',{hasText:'Tasks'}).count());
  await shot('try-tasks','dark');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>window.sufficeWhatsNew.open());
  await sheet.locator('li[data-id=automations] .whats-new-try').click();
  await page.locator('.settings-page, [data-settings], .settings').first().waitFor({state:'attached'});
  assert.deepEqual(errors,[]);
 }finally{await app.close().catch(()=>{});}
});
