// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): Needs you digest actions: approvals raised before load, Retry, Dismiss/resurface,
// the Cmd+K command, selection state, and a live CLI session approved from the digest. Private tmux socket only.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {guard,killTmux} from './electron-guard.mjs';

test('needs you actions: pre-load approval, retry, dismiss resurfaces, command menu, session approve',{timeout:240000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-needs-act-'))),SOCKET=`sfx-feat-needs-you-act-${process.pid}`;
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{PI_OFFLINE:'1',SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,
  SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('apps/desktop/test/sessions-approval-agent.mjs')});
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),`--user-data-dir=${data}`],env});
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.composer').waitFor();
  const now=Date.now();
  await app.evaluate(({ipcMain,BrowserWindow},now)=>{
   globalThis.answers=[];globalThis.runs=[];
   globalThis.threads=[
    {id:'pl1',title:'Release the 2.4 build',project:'Halo Pay',provider:'anthropic',status:'approval',modified:now-60000},
    {id:'t1',title:'Rate limit the public API',project:'Forge API',provider:'openai',status:'done',modified:now-300000}];
   const send=ev=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',ev);
   for(const a of ['threads','thread','approval-answer','run'])ipcMain.removeHandler('suffice:'+a);
   ipcMain.handle('suffice:threads',()=>globalThis.threads);
   // pl1's request was raised before the page loaded: only the running thread's snapshot knows it
   ipcMain.handle('suffice:thread',(_e,id)=>id==='pl1'?{id,title:'Release the 2.4 build',messages:[],running:true,runtime:{approvals:[{event:'approval',threadId:'pl1',requestId:11,name:'bash',input:{command:'make release'}}]}}:{id,title:globalThis.threads.find(t=>t.id===id)?.title||id,cwd:process.cwd(),messages:[],running:false});
   ipcMain.handle('suffice:approval-answer',(_e,payload)=>{globalThis.answers.push(payload);const t=globalThis.threads.find(t=>t.id===payload.threadId);if(t)t.status='working';send({event:'history_changed'});return true;});
   // first run of t1 fails, the retry stays running
   ipcMain.handle('suffice:run',(_e,payload)=>{globalThis.runs.push(payload.prompt);if(globalThis.runs.length===1)return Promise.reject(new Error('Task stopped by provider'));return new Promise(()=>{});});
   globalThis.emit=send;
  },now);
  await page.reload();await page.locator('.thread-row').last().waitFor();
  const nav=page.locator('.needs-nav');
  const expectCount=async n=>{await page.waitForFunction(n=>document.querySelector('.needs-nav .needs-count').textContent===String(n),n);};
  const emit=ev=>app.evaluate((_a,ev)=>globalThis.emit(ev),ev);
  const rowActs=key=>page.locator(`.needs-row[data-key=${key}] .needs-act`).allInnerTexts();

  // t1 fails through the real composer path, so it has canRetry
  await page.locator('.thread-row[data-thread=t1]').click();await page.locator('.thread-header').waitFor();
  await page.locator('#prompt').fill('limit the public api');await page.locator('.composer').evaluate(el=>el.requestSubmit());
  await page.locator('.thread-run-error').waitFor();
  await expectCount(2);

  // the digest clears the selected thread row; Escape puts it back
  assert.equal(await page.locator('.thread-row[data-thread=t1]').getAttribute('aria-pressed'),'true');
  await nav.click();await page.locator('.needs-view').waitFor({state:'visible'});
  assert.equal(await page.locator('.thread-row[aria-pressed=true]').count(),0);
  assert.equal(await nav.getAttribute('aria-current'),'page');
  await page.keyboard.press('Escape');await page.locator('.needs-view').waitFor({state:'hidden'});
  assert.equal(await page.locator('.thread-row[data-thread=t1]').getAttribute('aria-pressed'),'true');

  // Dismiss survives a re-render and resurfaces when record.modified changes
  await nav.click();
  await page.waitForFunction(()=>document.querySelector('.needs-row[data-key=pl1] .needs-act[data-act=approve]'));
  assert.deepEqual(await rowActs('t1'),['Retry','Open','Dismiss']);
  await page.locator('.needs-row[data-key=t1] .needs-act[data-act=dismiss]').click();await expectCount(1);
  await emit({event:'history_changed'});await page.waitForTimeout(400);
  await expectCount(1);assert.equal(await page.locator('.needs-row[data-key=t1]').count(),0);
  await app.evaluate(()=>{globalThis.threads.find(t=>t.id==='t1').modified=Date.now()+5000;});await emit({event:'history_changed'});
  await expectCount(2);await page.locator('.needs-row[data-key=t1]').waitFor();

  // an approval raised before load still resolves with one click
  assert.deepEqual(await rowActs('pl1'),['Approve','Deny','Open']);
  assert.match(await page.locator('.needs-row[data-key=pl1] .needs-why').innerText(),/make release/);
  await page.locator('.needs-row[data-key=pl1] .needs-act[data-act=approve]').click();
  await expectCount(1);
  assert.deepEqual(await app.evaluate(()=>globalThis.answers),[{threadId:'pl1',requestId:11,allow:true}]);

  // Retry, reached from the Cmd+K command menu: the run restarts and the digest closes
  await page.keyboard.press('Escape');await page.locator('.needs-view').waitFor({state:'hidden'});
  await page.keyboard.press('Control+k');await page.locator('.spotlight[open]').waitFor();
  await page.locator('.spotlight input').fill('Needs you');
  await page.locator('.spotlight [data-result=needs-you]').click();
  await page.locator('.needs-view').waitFor({state:'visible'});
  await page.locator('.needs-row[data-key=t1] .needs-act[data-act=retry]').click();
  await page.locator('.needs-view').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('.composer').dataset.running==='true');
  assert.deepEqual(await app.evaluate(()=>globalThis.runs),['limit the public api','limit the public api']);

  // a live CLI session waiting on a permission: Approve answers the prompt itself
  await page.evaluate(p=>sufficeDesktop.sessions.start({agent:'fakeclaude',cwd:p}),project);
  await page.reload();await page.locator('.sidebar-cli-sessions .thread-row').first().waitFor();
  const sid=await page.evaluate(async()=>(await sufficeDesktop.sessions.list()).at(-1).id);
  await page.locator('.sidebar-cli-sessions .thread-row').first().click();await page.locator('.thread-header').waitFor();
  await page.evaluate(([i,t])=>sufficeDesktop.sessions.send(i,t),[sid,'/bash']);
  await page.locator('.composer-approval:not([hidden])').waitFor({timeout:30000});
  await page.locator('.thread-row[data-thread=pl1]').click();
  const key=`session-${sid}`;
  await page.waitForFunction(()=>document.querySelector('.sidebar-cli-sessions .thread-row')?.dataset.status==='approval'||document.querySelector('.sidebar-cli-sessions .thread-row')?.dataset.status==='input',null,{timeout:30000}).catch(async e=>{throw new Error(e.message+' status='+await page.evaluate(()=>[...document.querySelectorAll('.sidebar-cli-sessions .thread-row')].map(r=>r.dataset.status)));});
  await nav.click();await page.locator(`.needs-row[data-key=${key}] .needs-act[data-act=approve]`).waitFor({timeout:30000});
  assert.deepEqual(await rowActs(key),['Approve','Deny','Open']);
  await page.locator(`.needs-row[data-key=${key}] .needs-act[data-act=approve]`).click();
  await page.locator(`.needs-row[data-key=${key}]`).waitFor({state:'detached',timeout:30000});
  assert.deepEqual(errors,[]);
 }finally{await app.close();killTmux(SOCKET);}
});
