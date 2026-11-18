import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

const launch=async(key,home)=>{const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-forge-'+key+'-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;return _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});};

test('model picker closes after the final choice and resets its search',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-overlay-model-'));const app=await launch('r2-overlays-model',home);
 try{
  await app.evaluate(({ipcMain})=>{const models=[{provider:'anthropic',id:'opus',name:'Claude Opus 5',efforts:['low','high']},{provider:'anthropic',id:'haiku',name:'Claude Haiku 5',efforts:[]},{provider:'deepseek',id:'ds-a',name:'DeepSeek A',efforts:[]},{provider:'deepseek',id:'ds-b',name:'DeepSeek B',efforts:[]}];ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>models);});
  const page=await app.firstWindow();await page.reload();
  const trigger=page.getByRole('button',{name:'Choose model and effort',exact:true}),picker=page.locator('.model-picker');
  await page.waitForFunction(()=>!document.querySelector('.model-button').disabled&&document.querySelector('#model-label')?.textContent==='Claude Opus 5');
  // effort stage: choosing an effort closes
  await trigger.click();await picker.waitFor();await page.locator('.effort-track input').press('ArrowRight');
  await picker.waitFor({state:'hidden'});
  // model without effort levels closes and returns focus to the trigger
  await trigger.click();await picker.waitFor();await page.locator('.model-stage-button').click();
  await page.locator('.model-option',{hasText:'Claude Haiku 5'}).click();
  await picker.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('model-button')),true,'focus returns to the trigger');
  // search resets on Escape
  await trigger.click();await picker.waitFor();await page.locator('.model-search').fill('deepseek');
  assert.equal(await page.locator('.model-option').count(),2);
  await page.keyboard.press('Escape');await picker.waitFor({state:'hidden'});
  await trigger.click();await picker.waitFor();
  assert.equal(await page.locator('.model-search').inputValue(),'');assert.ok(await page.locator('.model-option').count()>1);
 }finally{await app.close();}
});

test('spotlight hides the Open hint without results; right-panel toggle is absent without a thread',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-overlay-misc-'));
 const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});const timestamp=new Date().toISOString();
 await writeFile(resolve(dir,'one.jsonl'),[{type:'session',version:3,id:'one',timestamp,cwd:home},{type:'message',id:'u',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Thread one'}],timestamp:Date.now()}},{type:'message',id:'a',parentId:'u',timestamp,message:{role:'assistant',content:[{type:'text',text:'Reply'}],timestamp:Date.now(),stopReason:'stop'}}].map(e=>JSON.stringify(e)).join('\n')+'\n');
 const app=await launch('r2-overlays-misc',home);
 try{
  const page=await app.firstWindow();await page.locator('.thread-row').filter({hasText:'Thread one'}).waitFor();
  const toggle=page.getByRole('button',{name:'Toggle right panel'});
  assert.equal(await toggle.count(),0,'no thread: toggle is out of the accessibility tree');
  const hint=page.locator('.spotlight-footer').getByText('Open');
  await page.keyboard.press('Control+k');await page.locator('.spotlight[open]').waitFor();
  assert.equal(await hint.isVisible(),true);
  const input=page.getByRole('combobox',{name:'Search threads and commands'});
  await input.fill('zzqqxxnomatch');assert.equal(await page.locator('.spotlight [role=option]').count(),0);assert.equal(await hint.isVisible(),false);
  await input.fill('');assert.equal(await hint.isVisible(),true);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.spotlight').open);
  await page.locator('.thread-row').filter({hasText:'Thread one'}).click();
  await toggle.waitFor();await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.equal(await page.evaluate(()=>document.body.classList.contains('right-panel-open')),true);
 }finally{await app.close();}
});
