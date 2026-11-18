import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {createResourceService} from '../electron/resources.mjs';
import {guard} from './electron-guard.mjs';

test('desktop manages resources through real native IPC and shared settings surfaces',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-resource-ui-')),service=createResourceService(home);
 await service.action({action:'write',kind:'skills',name:'fixture',text:'---\nname: fixture\ndescription: Desktop fixture skill\n---\nFixture'});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('.composer').waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Session tools',exact:true}).count(),0);assert.equal(await page.evaluate(()=>typeof window.sufficeDesktop.agentAction),'undefined');
  await page.getByRole('button',{name:'Skills',exact:true}).click();
  await page.getByRole('switch',{name:'fixture',exact:true}).click();
  await page.getByRole('switch',{name:'fixture',exact:true}).getAttribute('aria-checked').then(async()=>{await page.waitForFunction(()=>document.querySelector('[aria-label="fixture"]')?.getAttribute('aria-checked')==='false');});
  assert.equal((await service.list()).skills[0].enabled,false);
  await page.getByRole('button',{name:'Prompt templates',exact:true}).click();
  await page.getByRole('button',{name:'Add',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'New prompt template'});await dialog.getByLabel('Name',{exact:true}).fill('review');await dialog.getByLabel('Instructions').fill('Review $1 carefully.');
  assert.equal(await page.locator('.resource-note').count(),0);
  await page.locator('html').evaluate(el=>el.dataset.theme='light');
  const fieldStyles=()=>dialog.locator('input,textarea').evaluateAll(nodes=>nodes.map(el=>{const s=getComputedStyle(el);return {fill:s.backgroundColor,border:s.borderTopColor,width:s.borderTopWidth,style:s.borderTopStyle};}));
  const light=await fieldStyles();assert.equal(light[0].fill,'rgb(255, 255, 255)');assert.deepEqual(light[0],light[1]);assert.equal(light[0].width,'1px');assert.equal(light[0].style,'solid');assert.notEqual(light[0].border,'rgba(0, 0, 0, 0)');
  await page.screenshot({path:resolve(home,'template-fields-light.png')});
  await page.locator('html').evaluate(el=>el.dataset.theme='dark');const dark=await fieldStyles();assert.deepEqual(dark[0],dark[1]);await page.screenshot({path:resolve(home,'template-fields-dark.png')});
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'detached'});
  assert.equal(await readFile(resolve(home,'prompts/review.md'),'utf8'),'Review $1 carefully.');
  await page.getByRole('button',{name:'Tools & MCP',exact:true}).click();await page.getByRole('button',{name:'Add server',exact:true}).click();
  const mcp=page.getByRole('dialog',{name:'Add MCP server'});await mcp.getByLabel('Name',{exact:true}).fill('docs');await mcp.getByLabel('Executable or HTTPS URL').fill('https://example.com/mcp');await mcp.getByRole('button',{name:'Save',exact:true}).click();await mcp.waitFor({state:'detached'});await page.getByRole('switch',{name:'docs',exact:true}).waitFor();assert.equal((await service.list()).mcp.docs.url,'https://example.com/mcp');
  await page.screenshot({path:resolve(home,'resources-dark.png')});await page.locator('html').evaluate(el=>el.dataset.theme='light');await page.screenshot({path:resolve(home,'resources-light.png')});
  await page.getByRole('button',{name:'Extensions',exact:true}).click();await page.getByRole('button',{name:'Install package',exact:true}).waitFor();await app.evaluate(({BrowserWindow,ipcMain})=>{ipcMain.removeHandler('suffice:extension-answer');ipcMain.handle('suffice:extension-answer',(_e,p)=>globalThis.fixtureExtensionAnswer=p);BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'extension_ui',kind:'input',title:'Extension fixture',requestId:42,threadId:'fixture-thread',placeholder:'Name'});});
  const extension=page.getByRole('dialog',{name:'Extension fixture'});await extension.getByRole('textbox').fill('desktop value');await extension.getByRole('button',{name:'Continue'}).click();await page.waitForTimeout(60);assert.equal(await app.evaluate(()=>globalThis.fixtureExtensionAnswer.value),'desktop value');
  const search=page.getByRole('searchbox',{name:'Search settings',exact:true});await search.fill('mcp');await page.getByRole('button',{name:'Add server',exact:true}).waitFor();await search.fill('');
  assert.deepEqual(errors,[]);console.log('Resource screenshots: '+home);
 }finally{await app.close();}
});
