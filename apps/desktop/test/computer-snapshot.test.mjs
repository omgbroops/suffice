import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard,killTmux} from './electron-guard.mjs';

// Hidden window, fake web: each step shows the ref snapshot and 'Click @eN'; the run ships no screenshot.
test('Computer use steps show ref snapshots and ref actions',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-computer-snap-')),socket='sfx-fr-ref-snapshot-control-1';
 const shots=resolve('/Users/abhayg/suffice-desktop-wt/ui-shots/frontier/ref-snapshot-control');await mkdir(shots,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_NO_SCHEDULER:'1',SUFFICE_COMPUTER_FAKE:'1',SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-computer-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  await page.locator('[data-action=settings]').first().click();await page.locator('[data-section=agent]').click();
  await page.getByRole('switch',{name:'Computer use sessions'}).click();
  await page.locator('[role=switch][aria-label="Computer use sessions"][aria-checked=true]').waitFor(); await page.locator('[data-action=settings]').first().click();
  await page.locator('.computer-nav').click();await page.locator('.computer-view:not([hidden])').waitFor();
  await page.getByRole('button',{name:'New session'}).last().click();
  await page.locator('[data-field=goal]').fill('Find a laptop');await page.locator('[data-field=url]').fill('https://shop.test/');
  await page.locator('.cu-form [data-act=start]').click();
  const step=page.locator('.cu-step',{has:page.locator('.cu-step-snap')}).first();await step.waitFor();
  assert.match(await step.locator('.cu-step-action').textContent(),/^Click @e\d+$/);
  assert.match(await step.locator('.cu-step-snap').textContent(),/^@e1 \w+/);
  assert.equal(await page.locator('.cu-step img,.cu-step canvas').count(),0,'no screenshot by default');
  await page.setViewportSize({width:1440,height:900});for(const mode of ['dark','light']){await page.locator('html').evaluate((el,m)=>{el.dataset.theme=m;},mode);await page.screenshot({path:resolve(shots,`computer-snapshot-${mode}.png`)});}
 }finally{await app.close();killTmux(socket);}
});
