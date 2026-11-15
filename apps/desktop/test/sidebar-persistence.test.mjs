import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
test('global sidebar state survives app restart and temporary settings expansion',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-sidebar-state-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;delete env.SUFFICE_WINDOW_CHROME;
 const launch=()=>_electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});let app=await launch();
 try{let page=await app.firstWindow();await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await page.waitForFunction(async()=> (await window.sufficeDesktop.preferences())['sidebar-collapsed']===true);await app.close();app=await launch();page=await app.firstWindow();await page.getByRole('button',{name:'Open sidebar',exact:true}).waitFor();assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('sidebar-collapsed')),true);
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('suffice-open-settings',{detail:{section:'general'}})));await page.getByRole('heading',{name:'General',exact:true}).waitFor();await page.getByRole('button',{name:'Back to chats',exact:true}).click();await page.getByRole('button',{name:'Open sidebar',exact:true}).waitFor();await page.getByRole('button',{name:'Open sidebar',exact:true}).click();await page.waitForFunction(async()=> (await window.sufficeDesktop.preferences())['sidebar-collapsed']===false);await app.close();app=await launch();page=await app.firstWindow();await page.getByRole('button',{name:'Collapse sidebar',exact:true}).waitFor();assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('sidebar-collapsed')),false);
 }finally{await app.close();}
});
