// Returning-user walk: saved sessions in two projects, open/switch threads, follow up, new session, settings, search.
// Real main process + host protocol, hidden window, fake harness runtime (signed in, no network), env allowlist.
// usage: node apps/desktop/test/sessions-walk.mjs <shots-dir>   (from repo root after `bun run desktop:build`)
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
const out=resolve(process.argv[2]||'sessions-shots');await mkdir(out,{recursive:true});
const home=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-sessions-')));
const alpha=resolve(home,'alpha-site'),beta=resolve(home,'beta-api');await mkdir(alpha);await mkdir(beta);
const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
for(const [id,title,cwd,reply] of [['one','Fix the login redirect',alpha,'Fixed the redirect in **auth.js**.'],['two','Add rate limiting',beta,'Added a token bucket to the API.']]){
 const now=new Date().toISOString();
 const entries=[{type:'session',version:3,id,timestamp:now,cwd},{type:'message',id:'user',parentId:null,timestamp:now,message:{role:'user',content:[{type:'text',text:title}],timestamp:Date.now()}},{type:'message',id:'assistant',parentId:'user',timestamp:now,message:{role:'assistant',content:[{type:'text',text:reply}],timestamp:Date.now(),stopReason:'stop'}},{type:'session_info',id:'name',parentId:'assistant',timestamp:now,name:title}];
 await writeFile(resolve(dir,id+'.jsonl'),entries.map(e=>JSON.stringify(e)).join('\n')+'\n');
}
const errors=[],state={};let n=0;
const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1',SUFFICE_FAKE_SIGNED_IN:'1'})});
try{
 await app.evaluate(({shell,dialog},p)=>{shell.openExternal=async()=>{};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},alpha);
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.composer').waitFor();await page.waitForTimeout(1500);
 const seen=async name=>{
  n++;await page.screenshot({path:resolve(out,`${String(n).padStart(2,'0')}-${name}.png`),timeout:30000});
  const s=await page.evaluate(()=>({groups:[...document.querySelectorAll('.sidebar-sessions .project-group')].map(g=>g.querySelector('.project-group-label').textContent+':'+g.querySelectorAll('.thread-row').length+(g.hasAttribute('data-collapsed')?' (collapsed)':'')),rows:[...document.querySelectorAll('.thread-row')].map(r=>r.querySelector('.row-title')?.textContent+(r.getAttribute('aria-pressed')==='true'?' *':'')),header:document.querySelector('.thread-header:not([hidden])')?.textContent||'',project:document.querySelector('.project-picker .project-name')?.textContent,messages:document.querySelectorAll('.thread-message').length,last:[...document.querySelectorAll('.thread-message')].at(-1)?.textContent?.slice(0,60)||'',dialog:document.querySelector('dialog[open]')?.textContent?.replace(/\s+/g,' ').slice(0,160)||'',toast:document.querySelector('.toast:not([hidden])')?.textContent||''}));
  state[name]=s;console.log(String(n).padStart(2,'0'),name.padEnd(16),JSON.stringify(s));
 };
 await seen('home');
 // pick alpha on the home screen, then follow up in a beta thread: the reply must run in beta
 await page.getByRole('button',{name:'Choose project',exact:true}).click();await page.getByRole('button',{name:'New project',exact:true}).click();await page.waitForTimeout(800);
 await page.locator('.thread-row').filter({hasText:'Fix the login redirect'}).click();await page.waitForTimeout(1000);await seen('open-thread');
 await page.locator('.thread-row').filter({hasText:'Add rate limiting'}).click();await page.waitForTimeout(1000);await seen('switch-thread');
 await page.locator('#prompt').fill('Also log rejected requests');await page.locator('#prompt').press('Enter');await page.waitForTimeout(1500);await seen('follow-up');
 await page.locator('.thread-row').filter({hasText:'Fix the login redirect'}).click();await page.waitForTimeout(900);
 await page.locator('#prompt').fill('Add a test for it');await page.locator('#prompt').press('Enter');await page.waitForTimeout(1500);await seen('follow-up-alpha');
 await page.locator('.project-group-label').filter({hasText:'beta-api'}).click();await page.waitForTimeout(300);await seen('collapse-other');
 await page.getByRole('button',{name:'New session'}).first().click();await page.waitForTimeout(900);await seen('new-session');
 await page.locator('[data-action="workspace-menu"]').first().click();await page.waitForTimeout(400);
 await page.getByText('Workspace settings',{exact:true}).click();await page.waitForTimeout(600);await seen('settings');
 await page.getByRole('button',{name:'Sign out'}).click();await page.waitForTimeout(800);await seen('signed-out');
 const pill=await page.locator('.sign-in-pill').isVisible();console.log('   sign-in pill back:',pill);
 await page.keyboard.press('Meta+k');await page.waitForTimeout(500);await page.keyboard.type('rate');await page.waitForTimeout(400);await seen('search');
 const hits=await page.evaluate(()=>[...document.querySelectorAll('dialog[open] button, dialog[open] [role="option"]')].map(b=>b.textContent.trim().slice(0,50)).filter(Boolean));console.log('   search shows:',JSON.stringify(hits));
 const check=(ok,m)=>{if(!ok)errors.push(m);};
 check(state.home.rows.length===2,'saved sessions not listed');
 check(JSON.stringify(state.home.groups.map(g=>g.split(':')[0]).sort())==='["alpha-site","beta-api"]','sidebar not grouped by project');
 check(state['follow-up'].last.includes('[in beta-api]'),'follow-up in a beta thread did not run in beta (home picker was alpha)');
 check(state['follow-up-alpha'].last.includes('[in alpha-site]'),'follow-up in an alpha thread did not run in alpha');
 check(state['collapse-other'].groups.some(g=>g.startsWith('beta-api')&&g.endsWith('(collapsed)'))&&state['collapse-other'].groups.some(g=>g.startsWith('alpha-site')&&!g.endsWith('(collapsed)')),'project group did not collapse');
 check(state['open-thread'].header==='Fix the login redirect'&&state['open-thread'].messages===2,'opening a saved thread failed');
 check(state['switch-thread'].header==='Add rate limiting','switching threads failed');
 check(state['follow-up'].last.includes('Fake harness reply: Also log rejected requests'),'follow-up in a saved thread failed');
 check(/Account\s*OpenAI · signed in/.test(state.settings.dialog)&&!/prototype|preview/i.test(state.settings.dialog),'settings still a prototype or missing account');
 check(pill&&state['signed-out'].toast==='Signed out','sign out did not return to signed-out state');
 check(await page.locator('.done-button').isVisible()===false,'dead Done control visible');
 console.log('errors',JSON.stringify(errors));
}finally{await app.close().catch(()=>{});}
process.exit(errors.length?1:0);
