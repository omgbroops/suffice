import electronPath from 'electron';
// Hidden check of the watchdog chip on agent messages in a CLI-session transcript (fake Claude agent, private tmux socket).
// SHOTS=<dir> writes dark+light PNGs (webContents.capturePage, 1440x900).
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const SOCK=`sfx-fr-wdlong-${process.pid}`,SHOTS=process.env.SHOTS;if(SHOTS)await mkdir(SHOTS,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-fr-wd-')));
const project=resolve(tmp,'long-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:SOCK,SUFFICE_HISTORY_HOME:home,
 SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-long-claims.mjs'),
 NODE_PATH:process.env.NODE_PATH||resolve('node_modules')});
const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 const shot=async n=>{if(!SHOTS)return;const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(SHOTS,n),Buffer.from(b,'base64'));};
 await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 const cwd=await app.evaluate(()=>process.env.SUFFICE_START_PROJECT);await page.evaluate(([a,p])=>sufficeDesktop.sessions.start({agent:a,cwd:p}),['fakeclaude',cwd]);await page.reload();await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
 await page.getByText('Turn 1: update file_1.js').first().click();
 const chips=page.locator('.thread-messages .claim-chip');
 await page.waitForFunction(()=>document.querySelectorAll('.thread-messages .thread-assistant').length>=60,null,{timeout:60000});
 await page.waitForTimeout(2500);
 // scroll through the thread: markdown windowing unrenders and re-renders messages, the chip must survive both
 for(const top of [0,1e6,0])await page.locator('.thread-messages').evaluate((e,t)=>{e.parentElement.scrollTop=t;},top).then(()=>page.waitForTimeout(1500));
 assert.equal(await chips.count(),60,'every agent message keeps its chip');
 await chips.nth(30).hover();await page.waitForTimeout(250);
 assert.equal(await page.locator('body > .claim-detail').count(),1,'hover after scroll shows detail');
 console.log('watchdog-long OK');
}finally{await app.close().catch(()=>{});try{execFileSync('tmux',['-L',SOCK,'kill-server'],{stdio:'ignore'});}catch{}}
