// First-time user walk in the real app (real main process + harness, hidden window, fresh home).
// usage: node apps/desktop/test/first-run.mjs <shots-dir>   (run from repo root after `bun run desktop:build`)
// Prints one line per step: what the user sees. Exit 1 on page errors.
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const out=resolve(process.argv[2]||'flows-shots');await mkdir(out,{recursive:true});
const home=await mkdtemp(resolve(tmpdir(),'suffice-first-run-'));
const alpha=resolve(home,'alpha-site'),beta=resolve(home,'beta-api');
await mkdir(alpha);await mkdir(beta);await writeFile(resolve(alpha,'README.md'),'alpha');
const electronPath=resolve('node_modules/electron/dist',process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':process.platform==='win32'?'electron.exe':'electron');
const env={...process.env,SUFFICE_HOME:resolve(home,'suffice')};delete env.ELECTRON_RUN_AS_NODE;
// a first-time user has no provider keys; a leaked shell key would run (and bill) a real model
for(const k of Object.keys(env))if(/API_KEY|SECRET|TOKEN/i.test(k))delete env[k];
const errors=[],state={};let n=0;
const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop/test/hidden-main.cjs'),'--user-data-dir='+resolve(home,'electron')],env});
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))console.log('   console.'+m.type(),m.text().slice(0,200));});
 await page.setViewportSize?.({width:1440,height:900}).catch(()=>{});
 await page.locator('.composer').waitFor();await page.waitForTimeout(1500);
 const seen=async name=>{
  n++;await page.screenshot({path:resolve(out,`${String(n).padStart(2,'0')}-${name}.png`),timeout:30000});
  const s=await page.evaluate(()=>({toast:document.querySelector('.toast:not([hidden])')?.textContent||'',menu:!document.querySelector('.project-menu')?.hidden,project:document.querySelector('.project-picker .project-name')?.textContent,bubble:[...document.querySelectorAll('.thread-assistant')].at(-1)?.textContent?.slice(0,120)||'',threads:document.querySelectorAll('.thread-row').length,thread:document.querySelector('.workspace')?.classList.contains('thread-view')}));
  state[name]=s;console.log(String(n).padStart(2,'0'),name.padEnd(18),JSON.stringify(s));
 };
 await seen('open');
 await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},alpha);
 await page.locator('#prompt').fill('Add a dark mode toggle');await page.getByRole('button',{name:'Start session',exact:true}).click();await page.waitForTimeout(1500);
 await seen('send-no-project');
 await page.keyboard.press('Escape');await page.waitForTimeout(500);await seen('picker-dismissed');
 console.log('   draft kept:',await page.locator('#prompt').inputValue());
 await page.getByRole('button',{name:'Start session',exact:true}).click();await page.waitForTimeout(800);
 if(!(await page.locator('.project-menu').isVisible()))await page.getByRole('button',{name:'Choose project',exact:true}).click();
 await page.waitForTimeout(500);await seen('project-menu');
 await page.getByRole('button',{name:'New project',exact:true}).click();await page.waitForTimeout(1500);
 await seen('project-picked');
 if(await page.getByRole('button',{name:'Start session',exact:true}).isEnabled().catch(()=>false)&&!(await page.locator('.workspace.thread-view').count())){
  if(!(await page.locator('#prompt').inputValue()))await page.locator('#prompt').fill('Add a dark mode toggle');
  console.log('-- draft not auto-sent after picking; sending again');await page.getByRole('button',{name:'Start session',exact:true}).click();
 }
 await page.waitForTimeout(4000);await seen('first-send');
 if(!(await page.getByRole('button',{name:'Choose project',exact:true}).isVisible())){console.log('-- picker hidden in thread view; New session');await page.getByRole('button',{name:'New session'}).first().click();await page.waitForTimeout(800);}
 await page.getByRole('button',{name:'Choose project',exact:true}).click();await page.waitForTimeout(400);
 await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},beta);
 await page.getByRole('button',{name:'New project',exact:true}).click();await page.waitForTimeout(1200);
 await seen('switch-project');
 const settings=page.locator('[data-action="workspace-menu"]');
 if(await settings.count()){await settings.first().click();await page.waitForTimeout(400);await seen('workspace-menu');await page.keyboard.press('Escape');}
 else console.log('-- no workspace-menu control');
 // the flow under test: send with no project opens the picker, Esc keeps the draft, picking sends it
 if(!state['send-no-project'].menu)errors.push('send with no project did not open the picker');
 if(state['picker-dismissed'].menu||state['picker-dismissed'].thread)errors.push('Esc did not return to the draft');
 if(!state['project-picked'].thread)errors.push('picking a project did not send the draft');
 if(/Error invoking remote method/.test(JSON.stringify(state)))errors.push('raw IPC error text shown');
 console.log('errors',JSON.stringify(errors));
}finally{await app.close().catch(()=>{});}
process.exit(errors.length?1:0);
