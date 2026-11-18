import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const fake=resolve(import.meta.dirname,'mcp-fake-server.mjs');
const shots=process.env.MCP_SHOTS;

test('MCP manager: install, health, scoped switches and the composer chip, driven like a user',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-mcp-ui-')),project=resolve(home,'alpha');await mkdir(project,{recursive:true});await mkdir(resolve(home,'history'),{recursive:true});
 if(shots)await mkdir(shots,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_SESSIONS_SOCKET:'sfx-agent-mcp-manager',SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 const stderr=[];app.process().stderr.on('data',c=>stderr.push(String(c)));
 try{
  const page=await app.firstWindow(),errors=[];await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));page.on('pageerror',e=>errors.push(e.message));await page.locator('.composer').waitFor();
  const scopeFile=async()=>JSON.parse(await readFile(resolve(home,'mcp-scope.json'),'utf8').catch(()=>'{}'));
  const shot=async name=>{if(!shots)return;for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(250);await page.screenshot({path:resolve(shots,`${name}-${theme}.png`)});}};
  const chip=page.getByRole('button',{name:'Tools',exact:true});
  await page.waitForFunction(()=>document.querySelector('.tools-chip')?.dataset.count==='4');
  assert.equal((await chip.textContent()).trim(),'Tools 4/4');
  await shot('01-composer-chip');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'MCPs',exact:true}).click();
  await page.getByRole('button',{name:'Install from snippet'}).click();
  const dialog=page.getByRole('dialog',{name:'Install MCP server'});
  await dialog.getByLabel('JSON snippet or command').fill(JSON.stringify({mcpServers:{docs:{command:process.execPath,args:[fake]}}}));
  await shot('02-install-dialog');
  await dialog.getByRole('button',{name:'Save'}).click();
  await page.locator('.settings-option').filter({hasText:'2 tools'}).filter({hasText:'docs'}).waitFor();
  await dialog.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Install from snippet'}).click();
  await page.getByRole('dialog',{name:'Install MCP server'}).getByLabel('JSON snippet or command').fill('definitely-not-a-command-xyz --flag');
  await page.getByRole('dialog',{name:'Install MCP server'}).getByRole('button',{name:'Save'}).click();
  await page.locator('.settings-option').filter({hasText:'Check failed: Command not found'}).waitFor();
  await shot('03-settings-everywhere');
  // Everywhere: switch Shell off.
  await page.getByRole('switch',{name:'Shell toolkit'}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Shell toolkit"]')?.getAttribute('aria-checked')==='false');
  assert.equal((await scopeFile()).global['toolkit:shell'],false);
  // This project: Files off for alpha only; thread scope stays disabled with no thread open.
  assert.equal(await page.getByRole('button',{name:'This thread'}).isDisabled(),true);
  await page.getByRole('button',{name:'alpha',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-scope=project]')?.getAttribute('aria-pressed')==='true');
  await page.getByRole('switch',{name:'Files toolkit'}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Files toolkit"]')?.getAttribute('aria-checked')==='false');
  const projects=(await scopeFile()).projects;assert.deepEqual(Object.values(projects),[{'toolkit:files':false}]);
  await page.getByRole('button',{name:'Reset'}).first().waitFor();
  await shot('04-settings-project');
  // The composer chip follows: 4 toolkits + docs + failing server, minus Shell and Files.
  await page.keyboard.press('Escape');await page.locator('.settings-main').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('.tools-chip')?.dataset.count==='4');
  await chip.click();
  const menu=page.getByRole('menu',{name:'Tools for this project'});await menu.waitFor();
  assert.deepEqual(await menu.getByRole('menuitemradio').evaluateAll(n=>n.map(x=>[x.getAttribute('aria-label'),x.getAttribute('aria-checked')])),[['Files','false'],['Shell','false'],['Code navigation','true'],['Web','true'],['docs','true'],['definitely-not-a-command-xyz','true']]);
  await shot('05-chip-menu');
  await menu.getByRole('menuitemradio',{name:'Shell'}).click();
  await page.waitForFunction(()=>document.querySelector('.tools-chip')?.dataset.count==='5');
  assert.equal(Object.values((await scopeFile()).projects)[0]['toolkit:shell'],true);
  // This thread: stub the run so a thread exists, then switch Files on for it alone.
  await app.evaluate(({ipcMain,BrowserWindow})=>{for(const a of ['run','thread','threads'])ipcMain.removeHandler('suffice:'+a);ipcMain.handle('suffice:threads',()=>[]);ipcMain.handle('suffice:thread',(_e,id)=>({id,title:id,cwd:process.cwd(),messages:[]}));ipcMain.handle('suffice:run',(_e,p)=>new Promise(()=>{BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'thread_started',id:p.prompt,threadId:p.prompt,clientId:p.clientId});}));});
  await page.reload();await page.locator('#prompt').fill('one');await page.locator('.composer').evaluate(el=>el.requestSubmit());
  await page.locator('.thread-row').filter({hasText:'one'}).waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'MCPs',exact:true}).click();
  await page.getByRole('button',{name:'This thread'}).click();
  await page.getByRole('switch',{name:'Files toolkit'}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Files toolkit"]')?.getAttribute('aria-checked')==='true');
  assert.deepEqual(Object.values((await scopeFile()).threads),[{'toolkit:files':true}]);
  await page.keyboard.press('Escape');await page.locator('.settings-main').waitFor({state:'hidden'});
  await chip.click();
  const tmenu=page.getByRole('menu',{name:'Tools for this thread'});await tmenu.waitFor();
  assert.equal(await tmenu.getByRole('menuitemradio',{name:'Files'}).getAttribute('aria-checked'),'true');
  assert.equal(await tmenu.getByRole('menuitemradio',{name:'Files'}).locator('.tool-on').count(),0);assert.equal(await tmenu.getByRole('menuitemradio',{name:'Files'}).locator('.menu-check:not(.menu-check--empty)').count(),1);
  assert.deepEqual(errors,[]);assert.equal(stderr.join('').includes('[no-dialog]'),false,stderr.join(''));
 }finally{await app.close();}
});
