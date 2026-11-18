import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

const shots=process.env.SCHEDULED_SHOTS;

test('Scheduled sidebar page lists, creates, runs now and shows last-run status through the real desktop UI',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-sched-ui-')),project=await mkdtemp(resolve(tmpdir(),'suffice-sched-proj-'));
 execFileSync('git',['init','-q'],{cwd:project});
 const now=Date.now(),hour=36e5;
 const seeded=(id,name,trigger,extra)=>({id,name,project,prompt:'p',effort:'medium',enabled:true,createdAt:now,lastRun:null,...extra,trigger});
 await writeFile(resolve(home,'automations.json'),JSON.stringify([
  seeded('11111111-1111-1111-1111-111111111111','Morning dependency check',{kind:'daily',time:'09:00'},{nextRun:now+5*hour,lastRun:{at:now-19*hour,status:'ok',threadId:'a'}}),
  seeded('33333333-3333-3333-3333-333333333333','Lint on file change',{kind:'file'},{enabled:false,lastRun:{at:now-30*hour,status:'error',error:'Model unavailable. Connect this provider in Settings.'}}),
 ]));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_NO_SCHEDULER:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fl2-automation-cron-1',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-sched-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>[{provider:'p',id:'sol',name:'Sol',available:true,efforts:['low','medium']}]);});
  const shot=async name=>{if(!shots)return;await mkdir(shots,{recursive:true});for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;},theme);await page.waitForTimeout(500);const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(png,'base64'));}await page.locator('html').evaluate(el=>{el.dataset.theme='dark';});};
  await page.setViewportSize({width:1440,height:900}).catch(()=>{});
  const nav=page.getByRole('button',{name:'Scheduled',exact:true});
  await nav.click();await page.locator('.scheduled-view').waitFor();
  assert.equal(await nav.getAttribute('aria-current'),'page');
  const rows=page.locator('.scheduled-view .automation-row');await rows.first().waitFor();assert.equal(await rows.count(),2);
  assert.match(await rows.nth(0).innerText(),/Morning dependency check[\s\S]*Every day at 09:00[\s\S]*Last run 19 hours ago[\s\S]*Next run/);
  assert.match(await rows.nth(1).innerText(),/failed: Model unavailable[\s\S]*Paused/);
  await shot('list');
  // Create with a schedule.
  await page.getByRole('button',{name:'New automation'}).click();const dialog=page.getByRole('dialog',{name:'New automation'});await dialog.waitFor();
  await dialog.getByLabel('Name').fill('Weekday standup notes');await dialog.getByLabel('Prompt').fill('Summarize yesterday\'s commits.');
  await dialog.getByLabel('Runs').selectOption('cron');await dialog.getByLabel(/Cron/).fill('30 8 * * 1-5');
  await shot('dialog');
  await dialog.getByRole('button',{name:'Create'}).click();await dialog.waitFor({state:'detached'});
  await page.waitForFunction(()=>document.querySelectorAll('.scheduled-view .automation-row').length===3);
  const made=rows.nth(2);assert.match(await made.innerText(),/Weekday standup notes[\s\S]*Schedule 30 8 \* \* 1-5[\s\S]*Never run[\s\S]*Next run/);
  // Run now: offline there is no provider, so the failure is recorded as last-run status.
  await made.getByRole('button',{name:'Run now'}).click();await made.getByText(/failed:/).waitFor({timeout:30000});
  await shot('run-status');
  const saved=JSON.parse(await readFile(resolve(home,'automations.json'),'utf8'));assert.equal(saved.length,3);assert.equal(saved[2].lastRun.status,'error');
  // Escape closes the page and returns to the home view.
  await page.keyboard.press('Escape');await page.locator('.scheduled-view').waitFor({state:'hidden'});assert.equal(await nav.getAttribute('aria-current'),null);
  await nav.click();await page.locator('.scheduled-view').waitFor();
  await page.getByRole('button',{name:'New session'}).click();await page.locator('.scheduled-view').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
