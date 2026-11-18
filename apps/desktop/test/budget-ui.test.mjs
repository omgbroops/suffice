import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {gateTurn,readCaps} from '../electron/budget-caps.mjs';

const shots=process.env.BUDGET_SHOTS;
test('Settings > Usage caps save through the real backend budget and gate turns',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-budget-ui-'));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fleet-budget-1',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-budget-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 let page;
 const shot=async name=>{if(!shots)return;await mkdir(shots,{recursive:true});for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;},theme);await page.waitForTimeout(120);const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(png,'base64'));}await page.locator('html').evaluate(el=>{el.dataset.theme='dark';});};
 const openUsage=async()=>{await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Usage',exact:true}).click();};
 try{
  page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await openUsage();
  const weekly=page.getByLabel('Weekly cap'),run=page.getByLabel('Per-run cap'),status=page.locator('.budget-status');
  await weekly.waitFor();assert.equal(await weekly.inputValue(),'');assert.match(await status.innerText(),/No weekly cap set/);
  await shot('caps-empty');
  await weekly.fill('500000');await run.fill('120');await page.getByRole('button',{name:'Save caps'}).click();
  await page.getByText('0 of 500K used this week').waitFor();assert.match(await status.innerText(),/Saved/);
  assert.deepEqual(JSON.parse(await readFile(resolve(home,'budget-caps.json'),'utf8')),{weeklyTokens:500000,runTokens:120});
  await shot('caps-saved');
  // Reopen: values persist from the file.
  await page.reload();await openUsage();
  await page.getByLabel('Weekly cap').waitFor();assert.equal(await page.getByLabel('Per-run cap').inputValue(),'120');
  // Backend gate: a spent window refuses the next turn; the backend file store holds the spend.
  assert.deepEqual(readCaps(home),{weeklyTokens:500000,runTokens:120});
  gateTurn(home)(500000);assert.throws(()=>gateTurn(home),/weekly cap reached/);
  await page.reload();await openUsage();
  await page.getByText('500K of 500K used this week').waitFor();await shot('caps-spent');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
