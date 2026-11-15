import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';

test('UI SDK navigation preserves menus, editable searches and tab state',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-ui-behaviors-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-ui-project-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
 const now=new Date().toISOString();await writeFile(resolve(dir,'one.jsonl'),[{type:'session',version:3,id:'ui-fixture',timestamp:now,cwd},{type:'message',id:'user',parentId:null,timestamp:now,message:{role:'user',content:[{type:'text',text:'Keyboard navigation fixture'}],timestamp:Date.now()}}].map(value=>JSON.stringify(value)).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain})=>{
   ipcMain.removeHandler('suffice:projects');ipcMain.handle('suffice:projects',()=>[{id:'alpha',name:'Alpha',path:'C:/Alpha'},{id:'beta',name:'Beta',path:'C:/Beta'}]);
   ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>[{id:'alpha',name:'Alpha model',provider:'openai',efforts:['low','medium','high']},{id:'beta',name:'Beta model',provider:'openai',efforts:[]}]);
  });await page.reload();await page.locator('.thread-row').waitFor();
  const active=()=>page.evaluate(()=>document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.trim());
  const settings=page.getByRole('button',{name:'Settings',exact:true});await settings.focus();await settings.press('Enter');await page.getByRole('heading',{name:'General',exact:true}).waitFor();await page.keyboard.press('ArrowDown');assert.equal(await active(),'Appearance');await page.keyboard.press('Enter');await page.getByRole('button',{name:'Background',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await active(),'Pixel horizon');await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.locator('.settings-main').waitFor({state:'hidden'});assert.equal(await active(),'Settings');
  await page.getByRole('button',{name:'Choose project',exact:true}).click();const search=page.getByRole('textbox',{name:'Search projects'});await search.fill('alp');await search.press('Home');assert.equal(await search.evaluate(el=>el.selectionStart),0);assert.equal(await search.inputValue(),'alp');await search.press('ArrowDown');assert.equal(await active(),'Alpha');await page.keyboard.press('End');assert.equal(await active(),'New project');await page.keyboard.press('Escape');
  const model=page.getByRole('button',{name:'Choose model and effort',exact:true});await model.click();const slider=page.getByRole('slider',{name:'Reasoning effort'});await slider.focus();await slider.press('End');assert.equal(await slider.inputValue(),'2');await page.locator('.model-stage-button').click();await page.getByRole('textbox',{name:'Search models'}).press('ArrowDown');assert.equal(await active(),'Alpha model');await page.keyboard.press('b');assert.equal(await active(),'Beta model');await page.keyboard.press('Escape');
  await page.locator('.thread-row').click();await page.getByRole('button',{name:'Toggle right panel',exact:true}).click();await page.locator('.panel-launcher').getByRole('button',{name:'Files',exact:true}).click();await page.getByRole('button',{name:'Add panel tab',exact:true}).click();await page.getByRole('menuitem',{name:'Changes',exact:true}).focus();await page.keyboard.press('Enter');
  const files=page.getByRole('tab',{name:'Files',exact:true}),changes=page.getByRole('tab',{name:'Changes',exact:true});await files.focus();await files.press('ArrowRight');assert.equal(await changes.getAttribute('aria-selected'),'true');assert.equal(await page.locator('.right-panel-tabs [role=tab][tabindex="0"]').count(),1);await changes.press('Home');assert.equal(await files.getAttribute('aria-selected'),'true');await page.locator('html').evaluate(el=>el.dir='rtl');await files.press('ArrowLeft');assert.equal(await changes.getAttribute('aria-selected'),'true');await page.locator('html').evaluate(el=>el.dir='ltr');await changes.press('Delete');assert.equal(await changes.count(),0);assert.equal(await files.getAttribute('aria-selected'),'true');
  await page.screenshot({path:resolve('apps/desktop/desktop-ui-behaviors-dark.png')});await page.locator('html').evaluate(el=>el.dataset.theme='light');await page.screenshot({path:resolve('apps/desktop/desktop-ui-behaviors-light.png')});assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
