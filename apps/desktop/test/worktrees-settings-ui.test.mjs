import electronPath from 'electron';
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {branchFixture} from './branch-fixture.mjs';
import {create} from '../electron/worktrees.mjs';
const SHOTS=process.env.WT_SHOTS||'';
test('settings Worktrees list: size and age, pin, delete snapshots, restore',{timeout:120000},async()=>{
 const {cwd}=await branchFixture(),home=await mkdtemp(resolve(tmpdir(),'suffice-wtset-')),history=await mkdtemp(resolve(tmpdir(),'suffice-wtset-hist-'));
 const a=await create(home,cwd,{threadId:'t1'});await create(home,cwd,{threadId:'t2'});await writeFile(resolve(a.path,'work.txt'),'edit');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:cwd,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fr-worktree-checkpoints-1',SUFFICE_HISTORY_HOME:history};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 const shot=async(page,name)=>{if(!SHOTS)return;for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(250);const png=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.capturePage().then(i=>i.toPNG().toString('base64')));await writeFile(resolve(SHOTS,`${name}-${theme}.png`),Buffer.from(png,'base64'));}};
 try{
  const page=await app.firstWindow();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('.settings-nav-item[data-section=projects]').click();
  const rows=page.locator('.wt-row');await rows.first().waitFor();assert.equal(await rows.count(),2);
  assert.match(await page.locator('.wt-card').innerText(),/changes/);
  await page.locator('[data-worktrees]').scrollIntoViewIfNeeded();await shot(page,'1-worktrees-list');
  await rows.first().getByRole('button',{name:'Pin'}).click();await rows.first().getByRole('button',{name:'Unpin'}).waitFor();
  const target=page.locator('.wt-row',{has:page.getByRole('button',{name:'Pin',exact:true})}).first();
  await target.getByRole('button',{name:'Delete'}).click();await page.getByText('Deleted, snapshot kept').waitFor();await shot(page,'2-deleted-restorable');
  await page.getByRole('button',{name:'Restore'}).click();await page.waitForFunction(()=>!document.body.innerText.includes('Deleted, snapshot kept'));
  assert.equal(await rows.count(),2);
 }finally{await app.close();}
});
