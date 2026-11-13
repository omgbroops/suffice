import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
test('thread selection paints immediately, warm transcripts are reused, and project menus never wait for metadata',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-navigation-')),env={...process.env,SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{const page=await app.firstWindow();await page.locator('.composer').waitFor();await page.emulateMedia({reducedMotion:'reduce'});
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:projects');ipcMain.handle('suffice:projects',()=>new Promise(resolve=>{globalThis.finishProjects=resolve;}));ipcMain.removeHandler('suffice:threads');ipcMain.handle('suffice:threads',()=>['one','two'].map(id=>({id,title:'Thread '+id,project:'Project',cwd:process.cwd(),modified:id==='one'?2:1})));ipcMain.removeHandler('suffice:thread');ipcMain.handle('suffice:thread',(_event,id)=>new Promise(resolve=>{globalThis.finishThread=()=>resolve({id,title:'Thread '+id,cwd:process.cwd(),messages:[{role:'assistant',content:[{type:'text',text:'Response for '+id}]}]});}));});await page.reload();await page.locator('[data-thread="one"]').waitFor();
 await page.getByRole('button',{name:'Choose project',exact:true}).click();await page.getByRole('dialog',{name:'Projects',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'New project',exact:true}).isVisible(),true);await page.getByRole('textbox',{name:'Search projects'}).press('Escape');
 await page.locator('[data-thread="one"]').click();assert.equal(await page.locator('.thread-header').innerText(),'Thread one');assert.equal(await page.locator('#prompt').getAttribute('readonly'),null);assert.equal(await page.locator('.thread-transcript').getAttribute('aria-busy'),'true');await page.locator('#prompt').fill('Keep this draft while loading');await app.evaluate(()=>globalThis.finishThread());await page.locator('.thread-assistant').filter({hasText:'Response for one'}).waitFor();assert.equal(await page.locator('#prompt').inputValue(),'Keep this draft while loading');
 await page.locator('[data-thread="two"]').click();assert.equal(await page.locator('.thread-header').innerText(),'Thread two');await app.evaluate(()=>globalThis.finishThread());await page.locator('.thread-assistant').filter({hasText:'Response for two'}).waitFor();
 await page.locator('[data-thread="one"]').click();assert.equal(await page.locator('.thread-assistant').innerText(),'Response for one');assert.equal(await page.locator('.thread-transcript').getAttribute('aria-busy'),'false');assert.equal(await page.locator('#prompt').inputValue(),'Keep this draft while loading');await app.evaluate(()=>globalThis.finishThread());
 await page.getByRole('button',{name:'New session',exact:true}).click();assert.equal(await page.locator('.thread-header').isVisible(),false);await app.evaluate(()=>globalThis.finishProjects([]));
 }finally{await app.close();}
});
