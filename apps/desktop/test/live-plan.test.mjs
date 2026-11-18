import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {parsePlan} from '../src/live-plan.js';
const shots='/Users/abhayg/suffice-desktop-wt/ui-shots/forge/final/live-plan';
test('parsePlan reads TodoWrite and update_plan shapes only',()=>{
 assert.deepEqual(parsePlan('TodoWrite',{todos:[{content:'A',status:'completed'},{content:'B',activeForm:'Doing B',status:'in_progress'},{content:'C',status:'pending'}]}).map(i=>i.state),['done','active','todo']);
 assert.equal(parsePlan('update_plan',{plan:[{step:'X',status:'pending'}]})[0].text,'X');
 assert.equal(parsePlan('bash',{todos:[{content:'A'}]}),null);assert.equal(parsePlan('TodoWrite',{}),null);
});
test('live plan card ticks, collapses to a count and expands on click',{timeout:120000},async()=>{
 const tmp=await mkdtemp(resolve(tmpdir(),'sfx-lp-'));const [project,data,home]=['project','data','history'].map(d=>resolve(tmp,d));for(const d of [project,data,home])await mkdir(d,{recursive:true});await mkdir(shots,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:resolve(tmp,'suffice'),SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-pre-live-plan-'+process.pid,SUFFICE_HISTORY_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+data],env});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  const send=v=>app.evaluate(({BrowserWindow},v)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',v),v);
  const shot=async name=>{const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,name),Buffer.from(b,'base64'));};
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:run');ipcMain.handle('suffice:run',()=>new Promise(()=>{}));});
  await page.locator('#prompt').fill('Ship the live plan card');await page.locator('#prompt').press('Enter');await page.locator('.thread-status').waitFor();
  await send({event:'thread_started',id:'lp-fixture'});await page.waitForTimeout(400);
  const todo=(...s)=>({todos:['Read the worker events','Render the card','Tick items live','Write the hidden test','Take screenshots'].map((content,i)=>({content,activeForm:['Reading the worker events','Rendering the card','Ticking items live','Writing the hidden test','Taking screenshots'][i],status:s[i]}))});
  const call=(id,input)=>send({event:'tool_start',id,name:'TodoWrite',input});
  assert.equal(await page.locator('.live-plan').count(),1);assert.equal(await page.locator('.live-plan').isHidden(),true);
  await send({event:'text',text:'Starting on the plan.'});
  await call('p1',todo('completed','completed','in_progress','pending','pending'));
  await page.waitForTimeout(500);
  assert.equal((await page.locator('.live-plan-count').innerText()),'2 of 5 done');assert.match(await page.locator('.live-plan-now').innerText(),/Ticking items live/);
  assert.equal(await page.locator('.live-plan').evaluate(e=>e.open),true);
  const box=await page.locator('.live-plan').boundingBox(),comp=await page.locator('.composer').boundingBox();assert.ok(box.y+box.height<=comp.y+1,'card sits above the composer');
  for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(300);await shot(`live-plan-open-${theme}.png`);}
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
  await call('p2',todo('completed','completed','completed','in_progress','pending'));await page.waitForTimeout(100);
  assert.equal(await page.locator('.live-plan-list li.just-done').count(),1);
  assert.equal(await page.locator('.live-plan-list li[data-state=done]').count(),3);
  await page.locator('.live-plan summary').click();await page.waitForTimeout(400);assert.equal(await page.locator('.live-plan').evaluate(e=>e.open),false);
  assert.equal(await page.locator('.live-plan-count').innerText(),'3 of 5 done');
  for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(300);await shot(`live-plan-collapsed-${theme}.png`);}
  await page.locator('.live-plan summary').click();await page.waitForTimeout(400);assert.equal(await page.locator('.live-plan').evaluate(e=>e.open),true);
  await call('p3',todo(...Array(5).fill('completed')));await page.waitForTimeout(300);
  assert.equal(await page.locator('.live-plan').getAttribute('data-state'),'done');assert.equal(await page.locator('.live-plan-count').innerText(),'5 of 5 done');
  assert.equal(await page.locator('.live-plan').evaluate(e=>e.open),true,'a card the viewer opened stays open');
  await page.emulateMedia({reducedMotion:'reduce'});await call('p4',todo(...Array(5).fill('pending')));await call('p5',todo('completed','pending','pending','pending','pending'));await page.waitForTimeout(50);
  assert.equal(await page.locator('.live-plan-list li.just-done svg').evaluate(e=>e.getAnimations().length),0,'reduced motion: no tick animation');
 }finally{await app.close().catch(()=>{});}
});
