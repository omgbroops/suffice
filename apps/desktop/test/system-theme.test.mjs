import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
test('System mode follows nativeTheme, including live updates',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-theme-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-forge-r2-theme-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  const osTheme=()=>app.evaluate(({nativeTheme})=>nativeTheme.shouldUseDarkColors?'dark':'light');
  const theme=()=>page.evaluate(()=>document.documentElement.dataset.theme);
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();
  await page.getByRole('button',{name:'Light',exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.getByRole('button',{name:'System',exact:true}).first().click();
  const want=await osTheme();await page.waitForFunction(t=>document.documentElement.dataset.theme===t,want,{timeout:5000});
  assert.equal(await theme(),want);
  // a live OS change (themeSource flips shouldUseDarkColors and fires 'updated') re-applies without reload
  const flip=want==='dark'?'light':'dark';
  await app.evaluate(({nativeTheme},s)=>{nativeTheme.themeSource=s;},flip);
  await page.waitForFunction(t=>document.documentElement.dataset.theme===t,flip,{timeout:5000});
  assert.equal(await osTheme(),flip);
 }finally{await app.close();}
});
