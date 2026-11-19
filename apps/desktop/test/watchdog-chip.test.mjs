import electronPath from 'electron';
// Hidden check of the watchdog chip on agent messages in a CLI-session transcript (fake Claude agent, private tmux socket).
// SHOTS=<dir> writes dark+light PNGs (webContents.capturePage, 1440x900).
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const SOCK=`sfx-fr-watchdog-${process.pid}`,SHOTS=process.env.SHOTS;if(SHOTS)await mkdir(SHOTS,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-fr-wd-')));
const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:SOCK,SUFFICE_HISTORY_HOME:home,
 SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-claims.mjs'),
 NODE_PATH:process.env.NODE_PATH||resolve('node_modules')});
const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 const shot=async n=>{if(!SHOTS)return;const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(SHOTS,n),Buffer.from(b,'base64'));};
 await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 const cwd=await app.evaluate(()=>process.env.SUFFICE_START_PROJECT);await page.evaluate(([a,p])=>sufficeDesktop.sessions.start({agent:a,cwd:p}),['fakeclaude',cwd]);await page.reload();await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
 await page.getByText('Fix the greeting and make sure the tests pass').first().click();
 await page.locator('.composer-approval:not([hidden])').waitFor({timeout:20000});await page.waitForTimeout(600);
 const chips=page.locator('.thread-messages .claim-chip');
 // progress: the last claim waits on a running command
 await chips.nth(2).waitFor();
 assert.deepEqual(await chips.evaluateAll(l=>l.map(c=>c.dataset.state)),['verified','failed','checking']);
 assert.match(await chips.nth(2).textContent(),/Checking claims/);
 await chips.nth(2).hover();await page.waitForTimeout(200);await shot('checking-dark.png');
 // approve -> the pending claim resolves to verified
 // hover the checking chip and approve with a DOM click so the pointer stays: the open detail must not outlive the chip
 await chips.nth(2).hover();assert.equal(await page.locator('body > .claim-detail').count(),1);
 await page.locator('.composer-approval button',{hasText:/^\s*(1\.\s*)?Yes\s*$/}).first().evaluate(b=>b.click());
 await page.waitForFunction(()=>document.querySelectorAll('.thread-messages .claim-chip[data-state="checking"]').length===0&&!document.querySelector('.thread-messages > .thread-status'),null,{timeout:20000});
 await page.waitForTimeout(500);
 const states=await chips.evaluateAll(l=>l.map(c=>c.dataset.state));
 assert.equal(states.length,3);
 assert.deepEqual(states,['verified','failed','verified']);
 await page.mouse.move(5,5);await page.waitForTimeout(200);assert.equal(await page.locator('body > .claim-detail').count(),0,'stale detail after re-render');
 // screen readers get the reason through aria-describedby
 assert.match(await chips.nth(1).evaluate(c=>document.getElementById(c.getAttribute('aria-describedby'))?.textContent||''),/util\.js: no edit or write/);
 // hover detail names the reason, and is opaque and unclipped
 await chips.nth(1).hover();await page.waitForTimeout(250);
 const d=page.locator('body > .claim-detail');assert.equal(await d.isVisible(),true);
 const txt=await d.textContent();assert.match(txt,/no edit or write of util\.js/);assert.match(txt,/last matching command exited 1/);
 const css=await d.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {bg:s.backgroundColor,top:r.top,left:r.left,right:r.right,vw:innerWidth};});
 assert.ok(!/rgba\(.*,\s*0?\.\d+\)$/.test(css.bg)&&css.bg!=='rgba(0, 0, 0, 0)',css.bg);assert.ok(css.top>=0&&css.left>=0&&css.right<=css.vw,JSON.stringify(css));
 await shot('failed-dark.png');
 // keyboard focus shows the same detail
 await page.mouse.move(5,5);await chips.nth(2).focus();await page.waitForTimeout(200);
 assert.equal(await page.locator('body > .claim-detail').isVisible(),true,'focus opens detail');
 assert.match(await page.locator('body > .claim-detail').textContent(),/npm test/);
 await page.locator('.thread-messages').evaluate(e=>{e.parentElement.scrollTop=e.parentElement.scrollHeight;});await shot('verified-dark.png');
 await page.locator('html').evaluate(e=>{e.dataset.theme='light';});await page.waitForTimeout(300);
 await chips.nth(1).hover();await page.waitForTimeout(250);await shot('failed-light.png');
 await chips.nth(2).hover();await page.waitForTimeout(250);await shot('verified-light.png');
 console.log('watchdog-chip OK');
}finally{await app.close().catch(()=>{});try{execFileSync('tmux',['-L',SOCK,'kill-server'],{stdio:'ignore'});}catch{}}
