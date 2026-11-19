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

test('MCP manager: per-project server is added, listed with its tools and token cost, tested and removed',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-mcp-proj-')),project=resolve(home,'alpha');await mkdir(project,{recursive:true});await mkdir(resolve(home,'history'),{recursive:true});
 if(shots)await mkdir(shots,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_SESSIONS_SOCKET:'sfx-fr-mcp-resources-1',SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 const stderr=[];app.process().stderr.on('data',c=>stderr.push(String(c)));
 try{
  const page=await app.firstWindow(),errors=[];await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));page.on('pageerror',e=>errors.push(e.message));await page.locator('.composer').waitFor();
  const file=resolve(project,'.suffice','mcp.json'),read=async f=>JSON.parse(await readFile(f,'utf8').catch(()=>'{}'));
  const shot=async name=>{if(!shots)return;for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(250);await page.screenshot({path:resolve(shots,`${name}-${theme}.png`)});}};
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Tools & MCP',exact:true}).click();
  await page.getByRole('button',{name:'Add to alpha'}).click();
  const dialog=page.getByRole('dialog',{name:'Add MCP server to alpha'});
  await dialog.getByLabel('JSON snippet, command or HTTPS URL').fill(JSON.stringify({mcpServers:{docs:{command:process.execPath,args:[fake]}}}));
  await shot('01-add-to-project');
  await dialog.getByRole('button',{name:'Save'}).click();
  await page.getByRole('button',{name:'alpha',exact:true}).click();
  const row=page.locator('.settings-option').filter({hasText:'Project file'}).filter({hasText:'2 tools'});await row.waitFor();
  assert.deepEqual(Object.keys((await read(file)).mcpServers),['docs']);
  assert.equal((await read(resolve(home,'mcp.json'))).mcpServers,undefined,'global file untouched');
  await row.getByRole('button',{name:'Tools'}).click();
  const list=page.locator('.settings-option').filter({hasText:'docs tools'});await list.waitFor();
  assert.match(await list.innerText(),/~\d/);
  await shot('02-project-server-tools');
  await row.getByRole('button',{name:'Check'}).click();await row.waitFor();
  await row.getByRole('button',{name:'Remove'}).click();
  await row.waitFor({state:'detached'});
  assert.deepEqual((await read(file)).mcpServers,{});
  assert.deepEqual(errors,[]);assert.equal(stderr.join('').includes('[no-dialog]'),false,stderr.join(''));
 }finally{await app.close();}
});
