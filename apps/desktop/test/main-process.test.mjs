import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

test('quit disposes sessions without a ReferenceError and stale catalog ids return null', {timeout:60000},async()=>{
  const home=await mkdtemp(resolve(tmpdir(),'suffice-mp-'));
  const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-r2-main-process-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'hist')};delete env.ELECTRON_RUN_AS_NODE;
  const electron=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
  let err='';electron.process().stderr.on('data',d=>{err+=d;});
  try{
    const page=await electron.firstWindow();
    await page.locator('.composer').waitFor();
    const cat=await page.evaluate(()=>window.sufficeDesktop.sessions.catalog('missing-session'));
    assert.equal(cat,null);
  }finally{
    await electron.evaluate(({app})=>app.quit()).catch(()=>{});
    await new Promise(r=>electron.process().once('exit',r)).catch(()=>{});
    await rm(home,{recursive:true,force:true});
  }
  assert.doesNotMatch(err,/ReferenceError/);
});
