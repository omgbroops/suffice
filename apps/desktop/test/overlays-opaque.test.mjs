import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

test('every open menu, popover and dialog has an opaque background',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-overlay-opaque-'));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fix2-overlays-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>[{provider:'anthropic',id:'opus',name:'Claude Opus 5',available:true,efforts:['low','high']},{provider:'deepseek',id:'ds',name:'DeepSeek A',available:true,efforts:[]}]);});
  const page=await app.firstWindow();await page.reload();await page.locator('.composer').waitFor();
  // alpha of the computed background colour; a gradient/image layer would also fail, since it can hide alpha
  const alpha=sel=>page.evaluate(s=>{const el=document.querySelector(s);if(!el)return null;const cs=getComputedStyle(el);const m=cs.backgroundColor.match(/[\d.]+/g).map(Number);return {alpha:m.length>3?m[3]:1,image:cs.backgroundImage,blur:cs.backdropFilter};},sel);
  const check=async(name,sel)=>{const a=await alpha(sel);assert.ok(a,name+' is open');assert.equal(a.alpha,1,name+' background alpha');assert.equal(a.image,'none',name+' has no translucent image layer');assert.ok(a.blur==='none'||a.blur==='',name+' has no backdrop blur');};
  const seen=[];
  await page.waitForFunction(()=>!document.querySelector('.model-button').disabled&&document.querySelector('#model-label')?.textContent==='Claude Opus 5');
  await page.getByRole('button',{name:'Choose model and effort',exact:true}).click();await page.locator('.popover.model-picker[data-open="true"]').waitFor();await page.waitForTimeout(400);await check('model picker','.popover.model-picker[data-open="true"]');seen.push('model');
  await page.locator('.model-stage-button').click();await page.waitForTimeout(300);await check('model list','.popover.model-picker[data-open="true"]');await page.keyboard.press('Escape');await page.waitForTimeout(300);
  for(const sel of ['.access-mode-picker','.project-picker']){
   await page.locator(sel).click();await page.waitForTimeout(500);
   const open=await page.evaluate(()=>[...document.querySelectorAll('.popover:not([hidden])')].length);assert.ok(open>0,sel+' opens a popover');
   const alphas=await page.evaluate(()=>[...document.querySelectorAll('.popover:not([hidden])')].map(el=>{const cs=getComputedStyle(el),m=cs.backgroundColor.match(/[\d.]+/g).map(Number);return {alpha:m.length>3?m[3]:1,image:cs.backgroundImage,blur:cs.backdropFilter};}));
   for(const a of alphas){assert.equal(a.alpha,1,sel+' popover alpha');assert.equal(a.image,'none');assert.ok(a.blur==='none'||a.blur==='');}
   seen.push(sel);await page.keyboard.press('Escape');await page.waitForTimeout(300);
  }
  await page.keyboard.press('Control+k');await page.locator('.spotlight[open]').waitFor();await page.waitForTimeout(300);await check('spotlight','dialog.spotlight[open]');seen.push('spotlight');
  assert.equal(seen.length,4);
 }finally{await Promise.race([app.close(),new Promise(r=>setTimeout(r,5000))]).catch(()=>{});}
});
