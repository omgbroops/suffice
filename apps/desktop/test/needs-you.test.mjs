// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): the "Needs you" digest, driven from the sidebar entry like a user.
// SHOT_DIR sets the screenshot folder. Private tmux socket only; the live "suffice" socket is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {guard} from './electron-guard.mjs';
import {collectNeeds} from '../src/needs-collect.js';

test('collectNeeds: groups, ordering, archive and dismissal rules',()=>{
 const t=(id,status,extra={})=>({id,title:id,status,modified:10,...extra});
 const got=collectNeeds({threads:[t('a','approval'),t('f','failed'),t('u','done',{unread:true}),t('d','done'),t('x','failed',{archived:true}),t('g','failed',{modified:5})],sessions:[t('s','input'),t('sd','done',{unread:true})],dismissed:{g:5}});
 assert.deepEqual(got.map(i=>i.record.id),['a','s','f','u']);
 assert.deepEqual(collectNeeds({threads:[t('g','failed',{modified:6})],sessions:[],dismissed:{g:5}}).map(i=>i.record.id),['g'],'a new failure resurfaces');
});

test('needs you digest: count, live updates, row actions, sessions, states',{timeout:240000},async()=>{
 const shots=resolve(process.env.SHOT_DIR||'/Users/abhayg/suffice-desktop-wt/ui-shots/forge/feat/needs-you');await mkdir(shots,{recursive:true});
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-needs-'))),SOCKET=`sfx-feat-needs-you-${process.pid}`;
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{PI_OFFLINE:'1',SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,
  SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('apps/desktop/test/sessions-approval-agent.mjs')});
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),`--user-data-dir=${data}`],env});
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.composer').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  const shot=async(name,theme)=>{await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.mouse.move(1000,880);await page.waitForTimeout(350);const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(b64,'base64'));};
  const both=async name=>{await shot(name,'dark');await shot(name,'light');await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});};
  const now=Date.now();
  await app.evaluate(({ipcMain,BrowserWindow},now)=>{
   globalThis.answers=[];globalThis.threads=[
    {id:'ap1',title:'Fix double charge on retried webhooks',project:'Halo Pay',provider:'anthropic',status:'approval',modified:now-120000},
    {id:'in1',title:'Draft the migration plan for billing v2',project:'Halo Pay',provider:'anthropic',status:'input',modified:now-900000},
    {id:'f1',title:'Rate limit the public API',project:'Forge API',provider:'openai',status:'failed',error:'Task stopped by provider',modified:now-300000},
    {id:'u1',title:'Audit color tokens for contrast',project:'Pixel Design System',provider:'openai',status:'done',modified:now-3600000},
    {id:'d2',title:'Animate the onboarding carousel',project:'Orbit Mobile',provider:'anthropic',status:'done',modified:now-7200000},
    {id:'ar1',title:'Archived failure',project:'Orbit Mobile',provider:'anthropic',status:'failed',modified:now-7300000}];
   ipcMain.removeHandler('suffice:threads');ipcMain.handle('suffice:threads',()=>globalThis.threads);
   ipcMain.removeHandler('suffice:thread');ipcMain.handle('suffice:thread',(_e,id)=>({id,title:globalThis.threads.find(t=>t.id===id)?.title||id,messages:[],running:false}));
   ipcMain.removeHandler('suffice:approval-answer');ipcMain.handle('suffice:approval-answer',(_e,payload)=>{globalThis.answers.push(payload);const t=globalThis.threads.find(t=>t.id===payload.threadId);if(t)t.status='working';const w=BrowserWindow.getAllWindows()[0];w.webContents.send('suffice:event',{event:'approval_resolved',threadId:payload.threadId,requestId:payload.requestId});w.webContents.send('suffice:event',{event:'history_changed'});return true;});
  },now);
  await page.evaluate(()=>{localStorage.setItem('suffice-thread-view-v1:u1',JSON.stringify({sidebar:{unread:true}}));localStorage.setItem('suffice-thread-view-v1:ar1',JSON.stringify({sidebar:{archived:true}}));localStorage.removeItem('suffice-needs-dismissed-v1');});
  await page.reload();await page.locator('.thread-row').last().waitFor();
  const nav=page.locator('.needs-nav'),count=()=>nav.locator('.needs-count').textContent();
  const emit=ev=>app.evaluate(({BrowserWindow},ev)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',ev),ev);
  const expectCount=async n=>{await page.waitForFunction(n=>document.querySelector('.needs-nav .needs-count').textContent===String(n),n).catch(async e=>{throw new Error(e.message+' count='+await count());});};

  // sidebar entry with count: approval, input, failed, unread-finished (archived and seen ones excluded)
  assert.equal(await nav.isVisible(),true);await expectCount(4);
  assert.match(await nav.getAttribute('aria-label'),/4 waiting/);
  await emit({event:'approval',threadId:'ap1',requestId:7,name:'bash',input:{command:'rm -rf build && npm run build'}});
  await shot('sidebar-entry','dark');

  // open from the sidebar entry
  await nav.click();await page.locator('.needs-view').waitFor({state:'visible'});
  assert.equal(await nav.getAttribute('aria-current'),'page');
  assert.equal(await page.locator('.needs-row').count(),4);
  assert.deepEqual(await page.locator('.needs-group-label').allInnerTexts().then(a=>a.map(s=>s.replace(/\s+/g,' '))),['Waiting on you 2','Failed 1','Finished, not seen yet 1']);
  assert.match(await page.locator('[data-key=ap1] .needs-why').innerText(),/rm -rf build/);
  assert.deepEqual(await page.locator('[data-key=ap1] .needs-act').allInnerTexts(),['Approve','Deny','Open']);
  assert.deepEqual(await page.locator('[data-key=in1] .needs-act').allInnerTexts(),['Open']);
  assert.deepEqual(await page.locator('[data-key=f1] .needs-act').allInnerTexts(),['Open','Dismiss']);
  assert.match(await page.locator('[data-key=f1] .needs-why').innerText(),/stopped by provider/i);
  await both('populated');

  // one-click approve: answers the real approval channel with the pending request, row leaves the digest, count follows
  await page.locator('[data-key=ap1] .needs-act[data-act=approve]').click();
  await expectCount(3);assert.equal(await page.locator('[data-key=ap1]').count(),0);
  assert.deepEqual(await app.evaluate(()=>globalThis.answers),[{threadId:'ap1',requestId:7,allow:true}]);

  // dismiss a failure and a finished-unread row; the dismissal survives a reload
  await page.locator('[data-key=f1] .needs-act[data-act=dismiss]').click();await expectCount(2);
  await page.locator('[data-key=u1] .needs-act[data-act=dismiss]').click();await expectCount(1);
  await page.reload();await page.locator('.thread-row').last().waitFor();await expectCount(1);

  // live update from thread state: a new failure arrives
  await app.evaluate(()=>{globalThis.threads.push({id:'f2',title:'Port the parser to Rust',project:'Forge API',provider:'anthropic',status:'failed',error:'Rate limit reached',modified:Date.now()-60000});});
  await emit({event:'history_changed'});await expectCount(2);

  // keyboard: Escape closes, focus returns to the entry; entry reopens; Open leaves the view and selects that thread
  await nav.click();await page.locator('.needs-view').waitFor({state:'visible'});
  await page.keyboard.press('Escape');await page.locator('.needs-view').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('needs-nav')),true);
  await nav.click();await page.locator('[data-key=in1] .needs-act[data-act=open]').click();
  await page.locator('.needs-view').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('.thread-row[data-thread=in1]')?.getAttribute('aria-pressed')==='true');
  assert.match(await page.locator('.thread-header').innerText(),/migration plan/);

  // a live CLI session waiting on a permission joins the digest
  await page.evaluate(p=>sufficeDesktop.sessions.start({agent:'fakeclaude',cwd:p}),project);
  await page.reload();await page.locator('.sidebar-cli-sessions .thread-row').first().waitFor();
  const sid=await page.evaluate(async()=>(await sufficeDesktop.sessions.list()).at(-1).id);
  await page.locator('.sidebar-cli-sessions .thread-row').first().click();await page.locator('.thread-header').waitFor();
  await page.evaluate(([i,t])=>sufficeDesktop.sessions.send(i,t),[sid,'/bash']);
  await page.locator('.composer-approval:not([hidden])').waitFor({timeout:30000});
  await page.locator('.thread-row[data-thread=f2]').click();
  await page.waitForFunction(()=>document.querySelector('.sidebar-cli-sessions .thread-row')?.dataset.status!=='working'&&['approval','input'].includes(document.querySelector('.sidebar-cli-sessions .thread-row').dataset.status),null,{timeout:20000}).catch(async e=>{throw new Error(e.message+' status='+await page.evaluate(()=>[...document.querySelectorAll('.sidebar-cli-sessions .thread-row')].map(r=>r.dataset.status))+' state='+await page.evaluate(i=>JSON.stringify(sufficeDesktop.sessions.state?.(i)),sid));});
  await expectCount(3);
  await page.locator('.needs-nav').click();await page.locator('.needs-view').waitFor({state:'visible'});
  const sessionRow=page.locator(`.needs-row[data-key=session-${sid}]`);assert.equal(await sessionRow.count(),1);
  assert.deepEqual(await sessionRow.locator('.needs-act').allInnerTexts(),['Approve','Deny','Open']);
  // only the digest entry reads as selected while it is open
  assert.equal(await page.locator('.thread-row[aria-pressed=true]').count(),0);
  await both('with-session');
  await sessionRow.locator('.needs-act[data-act=open]').click();
  await page.locator('.needs-view').waitFor({state:'hidden'});await page.locator('.composer-approval:not([hidden])').waitFor();

  // empty state
  await app.evaluate(()=>{globalThis.threads.length=0;});await emit({event:'history_changed'});
  await page.evaluate(i=>sufficeDesktop.sessions.stop(i),sid);await expectCount(0);
  assert.equal(await nav.locator('.needs-count').isHidden(),true);
  await nav.click();await page.locator('.needs-empty').waitFor();
  assert.equal(await page.locator('.needs-empty-title').innerText(),'Nothing needs you');
  await both('empty');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
