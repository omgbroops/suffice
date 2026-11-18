import electronPath from 'electron';
// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1) for the sidebar session rows, row menu, composer start flow and send-options menu.
// Private tmux socket only; the live "suffice" socket is never touched. SHOT_DIR saves screenshots; BASELINE=1 records shots without asserting.
import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {formatThreadTime} from '../src/thread-row.js';

const SOCKET=process.env.SFX_SOCKET||'sfx-test-session-list-start-'+process.pid,BASELINE=process.env.BASELINE==='1',SHOTS=process.env.SHOT_DIR;
const check=(fn)=>{if(!BASELINE)fn();};

test('formatter: now, Nm, Nh Nm, Nd and never three-digit minutes',()=>{
 assert.equal(formatThreadTime(5),'now');assert.equal(formatThreadTime(125*60),'2h 5m');assert.equal(formatThreadTime(120*60),'2h');assert.equal(formatThreadTime(2*86400),'2d');assert.equal(formatThreadTime(59*60),'59m');
 for(const s of [0,59,60,3599,3600,7500,86399,86400,172800,2077*60+53])assert.doesNotMatch(formatThreadTime(s),/\d{3,}m/);
 assert.equal(formatThreadTime(2077*60+53,true),'1d');assert.equal(formatThreadTime(42,true),'42s');
});

