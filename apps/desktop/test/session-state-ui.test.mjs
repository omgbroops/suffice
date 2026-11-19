// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): classifier state chips on session rows and the terminal tab, real backend + private tmux socket.
// SHOT_DIR saves dark+light screenshots at 1440x900.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import './electron-guard.mjs';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const SOCKET=`sfx-fl2-session-state-${process.pid}`,shots=process.env.SHOT_DIR;

test('session state chips follow the classifier',{timeout:240000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-sstate-')));
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),
  SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_STATE_AGENT:resolve('apps/desktop/test/session-state-agent.mjs'),SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home});
 const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  assert.equal(await app.evaluate(()=>process.env.SUFFICE_SESSIONS_SOCKET),SOCKET);
  await page.locator('.composer').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  const shot=async n=>{if(!shots)return;await mkdir(shots,{recursive:true});await page.waitForTimeout(350);const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,n),Buffer.from(b,'base64'));};
  const a=await page.evaluate(p=>sufficeDesktop.sessions.start({agent:'claude',cwd:p}),project);
  await page.waitForTimeout(500);
  const b=await page.evaluate(p=>sufficeDesktop.sessions.start({agent:'claude',cwd:p}),project);
  await page.reload();await page.locator('.composer').waitFor().catch(e=>{throw new Error(e.message+' errors='+JSON.stringify(errors));});
  const rows=page.locator('.sidebar-cli-sessions .thread-row');await page.waitForFunction(()=>document.querySelectorAll('.sidebar-cli-sessions .thread-row').length===2);
  const chips=()=>page.evaluate(()=>[...document.querySelectorAll('.sidebar-cli-sessions .thread-row')].map(r=>({s:r.querySelector('.session-state-chip')?.dataset.state,t:r.querySelector('.session-state-chip')?.textContent,r:getComputedStyle(r.querySelector('.session-state-mark')).borderRadius,old:getComputedStyle(r.querySelector('.thread-state')).display})));
  const send=(id,t)=>page.evaluate(([i,x])=>sufficeDesktop.sessions.send(i,x),[id,t]);
  const want=async(n,s)=>page.waitForFunction(([n,s])=>document.querySelectorAll('.sidebar-cli-sessions .session-state-chip')[n]?.dataset.state===s,[n,s],{timeout:20000}).catch(async()=>{throw new Error(`row ${n} never reached ${s}: ${JSON.stringify(await chips())}`);});
  // Row order is by activity; find which row is which through the click target instead of position.
  console.log('started');await send(a.id,'work');await send(b.id,'bash');
  await page.waitForFunction(()=>{const s=[...document.querySelectorAll('.sidebar-cli-sessions .session-state-chip')].map(c=>c.dataset.state).sort().join();return s==='blocked,working';},null,{timeout:25000}).catch(async()=>{throw new Error('working+blocked missing: '+JSON.stringify(await chips()));});
  for(const c of await chips()){assert.match(c.r,/^2px/,'rounded rectangle, not a dot');assert.equal(c.old,'none','old icon hidden: one indicator per row');}
  const labels=await chips();assert.deepEqual(labels.map(c=>c.t).sort(),['Blocked','Working']);
  console.log('rows ok',JSON.stringify(labels));
  // Blocked row: answer through the product path, row leaves blocked.
  for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;document.querySelector('.desktop-app')?.setAttribute('data-theme',t);},theme);await shot(`rows-${theme}.png`);}
  await send(b.id,'ok');
  await page.waitForFunction(()=>[...document.querySelectorAll('.sidebar-cli-sessions .session-state-chip')].some(c=>c.dataset.state==='idle'||c.dataset.state==='waiting'),null,{timeout:25000}).catch(async()=>{throw new Error('blocked never cleared: '+JSON.stringify(await chips()));});
  console.log('cleared');
  // Terminal tab: open the working session in terminal mode; the tab carries the same chip.
  await page.evaluate(id=>[...document.querySelectorAll('.sidebar-cli-sessions .thread-row')].find(r=>r.title&&false),a.id);
  const workingRow=page.locator('.sidebar-cli-sessions .thread-row:has(.session-state-chip[data-state="working"])').first();await workingRow.click();
  await page.locator('.session-mode-toggle').click();
  const tab=page.locator('.session-term-tabs [role=tab]');await tab.waitFor();
  assert.equal(await tab.locator('.session-state-chip').getAttribute('data-state'),'working');
  assert.match(await tab.getAttribute('aria-label'),/Working/);
  for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;document.querySelector('.desktop-app')?.setAttribute('data-theme',t);},theme);await shot(`terminal-tab-${theme}.png`);}
  // Reachable and uncovered: the tab centre hit-tests to itself.
  const hit=await tab.evaluate(t=>{const r=t.getBoundingClientRect(),e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return t.contains(e);});assert.ok(hit,'terminal tab not covered');
  // State change reaches the tab live: send a prompt dialog to this session.
  await send(a.id,'bash');
  await page.waitForFunction(()=>document.querySelector('.session-term-tab .session-state-chip')?.dataset.state==='blocked',null,{timeout:25000});
  // Esc declines the Bash prompt: the chip must leave Blocked and settle (the fake agent writes no tool_result for a declined call).
  await page.locator('.xterm-helper-textarea').first().focus();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>['waiting','idle'].includes(document.querySelector('.session-term-tab .session-state-chip')?.dataset.state),null,{timeout:20000}).catch(async()=>{throw new Error('Esc decline never settled: '+JSON.stringify(await chips()));});
  console.log('esc settled');
  // Error screen -> Blocked (failed).
  await send(a.id,'error');
  await page.waitForFunction(()=>document.querySelector('.session-term-tab .session-state-chip')?.dataset.state==='blocked',null,{timeout:20000}).catch(async()=>{throw new Error('error screen never Blocked: '+JSON.stringify(await chips()));});
  console.log('error blocked');
  // Agent exits with code 0: session ends; the row must not stay Working/Blocked (every remaining chip Idle).
  await send(a.id,'quit');
  await page.waitForFunction(()=>{const cs=[...document.querySelectorAll('.sidebar-cli-sessions .session-state-chip')].map(c=>c.dataset.state);return cs.every(s=>s==='idle');},null,{timeout:20000}).catch(async()=>{throw new Error("exit not reflected: "+JSON.stringify(await chips()));});
  console.log('exit reflected',JSON.stringify(await chips()));
  assert.deepEqual(errors,[]);
 }finally{
  await app.close().catch(()=>{});
  try{execFileSync('tmux',['-L',SOCKET,'kill-server'],{stdio:'ignore'});}catch{}
  await rm(tmp,{recursive:true,force:true});
 }
});
