import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
test('custom accent picker opens at the current default accent',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-accent-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fixc-accent-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  const before=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--blue').trim());
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();
  await page.locator('[data-custom-accent]').click();
  const hex=await page.locator('.accent-picker .accent-hex input').inputValue();
  assert.equal(hex.replace('#','').toLowerCase(),before.replace('#','').toLowerCase());
 }finally{await app.close();}
});
