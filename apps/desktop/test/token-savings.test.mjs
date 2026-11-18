import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

// Drives Settings > Context & memory > Token savings like a user, checks persistence across reload, and optionally writes SHOTS=<dir> screenshots (1440x900, dark + light).
test('token savings toggles are reachable in Settings, persist, and the limit select works',{timeout:90000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-tok-')));
 const [project,data,suffice,home]=['project','data','suffice','home'].map(d=>resolve(tmp,d));for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-feat-mcp-token-'+process.pid,SUFFICE_HISTORY_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+data],env});
 const errors=[];app.process().stderr.on('data',d=>{if(String(d).includes('[no-dialog]'))errors.push(String(d));});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  const open=async()=>{await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Context & memory',exact:true}).click();};
  const shot=async name=>{if(!process.env.SHOTS)return;await mkdir(process.env.SHOTS,{recursive:true});await page.waitForTimeout(400);const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(process.env.SHOTS,name+'.png'),Buffer.from(b,'base64'));};
  const mode=async m=>{await page.getByRole('button',{name:'Appearance',exact:true}).click();await page.getByRole('group',{name:'Mode',exact:true}).getByRole('button',{name:m,exact:true}).click();await page.getByRole('button',{name:'Context & memory',exact:true}).click();};
  await open();
  const defer=page.getByRole('switch',{name:'Load MCP tool details on demand',exact:true}),compact=page.getByRole('switch',{name:'Shorten large tool results',exact:true});
  assert.equal(await defer.getAttribute('aria-checked'),'true');assert.equal(await compact.getAttribute('aria-checked'),'true');
  assert.ok(await page.getByText('Token savings',{exact:true}).isVisible());
  await mode('Dark');await shot('on-dark');await mode('Light');await shot('on-light');
  await defer.click();await compact.click();
  await page.waitForFunction(async()=>{const s=await window.suffice?.settings?.get?.();return !s||s['defer-mcp-schemas']===false;}).catch(()=>{});
  assert.equal(await defer.getAttribute('aria-checked'),'false');assert.equal(await compact.getAttribute('aria-checked'),'false');
  await shot('off-light');await mode('Dark');await shot('off-dark');
  await page.reload();await open();
  assert.equal(await defer.getAttribute('aria-checked'),'false');assert.equal(await compact.getAttribute('aria-checked'),'false');
  await compact.click();await page.waitForFunction(()=>[...document.querySelectorAll('[role=switch]')].find(e=>e.getAttribute('aria-label')==='Shorten large tool results'||e.textContent.includes('Shorten large'))?.getAttribute('aria-checked')==='true').catch(()=>{});assert.equal(await compact.getAttribute('aria-checked'),'true');
  const limit=page.getByRole('button',{name:/Shorten results over/});await limit.click();await shot('limit-open-dark');
  await page.getByText('4,000 tokens',{exact:true}).click();
  const saved=JSON.parse(await readFile(resolve(suffice,'desktop-settings.json'),'utf8'));
  assert.equal(saved['defer-mcp-schemas'],false);assert.equal(saved['compact-tool-results'],true);assert.equal(saved['compact-limit'],'4,000 tokens');
  assert.deepEqual(errors,[]);
 }finally{await app.close().catch(()=>{});}
});
