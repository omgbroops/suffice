import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
test('Spotlight closes on Escape after ArrowDown navigation',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-spotesc-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fixc-spotesc-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  const open=()=>page.evaluate(()=>document.querySelector('.spotlight').open);
  const input=page.getByRole('combobox',{name:'Search threads and commands'});
  const cases={
   'ctrl+k, ArrowDown':async()=>{await page.keyboard.press('Control+k');await page.locator('.spotlight[open]').waitFor();await input.press('ArrowDown');await input.press('ArrowDown');},
   'button, type, ArrowDown':async()=>{await page.getByRole('button',{name:'Search sessions',exact:true}).click();await page.locator('.spotlight[open]').waitFor();await input.fill('t');await input.press('ArrowDown');},
  };
  for(const [name,go] of Object.entries(cases)){await go();await page.keyboard.press('Escape');await page.waitForTimeout(400);assert.equal(await open(),false,'Esc after '+name);}
 }finally{await app.close();}
});
