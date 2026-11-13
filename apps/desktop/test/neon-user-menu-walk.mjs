// Neon user menu + Settings walk. Real main process (hidden window), fake harness, temp SUFFICE_HOME. No real model runs.
// usage: node apps/desktop/test/neon-user-menu-walk.mjs <shots-dir>   (after the desktop build, from the repo root)
import {_electron} from 'playwright-core';
import {mkdtemp,mkdir,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
const out=resolve(process.argv[2]||'neon-user-menu-shots');await mkdir(out,{recursive:true});
const home=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-num-')));
// fixtures: a JWT-shaped login (email + plan) and one usage record, so those paths are real
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=`${b64({alg:'none'})}.${b64({email:'walker@example.invalid','https://api.openai.com/auth':{chatgpt_plan_type:'plus'}})}.sig`;
await writeFile(resolve(home,'auth.json'),JSON.stringify({tokens:{id_token:jwt}}));
await mkdir(resolve(home,'sessions','fake'),{recursive:true});
await writeFile(resolve(home,'sessions','fake','x.jsonl'),JSON.stringify({type:'message',message:{usage:{input:1000,output:500,cacheRead:200,cacheWrite:0,cost:{total:0.42}},timestamp:Date.now()-36e5,model:'walk-model-1'}})+'\n');
const errors=[];
const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1',SUFFICE_FAKE_SIGNED_IN:'1'})});
try{
 await app.evaluate(({shell})=>{globalThis.__opened=[];shell.openExternal=async url=>{globalThis.__opened.push(url);};});
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('.composer').waitFor();
 await page.evaluate(()=>localStorage.setItem('suffice-background','neon-mech'));await page.reload();
 await page.locator('.nx-nav').waitFor();
 const shot=async n=>{await page.waitForTimeout(250);await page.screenshot({path:resolve(out,n+'.png'),timeout:30000});};
 const foot=page.locator('.nx-foot'),um=page.locator('.nx-um'),sub=page.locator('.nx-um-sub'),mi=t=>um.locator('.nx-um-mi',{hasText:t}),si=t=>sub.locator('.nx-um-mi',{hasText:t});
 const st=page.locator('.nx-st'),nav=t=>st.locator('.nx-st-nav',{hasText:t}),main=st.locator('.nx-st-main');
 const menuClosed=async w=>assert.equal(await um.count(),0,w);
 const focusCls=()=>page.evaluate(()=>document.activeElement?.className||'');

 // footer
 await page.waitForFunction(()=>/plus/i.test(document.querySelector('.nx-um-plan')?.textContent||''),null,{timeout:10000});
 assert.equal(await foot.getAttribute('role'),'button');assert.equal(await foot.getAttribute('aria-haspopup'),'menu');assert.equal(await foot.getAttribute('aria-expanded'),'false');
 assert.ok((await foot.locator('.nx-um-name').innerText()).trim().length>0,'footer name non-empty');
 await shot('01-footer');

 // open by click, rows, header
 await foot.click();await um.first().waitFor();assert.equal(await foot.getAttribute('aria-expanded'),'true');
 assert.match(await um.innerText(),/walker@example\.invalid/,'email header');
 for(const t of ['Settings','Usage','Language','Get help','Sign out'])assert.equal(await mi(t).count(),1,'row '+t);
 await shot('02-menu');
 // keyboard: arrows, Home/End, Escape returns focus to the footer
 await page.keyboard.press('ArrowDown');assert.ok((await focusCls()).includes('nx-um-mi'),'ArrowDown focuses a row');
 await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'out','End = last row');
 await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'settings','Home = first row');
 await page.keyboard.press('Escape');await menuClosed('Escape closes');assert.ok((await focusCls()).includes('nx-foot'),'focus returns to footer');
 // keyboard open
 await foot.focus();await page.keyboard.press('Enter');await um.first().waitFor();await page.keyboard.press('Escape');await menuClosed('keyboard open then Escape');
 // outside click closes
 await foot.click();await um.first().waitFor();await page.mouse.click(900,500);await menuClosed('outside click closes');

 // submenus: hover, click, ArrowRight/ArrowLeft
 await foot.click();await um.first().waitFor();
 await mi('Language').hover();await sub.waitFor();assert.equal(await si('English').getAttribute('aria-checked'),'true','English checked');await shot('03-language');
 await mi('Get help').hover();await page.waitForFunction(()=>/Report an issue/.test(document.querySelector('.nx-um-sub')?.textContent||''));
 for(const t of ['Report an issue','Keyboard shortcuts'])assert.equal(await si(t).count(),1,'help row '+t);await shot('04-help');
 await mi('Language').click();await sub.waitFor();await page.keyboard.press('Escape');assert.equal(await sub.count(),0,'Escape closes submenu first');await page.keyboard.press('Escape');await menuClosed('second Escape closes menu');
 await foot.click();await um.first().waitFor();await mi('Get help').focus();await page.keyboard.press('ArrowRight');await sub.waitFor();assert.ok((await focusCls()).includes('nx-um-mi'),'ArrowRight enters submenu');
 await page.keyboard.press('ArrowLeft');assert.equal(await sub.count(),0,'ArrowLeft closes submenu');assert.equal(await um.count(),1,'menu stays open');
 // Report an issue opens the issues URL
 await mi('Get help').click();await si('Report an issue').click();
 assert.ok((await app.evaluate(()=>globalThis.__opened)).includes('https://github.com/sufficelabs/suffice/issues'),'issues URL opened');await menuClosed('menu closes after Report an issue');
 // Keyboard shortcuts opens Settings > Shortcuts
 await foot.click();await mi('Get help').click();await si('Keyboard shortcuts').click();await st.waitFor();
 assert.equal(await nav('Shortcuts').getAttribute('aria-current'),'true','Shortcuts page selected');await shot('05-shortcuts');
 await page.keyboard.press('Escape');assert.equal(await st.count(),0,'Escape closes Settings');
 // Usage row opens Usage page with the fixture
 await foot.click();await mi('Usage').click();await st.waitFor();
 await page.waitForFunction(()=>/walk-model-1/.test(document.querySelector('.nx-st-main')?.textContent||''),null,{timeout:10000});
 assert.match(await main.innerText(),/\$0\.42/,'fixture cost shown');await shot('06-usage');

 // Settings: pages, X, search
 await nav('Account').click();assert.match(await main.innerText(),/walker@example\.invalid/);assert.match(await main.innerText(),/Plus/);await shot('07-account');
 await nav('Appearance').click();await shot('08-appearance');
 const before=await page.evaluate(()=>document.documentElement.dataset.theme||'dark'),other=before==='light'?'dark':'light';
 await st.locator(`[data-theme="${other}"]`).click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme||'dark'),other,'theme switches');
 await st.locator(`[data-theme="${before}"]`).click();
 const cmp=()=>page.evaluate(()=>document.body.hasAttribute('data-nx-compact'));const c0=await cmp();
 await st.locator('[data-compact]').click();await page.waitForTimeout(150);assert.notEqual(await cmp(),c0,'compact toggles');await st.locator('[data-compact]').click();
 await nav('Shortcuts').click();assert.match(await main.innerText(),/Search/);
 const search=st.locator('.nx-st-search input');
 await search.fill('explorer');assert.equal(await st.locator('.nx-st-nav').count(),1,'search narrows nav');assert.equal(await st.locator('.nx-st-t tbody tr').count(),1,'search narrows rows');await shot('09-search');
 await search.fill('zzzz');assert.equal(await st.locator('.nx-st-nav').count(),0);assert.match(await main.innerText(),/No results/);
 await search.fill('');assert.equal(await st.locator('.nx-st-nav').count(),4,'nav restored');
 await st.locator('.nx-st-x').click();assert.equal(await st.count(),0,'X closes Settings');assert.ok((await focusCls()).includes('nx-foot'),'focus returns to footer');

 // platform shortcuts
 await page.evaluate(()=>{window.__nxPlatform='win32';});
 await foot.click();await um.first().waitFor();assert.equal((await mi('Settings').locator('.nx-um-k').innerText()).trim(),'Ctrl+,','win label');await shot('10-menu-win');await page.keyboard.press('Escape');
 await page.keyboard.press('Meta+,');await page.waitForTimeout(300);assert.equal(await st.count(),0,'Meta+, does nothing on win');
 await page.keyboard.press('Control+,');await st.waitFor({timeout:5000});await page.keyboard.press('Escape');
 await page.evaluate(()=>{window.__nxPlatform='darwin';});
 await foot.click();await um.first().waitFor();assert.equal((await mi('Settings').locator('.nx-um-k').innerText()).trim(),'⌘,','mac label');await page.keyboard.press('Escape');
 await page.keyboard.press('Control+,');await page.waitForTimeout(300);assert.equal(await st.count(),0,'Ctrl+, does nothing on mac');
 await page.keyboard.press('Meta+,');await st.waitFor({timeout:5000});await page.keyboard.press('Escape');

 // sign out then sign in
 await foot.click();await mi('Sign out').click();
 await page.waitForTimeout(800);
 await foot.click();await um.first().waitFor();assert.equal(await mi('Sign in').count(),1,'Sign in after sign-out');await shot('11-signed-out');
 await mi('Sign in').click();await page.waitForTimeout(500);await shot('12-sign-in');
 assert.deepEqual(errors,[],'no page errors');
 console.log('user-menu walk ok');
}finally{await app.close();}
