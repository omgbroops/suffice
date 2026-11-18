// Hidden test: sessions user flow on the real backend: composer start, follow-up send, list, Attach in Terminal row item, screenshots dark+light, stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const SOCKET='sfx-fleet-sessions-'+process.pid,appDir=resolve(process.env.APP_DIR||'apps/desktop');

async function launch(tmp,extra={}){
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home'),simLog=resolve(tmp,'sim.log');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 await writeFile(simLog,'');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),
  SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('apps/desktop/test/sessions-trust-agent.mjs'),SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,SIM_LOG:simLog,BOOT_MS:'0',...extra});
 const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',appDir,`--user-data-dir=${data}`],env});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await page.locator('[data-action="send-menu"]').waitFor();
 await page.evaluate(()=>{document.querySelector('.composer').modelSelection={provider:'cli',model:'fakeclaude'};});
 return {app,page,simLog};
}
const trust=async page=>{await page.locator('.composer-approval .approval-controls button').first().waitFor({timeout:20000});await page.locator('.composer-approval .provider-dialog-primary').click();await page.waitForFunction(()=>!document.querySelector('.composer-approval'),null,{timeout:15000});};

const SHOTS='/Users/abhayg/suffice-desktop-wt/ui-shots/fleet/sessions';
test('start from composer, send, list, attach in terminal, stop',{timeout:150000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-fleet-sess-')));
 const {app,page}=await launch(tmp);
 try{
  await mkdir(SHOTS,{recursive:true});await page.setViewportSize({width:1440,height:900});
  await page.locator('#prompt').fill('first prompt');await page.locator('.send-button').click();
  await trust(page);
  const row=page.locator('.session-row--sidebar').first();await row.waitFor();
  const [s]=await page.evaluate(()=>sufficeDesktop.sessions.list());assert.ok(s?.id);
  await page.evaluate(i=>sufficeDesktop.sessions.send(i,'second prompt'),s.id);
  await row.click({button:'right'});
  await page.locator('[data-menu-action="session:attach-terminal"]').waitFor();
  for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.screenshot({path:`${SHOTS}/menu-${theme}.png`});}
  await page.locator('[data-menu-action="session:attach-terminal"]').click();
  await page.locator('.toast',{hasText:/tmux -L .* attach -t/}).waitFor();
  const r=await page.evaluate(i=>sufficeDesktop.sessions.attachTerminal(i),s.id);
  assert.equal(r.opened,false);assert.match(r.command,/^tmux -L sfx-fleet-sessions-\d+ attach -t /);
  await row.click({button:'right'});await page.locator('[data-menu-action="session:stop"]').click();await page.locator('.thread-delete-dialog [data-stop]').click();
  await page.waitForFunction(()=>!document.querySelector('.session-row--sidebar'));
 }finally{
  await app.close().catch(()=>{});
  try{execFileSync('tmux',['-L',SOCKET,'kill-server'],{stdio:'ignore'});}catch{}
  await rm(tmp,{recursive:true,force:true});
 }
});
