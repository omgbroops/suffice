import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

test('model picker keeps focus, groups providers once, labels single-effort models and keeps agents out of model options',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-model-picker-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  await app.evaluate(({ipcMain})=>{
   const models=[{provider:'openai',id:'m-a',name:'Alpha',efforts:['low','high']},{provider:'anthropic',id:'m-b',name:'Beta',efforts:['low','high']},{provider:'openai',id:'m-c',name:'Gamma',efforts:['high']}];
   ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>models);
   ipcMain.removeHandler('suffice:sessions-available');ipcMain.handle('suffice:sessions-available',()=>({ok:true,agents:[{id:'claude',label:'Claude Code',missing:false}]}));
  });
  const page=await app.firstWindow();await page.reload();
  const button=page.getByRole('button',{name:'Choose model and effort',exact:true});await page.waitForFunction(()=>!document.querySelector('.model-button').disabled&&document.querySelector('#model-label')?.textContent==='Alpha');
  await button.click();
  await page.locator('.model-stage-button').click();
  const titles=await page.locator('.model-provider-title').allInnerTexts();assert.deepEqual(titles,['openai','anthropic','Agent CLIs']);
  assert.equal(await page.locator('.model-option').count(),3);assert.equal(await page.locator('.agent-option').count(),1);
  await page.locator('.model-search').fill('claude');assert.equal(await page.locator('.agent-option').count(),1);assert.equal(await page.locator('.model-empty').count(),0,'no empty message while an agent row matches');await page.locator('.model-search').fill('');
  await page.locator('.model-option',{hasText:'Beta'}).click();
  assert.equal(await page.evaluate(()=>document.activeElement?.type),'range','focus returns to the slider after choosing a model');
  await page.locator('.model-stage-button').click();
  await page.locator('.model-option',{hasText:'Gamma'}).click();
  assert.equal(await page.locator('.effort-track').count(),0);assert.equal(await page.locator('input[type=range]').count(),0);assert.equal((await page.locator('.model-effort').first().innerText()).trim(),'High');
  assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),'BODY','focus stays in the picker');
  assert.equal(await page.locator('.model-effort').innerText(),'High');
 }finally{await app.close();}
});
