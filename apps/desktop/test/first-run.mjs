// First-time user walk in the real app: real main process + host protocol, hidden window, fresh home,
// fake harness runtime (no provider, no network), env built from an allowlist so no real key can leak in.
// usage: node apps/desktop/test/first-run.mjs <shots-dir>   (from repo root after `bun run desktop:build`)
// Prints one line per step (what the user sees) and exits 1 if the flow breaks.
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const out=resolve(process.argv[2]||'flows-shots');await mkdir(out,{recursive:true});
const home=await mkdtemp(resolve(tmpdir(),'suffice-first-run-'));
const alpha=resolve(home,'alpha-site'),beta=resolve(home,'beta-api');
await mkdir(alpha);await mkdir(beta);await writeFile(resolve(alpha,'README.md'),'alpha');
const electronPath=resolve('node_modules/electron/dist',process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':process.platform==='win32'?'electron.exe':'electron');
const env={SUFFICE_HOME:resolve(home,'suffice'),SUFFICE_FAKE_HARNESS:'1'};
for(const k of ['PATH','HOME','USER','LOGNAME','SHELL','TMPDIR','LANG','SystemRoot','TEMP'])if(process.env[k])env[k]=process.env[k];
const errors=[],state={};let n=0;
const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop/test/hidden-main.cjs'),'--user-data-dir='+resolve(home,'electron')],env});
try{
 // native edges only: the folder dialog returns a temp folder, the browser opener records instead of opening
 await app.evaluate(({dialog,shell},p)=>{globalThis.opened=[];shell.openExternal=async url=>{globalThis.opened.push(url);};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},alpha);
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.composer').waitFor();await page.waitForTimeout(1500);
 const send=()=>page.getByRole('button',{name:'Start session',exact:true}).click();
 const seen=async name=>{
  n++;await page.screenshot({path:resolve(out,`${String(n).padStart(2,'0')}-${name}.png`),timeout:30000});
  const s=await page.evaluate(()=>({toast:document.querySelector('.toast:not([hidden])')?.textContent||'',projects:!document.querySelector('.project-menu:not(.sign-in-menu)')?.hidden,signIn:!document.querySelector('.sign-in-menu')?.hidden,pill:!document.querySelector('.sign-in-pill')?.hidden,paste:!document.querySelector('.sign-in-paste')?.hidden,project:document.querySelector('.project-picker .project-name')?.textContent,draft:document.querySelector('#prompt')?.value,bubble:[...document.querySelectorAll('.thread-assistant')].at(-1)?.textContent?.slice(0,80)||'',thread:document.querySelector('.workspace')?.classList.contains('thread-view')}));
  state[name]=s;console.log(String(n).padStart(2,'0'),name.padEnd(17),JSON.stringify(s));
 };
 await seen('open');
 await page.locator('#prompt').fill('Add a dark mode toggle');await send();await page.waitForTimeout(800);
 await seen('send-no-project');
 await page.keyboard.press('Escape');await page.waitForTimeout(500);await seen('picker-dismissed');
 await send();await page.waitForTimeout(600);await seen('project-menu');
 await page.getByRole('button',{name:'New project',exact:true}).click();await page.waitForTimeout(1200);
 await seen('sign-in-asked');
 await page.getByRole('button',{name:'Continue in browser'}).click();await page.waitForTimeout(1200);
 await seen('signing-in');
 const opened=await app.evaluate(()=>globalThis.opened);console.log('   browser asked to open:',JSON.stringify(opened));
 await page.locator('.sign-in-paste').fill('fake-code');await page.locator('.sign-in-paste').press('Enter');await page.waitForTimeout(2500);
 await seen('first-send');
 await page.getByRole('button',{name:'New session'}).first().click();await page.waitForTimeout(800);
 await page.getByRole('button',{name:'Choose project',exact:true}).click();await page.waitForTimeout(400);
 await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},beta);
 await page.getByRole('button',{name:'New project',exact:true}).click();await page.waitForTimeout(1200);
 await seen('switch-project');
 const check=(ok,message)=>{if(!ok)errors.push(message);};
 check(state.open.pill,'sign-in not offered on a fresh install');
 check(state['send-no-project'].projects,'send with no project did not open the picker');
 check(!state['picker-dismissed'].projects&&!state['picker-dismissed'].thread&&state['picker-dismissed'].draft==='Add a dark mode toggle','Esc did not return to the draft');
 check(state['sign-in-asked'].signIn&&!state['sign-in-asked'].thread,'picking a project while signed out did not ask to sign in');
 check(opened.length===1&&opened[0].startsWith('https://auth.example.invalid/'),'sign-in did not open the auth page');
 check(state['signing-in'].paste&&state['signing-in'].signIn,'sign-in prompt did not stay up for the paste step');
 check(state['first-send'].thread&&state['first-send'].bubble.includes('Fake harness reply: Add a dark mode toggle')&&!state['first-send'].pill,'signing in did not send the draft');
 check(state['switch-project'].project==='beta-api'&&!state['switch-project'].pill,'project switch failed');
 check(!/Error invoking remote method/.test(JSON.stringify(state)),'raw IPC error text shown');
 console.log('errors',JSON.stringify(errors));
}finally{await app.close().catch(()=>{});}
process.exit(errors.length?1:0);
