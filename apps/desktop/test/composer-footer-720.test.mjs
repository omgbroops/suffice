import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
// At 720x540 every control in the composer box and in the row below it must sit inside the composer width with no horizontal overflow.
test('composer controls stay inside the composer width at 720x540',{timeout:90000},async()=>{
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
  const r=await page.evaluate(()=>{const c=document.querySelector('.composer').getBoundingClientRect(),rows=[document.querySelector('.composer-row'),document.querySelector('.composer-meta')];
   const out=rows.flatMap(t=>[...t.querySelectorAll('button')]).filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return {n:e.className+'|'+(e.getAttribute('aria-label')||''),l:b.left,r:b.right}}).filter(b=>b.l<c.left-0.5||b.r>c.right+0.5);
   return {c:[c.left,c.right],w:innerWidth,over:rows.filter(t=>t.scrollWidth>t.clientWidth).map(t=>t.className),out};});
  assert.ok(r.w<=720,'viewport '+r.w);
  assert.deepEqual(r.over,[],'composer rows overflow '+JSON.stringify(r));
  assert.deepEqual(r.out,[],'controls outside composer '+JSON.stringify(r));
 }finally{await app.close().catch(()=>{});}
});
