import electronPath from 'electron';
// Hidden: the session Terminal view shows the tmux pane raw (tmux mouse on, platform mono, grapheme widths). Private tmux socket sfx-r2-terminal. SHOTS=<dir> writes a PNG.
import './electron-guard.mjs';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const SHOTS=process.env.SHOTS,socket='sfx-r2-terminal-'+process.pid;if(SHOTS)await mkdir(SHOTS,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-sess-raw-')));
const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:home,
 SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs')});
const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 await page.evaluate(([a,p])=>sufficeDesktop.sessions.start({agent:a,cwd:p}),['fakeclaude',project]);await page.reload();await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
 await page.locator('.sidebar-cli-sessions .thread-row').first().click();
 await page.locator('.session-mode-toggle').click();
 await page.locator('.session-terminal-slot .xterm-screen').waitFor();await page.waitForTimeout(1200);
 const font=await page.locator('.session-terminal-slot .xterm-rows').evaluate(e=>({f:getComputedStyle(e).fontFamily,s:getComputedStyle(e).fontSize}));
 assert.match(font.f,/^ui-monospace/);assert.equal(font.s,'12px');
 const sess=execFileSync('tmux',['-L',socket,'list-sessions','-F','#{session_name}'],{encoding:'utf8'}).trim().split('\n')[0];
 assert.match(execFileSync('tmux',['-L',socket,'show-options','-t',sess,'mouse'],{encoding:'utf8'}),/mouse on/);
 if(SHOTS){const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(SHOTS,'session-terminal-raw.png'),Buffer.from(b,'base64'));}
 console.log('ok session terminal raw');
}finally{await app.close();try{execFileSync('tmux',['-L',socket,'kill-server']);}catch{}}
