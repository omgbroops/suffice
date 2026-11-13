// Neon layout walk: real main process, hidden window, fake harness, a real git repo with a GitHub remote.
// Checks the sidebar badges, PR/issue lists, project chip and footer come from git + gh, and that clicks work.
// usage: node apps/desktop/test/neon-walk.mjs <shots-dir> <git-repo>   (after the desktop build)
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
const out=resolve(process.argv[2]||'neon-shots'),repo=resolve(process.argv[3]||'.');await mkdir(out,{recursive:true});
const home=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-neon-')));
const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
for(const [id,title,mins] of [['one','Fix the session restore race',40],['two','Speed up the seafood tests',60*26],['three','Add the neon layout',60*24*6]]){
 const t=new Date(Date.now()-mins*60000).toISOString();
 const entries=[{type:'session',version:3,id,timestamp:t,cwd:repo},{type:'message',id:'u',parentId:null,timestamp:t,message:{role:'user',content:[{type:'text',text:title}],timestamp:Date.parse(t)}},{type:'message',id:'a',parentId:'u',timestamp:t,message:{role:'assistant',content:[{type:'text',text:'Done.'}],provider:'fake',model:'fake-model-1',usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.parse(t)}}];
 await writeFile(resolve(dir,id+'.jsonl'),entries.map(e=>JSON.stringify(e)).join('\n')+'\n');
}
const {threadId}=await import('../electron/threads.mjs');
await writeFile(resolve(home,'thread-meta.json'),JSON.stringify({[threadId(resolve(dir,'one.jsonl'))]:{branch:'bg-perf'}}));
const errors=[],opened=[];
const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1',SUFFICE_FAKE_SIGNED_IN:'1'})});
try{
 await app.evaluate(({shell,dialog},p)=>{globalThis.__opened=[];shell.openExternal=async url=>{globalThis.__opened.push(url);};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},repo);
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('.composer').waitFor();
 await page.evaluate(()=>localStorage.setItem('suffice-background','neon-mech'));await page.reload();
 await page.locator('.nx-nav').waitFor();
 await page.locator('.thread-row').first().waitFor({timeout:15000});
 await page.locator('.project-picker').click();await page.locator('.project-add').click();await page.waitForTimeout(3000);
 const shot=async name=>page.screenshot({path:resolve(out,name+'.png'),timeout:30000});
 await shot('01-home');
 const state=await page.evaluate(()=>({project:document.querySelector('.project-bar .project-name')?.textContent+' | '+document.querySelector('.project-bar .git-pill')?.textContent.trim(),inRow:!!document.querySelector('.project-bar [data-nx="repos"]'),repos:document.querySelector('[data-nx="repos"] .nx-chip-label')?.textContent,
  user:document.querySelector('.nx-foot .nx-name')?.textContent,org:document.querySelector('.nx-foot .nx-org')?.textContent,prBadge:document.querySelector('[data-nx="prs"] .nx-badge')?.textContent,threads:document.querySelectorAll('.thread-row .nx-av').length,times:[...document.querySelectorAll('.thread-row .nx-time')].map(e=>e.textContent)}));
 console.log(JSON.stringify(state));
 if(process.env.NEON_PROBE)console.log(await page.evaluate(()=>JSON.stringify({bar:(()=>{const b=document.querySelector('.project-bar');return b&&{parent:b.parentElement.className,cls:b.className,html:b.outerHTML.slice(0,300)};})(),
  tb:[...document.querySelectorAll('.home .composer-toolbar *')].filter(e=>e.parentElement.classList.contains('toolbar-group')||e.parentElement.classList.contains('composer-toolbar')).map(e=>({c:e.className.baseVal??e.className,o:getComputedStyle(e).order,d:getComputedStyle(e).display,x:Math.round(e.getBoundingClientRect().x),w:Math.round(e.getBoundingClientRect().width)})),
  send:getComputedStyle(document.querySelector('.home .send-group')).backgroundImage.slice(0,60)})));
 assert.ok(/suffice-desktop \| \S/.test(state.project),'project + branch chips');assert.ok(state.inRow,'extra chips share the project row');
 assert.ok(/repo/.test(state.repos),'repo count');
 assert.ok(state.org.includes('/'),'footer shows the GitHub repo');
 assert.equal(state.threads,3,'every thread row has an avatar');
 await page.waitForFunction(()=>document.querySelector('.thread-row .nx-pr'),null,{timeout:20000}).catch(async e=>{console.log('rows',await page.evaluate(()=>JSON.stringify([...document.querySelectorAll('.thread-row')].map(r=>({...r.dataset,meta:r.querySelector('.nx-meta')?.outerHTML.slice(0,200)})))));throw e;});
 const rowMeta=await page.evaluate(()=>[...document.querySelectorAll('.thread-row .nx-meta')].map(m=>m.textContent));console.log('meta',rowMeta);
 assert.ok(rowMeta.some(t=>t.includes('bg-perf')&&t.includes('#2')&&t.includes('fake-model-1')),'branch, its PR and the model show on the row');
 await shot('01b-thread-details');
 await page.locator('[data-nx="density"]').click();assert.equal(await page.locator('.thread-row .nx-meta').first().isVisible(),false,'compact hides details');await shot('01c-compact');
 await page.locator('[data-nx="density"]').click();
 await page.locator('.nx-row[data-nx="prs"]').click();await page.locator('.nx-pop').waitFor();await page.waitForTimeout(300);await shot('02-prs');
 const rows=await page.locator('.nx-pop-main').count();console.log('pr rows',rows);
 if(rows){
  await page.locator('.nx-pop [data-open]').first().click();await page.waitForTimeout(300);
  const urls=await app.evaluate(()=>globalThis.__opened);console.log('opened',urls);assert.ok(urls[0]?.startsWith('https://github.com/'),'arrow opens the PR on GitHub');
  await page.locator('.nx-pop-main').first().click();await page.waitForTimeout(300);
  const text=await page.locator('#prompt').inputValue();console.log('prompt',text);assert.ok(text.startsWith('Review pull request #'),'row fills the composer');
  await shot('03-pr-in-composer');
 }
 await page.locator('.nx-row[data-nx="issues"]').click();await page.locator('.nx-pop').waitFor();await page.waitForTimeout(300);await shot('04-issues');
 await page.keyboard.press('Escape');assert.equal(await page.locator('.nx-pop').count(),0,'Escape closes the list');
 assert.deepEqual(errors,[],'no page errors');
 console.log('PASS');
}finally{await app.close();}
