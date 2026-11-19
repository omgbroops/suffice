import electronPath from 'electron';
// Hidden cancel-mid-run check of the watchdog chip in a CLI-session transcript (fake Claude agent, private tmux socket).
// SHOTS=<dir> writes dark+light PNGs (webContents.capturePage, 1440x900).
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const SOCK=`sfx-f2-watchdog-${process.pid}`,SHOTS=process.env.SHOTS;if(SHOTS)await mkdir(SHOTS,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-fr-wd-')));
const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:SOCK,SUFFICE_HISTORY_HOME:home,
 SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-cancel.mjs'),
 NODE_PATH:process.env.NODE_PATH||resolve('node_modules')});
const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
 const cwd=await app.evaluate(()=>process.env.SUFFICE_START_PROJECT);await page.evaluate(([a,p])=>sufficeDesktop.sessions.start({agent:a,cwd:p}),['fakeclaude',cwd]);await page.reload();await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
 await page.getByText('Run the tests').first().click();
 const chip=page.locator('.thread-messages .claim-chip');
 await chip.waitFor();assert.match(await chip.textContent(),/Checking claims/);
 const stop=page.locator('[aria-label="Stop task"]');await stop.waitFor({timeout:10000});
 await stop.click();
 await page.waitForFunction(()=>!document.querySelector('.thread-messages .claim-chip[data-state="checking"]'),null,{timeout:10000});
 assert.doesNotMatch(await chip.textContent(),/Checking claims/);
 assert.equal(await chip.getAttribute('data-state'),'failed');await chip.hover();assert.match(await page.locator('body > .claim-detail').textContent(),/was stopped before it finished/);
 console.log('watchdog-cancel OK',await chip.evaluate(c=>c.dataset.state+': '+c.textContent));
}finally{await app.close();try{execFileSync('tmux',['-L',SOCK,'kill-server'],{stdio:'ignore'})}catch{}}