test('session list, row menu, start flow and send options',{timeout:180000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-sessions-list-')));
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice');
 for(const d of [project,data,suffice])await mkdir(d,{recursive:true});
 await writeFile(resolve(project,'a.txt'),'x');
 const env={...process.env,FAKE_CLAUDE_TYPED_FIRST:'1'};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',PI_OFFLINE:'1',SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:resolve(tmp,'home'),
  SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs')});
 const app=await _electron.launch({executablePath:electronPath,args:['-r',process.env.SUFFICE_TEST_ELECTRON_REQUIRE||'/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
 const tmux=(...a)=>{try{return execFileSync('tmux',['-L',SOCKET,...a],{encoding:'utf8'});}catch{return '';}};
 try{
  assert.equal(await app.evaluate(()=>process.env.SUFFICE_SESSIONS_SOCKET),SOCKET,'private socket must reach the app');
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.locator('.composer').waitFor();await page.emulateMedia({reducedMotion:'reduce'});
  const shot=async name=>{if(!SHOTS)return;await mkdir(SHOTS,{recursive:true});const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(SHOTS,name),Buffer.from(b64,'base64'));};
  // One normal thread so rows can be compared.
  await app.evaluate(({ipcMain},cwd)=>{ipcMain.removeHandler('suffice:threads');ipcMain.handle('suffice:threads',()=>[{id:'normal-1',title:'Fix flaky upload test',project:'demo-project',cwd,modified:Date.now()-3*3600e3,provider:'anthropic',model:'claude-sonnet'}]);},project);
  await page.reload();await page.locator('.composer').waitFor();await page.locator('[data-thread="normal-1"]').waitFor();
  const start=agent=>page.evaluate(a=>window.sufficeDesktop.sessions.start({agent:a,cwd:document.querySelector('.project-picker')?.dataset.tooltip}),agent);
  const first=await start('fakeclaude');await page.waitForTimeout(400);const second=await start('fakeclaude');
  await page.evaluate(([id,t])=>window.sufficeDesktop.sessions.send(id,t),[second.id,'Port the parser to Rust']);
  await page.evaluate(id=>localStorage.setItem('suffice-thread-view-v1:session-'+id,JSON.stringify({sidebar:{title:'Renamed in header'}})),first.id);
  await page.waitForTimeout(800);await page.reload();await page.locator('.composer').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.sidebar-cli-sessions .thread-row').length===2);
  await page.waitForFunction(()=>{const t=[...document.querySelectorAll('.sidebar-cli-sessions .thread-card-title')].map(n=>n.textContent).sort();return t.length===2&&t[0]==='Port the parser to Rust'&&t[1]==='Renamed in header';},null,{timeout:30000});
  const rows=page.locator('.sidebar-cli-sessions .thread-row');
  check(()=>{});
  // Row content: provider logo on line 3, no monitor "CLI" chip, minutes never over 59.
  const info=await rows.evaluateAll(rs=>rs.map(r=>({title:r.querySelector('.thread-card-title').textContent,line3:r.querySelector('.thread-branch-line').innerText.trim(),img:!!r.querySelector('.thread-branch-line img.settings-provider-icon'),noBranch:!!r.querySelector('.thread-no-branch'),age:r.querySelector('.thread-age').textContent})));
  console.log(JSON.stringify(info));
  check(()=>{for(const r of info){assert.equal(r.img,true,'provider logo');assert.equal(r.noBranch,false);assert.match(r.line3,/^Claude Code$/);assert.doesNotMatch(r.age,/\d{3,}m/);}
   assert.ok(info.some(r=>r.title==='Renamed in header'),'rename wins');
   assert.deepEqual(info.map(r=>r.title).sort(),['Port the parser to Rust','Renamed in header']);});
  await shot('sidebar.png');
  // Hover card.
  await rows.first().hover();await page.locator('.thread-hover-card:not([hidden])').first().waitFor({timeout:3000}).catch(()=>{});await shot('row-hover.png');
  await page.mouse.move(700,400);
  // Context menu + copy command.
  await page.evaluate(()=>{window.__copied=[];navigator.clipboard.writeText=async t=>{window.__copied.push(t);};});
  await rows.first().click({button:'right'});await page.waitForTimeout(300);await shot('row-context-menu.png');
  const items=await page.locator('.thread-context-menu:not([hidden]) [data-menu-action]').allInnerTexts().catch(()=>[]);console.log('menu',JSON.stringify(items));
  check(()=>assert.deepEqual(items.map(s=>s.trim()),['Copy attach command','Show terminal','Stop session']));
  if(!BASELINE){await page.locator('[data-menu-action="session:attach"]').click();await page.waitForTimeout(300);
   const copied=await page.evaluate(()=>window.__copied);assert.ok(copied.some(t=>t.includes(`-L ${SOCKET}`)),'attach command names the private socket: '+JSON.stringify(copied));}
  else await page.keyboard.press('Escape');
  // Session older than one day: shift the clock, let the 30 s tick run.
  await page.evaluate(()=>{window.__realNow=Date.now;const d=Date.now;Date.now=()=>d()+2*86400e3+3600e3;});await page.waitForTimeout(31000);await shot('sidebar-old-session.png');
  const olds=await page.locator('.sidebar-cli-sessions .thread-age').allInnerTexts();console.log('ages',olds);check(()=>{for(const a of olds)assert.match(a,/^2d$/);});
  await page.evaluate(()=>{Date.now=window.__realNow;});
  // Start screen: new session, Claude Code selection, typed prompt, send.
  await page.getByRole('button',{name:'New session',exact:true}).click();await page.waitForTimeout(500);
  await page.evaluate(()=>{document.querySelector('.composer').modelSelection={provider:'cli',model:'fakeclaude'};});
  await page.locator('#prompt').fill('Add a retry to the uploader');await page.waitForTimeout(200);await shot('start-prompt.png');
  // Send-options menu: no per-agent entries.
  await page.locator('[data-action="send-menu"]').click();await page.waitForTimeout(300);await shot('send-options.png');
  const sendItems=await page.locator('[data-menu-action]').evaluateAll(n=>n.map(x=>x.dataset.menuAction).filter(a=>/^(cli-session|import-chat|background-send)/.test(a)));console.log('send',sendItems);
  check(()=>{assert.deepEqual(sendItems.sort(),['background-send:start','import-chat:open']);assert.equal(sendItems.some(a=>a.startsWith('cli-session:')),false);});
  await page.keyboard.press('Escape');await page.mouse.move(700,300);
  const before=tmux('list-sessions','-F','#{session_name}').split('\n').filter(Boolean).length;
  await page.evaluate(()=>{document.querySelector('.composer').modelSelection={provider:'cli',model:'fakeclaude'};});
  await page.evaluate(()=>{window.__bubbles=new Set();const grab=()=>document.querySelectorAll('.thread-user').forEach(n=>window.__bubbles.add(n.textContent.trim()));new MutationObserver(grab).observe(document.body,{childList:true,subtree:true,characterData:true});});
  await page.locator('.send-button').click();
  if(!BASELINE){await page.locator('.thread-header').waitFor();await page.waitForTimeout(500);
   assert.equal(await page.locator('#prompt').inputValue(),'');
   const after=tmux('list-sessions','-F','#{session_name}').split('\n').filter(Boolean).length;assert.equal(after,before+1,'exactly one session created');
   assert.ok((await page.evaluate(()=>[...window.__bubbles])).includes('Add a retry to the uploader'),'user bubble with the typed text appeared');
   // The first user item in the agent's transcript is the typed text (fake agent writes the first typed line as its first prompt).
   await page.waitForFunction(()=>[...document.querySelectorAll('.thread-user')].some(n=>n.textContent.trim()==='Add a retry to the uploader'));
   const sid=await page.evaluate(()=>window.sufficeDesktop.sessions.list().then(l=>l.map(s=>s.id)));
   // The first message is held until the CLI screen shows no prompt, so the agent's own user item arrives a moment after the bubble.
   const firstsOf=()=>page.evaluate(ids=>ids.map(i=>window.sufficeDesktop.sessions.ui(i)?.items?.find(x=>x.kind==='user')?.text),sid);
   let firsts=await firstsOf();for(let n=0;n<40&&!firsts.includes('Add a retry to the uploader');n++){await page.waitForTimeout(250);firsts=await firstsOf();}
   assert.ok(firsts.includes('Add a retry to the uploader'),'first user item equals typed text: '+JSON.stringify(firsts));
   assert.equal((await page.locator('.sidebar-cli-sessions .thread-row[aria-pressed="true"] .thread-card-title').innerText()).trim(),'Add a retry to the uploader');
  }else await page.waitForTimeout(1500);
  await shot('after-send.png');
 }finally{await app.close();tmux('kill-server');}
});
