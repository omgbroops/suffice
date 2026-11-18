import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

const shots=process.env.AUTOMATIONS_SHOTS;

test('Automations settings page creates, runs, pauses, edits and deletes through the real desktop UI, and survives a restart',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-auto-ui-')),project=await mkdtemp(resolve(tmpdir(),'suffice-auto-ui-proj-'));
 execFileSync('git',['init','-q'],{cwd:project});
 const now=Date.now(),hour=36e5;
 const seeded=(id,name,trigger,extra)=>({id,name,project,prompt:'p',effort:'medium',enabled:true,createdAt:now,lastRun:null,...extra,trigger});
 await writeFile(resolve(home,'automations.json'),JSON.stringify([
  seeded('11111111-1111-1111-1111-111111111111','Morning dependency check',{kind:'daily',time:'09:00'},{model:'sol',provider:'p',nextRun:now+5*hour,lastRun:{at:now-19*hour,status:'ok',threadId:'a'}}),
  seeded('22222222-2222-2222-2222-222222222222','Review every push',{kind:'push'},{lastRun:{at:now-2*hour,status:'ok',threadId:'b'}}),
  seeded('33333333-3333-3333-3333-333333333333','Lint on file change',{kind:'file'},{enabled:false,lastRun:{at:now-30*hour,status:'error',error:'Model unavailable. Connect this provider in Settings.'}}),
 ]));
 const run=async(body)=>{
  const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_NO_SCHEDULER:'1',SUFFICE_SESSIONS_SOCKET:'sfx-feat-automations',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-auto-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
  try{const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>[{provider:'p',id:'sol',name:'Sol',available:true,efforts:['low','medium','high']},{provider:'p',id:'sol-mini',name:'Sol Mini',available:true,efforts:['low']}]);});
   const shot=async name=>{if(!shots)return;await mkdir(shots,{recursive:true});for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;},theme);await page.waitForTimeout(150);const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(png,'base64'));}await page.locator('html').evaluate(el=>{el.dataset.theme='dark';});};
   await body(page,shot);assert.deepEqual(errors,[]);}
  finally{await app.close();}
 };
 const open=async page=>{await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Automations',exact:true}).click();await page.locator('.automation-card').waitFor();};

 await run(async(page,shot)=>{
  await open(page);
  const rows=page.locator('.automation-row');await rows.first().waitFor();assert.equal(await rows.count(),3);
  const first=rows.nth(0);
  assert.match(await first.innerText(),/Morning dependency check[\s\S]*Every day at 09:00[\s\S]*Last run 19 hours ago[\s\S]*Next run Today|Tomorrow/);
  assert.match(await rows.nth(1).innerText(),/When you push[\s\S]*Waiting for a push/);
  assert.match(await rows.nth(2).innerText(),/When files change[\s\S]*failed: Model unavailable[\s\S]*Paused/);
  assert.equal(await rows.nth(2).getByRole('switch').getAttribute('aria-checked'),'false');
  await shot('list');

  // Enable toggle persists.
  await rows.nth(2).getByRole('switch').click();await page.waitForFunction(()=>document.querySelectorAll('.automation-row')[2].querySelector('[role=switch]').getAttribute('aria-checked')==='true');
  assert.match(await rows.nth(2).innerText(),/Waiting for file changes/);

  // New automation: bad cron is rejected in the dialog, good input is saved.
  await page.getByRole('button',{name:'New automation'}).click();const dialog=page.getByRole('dialog',{name:'New automation'});await dialog.waitFor();
  await dialog.getByLabel('Name').fill('Weekday standup notes');await dialog.getByLabel('Prompt').fill('Summarize yesterday\'s commits.');
  await dialog.getByLabel('Runs').selectOption('cron');await dialog.getByLabel(/Cron/).fill('nope');
  await shot('dialog-cron');
  await dialog.getByRole('button',{name:'Create'}).click();await dialog.locator('.automation-error').filter({hasText:'five cron fields'}).waitFor();
  await dialog.getByLabel(/Cron/).fill('30 8 * * 1-5');await dialog.getByLabel('Model').selectOption('p|sol-mini');await dialog.getByLabel('Effort').selectOption('low');
  await dialog.getByRole('button',{name:'Create'}).click();await dialog.waitFor({state:'detached'});
  await page.waitForFunction(()=>document.querySelectorAll('.automation-row').length===4);
  const made=rows.nth(3);assert.match(await made.innerText(),/Weekday standup notes[\s\S]*Schedule 30 8 \* \* 1-5[\s\S]*sol-mini[\s\S]*Never run[\s\S]*Next run/);
  await shot('list-created');

  // Edit keeps the id and updates the schedule.
  await made.getByRole('button',{name:'Edit'}).click();const edit=page.getByRole('dialog',{name:'Edit automation'});await edit.waitFor();
  assert.equal(await edit.getByLabel('Name').inputValue(),'Weekday standup notes');await shot('dialog-edit');
  await edit.getByLabel('Runs').selectOption('hourly');await edit.getByLabel('Minute past the hour').fill('15');await edit.getByRole('button',{name:'Save'}).click();await edit.waitFor({state:'detached'});
  await page.getByText('Every hour at :15').waitFor();assert.equal(await rows.count(),4);

  // Run now goes through the real main-process path; offline there is no provider, so the failure is recorded and shown.
  await made.getByRole('button',{name:'Run now'}).click();await made.getByText(/failed:/).waitFor({timeout:30000});
  await shot('list-run-error');

  // Delete.
  await rows.nth(1).getByRole('button',{name:'Delete'}).click();await page.waitForFunction(()=>document.querySelectorAll('.automation-row').length===3);
  await page.getByText('Review every push').waitFor({state:'detached'});
 });

 // Restart: everything above is still there, nothing was reset.
 const saved=JSON.parse(await readFile(resolve(home,'automations.json'),'utf8'));assert.equal(saved.length,3);
 await run(async(page,shot)=>{await open(page);assert.equal(await page.locator('.automation-row').count(),3);await page.getByText('Weekday standup notes').waitFor();assert.equal(await page.locator('.automation-row').nth(2).getByRole('switch').getAttribute('aria-checked'),'true');});

 // Empty state.
 await writeFile(resolve(home,'automations.json'),'[]');
 await run(async(page,shot)=>{await open(page);await page.getByText('No automations yet').waitFor();await page.waitForTimeout(800);await page.locator('.automation-card').waitFor();await shot('empty');
  await page.getByRole('button',{name:'New automation'}).click();await page.getByRole('dialog',{name:'New automation'}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});});
});
