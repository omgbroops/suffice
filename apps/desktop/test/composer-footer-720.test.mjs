import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
// At 720x540 every composer footer control must sit inside the composer box with no horizontal overflow.
test('composer footer stays inside the composer at 720x540',{timeout:90000},async()=>{
 const root=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-footer-')));
 const home=resolve(root,'suffice-home'),fakeHome=resolve(root,'home'),project=resolve(root,'project');
 for(const dir of [home,fakeHome,project])await mkdir(dir);
 const env={PATH:process.env.PATH,HOME:fakeHome,TMPDIR:process.env.TMPDIR,LANG:process.env.LANG,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_SESSIONS_SOCKET:'sfx-conv-footer720-'+process.pid,SUFFICE_HISTORY_HOME:resolve(root,'history')};
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop/test/voice-hidden-main.cjs'),'--user-data-dir='+resolve(root,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setMinimumSize(100,100);w.setContentSize(720,540);});
  await page.setViewportSize({width:720,height:540}).catch(()=>{});
  await page.waitForFunction(()=>innerWidth<=720);await page.waitForTimeout(500);
  const r=await page.evaluate(()=>{const c=document.querySelector('.composer').getBoundingClientRect(),t=document.querySelector('.composer-toolbar');
   const out=[...t.querySelectorAll('button,.tools-chip,.access-mode-picker')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return {n:e.className+'|'+(e.getAttribute('aria-label')||''),l:b.left,r:b.right}}).filter(b=>b.l<c.left-0.5||b.r>c.right+0.5);
   return {c:[c.left,c.right],tb:(b=>[b.left,b.right])(t.getBoundingClientRect()),kids:[...t.children].map(k=>[k.className,k.getBoundingClientRect().left,k.getBoundingClientRect().right]),w:innerWidth,scroll:t.scrollWidth,client:t.clientWidth,out};});
  assert.ok(r.w<=720,'viewport '+r.w);
  assert.ok(r.scroll<=r.client,'toolbar overflows '+JSON.stringify(r));
  assert.deepEqual(r.out,[],'controls outside composer '+JSON.stringify(r));
 }finally{await app.close().catch(()=>{});}
});
