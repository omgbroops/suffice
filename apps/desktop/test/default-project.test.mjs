import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard,killTmux} from './electron-guard.mjs';

// No project chosen: a run creates the default directory (~/Suffice) on demand instead of asking for a project.
test('a run with no project creates the default directory on demand', {timeout:60000},async()=>{
  const home=await mkdtemp(resolve(tmpdir(),'suffice-defproj-')),dir=resolve(home,'Suffice'),socket='sfx-fix1-screen-defproj-'+process.pid;
  const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_DEFAULT_PROJECT:dir,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:resolve(home,'hist')};delete env.ELECTRON_RUN_AS_NODE;delete env.SUFFICE_START_PROJECT;
  const electron=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
  try{
    const page=await electron.firstWindow();await page.locator('.composer').waitFor();
    await assert.rejects(stat(dir),/ENOENT/);
    // An invalid effort is rejected after the project step, so no model or provider is needed.
    const message=await page.evaluate(()=>window.sufficeDesktop.run({prompt:'hello',effort:'bogus'}).then(()=>'',e=>String(e.message)));
    assert.match(message,/Invalid task/);assert.doesNotMatch(message,/Choose a project/);
    assert.ok((await stat(dir)).isDirectory());
  }finally{
    await electron.evaluate(({app})=>app.quit()).catch(()=>{});
    await new Promise(r=>electron.process().once('exit',r)).catch(()=>{});
    killTmux(socket);await rm(home,{recursive:true,force:true});
  }
});
