// Neon composer walk: "+" menu, run options, run-location chip, account menu, dictation, header icons.
// Real main process (hidden window), fake harness, a TEMP git repo as the project. No real model runs.
// usage: node apps/desktop/test/neon-composer-walk.mjs <shots-dir>   (after the desktop build, from the repo root)
import {_electron} from 'playwright-core';
import {mkdtemp,mkdir,writeFile,readFile,realpath,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
const out=resolve(process.argv[2]||'neon-composer-shots');await mkdir(out,{recursive:true});
const home=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-ncw-')));
const repo=resolve(home,'proj-walk');await mkdir(repo);
const git=(...a)=>execFileSync('git',['-C',repo,'-c','user.name=walk','-c','user.email=walk@example.invalid',...a],{encoding:'utf8'});
git('init','-q');await writeFile(resolve(repo,'a.txt'),'hello\n');git('add','.');git('commit','-q','-m','init');
// spoken fixture for the fake microphone: 16 kHz mono wav
const aiff=resolve(home,'say.aiff'),wav=resolve(home,'say.wav');
execFileSync('say',['-o',aiff,'testing the neon composer']);execFileSync('afconvert',['-f','WAVE','-d','LEI16@16000',aiff,wav]);
const errors=[];
const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron'),'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+wav],env:testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1',SUFFICE_FAKE_SIGNED_IN:'1'})});
try{
 await app.evaluate(({shell,dialog},p)=>{globalThis.__opened=[];shell.openExternal=async url=>{globalThis.__opened.push(url);};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},repo);
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('.composer').waitFor();
 await page.evaluate(()=>localStorage.setItem('suffice-background','neon-mech'));await page.reload();
 await page.locator('.nx-nav').waitFor();
 await page.locator('.project-picker').click();await page.locator('.project-add').click();
 await page.waitForFunction(n=>document.querySelector('.project-bar .project-name')?.textContent.trim()===n,basename(repo),{timeout:15000});
 const shot=async n=>{await page.waitForTimeout(250);await page.screenshot({path:resolve(out,n+'.png'),timeout:30000});};
 const pop=page.locator('.nx-pop'),item=t=>pop.locator('.nx-mi',{hasText:t});
 const prompt=page.locator('#prompt');
 const closed=async w=>{await page.keyboard.press('Escape');assert.equal(await pop.count(),0,w+': Escape closes');};
 await shot('01-home');

 // + add menu
 const plus=page.locator('.composer [data-action="attach"]');
 await plus.click();await pop.waitFor();assert.equal(await pop.locator('.nx-mi').count(),5,'five add items');await shot('02-add-menu');
 await page.keyboard.press('ArrowDown');assert.ok(await page.evaluate(()=>document.activeElement.classList.contains('nx-mi')),'arrows move focus');
 await closed('add menu');
 await plus.click();await item('Slash commands').click();assert.equal(await prompt.inputValue(),'/','slash inserts /');assert.equal(await pop.count(),0,'item closes menu');
 await prompt.fill('');await plus.click();await item('Mention a file').click();assert.equal(await prompt.inputValue(),'@','mention inserts @');
 await prompt.fill('');
 // add files: the hidden file input opens a chooser; confirm the click reaches it
 await page.evaluate(()=>{window.__fi=0;document.querySelector('#file-input').addEventListener('click',e=>{window.__fi++;e.preventDefault();},true);});
 await plus.click();await item('Add files or images').click();assert.equal(await page.evaluate(()=>window.__fi),1,'file input clicked');
 // paste copied files: empty clipboard gives a note, and no error
 await plus.click();await item('Paste copied files').click();await page.waitForTimeout(400);await shot('03-paste-files');
 // issue/PR search (temp repo has no remote: the list explains why, and the search box works)
 await plus.click();await item('Add an issue or pull request').click();await pop.locator('.nx-search').waitFor();await page.waitForTimeout(600);await shot('04-issue-list');
 const rows=await pop.locator('.nx-list .nx-mi').count();
 if(rows){await pop.locator('.nx-search').fill('zzzz-no-match');assert.equal(await pop.locator('.nx-list .nx-mi').count(),0,'search filters');await pop.locator('.nx-search').fill('');await pop.locator('.nx-list .nx-mi').first().click();assert.match(await prompt.inputValue(),/^#\d+ .+ https:\/\/github\.com\//,'issue text inserted');await prompt.fill('');}
 else{assert.ok((await pop.locator('.nx-pop-empty').textContent()).length>3,'empty list says why');await pop.locator('.nx-search').fill('x');}
 await closed('issue list');

 // run options
 const tools=page.locator('[data-nx="tools"]');
 await tools.click();await pop.waitFor();await shot('05-run-options');
 const eff=()=>pop.locator('.nx-eff-v').textContent();
 const e0=await eff().catch(()=>null);
 if(e0){await pop.locator('[data-d="-1"]').click();const e1=await eff();await pop.locator('[data-d="1"]').click();await pop.locator('[data-d="1"]').click();const e2=await eff();console.log('effort',e0,e1,e2);assert.ok(e1!==e0||e2!==e0,'effort control changes the model effort');}
 await item('Run in background').click();assert.equal(await item('Run in background').getAttribute('aria-checked'),'true','background toggles on');await shot('06-run-options-bg');
 await closed('run options');
 await tools.click();assert.equal(await item('Run in background').getAttribute('aria-checked'),'true','state kept');await item('Run in background').click();await closed('run options again');

 // run location chip
 const env=page.locator('[data-nx="env"]');
 await env.click();await pop.waitFor();await shot('07-env-menu');
 assert.equal(await item('This folder').getAttribute('aria-checked'),'true','This folder checked');
 assert.equal(await item('Cloud').isDisabled(),true,'Cloud disabled');assert.ok((await item('Cloud').textContent()).includes('not available yet'));
 await closed('env menu');
 await env.click();await item('New git worktree').click();
 await page.waitForFunction(()=>document.querySelector('[data-nx="env"] span')?.textContent==='Worktree',null,{timeout:30000});
 const wts=await readdir(resolve(home,'worktrees'));assert.equal(wts.length,1,'worktree dir created');
 assert.ok((await stat(resolve(home,'worktrees',wts[0],'a.txt'))).isFile(),'worktree has the repo files');
 assert.ok(git('worktree','list').includes(wts[0]),'git lists the worktree');
 assert.ok(git('branch','--list','suffice/*').trim(),'suffice/ branch exists');
 const sel=await page.locator('.project-bar .project-name').textContent();assert.equal(sel.trim(),wts[0],'worktree is the selected project');
 await shot('08-worktree');
 await env.click();assert.equal(await item('This folder').getAttribute('aria-checked'),'false');await shot('09-env-menu-worktree');await closed('env menu 2');

 // dictation: the fake microphone plays the spoken fixture through the real recorder and whisper.cpp
 const mic=page.locator('.nx-mic');
 const stt=await page.evaluate(()=>window.sufficeDesktop.sttAvailable());console.log('stt',stt);
 if(stt){
  await mic.waitFor({timeout:5000});await shot('10-mic-idle');
  await mic.click();await page.waitForFunction(()=>document.querySelector('.nx-mic')?.dataset.state==='rec');await shot('11-mic-recording');
  await page.waitForTimeout(8000);await mic.click();
  await page.waitForFunction(()=>document.querySelector('.nx-mic')?.dataset.state==='idle'||document.querySelector('.nx-mic')?.hidden,null,{timeout:90000});
  const said=await prompt.inputValue();console.log('dictated',JSON.stringify(said));assert.ok(/[a-z]{2,}/i.test(said),'dictation text inserted');
  // the fake capture device may start mid-clip, so the words themselves are checked on the exact transcribe path
  const pcm=(await readFile(wav)).subarray(44).toString('base64');
  const words=await page.evaluate(b=>window.sufficeDesktop.transcribe(Uint8Array.from(atob(b),c=>c.charCodeAt(0)).buffer),pcm);console.log('transcribe',JSON.stringify(words));assert.match(words,/neon|composer|testing/i,'whisper hears the spoken fixture');await shot('12-dictated');
  assert.equal(await mic.isVisible(),false,'mic gives way to send once text exists');
  await prompt.fill('');await mic.waitFor();
 }else{assert.equal(await page.locator('.composer').evaluate(e=>e.classList.contains('nx-no-stt')),true);await shot('10-no-stt');}

 // footer account menu
 const foot=page.locator('.nx-foot');
 await foot.click();await pop.waitFor();await shot('13-account-menu');
 await page.keyboard.press('ArrowDown');await closed('account menu');
 await foot.focus();await page.keyboard.press('Enter');await pop.waitFor();await closed('account menu (keyboard)');
 const login=await page.evaluate(()=>window.sufficeDesktop.gitInfo().then(i=>i.login||'').catch(()=>''));console.log('login',JSON.stringify(login));
 await foot.click();
 if(login){await item('GitHub profile').click();assert.deepEqual((await app.evaluate(()=>globalThis.__opened)).slice(-1),['https://github.com/'+login],'profile link opened');}
 else{assert.equal(await item('GitHub profile').count(),0,'no profile row without a login');await closed('account menu (no login)');}
 await foot.click();const was=await page.evaluate(()=>document.documentElement.dataset.theme||'dark');
 await item(was==='light'?'Dark':'Light').click();await page.waitForTimeout(300);assert.notEqual(await page.evaluate(()=>document.documentElement.dataset.theme||'dark'),was,'theme toggles');await shot('14-theme-toggled');
 await foot.click();await item(was==='light'?'Light':'Dark').click();await page.waitForTimeout(300);
 await foot.click();await item('Settings').click();await page.locator('#dialog-title').filter({hasText:/^Settings$/}).waitFor({timeout:5000});await shot('15-settings');await page.keyboard.press('Escape');
 await foot.click();await item('Sign out').click();await page.waitForTimeout(800);await shot('16-signed-out');

 // header icons and More
 await page.locator('[data-nx="search"]').first().click();await page.locator('#session-search').waitFor();await shot('17-search');await page.keyboard.press('Escape');await page.waitForTimeout(200);
 const body=()=>page.evaluate(()=>document.body.classList.contains('sidebar-collapsed'));
 await page.locator('[data-nx="sidebar"]').click();assert.equal(await body(),true,'sidebar collapses');await shot('18-collapsed');
 await page.locator('.sidebar-reopen').first().click();assert.equal(await body(),false,'sidebar reopens');
 await page.locator('[data-nx="layout"]').click();await page.waitForTimeout(300);
 assert.ok(await page.evaluate(()=>/Open a thread first/.test(document.body.innerText)),'right panel icon explains itself without a thread');await shot('19-layout-no-thread');
 await page.locator('.nx-row[data-nx="more"]').click();await page.waitForTimeout(500);await shot('20-more');
 assert.ok(await page.evaluate(()=>/Workspace settings/.test(document.body.innerText)),'More opens the workspace menu');await page.keyboard.press('Escape');
 assert.deepEqual(errors,[],'no page errors');
 console.log('PASS');
}finally{await app.close();}
