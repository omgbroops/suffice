import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';

test('choosing an enabled Grok model clears a stale unavailable-model send guard',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-model-guard-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>[{provider:'xai',id:'grok-fixture',name:'Grok fixture',available:true,efforts:[]}]);ipcMain.removeHandler('suffice:run');ipcMain.handle('suffice:run',(_event,payload)=>{globalThis.grokRequest=payload;return {text:'Grok fixture reply'};});});
  const page=await app.firstWindow();await page.evaluate(()=>localStorage.setItem('suffice-model',JSON.stringify({provider:'openai',model:'missing-model',effort:'high'})));await page.reload();
  await page.waitForFunction(()=>document.querySelector('.composer')?.modelsDisabled===true);
  await page.getByRole('button',{name:'Choose model and effort',exact:true}).click();await page.getByRole('button',{name:'Grok fixture',exact:true}).click();
  assert.equal(await page.locator('.composer').evaluate(el=>el.modelsDisabled),false);
  await page.locator('#prompt').fill('Use the selected Grok model');await page.locator('#prompt').press('Enter');
  await page.locator('.thread-assistant').filter({hasText:'Grok fixture reply'}).waitFor();const sent=await app.evaluate(()=>globalThis.grokRequest);assert.equal(sent.provider,'xai');assert.equal(sent.model,'grok-fixture');
 }finally{await app.close();}
});
