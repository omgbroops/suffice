// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): sidebar rows only select for the current view; the thread meta line never wraps; Needs-you accent only on the primary action.
// SHOT_DIR sets the screenshot folder. Private tmux socket only; the live "suffice" socket is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {guard} from './electron-guard.mjs';
test('final UI fixes: sidebar selection, meta line, needs-you accent',{timeout:240000},async()=>{
 const shots=resolve(process.env.SHOT_DIR||'/Users/abhayg/suffice-desktop-wt/ui-shots/forge/final/fix-ui');await mkdir(shots,{recursive:true});
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-finalui-'))),SOCKET=`sfx-fix-final-ui-${process.pid}`;
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
  const rows={new:'.new-session',tasks:'.sidebar-tasks',needs:'.needs-nav',issues:'.issues-nav'};
  const bg=async key=>{await page.mouse.move(1000,880);await page.waitForTimeout(250);return page.locator(rows[key]).evaluate(e=>getComputedStyle(e).backgroundColor);};
  const fails=[];
  // a row is "selected" when its fill differs from the Issues row, which is never the current view here
  const check=async(label,active)=>{const base=await bg('issues');for(const k of ['tasks','needs']){const sel=(await bg(k))!==base;if(sel!==active.includes(k))fails.push(`${label}: ${k} row selected=${sel}`);}};
  await emit({event:'approval',threadId:'ap1',requestId:7,name:'bash',input:{command:'rm -rf build && npm run build'}});
  await shot('a-start','dark');await check('start',[]);
  await shot('a-start','light');
  await page.locator(rows.needs).click();await page.locator('.needs-view').waitFor({state:'visible'});
  await shot('b-needs-you','dark');await check('needs-you',['needs']);await shot('b-needs-you','light');
  const blue=await page.evaluate(()=>{const p=document.createElement('i');p.style.color='var(--blue)';document.body.append(p);const c=getComputedStyle(p).color;p.remove();return c;});
  const prim=await page.evaluate(()=>[...document.querySelectorAll('.needs-row')].map(r=>[...r.querySelectorAll('.needs-act')].filter(b=>b.classList.contains('needs-act--primary')).map(b=>b.textContent)));
  const accented=await page.evaluate(b=>[...document.querySelectorAll('.needs-act')].filter(x=>getComputedStyle(x).backgroundColor===b).map(x=>x.textContent),blue);
  if(JSON.stringify(prim)!==JSON.stringify([['Approve'],['Open'],[],[]]))fails.push('needs primaries '+JSON.stringify(prim));
  if(accented.join()!=='Approve,Open')fails.push('accent fill on '+accented.join()+' (blue '+blue+')');
  const meta=await page.locator('.thread-row',{hasText:'Audit color tokens'}).locator('.thread-card-title').evaluate(e=>{const h=e.getBoundingClientRect().height,lh=parseFloat(getComputedStyle(e).lineHeight);return {h,lh};});
  if(meta.h>meta.lh+1)fails.push(`row title height ${meta.h} vs one line ${meta.lh}`);
  await page.keyboard.press('Escape');await page.locator('.needs-view').waitFor({state:'hidden'});
  await page.locator(rows.tasks).click();await page.locator('.task-board').waitFor({state:'visible'});
  await shot('c-tasks','dark');await check('tasks',['tasks']);await shot('c-tasks','light');
  assert.deepEqual(fails,[]);
 }finally{await app.close().catch(()=>{});}
});
