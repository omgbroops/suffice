import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const shots='/Users/abhayg/suffice-desktop-wt/ui-shots/frontier/progress-xp-run-view';
test('run strip: verb, tokens, plan tick, XP chip, achievements toast, menu',{timeout:150000},async()=>{
 const tmp=await mkdtemp(resolve(tmpdir(),'sfx-xp-'));const [project,data,home]=['project','data','history'].map(d=>resolve(tmp,d));for(const d of [project,data,home])await mkdir(d,{recursive:true});await mkdir(shots,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:resolve(tmp,'suffice'),SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fr-progress-xp-run-view-'+process.pid,SUFFICE_HISTORY_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+data],env});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  const send=v=>app.evaluate(({BrowserWindow},v)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',v),v);
  const shot=async name=>{const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,name),Buffer.from(b,'base64'));};
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:run');ipcMain.handle('suffice:run',()=>new Promise(()=>{}));});
  await page.locator('#prompt').fill('Show the run strip');await page.locator('#prompt').press('Enter');await page.locator('.thread-status').waitFor();
  await send({event:'thread_started',id:'xp-fixture'});await page.waitForTimeout(300);
  const strip=page.locator('.run-strip');assert.equal(await strip.isVisible(),true);assert.match(await page.locator('.xp-level').innerText(),/Lv 1/);
  const todo=(...s)=>({todos:['Read events','Patch view','Run tests'].map((content,i)=>({content,activeForm:['Reading events','Patching view','Running tests'][i],status:s[i]}))});
  await send({event:'tool_start',id:'t0',name:'TodoWrite',input:todo('in_progress','pending','pending')});
  await send({event:'tool_start',id:'t1',name:'Read',input:{file_path:'a'}});await page.waitForTimeout(100);
  assert.equal(await page.locator('.run-strip-verb').innerText(),'Reading');
  await send({event:'tool_end',id:'t1',result:'ok'});
  await send({event:'tool_start',id:'t2',name:'Edit',input:{}});await page.waitForTimeout(100);assert.equal(await page.locator('.run-strip-verb').innerText(),'Patching');
  await send({event:'tool_end',id:'t2',result:'ok'});
  await send({event:'tool_start',id:'t3',name:'Bash',input:{command:'node --test'}});await page.waitForTimeout(100);assert.equal(await page.locator('.run-strip-verb').innerText(),'Testing');
  await send({event:'usage',usage:{totalTokens:60000}});await send({event:'tool_end',id:'t3',result:'pass'});await page.waitForTimeout(150);
  assert.match(await page.locator('.run-strip-tokens').innerText(),/60\.0k tokens/);
  await send({event:'tool_start',id:'t4',name:'TodoWrite',input:todo('completed','in_progress','pending')});await page.waitForTimeout(80);
  assert.equal(await page.locator('.live-plan-list li.just-done').count(),1);
  assert.ok(await page.locator('.live-plan-list li.just-done .live-plan-box').evaluate(e=>e.getAnimations().length)>0,'spring tick runs');
  assert.ok(await page.locator('.xp-level').innerText().then(t=>/Lv 2/.test(t)),'60k tokens + a passing test reach level 2');
  const sb=await strip.boundingBox(),pb=await page.locator('.live-plan').boundingBox(),cb=await page.locator('.composer').boundingBox();assert.ok(sb.y+sb.height<=pb.y+1&&pb.y+pb.height<=cb.y+1,'strip and plan stack above the composer');
  await page.locator('.xp-chip').click();assert.equal(await page.locator('.xp-menu').isVisible(),true);{const m=await page.locator('.xp-menu').boundingBox();assert.ok(m.y>=0&&m.y+m.height<=sb.y,'menu opens above the strip, fully on screen');}assert.equal(await page.locator('.xp-menu .xp-head').count(),0,'shortcuts hidden below level 4');
  assert.equal(await page.locator('.xp-toggle').getAttribute('aria-checked'),'false','sound off by default');
  for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>{const m=document.querySelector('.xp-menu').getBoundingClientRect();return !!document.elementFromPoint(m.x+30,m.y+30).closest('.xp-menu');}),true,'menu is not clipped or covered');await shot(`strip-menu-${theme}.png`);}
  await page.keyboard.press('Escape');assert.equal(await page.locator('.xp-menu').count(),0);
  await send({event:'run_completed',result:{}});await page.waitForTimeout(300);
  assert.equal(await page.locator('.run-strip-verb').innerText(),'Done');
  assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('suffice.progress.v1')).state.achievements['first-pass']>0));
  for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(300);await shot(`strip-done-${theme}.png`);}
 }finally{await app.close().catch(()=>{});}
});
