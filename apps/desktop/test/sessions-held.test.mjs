// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): a first message held while the CLI boots shows as pending (aria-busy); a CLI that exits before ready hands the text back within seconds, to its own session only.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const SOCKET='sfx-r2-sessions-held',appDir=resolve(process.env.APP_DIR||'apps/desktop'),shots=resolve(process.env.SHOT_DIR||tmpdir()+'/sfx-held-shots');


for(const away of [false,true])test(`held first message: pending, then handed back on CLI exit (${away?'after leaving the session':'in the session'})`,{timeout:120000},async()=>{
 await mkdir(shots,{recursive:true});
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-held-')));
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),
  SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('apps/desktop/test/sessions-trust-agent.mjs'),SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,BOOT_MS:'600000',EXIT_MS:'2500'});
 const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',appDir,`--user-data-dir=${data}`],env});
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.locator('[data-action="send-menu"]').waitFor();
  await page.evaluate(()=>{document.querySelector('.composer').modelSelection={provider:'cli',model:'fakeclaude'};});
  await page.locator('#prompt').fill('Add a retry to the uploader');
  await page.locator('.send-button').click();
  const held=page.locator('.thread-user[aria-busy="true"]');
  await held.waitFor();
  assert.match(await held.getAttribute('class'),/thread-pending/);
  await page.waitForTimeout(500);
  await page.screenshot({path:resolve(shots,`held-pending-${away}.png`)});
  if(away){await page.locator('.new-session').click();await page.locator('#prompt').waitFor();}
  const t0=Date.now();
  await page.waitForFunction(()=>/did not|exited/.test(document.querySelector('.toast')?.textContent||''),null,{timeout:15000});
  assert.ok(Date.now()-t0<9000,'exit is detected well before the 45 s timeout');
  await page.screenshot({path:resolve(shots,`held-handback-${away}.png`)});
  const val=await page.locator('#prompt').inputValue();
  if(away){
   assert.equal(val,'','text is not written into another view\'s composer');
   assert.match(await page.locator('.toast').textContent(),/Add a retry/,'toast names the session');
   await page.locator('.session-row--sidebar').first().click();
   await page.waitForFunction(()=>document.querySelector('#prompt')?.value==='Add a retry to the uploader');
  }else assert.equal(val,'Add a retry to the uploader');
  assert.deepEqual(errors,[]);
 }finally{
  await app.close().catch(()=>{});
  try{execFileSync('tmux',['-L',SOCKET,'kill-server'],{stdio:'ignore'});}catch{}
  await rm(tmp,{recursive:true,force:true});
 }
});
