import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
test('Spotlight reopen during close fade, Tab focus loop, scope keys, ARIA state',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-spota11y-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-forge-spotlight-contrast',SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  const open=()=>page.evaluate(()=>document.querySelector('.spotlight').open);
  const input=page.getByRole('combobox',{name:'Search threads and commands'});
  await page.getByRole('button',{name:'Search sessions',exact:true}).click();await page.locator('.spotlight[open]').waitFor();
  for(let i=0;i<5;i++){
   await page.locator('.spotlight-close').click();await page.keyboard.press('Control+k');await page.waitForTimeout(400);
   assert.equal(await open(),true,'Ctrl+K during fade, iteration '+i);
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.spotlight-results')).opacity),'1');
  }
  await input.focus();const seen=new Set();
  for(let i=0;i<8;i++){await page.keyboard.press('Tab');seen.add(await page.evaluate(()=>{const a=document.activeElement;return document.querySelector('.spotlight').contains(a)?(a.getAttribute('aria-label')||a.getAttribute('role')||a.tagName):'OUTSIDE';}));}
  assert.ok(!seen.has('OUTSIDE'),'focus left dialog');assert.ok(seen.has('Close search')&&seen.has('tab'),[...seen].join());
  await input.focus();await page.keyboard.press('Control+Tab');assert.equal(await page.getByRole('tab',{name:/Threads/}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:/Threads/}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:/Commands/}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:/Commands/}).focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.getByRole('tab',{name:/Threads/}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:/All/}).click();
  await input.fill('zzqxq');await page.waitForTimeout(500);
  assert.equal(await input.getAttribute('aria-expanded'),'false');assert.match(await page.locator('.spotlight [aria-live]').textContent(),/0 results/);
  await input.fill('theme');await page.waitForTimeout(500);
  assert.equal(await input.getAttribute('aria-expanded'),'true');assert.match(await page.locator('.spotlight [aria-live]').textContent(),/[1-9]\d* results/);
 }finally{await app.close();}
});
