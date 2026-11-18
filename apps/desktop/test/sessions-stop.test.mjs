// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): after Stop from the row menu no send targets the dead pane, and sessions.send on a stopped id rejects with the plain 'Session ended'.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const SOCKET='sfx-forge-r2-sessions-stop-'+process.pid,appDir=resolve(process.env.APP_DIR||'apps/desktop');

async function launch(tmp,extra={}){
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home'),simLog=resolve(tmp,'sim.log');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 await writeFile(simLog,'');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),
  SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('apps/desktop/test/sessions-trust-agent.mjs'),SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,SIM_LOG:simLog,BOOT_MS:'0',...extra});
 const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',appDir,`--user-data-dir=${data}`],env});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
 await page.evaluate(()=>{document.querySelector('.composer').modelSelection={provider:'cli',model:'fakeclaude'};});
 return {app,page,simLog};
}
const trust=async page=>{await page.locator('.composer-approval .approval-controls button').first().waitFor({timeout:20000});await page.locator('.composer-approval .provider-dialog-primary').click();await page.waitForFunction(()=>!document.querySelector('.composer-approval'),null,{timeout:15000});};

test('Stop from the row menu, then typing, starts one fresh session and never sends to the dead pane',{timeout:120000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-stop-')));
 const {app,page}=await launch(tmp),logs=[];
 page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(e.message));
 try{
  await page.locator('#prompt').fill('first prompt');await page.locator('.send-button').click();
  await trust(page);
  await page.locator('.session-row--sidebar').first().waitFor();
  await page.locator('.session-row--sidebar').first().click({button:'right'});
  await page.locator('[data-menu-action="session:stop"]').click();
  await page.locator('.thread-delete-dialog [data-stop]').click();
  await page.waitForFunction(()=>!document.querySelector('.session-row--sidebar'));
  await page.locator('#prompt').fill('typed-after-stop');await page.keyboard.press('Enter');
  await page.locator('.session-row--sidebar').first().waitFor();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('.session-row--sidebar').count(),1,'exactly one new session row');
  const toasts=await page.locator('.toast').allTextContents();
  assert.deepEqual([...logs,...toasts].filter(t=>/tmux send-keys failed|can't find pane/.test(t)),[]);
 }finally{
  await app.close().catch(()=>{});
  try{execFileSync('tmux',['-L',SOCKET,'kill-server'],{stdio:'ignore'});}catch{}
  await rm(tmp,{recursive:true,force:true});
 }
});

test('sessions.send on a stopped session rejects with Session ended',{timeout:120000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-stop2-')));
 const {app,page}=await launch(tmp);
 try{
  await page.locator('#prompt').fill('first prompt');await page.locator('.send-button').click();
  await trust(page);
  const r=await page.evaluate(async()=>{const sx=window.sufficeDesktop.sessions;const [s]=await sx.list();await sx.stop(s.id);
   try{await sx.send(s.id,'x');return 'resolved';}catch(e){return e.message;}}); // control() on a stopped id is already the plain 'Unknown session'
  assert.match(r,/Session ended/);assert.doesNotMatch(r,/tmux|can't find pane/);
 }finally{
  await app.close().catch(()=>{});
  try{execFileSync('tmux',['-L',SOCKET,'kill-server'],{stdio:'ignore'});}catch{}
  await rm(tmp,{recursive:true,force:true});
 }
});
