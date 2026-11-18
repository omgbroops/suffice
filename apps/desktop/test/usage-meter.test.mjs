import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {runCaps,dailyBudget,budgetStatus} from '../electron/usage.mjs';
import {createHarnessHost} from '../electron/worker.mjs';

const shots=process.env.USAGE_METER_SHOTS||'';

test('caps and daily budget come from Settings choices; env still wins',()=>{
 assert.deepEqual(runCaps({},{'run-cap-usd':'$10','run-cap-tokens':'500K'}),{usd:10,tokens:500000});
 assert.deepEqual(runCaps({},{'run-cap-usd':'No cap','run-cap-tokens':'5M'}),{usd:Infinity,tokens:5000000});
 assert.deepEqual(runCaps({SUFFICE_RUN_CAP_USD:'0.5'},{'run-cap-usd':'$10'}),{usd:.5,tokens:2000000});
 assert.equal(dailyBudget('/nowhere',{'budget-daily-tokens':'Off'}),null);
 assert.equal(budgetStatus('/nowhere',{}),null);
});

test('worker stops at the daily budget, records spend in the backend budget file, then refuses the next run',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-budget-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-budget-cwd-'));
 const messages=[];let subscriber,usage={cost:0,totalTokens:0},aborts=0;
 const agent={session:{getSessionStats:()=>({cost:usage.cost,tokens:{total:usage.totalTokens}}),subscribe:fn=>{subscriber=fn;},setThinkingLevel:()=>{}},totals:{},sessionPath:()=>'/test/session',
  run:async()=>{const seen=aborts;for(const total of [400000,900000,1100000,5000000]){usage={cost:0,totalTokens:total};subscriber({type:'message_end'});if(aborts>seen)break;}return '';},abort:()=>{aborts++;},dispose:async()=>{}};
 const host=createHarnessHost({home,send:m=>messages.push(m),createRuntime:async()=>({isUsingSubscription:()=>true}),createSession:async()=>agent});
 const desktopSettings={'budget-daily-tokens':'1M'};
 await host({id:1,action:'status'});await host({id:2,action:'run',payload:{prompt:'x',effort:'low',cwd,desktopSettings}});
 assert.equal(aborts,1);assert.match(messages.find(m=>m.id===2).error,/Stopped: this run reached its 1M token cap/);
 const saved=JSON.parse(await readFile(resolve(home,'budget.json'),'utf8'));assert.equal(Object.values(saved.windows)[0].used,1100000);
 assert.deepEqual([budgetStatus(home,desktopSettings).used,budgetStatus(home,desktopSettings).remaining],[1100000,0]);
 await host({id:3,action:'run',payload:{prompt:'y',effort:'low',cwd,desktopSettings}});
 assert.match(messages.find(m=>m.id===3).error,/daily token budget is used up/);
});

test('Settings > Usage sets caps and shows the day total; composer footer shows the thread meter',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-meter-ui-'));await mkdir(home,{recursive:true});
 await writeFile(resolve(home,'budget.json'),JSON.stringify({windows:{daily:{start:new Date(new Date().setHours(0,0,0,0)).getTime(),used:240000}}}));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fleet-usage-meter-1',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-meter-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 let page;
 const shot=async name=>{if(!shots)return;await mkdir(shots,{recursive:true});for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;},theme);await page.waitForTimeout(150);const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(png,'base64'));}await page.locator('html').evaluate(el=>{el.dataset.theme='dark';});};
 try{
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1440,900);});
  page=await app.firstWindow();await page.locator('.composer').waitFor();
  const meter=page.locator('.usage-meter');assert.equal(await meter.isHidden(),true,'no reading before a thread has usage');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'usage',usage:{cost:.1234,totalTokens:15500,inputTokens:12400,outputTokens:3100,windowTokens:5400,windowPercent:27}}));
  await meter.waitFor();assert.equal((await meter.innerText()).trim(),'12.4k in · 3.1k out · ctx 27% · $0.12');
  const box=await meter.boundingBox(),form=await page.locator('.composer').boundingBox();assert.ok(box.x>=form.x&&box.x+box.width<=form.x+form.width&&box.y+box.height<=form.y+form.height+1,'meter inside composer');
  await shot('footer-meter');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Usage',exact:true}).click();
  const pick=async(label,option)=>{await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('menuitemradio',{name:option,exact:true}).click();};
  await pick('Cost cap per run','$1');await pick('Token cap per run','500K');await pick('Daily token budget','1M');
  await page.waitForFunction(()=>window.sufficeDesktop.budget().then(b=>b&&b.tokens===1e6&&b.used===240000));
  const stored=await page.evaluate(()=>window.sufficeDesktop.settings?.get?.()??null);if(stored)assert.deepEqual([stored['run-cap-usd'],stored['run-cap-tokens'],stored['budget-daily-tokens']],['$1','500K','1M']);
  await page.getByRole('button',{name:'Settings',exact:true}).click().catch(()=>{});
  await page.getByRole('button',{name:'Usage',exact:true}).click();
  await page.locator('.usage-budget').waitFor();assert.match(await page.locator('.usage-budget').innerText(),/Today: 240K of 1\.0M tokens/);
  await shot('settings-usage');
 }finally{await app.close();}
});
