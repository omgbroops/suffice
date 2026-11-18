import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {checkpoint} from '../electron/rewind.mjs';

// Drives the rewind tab like a user: open the panel, pick Rewind, scrub with the keyboard, confirm, undo.
// Set REWIND_SHOTS=<dir> to also write dark/light 1440x900 screenshots of every state.
test('rewind tab: timeline, scrub, confirm, restore and undo in the real panel',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-rewind-ui-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-rewind-project-')),plain=await mkdtemp(resolve(tmpdir(),'suffice-rewind-plain-'));
 const git=(...a)=>promisify(execFile)('git',['-C',cwd,...a],{windowsHide:true});
 await writeFile(resolve(cwd,'app.js'),'export const greeting = "hello";\n');await git('init','-q');await git('add','app.js');await git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
 const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
 for(const [id,where] of [['one',cwd],['two',plain]]){const timestamp=new Date().toISOString();await writeFile(resolve(dir,id+'.jsonl'),[
  {type:'session',version:3,id,timestamp,cwd:where},
  {type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Thread '+id}],timestamp:Date.now()}},
  {type:'message',id:'assistant',parentId:'user',timestamp,message:{role:'assistant',content:[{type:'text',text:'Reply '+id}],timestamp:Date.now(),stopReason:'stop'}},
 ].map(entry=>JSON.stringify(entry)).join('\n')+'\n');}
 const shots=process.env.REWIND_SHOTS;if(shots)await mkdir(shots,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-feat-rewind',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-rewind-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 const stderr=[];app.process().stderr.on('data',d=>stderr.push(String(d)));
 try{
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  const shot=async name=>{if(!shots)return;for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(250);const image=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.capturePage().then(i=>i.toPNG().toString('base64')));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(image,'base64'));}await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});};
  await page.locator('.thread-row').filter({hasText:'Thread one'}).waitFor();
  const ids=await page.evaluate(()=>window.sufficeDesktop.threads().then(t=>Object.fromEntries(t.map(x=>[x.title||x.id,x.id]))));
  const threads=await page.evaluate(()=>window.sufficeDesktop.threads());const one=threads.find(t=>t.cwd&&t.cwd.endsWith(cwd.split('/').pop())).id;
  // Two turns of history, then a third turn's edits left in the tree.
  await checkpoint(cwd,one,'Add a greeting helper');await writeFile(resolve(cwd,'app.js'),'export const greeting = "hello";\nexport const hi = () => greeting;\n');
  await checkpoint(cwd,one,'Write tests for the helper and refactor the module so the example is easier to read');await writeFile(resolve(cwd,'test.js'),'import {hi} from "./app.js";\n');await writeFile(resolve(cwd,'app.js'),'export const hi = () => "hello";\n');
  await page.locator('.thread-row').filter({hasText:'Thread one'}).click();await page.locator('.thread-header').filter({hasText:'Thread one'}).waitFor();
  await page.getByRole('button',{name:'Toggle right panel'}).click();
  await shot('launcher');
  await page.locator('.panel-launcher').getByRole('button',{name:'Rewind',exact:true}).click();
  const items=page.locator('.rewind-item');await items.nth(1).waitFor();
  assert.equal(await items.count(),2);assert.equal(await page.locator('.rewind-now').count(),1);
  assert.equal(await items.nth(0).getAttribute('aria-selected'),'true');
  assert.match(await items.nth(0).innerText(),/Before turn 2/);assert.match(await items.nth(1).innerText(),/Before turn 1/);
  assert.match(await items.nth(0).innerText(),/2 files/);
  await shot('timeline');
  // Scrub with the keyboard, then ask and cancel.
  await items.nth(0).focus();await page.keyboard.press('ArrowDown');
  assert.equal(await items.nth(1).getAttribute('aria-selected'),'true');
  await page.getByRole('button',{name:'Rewind…'}).click();await page.locator('.rewind-actions').waitFor();
  await shot('confirm');
  await page.getByRole('button',{name:'Cancel'}).click();assert.equal(await page.locator('.rewind-actions').count(),0);
  // Restore to before turn 1.
  await page.getByRole('button',{name:'Rewind…'}).click();await page.locator('.rewind-actions').getByRole('button',{name:'Rewind',exact:true}).click();
  await page.locator('.rewind-line',{hasText:'Restored'}).waitFor();
  assert.equal(await readFile(resolve(cwd,'app.js'),'utf8'),'export const greeting = "hello";\n');assert.equal(await access(resolve(cwd,'test.js')).then(()=>true,()=>false),false);
  assert.equal(await items.count(),3);assert.equal(await page.locator('.rewind-item[data-kind="rewind"]').count(),1);
  assert.equal(await git('stash','list').then(r=>r.stdout),'');
  await shot('restored');
  // Undo through the safety checkpoint.
  await page.getByRole('button',{name:'Rewind…'}).click();await page.locator('.rewind-actions').getByRole('button',{name:'Rewind',exact:true}).click();
  await page.locator('.rewind-line',{hasText:'Restored'}).waitFor();
  assert.equal(await readFile(resolve(cwd,'app.js'),'utf8'),'export const hi = () => "hello";\n');assert.equal(await readFile(resolve(cwd,'test.js'),'utf8'),'import {hi} from "./app.js";\n');
  // Empty and no-Git states.
  await page.locator('.thread-row').filter({hasText:'Thread two'}).click();await page.locator('.thread-header').filter({hasText:'Thread two'}).waitFor();
  await page.waitForTimeout(600);
  if(!await page.evaluate(()=>document.body.classList.contains('right-panel-open')))await page.getByRole('button',{name:'Toggle right panel'}).click();
  await page.locator('.panel-launcher').waitFor();
  if(!await page.locator('.rewind').count())await page.locator('.panel-launcher').getByRole('button',{name:'Rewind',exact:true}).click();
  await page.getByText('No Git repository').first().waitFor();await shot('no-git');
  assert.deepEqual(stderr.filter(line=>line.includes('[no-dialog]')),[]);
 }finally{await app.close();}
});
