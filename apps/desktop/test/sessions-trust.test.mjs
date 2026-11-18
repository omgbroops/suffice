// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): the first prompt typed in the composer survives the folder-trust card (fake Claude drops keys until trusted).
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const SOCKET='sfx-r2-sessions',appDir=resolve(process.env.APP_DIR||'apps/desktop'),shots=resolve(process.env.SHOT_DIR||tmpdir()+'/sfx-trust-shots');

for(const BOOT of [0,1500,3000])test(`first prompt survives the trust card (CLI boots in ${BOOT} ms)`,{timeout:120000},async()=>{
 await mkdir(shots,{recursive:true});
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-trust-')));
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home'),simLog=resolve(tmp,'sim.log');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 await writeFile(simLog,'');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),
  SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('apps/desktop/test/sessions-trust-agent.mjs'),SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,SIM_LOG:simLog,BOOT_MS:String(BOOT)});
 const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',appDir,`--user-data-dir=${data}`],env});
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.locator('[data-action="send-menu"]').waitFor();
  await page.evaluate(()=>{document.querySelector('.composer').modelSelection={provider:'cli',model:'fakeclaude'};});
  assert.equal(await page.locator('.composer-approval').count(),0,'no approval section in the DOM while nothing is pending');
  await page.locator('#prompt').fill('Add a retry to the uploader');
  await page.locator('.send-button').click();
  await page.locator('.composer-approval .approval-controls button').first().waitFor({timeout:20000});
  await page.screenshot({path:resolve(shots,`01-trust-card-${BOOT}.png`)});
  assert.equal(await page.locator('#prompt').inputValue(),'','prompt is not handed back to the composer');
  await page.locator('.composer-approval button').first().click();
  await page.waitForFunction(()=>!document.querySelector('.composer-approval'),null,{timeout:15000});
  const deadline=Date.now()+15000;let got='';
  while(Date.now()<deadline){got=await readFile(simLog,'utf8');if(got.includes('PROMPT:'))break;await page.waitForTimeout(250);}
  await page.screenshot({path:resolve(shots,`02-after-trust-${BOOT}.png`)});
  assert.match(got,/PROMPT:Add a retry to the uploader/,'agent received the first prompt after trust');
  assert.equal(await page.locator('#prompt').inputValue(),'');
  assert.deepEqual(errors,[]);
 }finally{
  await app.close().catch(()=>{});
  try{execFileSync('tmux',['-L',SOCKET,'kill-server'],{stdio:'ignore'});}catch{}
  await rm(tmp,{recursive:true,force:true});
 }
});
