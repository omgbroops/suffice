import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

// Regression tests for the Scheduled/Automations UI: double submit, switch double-click, Scheduled opening under Settings.
test('automation form saves once, a double-clicked switch cancels out, Scheduled opens above Settings',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-sfix-')),project=await mkdtemp(resolve(tmpdir(),'suffice-sfix-proj-'));
 execFileSync('git',['init','-q'],{cwd:project});
 const file=resolve(home,'automations.json'),read=async()=>JSON.parse(await readFile(file,'utf8'));
 await writeFile(file,JSON.stringify([{id:'11111111-1111-1111-1111-111111111111',name:'Weekday',project,prompt:'p',effort:'medium',enabled:true,createdAt:Date.now(),lastRun:null,trigger:{kind:'cron',cron:'30 8 * * 1-5'}}]));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_NO_SCHEDULER:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fl2-automation-cron-2',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-sfix-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const nav=page.locator('.scheduled-nav'),rows=page.locator('.scheduled-view .automation-row'),list=()=>page.evaluate(()=>window.sufficeDesktop.automations());
  // Settings > Automations, then the sidebar Scheduled entry: Scheduled must be on top and Settings closed.
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Automations',exact:true}).click();
  await page.locator('html.settings-open').waitFor();
  await nav.click();await page.locator('.scheduled-view').waitFor();
  assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('settings-open')),false);
  assert.equal(await page.locator('.scheduled-view').evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+40);return !!hit&&el.contains(hit);}),true);
  await rows.first().waitFor();
  // Switch clicked twice in one tick ends enabled again.
  await rows.first().getByRole('switch').evaluate(b=>{b.click();b.click();});
  await list();assert.equal((await read())[0].enabled,true);
  // Create clicked three times in one tick saves one automation.
  await page.getByRole('button',{name:'New automation'}).click();const dialog=page.getByRole('dialog',{name:'New automation'});await dialog.waitFor();
  await dialog.getByLabel('Name').fill('Once');await dialog.getByLabel('Prompt').fill('Do it once.');
  await dialog.getByLabel('Runs').selectOption('cron');await dialog.getByLabel(/Cron/).fill('0 9 * * *');
  await dialog.getByRole('button',{name:'Create'}).evaluate(b=>{b.click();b.click();b.click();});
  await dialog.waitFor({state:'detached'});await list();
  assert.deepEqual((await read()).map(item=>item.name),['Weekday','Once']);
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
