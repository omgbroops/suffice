import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard,killTmux,openMore} from './electron-guard.mjs';

const OK='node -e process.exit(0)';
const rowOf=(page,title)=>page.locator('.flow-item',{has:page.locator('.flow-title',{hasText:title})});
const toast=page=>page.locator('.toast-message');

test('Workflows: escaping, double start, empty test command, 12 runs, kill and restart, cancel and resume',{timeout:240000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-flow-edge-')),apps=[];
 const launch=async n=>{ // one userData dir: Electron's single-instance lock means two live windows never share a data dir
  const socket='sfx-fl2-workflow-flow-'+(10+n);
  const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_NO_SCHEDULER:'1',SUFFICE_FLOW_RUNNER:'fake',SUFFICE_FLOW_RUN_TOKENS:'100000',SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-flow-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
  apps.push({app,socket});const page=await app.firstWindow();
  await openMore(page);await page.locator('.flows-nav').click();await page.locator('.flows-view:not([hidden])').waitFor();
  return {app,page,pid:app.process().pid};
 };
 try{
  // Window 1: a task with markup stays text; a double click starts exactly one run; a blank test command is refused.
  const one=await launch(1),p1=one.page,markup='<img src=x onerror="window.__x=1"> & "quote"';
  await p1.getByRole('button',{name:'New run'}).click();await p1.getByRole('radio',{name:'Plan, approve, build'}).click();
  await p1.locator('[data-field=task]').fill(markup);await p1.locator('[data-field=test]').fill('   ');
  await p1.getByRole('button',{name:'Start run'}).click();
  await p1.locator('.flow-error',{hasText:'Enter the test command'}).waitFor();assert.equal(await p1.locator('.flow-row').count(),0);
  await p1.locator('[data-field=test]').fill(OK);
  await p1.getByRole('button',{name:'Start run'}).dblclick();
  await p1.locator('.flow-approval').waitFor();
  assert.equal(await p1.locator('.flow-row').count(),1);
  assert.equal(await p1.locator('.flow-title').innerText(),markup);
  assert.equal(await p1.locator('.flows-view img').count(),0);assert.equal(await p1.evaluate(()=>window.__x),undefined);
  assert.match(await p1.locator('.flow-approval-sub').innerText(),/build-plan in <img/);
  // Killed while waiting for approval (no clean shutdown): the next launch lists it as interrupted, with a lock left by a dead pid.
  const gone=new Promise(r=>one.app.process().once('exit',r));process.kill(one.pid,'SIGKILL');await gone;

  const two=await launch(2),p2=two.page;
  const r2=rowOf(p2,'quote');await await r2.getByText('Interrupted',{exact:true}).waitFor();
  await r2.getByRole('button',{name:/^Resume/}).click();
  await p2.locator('.flow-approval').waitFor();

  // Cancel while asking, resume, ask again, approve: the run finishes in this window.
  await rowOf(p2,'quote').getByRole('button',{name:/^Cancel/}).click();await rowOf(p2,'quote').getByText('Cancelled',{exact:true}).waitFor();
  assert.equal(await p2.locator('.flow-approval').count(),0);
  await rowOf(p2,'quote').getByRole('button',{name:/^Resume/}).click();
  await p2.locator('.flow-approval').waitFor();
  await p2.locator('.flow-approval').getByRole('button',{name:'Approve'}).click();
  await rowOf(p2,'quote').getByText('Done',{exact:true}).waitFor();
  const p3=p2;

  // 12 runs all list and finish.
  await p3.evaluate(async()=>{for(let i=0;i<12;i++)await window.sufficeDesktop.flow.start({workflow:'research-relay',topic:'Topic '+i});});
  await p3.locator('.flow-count-label',{hasText:'13 runs'}).waitFor();
  await p3.waitForFunction(()=>document.querySelectorAll('.flow-row[data-state=ended]').length===13);
  assert.equal(await p3.locator('.flow-row').count(),13);
  assert.equal(await p3.locator('.flow-title',{hasText:/^Topic \d+$/}).count(),12);
 }finally{
  for(const {app,socket} of apps){try{await app.close();}catch{}killTmux(socket);}
 }
});
