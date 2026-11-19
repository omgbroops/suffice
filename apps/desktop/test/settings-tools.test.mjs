import electronPath from 'electron';
// Hidden tests for the settings-tools track: one tick in access modes, plugin list on/off, task board radii + inline discard bubble. SHOT_DIR saves 1440x900 dark+light shots.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {guard,openMore} from './electron-guard.mjs';
const SHOTS=process.env.SHOT_DIR,SOCKET='sfx-lb-settings-tools-'+process.pid;
let app,page,tmp;
const snap=async name=>{if(!SHOTS)return;await mkdir(SHOTS,{recursive:true});for(const t of ['dark','light']){await page.evaluate(v=>{document.documentElement.dataset.theme=v;},t);const b64=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1440,900);await new Promise(r=>setTimeout(r,250));return (await w.webContents.capturePage()).toPNG().toString('base64');});await writeFile(resolve(SHOTS,`${name}-${t}.png`),Buffer.from(b64,'base64'));}await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});};
before(async()=>{
 tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-settings-tools-')));const project=resolve(tmp,'demo');for(const d of [project,resolve(tmp,'data'),resolve(tmp,'suffice')])await mkdir(d,{recursive:true});
 const env={...process.env,SUFFICE_HOME:resolve(tmp,'suffice'),SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',PI_OFFLINE:'1',SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:resolve(tmp,'home')};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),`--user-data-dir=${resolve(tmp,'data')}`],env});
 page=await app.firstWindow();page.setDefaultTimeout(15000);await page.locator('.composer').waitFor();await page.emulateMedia({reducedMotion:'reduce'});
});
after(async()=>{try{await app?.close();}catch{}});

test('15: access modes show exactly one tick',async()=>{
 await page.locator('.access-mode-picker').click();const menu=page.locator('.access-mode-menu:not([hidden])');await menu.waitFor();
 const rows=await menu.locator('[role=menuitemradio]').evaluateAll(r=>r.map(x=>({c:x.getAttribute('aria-checked'),t:[...x.children].filter(i=>i.classList.contains('menu-check')&&getComputedStyle(i).visibility!=='hidden').length})));
 assert.equal(rows.length,3);assert.equal(rows.filter(r=>r.t>0).length,1,JSON.stringify(rows));assert.equal(rows.find(r=>r.t>0).c,'true');
 await snap('15-access');await page.keyboard.press('Escape');
});

test('16: plugin list switches on and off, one control per row',async()=>{
 await app.evaluate(({ipcMain})=>{globalThis.ext=[{path:'/p/git-helper',enabled:true,source:'user'},{path:'/p/lint-bot',enabled:false,source:'user'}];
  ipcMain.removeHandler('suffice:resources');ipcMain.handle('suffice:resources',()=>({extensions:globalThis.ext,packages:[],skills:[],templates:[],mcp:{},diagnostics:[]}));
  const prev=ipcMain._invokeHandlers?.get?.('suffice:resource-action');ipcMain.removeHandler('suffice:resource-action');
  ipcMain.handle('suffice:resource-action',(_e,p)=>{if(p.action==='extension-toggle'){globalThis.ext=globalThis.ext.map(x=>x.path===p.path?{...x,enabled:p.enabled}:x);return {extensions:globalThis.ext,packages:[],skills:[],templates:[],mcp:{},diagnostics:[]};}if(p.action==='mcp-state')return {level:'global',toolkits:[],servers:[],tokens:0,activeCount:0};return {};});});
 await page.getByRole('button',{name:'Plugins',exact:true}).click();await page.locator('#settings-title-extensions').waitFor();
 const lint=page.locator('.settings-option').filter({hasText:'lint-bot'});await lint.waitFor();
 assert.equal(await lint.locator('[role=switch]').count(),1);assert.equal(await lint.locator('[role=switch]').getAttribute('aria-checked'),'false');
 await snap('16-plugins');
 await lint.getByRole('switch',{name:'lint-bot'}).click();
 await page.locator('.settings-option').filter({hasText:'lint-bot'}).filter({hasText:'On ·'}).waitFor();
 await page.keyboard.press('Escape');await page.locator('.settings-main').waitFor({state:'hidden'});
});

test('13: task board radii sit on the scale; discard bubble is inline and covers nothing',async()=>{
 await openMore(page);await page.getByRole('button',{name:'Tasks',exact:true}).click();const board=page.getByRole('region',{name:'Tasks'});await board.waitFor();
 const radii=await page.evaluate(()=>{const scale=new Set(['0px','4px','6px','8px','12px','16px','22px']);const out=[];for(const el of document.querySelectorAll('.task-board, .task-board *, .sidebar-tasks, .tb-badge')){const r=getComputedStyle(el).borderRadius;if(r.split(' ').some(v=>!scale.has(v)))out.push(el.className+' '+r);}return out;});
 assert.deepEqual(radii,[],'off-scale radii');
 await page.locator('#tb-text').fill('unsaved');await page.locator('.new-session').click();
 const bubble=page.locator('.tb-discard');await bubble.waitFor();
 const [bb,form,cols]=await Promise.all([bubble.boundingBox(),page.locator('.tb-add').boundingBox(),page.locator('.tb-columns').boundingBox()]);
 assert.ok(bb.y>=form.y&&bb.y+bb.height<=form.y+form.height+1,'bubble inside the add box');assert.ok(bb.y+bb.height<=cols.y+1,'bubble clear of the columns');
 await snap('13-tasks-discard');
 await bubble.getByRole('button',{name:'Keep'}).click();await bubble.waitFor({state:'hidden'});
 await page.locator('#tb-text').fill('');await page.locator('.new-session').click();await board.waitFor({state:'hidden'});
});
