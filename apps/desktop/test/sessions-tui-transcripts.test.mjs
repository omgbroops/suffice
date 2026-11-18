import electronPath from 'electron';
// Hidden: real subagent tracker cards + slash menu from the real catalog, dark and light. SHOTS=<dir> writes PNGs.
// SHOTS=<dir> also writes PNGs (webContents.capturePage, 1440x900).
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const KEY='tui-transcripts',SOCK=`sfx-r2-${KEY}-${process.pid}`,SHOTS=process.env.SHOTS;if(SHOTS)await mkdir(SHOTS,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-sess-tr-')));
const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:SOCK,SUFFICE_HISTORY_HOME:home,
 SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs'),
 NODE_PATH:process.env.NODE_PATH||'/Users/abhayg/suffice-desktop-wt/voice/node_modules'});
const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 const shot=async n=>{if(!SHOTS)return;const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(SHOTS,n),Buffer.from(b,'base64'));};
 await page.locator('[data-action="send-menu"]').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 const cwd=await app.evaluate(()=>process.env.SUFFICE_START_PROJECT);await page.evaluate(([a,p])=>sufficeDesktop.sessions.start({agent:a,cwd:p}),['fakeclaude',cwd]);await page.reload();await page.locator('[data-action="send-menu"]').waitFor();await page.locator('.sidebar-cli-sessions .thread-row').first().click();
 await page.locator('.composer-approval:not([hidden])').waitFor({timeout:20000});
 await page.locator('.composer-approval button',{hasText:/^\s*(1\.\s*)?Yes\s*$/}).first().click();
 await page.waitForFunction(()=>!document.querySelector('.thread-messages > .thread-status'),null,{timeout:20000});await page.waitForTimeout(700);
 const T='.thread-messages';
 for(const theme of ['dark','light']){
  await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(300);
  // subagent cards come from the real tracker: parallel agents, one finished with a nested child
  const subs=page.locator(`${T} .session-sub`);assert.ok(await subs.count()>=2);
  await page.locator(`${T} > details.thread-activity:has(.session-sub)`).evaluateAll(l=>l.forEach(d=>{d.open=true;}));
  await subs.nth(0).evaluate(e=>e.scrollIntoView({block:'center'}));
  if(!await subs.nth(0).evaluate(e=>e.open))await subs.nth(0).locator('> summary').click();await page.waitForTimeout(400);
  assert.ok(await subs.nth(0).locator('details.tool-widget').count()>=1,'child tool rows from the child transcript');
  await shot(`${theme}-subagent-cards.png`);
  // slash menu: real command catalog, filter, keyboard pick, Escape
  await page.locator('#prompt').fill('');await page.locator('#prompt').click();await page.keyboard.type('/');
  const items=page.locator('.slash-menu .menu-item');await items.first().waitFor();const all=await items.count();assert.ok(all>3,'catalog commands: '+all);
  await shot(`${theme}-slash-menu.png`);
  await page.keyboard.type('mo');await page.waitForTimeout(250);const some=await items.count();assert.ok(some>=1&&some<all,`filter ${all}->${some}`);
  const first=(await items.first().locator('.menu-label,:scope').first().textContent()).trim();assert.ok(first.startsWith('/'),first);
  await page.keyboard.press('Enter');await page.waitForTimeout(250);assert.match(await page.locator('#prompt').inputValue(),/^\/\S+ $/,'pick fills the command');
  await page.locator('#prompt').fill('');await page.keyboard.type('/');await items.first().waitFor();await page.keyboard.press('Escape');await page.waitForTimeout(250);
  assert.equal(await page.locator('.slash-menu:not([hidden])').count(),0,'Escape closes the menu');await page.locator('#prompt').fill('');
 }
 console.log('tui-transcripts OK');
}finally{await app.close().catch(()=>{});try{execFileSync('tmux',['-L',SOCK,'kill-server'],{stdio:'ignore'});}catch{}}
