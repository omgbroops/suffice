import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const fake=resolve(import.meta.dirname,'mcp-fake-server.mjs');

test('MCP add dialog: Escape closes only the dialog, plain validation messages, 0 tools has no token figure',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-mcp-add-')),project=resolve(home,'alpha');await mkdir(project,{recursive:true});await mkdir(resolve(home,'history'),{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_SESSIONS_SOCKET:'sfx-fr-mcp-add',SUFFICE_HISTORY_HOME:resolve(home,'history')};
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Tools & MCP',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Add MCP server'});
  const open=async()=>{await page.getByRole('button',{name:'Add server',exact:true}).click();await dialog.waitFor();};
  await open();await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Add server',exact:true}).waitFor();
  await open();await dialog.getByLabel('Name').fill('Weird Name/x');await dialog.getByLabel('Executable or HTTPS URL').fill(process.execPath);
  await dialog.getByRole('button',{name:'Save'}).click();
  assert.equal(await dialog.getByRole('status').textContent(),'Name can use letters, numbers, - and _ only');
  await dialog.getByLabel('Name').fill('ok');await dialog.getByLabel('Arguments (JSON array)').fill('not json');
  await dialog.getByRole('button',{name:'Save'}).click();
  await page.waitForFunction(()=>document.querySelector('dialog[open] p[role=status]')?.textContent==='Arguments must be a JSON array');
  await dialog.getByLabel('Name').fill('empty');await dialog.getByLabel('Arguments (JSON array)').fill(JSON.stringify([fake,'--empty']));
  await dialog.getByRole('button',{name:'Save'}).click();await dialog.waitFor({state:'detached'});
  const row=page.locator('.settings-option').filter({hasText:'empty'});
  await row.waitFor();if(await row.getByText('Not checked').count())await row.getByRole('button',{name:'Check'}).click();
  await row.filter({hasText:'0 tools'}).waitFor();
  assert.equal(await row.filter({hasText:'tokens'}).count(),0);
 }finally{await app.close();}
});
