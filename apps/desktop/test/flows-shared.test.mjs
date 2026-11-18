import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard,killTmux} from './electron-guard.mjs';

const rowOf=(page,title)=>page.locator('.flow-item',{has:page.locator('.flow-title',{hasText:title})});

test('Workflows: two live windows over one runs dir: one owner per run, the other cannot answer or cancel it',{timeout:240000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-flow-shared-')),apps=[];
 const launch=async n=>{ // own userData per live window (single-instance lock); window 2's sessions dir is a link to window 1's, so both read the same runs and budget
  const socket='sfx-fl2-workflow-flow-'+(30+n);
  const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_NO_SCHEDULER:'1',SUFFICE_FLOW_RUNNER:'fake',SUFFICE_FLOW_RUN_TOKENS:'100000',SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-flow-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
  if(n>1){await mkdir(resolve(home,'profile'+n),{recursive:true});await symlink(resolve(home,'profile1','sessions'),resolve(home,'profile'+n,'sessions'));}
  const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile'+n)],env});
  apps.push({app,socket});const page=await app.firstWindow();
  await page.locator('.flows-nav').click();await page.locator('.flows-view:not([hidden])').waitFor();
  return page;
 };
 try{
  const p1=await launch(1);
  await p1.getByRole('button',{name:'New run'}).click();await p1.getByRole('radio',{name:'Plan, approve, build'}).click();
  await p1.locator('[data-field=task]').fill('Shared one');await p1.locator('[data-field=test]').fill('node -e process.exit(0)');
  await p1.getByRole('button',{name:'Start run'}).click();await p1.locator('.flow-approval').waitFor();
  const p2=await launch(2); // started after the run exists, while window 1 is live
  await rowOf(p2,'Shared one').getByText('Running',{exact:true}).waitFor({timeout:15000});
  assert.equal(await p2.locator('.flow-approval').count(),0);
  const id=await p2.evaluate(async()=>(await window.sufficeDesktop.flow.list()).runs.find(r=>r.title==='Shared one').runId);
  await assert.rejects(p2.evaluate(i=>window.sufficeDesktop.flow.approve(i,true),id),/already answered/);
  await assert.rejects(p2.evaluate(i=>window.sufficeDesktop.flow.cancel(i),id),/not running in this window/);
  await p1.locator('.flow-approval').waitFor(); // window 2's attempts left the run waiting
  await p1.locator('.flow-approval').getByRole('button',{name:'Approve'}).click();
  await rowOf(p1,'Shared one').getByText('Done',{exact:true}).waitFor();
  // Window 2 re-lists when its view reopens (the nav toggles: leave, return).
  await p2.locator('.flows-nav').click();await p2.locator('.flows-nav').click();
  await rowOf(p2,'Shared one').getByText('Done',{exact:true}).waitFor({timeout:15000});
 }finally{
  for(const {app,socket} of apps){try{await app.close();}catch{}killTmux(socket);}
 }
});
