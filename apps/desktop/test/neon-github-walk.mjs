// Neon github panes walk: real main process, hidden window, fake harness, a real git repo with a GitHub remote.
// Checks the sidebar badges, PR/issue lists, project chip and footer come from git + gh, and that clicks work.
// usage: node apps/desktop/test/neon-github-walk.mjs <shots-dir> <git-repo>   (after the desktop build)
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
const out=resolve(process.argv[2]||'visual-review/neon-github'),repo=resolve(process.argv[3]||resolve(process.env.HOME,'suffice-desktop'));await mkdir(out,{recursive:true});
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
let page;try{
 await app.evaluate(({shell,dialog},p)=>{globalThis.__opened=[];shell.openExternal=async url=>{globalThis.__opened.push(url);};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},repo);
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('.composer').waitFor();
 await page.evaluate(()=>localStorage.setItem('suffice-background','neon-mech'));await page.reload();
 await page.locator('.nx-nav').waitFor();
 await page.locator('.thread-row').first().waitFor({timeout:15000});
 await page.locator('.project-picker').click();await page.locator('.project-add').click();await page.waitForTimeout(3000);
 const shot=async name=>page.screenshot({path:resolve(out,name+'.png'),timeout:30000});

 await page.waitForFunction(()=>/\d/.test(document.querySelector('[data-nx="issues"] .nx-badge')?.textContent||''),null,{timeout:20000});
 // PRs
 await page.locator('.nx-row[data-nx="prs"]').click();await page.locator('.nx-gh-row').first().waitFor({timeout:30000});await shot('01-prs-open');
 assert.ok((await page.locator('.nx-pane-head .nx-gh-repo').textContent()).includes('/'),'header shows owner/name');
 const first=await page.locator('.nx-gh-row').first().innerText();console.log('row',first.replace(/\n/g,' | '));
 await page.locator('.nx-gh-row').first().click();await page.locator('.nx-gh-detail:not([hidden]) .nx-gh-body-text').waitFor({timeout:30000});
 assert.ok(await page.locator('.nx-gh-files li').count()>0,'PR detail lists changed files');await shot('02-pr-detail');
 await page.locator('.nx-gh-search input').fill('zzzz-no-such-title');assert.equal(await page.locator('.nx-gh-row').count(),0,'search filters rows');await shot('03-pr-no-match');
 await page.locator('.nx-gh-search input').fill('');
 await page.locator('[data-mine]').click();await page.waitForTimeout(200);await shot('04-pr-mine');await page.locator('[data-mine]').click();
 for(const t of ['merged','closed']){await page.locator(`[data-tab="${t}"]`).click();await page.locator('.nx-gh-row,.nx-gh-empty').first().waitFor({timeout:30000});await shot('05-pr-'+t);}
 await page.locator('[data-tab="open"]').click();await page.locator('.nx-gh-row').first().waitFor({timeout:30000});
 await page.locator('.nx-pane-actions .nx-gh-refresh').click();await page.locator('.nx-gh-row').first().waitFor({timeout:30000});
 await page.locator('.nx-gh-row').first().click();await page.locator('.nx-gh-detail:not([hidden]) .nx-gh-body-text').waitFor({timeout:30000});
 await page.locator('.nx-gh-detail [data-gh]').click();await page.waitForTimeout(300);
 const urls=await app.evaluate(()=>globalThis.__opened);console.log('opened',urls);assert.ok(urls[0]?.startsWith('https://github.com/'),'Open on GitHub calls openExternal');
 await page.locator('.nx-gh-detail [data-fill]').click();await page.waitForTimeout(300);
 const text=await page.locator('#prompt').inputValue();console.log('prompt',text);assert.ok(text.startsWith('Review pull request #'),'Review this PR fills the composer');
 assert.equal(await page.locator('.nx-pane').count(),0,'pane closed after fill');await shot('06-composer-filled');
 // issues (may be empty)
 await page.locator('.nx-row[data-nx="issues"]').click();await page.locator('.nx-gh-row,[data-empty],[data-reason]').first().waitFor({timeout:30000});await shot('07-issues');
 const n=await page.locator('.nx-gh-row').count();console.log('issue rows',n);
 if(!n)assert.ok((await page.locator('[data-empty]').textContent()).startsWith('No open issues'),'empty state');
 else{await page.locator('.nx-gh-row').first().click();await page.locator('.nx-gh-detail:not([hidden]) .nx-gh-body-text').waitFor({timeout:30000});await page.locator('.nx-gh-detail [data-fill]').click();assert.ok((await page.locator('#prompt').inputValue()).startsWith('Fix issue #'),'Fix this issue fills the composer');}
 await page.locator('.nx-row[data-nx="issues"]').click().catch(()=>{});
 if(await page.locator('.nx-pane').count()){await page.locator('[data-tab="closed"]').click();await page.locator('.nx-gh-row,.nx-gh-empty').first().waitFor({timeout:30000});await shot('08-issues-closed');await page.keyboard.press('Escape');}
 assert.equal(await page.locator('.nx-pop').count(),0,'old popover is gone');
 assert.deepEqual(errors,[],'no page errors');
 console.log('PASS');
}catch(e){console.log('errors',errors,await page?.evaluate(()=>document.querySelector('.nx-gh-list')?.outerHTML.slice(0,600)));await page?.screenshot({path:resolve(out,'FAIL.png')}).catch(()=>{});throw e;}finally{await app.close();}
