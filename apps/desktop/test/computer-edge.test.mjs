import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard,killTmux} from './electron-guard.mjs';

// Hidden window, fake computer: leaving Settings by opening Computer use, cancel while steps run, quit while an approval waits.
test('Computer use edges: settings closes, cancel mid-run, interrupted approval after quit',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-computer-edge-'));let n=0;
 const launch=async body=>{
  const socket='sfx-fl2-computer-use-e'+(++n);
  const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_NO_SCHEDULER:'1',SUFFICE_COMPUTER_FAKE:'1',SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-computer-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
  try{const page=await app.firstWindow();page.setDefaultTimeout(15000);await body(page);}
  finally{await app.close();killTmux(socket);}
 };
 const start=async(page,goal,url)=>{
  await page.getByRole('button',{name:'New session'}).last().click();
  await page.locator('[data-field=goal]').fill(goal);await page.locator('[data-field=url]').fill(url);
  await page.locator('.cu-form [data-act=start]').click();
 };
 const row=(page,goal)=>page.locator('.cu-item',{hasText:goal});

 await launch(async page=>{
  // Settings is modal now (sidebar inert): leave it with Back, then Computer use opens and Settings stays closed
  await page.locator('[data-action=settings]').first().click();
  await page.locator('[data-section=agent]').click();
  await page.getByRole('switch',{name:'Computer use sessions'}).click();
  await page.locator('[role=switch][aria-label="Computer use sessions"][aria-checked=true]').waitFor();
  await page.getByRole('button',{name:'Back to chats'}).click();
  await page.locator('.computer-nav').click();
  await page.locator('.computer-view:not([hidden])').waitFor();
  await page.waitForFunction(()=>!document.documentElement.classList.contains('settings-open'));
  await page.locator('.settings-scroll').waitFor({state:'hidden'});

  // cancel while steps are running
  await start(page,'Walk the slow site','https://slow.test/');
  const r=row(page,'Walk the slow site');
  await page.waitForFunction(()=>/^[1-9]/.test(document.querySelector('.cu-item .cu-steps-count')?.textContent||''));
  await r.locator('.cu-row[data-state=running]').waitFor();
  await r.locator('[data-act=cancel]').click();
  await r.locator('.cu-row[data-state=cancelled]').waitFor();
  const list=()=>page.evaluate(()=>window.sufficeDesktop.computer.list().then(x=>x.runs[0]));
  const a=await list();
  assert.ok(a.stepCount>=1&&a.stepCount<20,'stopped mid-run: '+a.stepCount);
  assert.equal(a.state,'cancelled');
  assert.equal(a.stopReason,'aborted');
  assert.equal((await list()).stepCount,a.stepCount);

  // leave a payment approval pending, then quit
  await start(page,'Buy a laptop','https://shop.test/');
  await page.locator('.cu-approval').waitFor();
 });

 await launch(async page=>{
  await page.locator('.computer-nav').click();await page.locator('.computer-view:not([hidden])').waitFor();
  const r=row(page,'Buy a laptop');
  await r.locator('.cu-row[data-state=interrupted]').waitFor();
  assert.match(await r.locator('.cu-reason').innerText(),/before you answered[\s\S]*not taken/);
  assert.equal(await page.locator('.cu-approval').count(),0);
  await row(page,'Walk the slow site').locator('.cu-row[data-state=cancelled]').waitFor();
 });
});
