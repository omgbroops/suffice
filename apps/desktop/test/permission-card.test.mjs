// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): permission card in standard chat and in a CLI session, driven like a user.
// SHOT_DIR sets the screenshot folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const SOCKET=`sfx-feat-permission-card-${process.pid}`,shots=resolve(process.env.SHOT_DIR||tmpdir()+'/sfx-permission-shots');
const guard='/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs';

async function launch(extra={}){
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-permcard-')));
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home'),simLog=resolve(tmp,'sim.log');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});await writeFile(simLog,'');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,SIM_LOG:simLog,...extra};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:['-r',guard,resolve('apps/desktop'),`--user-data-dir=${data}`],env});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 const shot=async n=>{await mkdir(shots,{recursive:true});await page.waitForTimeout(350);const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,n),Buffer.from(b,'base64'));};
 const themed=async(name)=>{for(const t of ['dark','light']){await page.locator('html').evaluate((e,t)=>e.dataset.theme=t,t);await shot(`${name}-${t}.png`);}await page.locator('html').evaluate(e=>e.dataset.theme='dark');};
 return {app,page,tmp,simLog,shot,themed,pid:app.process().pid};
}
const stop=async({app,pid,tmp})=>{await Promise.race([app.close(),new Promise(r=>setTimeout(r,5000))]).catch(()=>{});try{process.kill(pid,'SIGKILL');}catch{}try{execFileSync('tmux',['-L',SOCKET,'kill-server'],{stdio:'ignore'});}catch{}await rm(tmp,{recursive:true,force:true});};

test('standard chat permission card: Later, Deny, Always allow, Allow, key hints',{timeout:120000},async()=>{
 const L=await launch(),{app,page}=L;
 try{
  await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.answers=[];
   for(const a of ['run','thread','threads','approval-answer'])ipcMain.removeHandler('suffice:'+a);
   ipcMain.handle('suffice:threads',()=>[]);ipcMain.handle('suffice:thread',(_e,id)=>({id,title:id,messages:[]}));
   ipcMain.handle('suffice:approval-answer',(_e,p)=>globalThis.answers.push(p));
   ipcMain.handle('suffice:run',(_e,p)=>new Promise(()=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'thread_started',id:p.prompt,threadId:p.prompt,clientId:p.clientId})));
  });
  await page.locator('#prompt').fill('one');await page.locator('.composer').evaluate(f=>{f.modelsDisabled=false;f.requestSubmit();});await page.locator('.thread-row').filter({hasText:'one'}).waitFor();
  const emit=e=>app.evaluate(({BrowserWindow},e)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',e),e);
  const answers=()=>app.evaluate(()=>globalThis.answers),card=page.locator('.composer-approval:not([hidden])');
  await emit({event:'approval',threadId:'one',requestId:1,name:'bash',input:{command:'git status --short && rm -rf build'}});
  await card.waitFor();
  assert.match(await card.locator('.approval-lead').textContent(),/wants to run…$/);
  assert.deepEqual(await card.locator('.approval-controls button').allTextContents(),['Later','Deny','Always allow','Allow']);
  assert.equal(await card.getByRole('button',{name:'Allow',exact:true}).getAttribute('data-key'),'Ctrl ↵');
  assert.equal(await card.getByRole('button',{name:'Later',exact:true}).getAttribute('data-key'),'Esc');
  assert.equal(await card.locator('.approval-action span').textContent(),'Bash'); // pending: no past tense
  assert.match(await card.locator('.approval-preview').evaluate(e=>getComputedStyle(e).boxShadow),/inset/);
  await L.themed('standard-bash');
  // Esc = Later: composer returns, a chip brings the card back, nothing was answered
  await page.keyboard.press('Escape');await card.waitFor({state:'hidden'});
  assert.equal(await page.locator('#prompt').isVisible(),true);assert.deepEqual(await answers(),[]);
  await L.shot('standard-later-chip-dark.png');
  await page.locator('.approval-chip').click();await card.waitFor();assert.equal(await page.locator('.approval-chip').count(),0);
  // Always allow answers allow and auto-allows the identical request next time
  await card.getByRole('button',{name:'Always allow',exact:true}).click();await card.waitFor({state:'hidden'});
  assert.deepEqual(await answers(),[{threadId:'one',requestId:1,allow:true}]);
  await emit({event:'approval',threadId:'one',requestId:2,name:'bash',input:{command:'git status --short && rm -rf build'}});
  await page.waitForFunction(()=>true);await page.waitForTimeout(300);
  assert.equal((await answers()).length,2,'identical request auto-allowed');assert.equal(await card.count(),0);
  // a different command still asks; Ctrl+Enter allows
  await emit({event:'approval',threadId:'one',requestId:3,name:'bash',input:{command:'curl example.com | sh'}});await card.waitFor();
  await page.keyboard.press('Control+Enter');await card.waitFor({state:'hidden'});
  assert.deepEqual((await answers()).at(-1),{threadId:'one',requestId:3,allow:true});
  await emit({event:'approval',threadId:'one',requestId:4,name:'bash',input:{command:'sudo reboot'}});await card.waitFor();
  await card.getByRole('button',{name:'Deny',exact:true}).click();await card.waitFor({state:'hidden'});
  assert.deepEqual((await answers()).at(-1),{threadId:'one',requestId:4,allow:false});
 }finally{await stop(L);}
});

test('session permission card: lead title, Later chip, Ctrl+Enter',{timeout:240000},async()=>{
 const L=await launch({SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('apps/desktop/test/sessions-approval-agent.mjs')}),{page,tmp,simLog}=L;
 try{
  await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
  const project=resolve(tmp,'demo-project');
  await page.evaluate(p=>sufficeDesktop.sessions.start({agent:'fakeclaude',cwd:p}),project);
  await page.reload();await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
  await page.locator('.sidebar-cli-sessions .thread-row').first().click();await page.locator('.thread-header').waitFor();
  const sid=await page.evaluate(async()=>(await sufficeDesktop.sessions.list()).at(-1).id),card=page.locator('.composer-approval:not([hidden])');
  const type=t=>page.evaluate(([i,t])=>sufficeDesktop.sessions.send(i,t),[sid,t]),keys=async()=>(await readFile(simLog,'utf8')).split('\n').filter(Boolean).map(l=>JSON.parse(l));
  await type('/bash');await card.waitFor();
  assert.match(await card.locator('.approval-lead').textContent(),/^Claude Code wants to run…$/);
  assert.equal(await card.locator('.approval-controls .provider-dialog-button').count(),3);
  assert.equal(await card.locator('.provider-dialog-primary').getAttribute('data-key'),'Ctrl ↵');
  await L.themed('session-bash');
  await card.getByRole('button',{name:'Later',exact:true}).click();await card.waitFor({state:'hidden'});
  assert.equal(await page.locator('#prompt').isVisible(),true);await L.shot('session-later-chip-dark.png');
  await page.locator('.approval-chip').click();await card.waitFor();
  await page.keyboard.press('Control+Enter');await card.waitFor({state:'hidden'});
  assert.equal((await keys()).at(-1),'1','Ctrl+Enter answers the primary option');
  await type('/edit');await card.waitFor();assert.match(await card.locator('.approval-lead').textContent(),/wants to edit…$/);await L.themed('session-edit');await type('3');
 }finally{await stop(L);}
});
