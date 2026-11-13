// Automations pane walk: real main process, hidden window, fake harness (no real model), temp git repo as the project.
// usage: node apps/desktop/test/neon-auto-walk.mjs [shots-dir]   (after the desktop build)
import {_electron} from 'playwright-core';
import {mkdtemp,mkdir,realpath,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
const out=resolve(process.argv[2]||'apps/desktop/visual-review/neon-auto');await mkdir(out,{recursive:true});
const home=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-auto-')));
const repo=resolve(home,'demo-repo');await mkdir(repo);
const git=(...a)=>execFileSync('git',a,{cwd:repo});
git('init','-q');git('config','user.email','t@example.invalid');git('config','user.name','t');await writeFile(resolve(repo,'a.txt'),'hi\n');git('add','.');git('commit','-qm','init');
const errors=[];
const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1',SUFFICE_FAKE_SIGNED_IN:'1'})});
try{
 await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},repo);
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('.composer').waitFor();
 await page.evaluate(()=>localStorage.setItem('suffice-background','neon-mech'));await page.reload();
 await page.locator('.nx-nav').waitFor();
 await page.locator('.project-picker').click();await page.locator('.project-add').click();await page.waitForTimeout(2500);
 const shot=n=>page.screenshot({path:resolve(out,n+'.png'),timeout:30000});
 const saved=async()=>JSON.parse(await readFile(resolve(home,'automations.json'),'utf8'));

 await page.locator('.nx-row[data-nx="auto"]').click();await page.locator('.nx-pane[data-pane="auto"]').waitFor();
 await page.locator('.na-empty').waitFor();assert.match(await page.locator('.na-empty p').textContent(),/saved prompt on a schedule/);await shot('01-empty');

 // new form: validation error first, then a valid save
 await page.locator('.na-bar [data-act="new"]').click();await page.locator('.na-form').waitFor();await shot('02-form');
 await page.locator('.na-form button[type=submit]').click();await page.locator('.na-error:not([hidden])').waitFor();await shot('02b-form-error');
 await page.fill('.na-form [name=name]','Weekday triage');await page.fill('.na-form [name=prompt]','Summarize open work in this repo');
 await page.selectOption('.na-form [name=kind]','weekdays');await page.fill('.na-form [name=at]','09:00');
 await page.locator('.na-form button[type=submit]').click();await page.locator('.na-row').waitFor();
 const row=page.locator('.na-row');
 assert.match(await row.textContent(),/Weekday triage/);assert.match(await row.textContent(),/demo-repo · Weekdays at 09:00/);assert.match(await row.textContent(),/Next /);assert.match(await row.textContent(),/Not run yet/);
 await shot('03-listed');

 // Run now: fake model finishes, status ok and a thread id
 await row.locator('[data-act=run]').click();
 await page.waitForFunction(()=>document.querySelector('.na-last')?.dataset.state==='ok',null,{timeout:30000});
 let a=(await saved())[0];assert.equal(a.lastStatus,'ok');assert.ok(a.lastThreadId,'thread id recorded');
 await page.locator('.na-link').waitFor();await shot('04-ran');
 // open its thread via the sidebar row
 await page.waitForSelector(`.thread-row[data-thread="${a.lastThreadId}"]`,{timeout:15000});
 await page.locator('.na-link').click();await page.waitForTimeout(800);
 assert.equal(await page.locator('.nx-pane').count(),0,'pane closes when the thread opens');
 assert.equal(await page.locator(`.thread-row[data-thread="${a.lastThreadId}"]`).getAttribute('aria-pressed'),'true','thread opened');await shot('05-thread');
 await page.locator('.nx-row[data-nx="auto"]').click();await page.locator('.na-row').waitFor();

 // toggle off
 await page.locator('.na-toggle').click();await page.locator('.na-toggle[aria-checked="false"]').waitFor();
 assert.match(await page.locator('.na-next').textContent(),/Paused/);assert.equal((await saved())[0].enabled,false);await shot('06-paused');

 // edit
 await page.locator('[data-act=edit]').click();await page.locator('.na-form').waitFor();
 assert.equal(await page.inputValue('.na-form [name=name]'),'Weekday triage');
 await page.fill('.na-form [name=name]','Hourly triage');await page.selectOption('.na-form [name=kind]','hourly');await page.fill('.na-form [name=everyHours]','4');await shot('07-edit');
 await page.locator('.na-form button[type=submit]').click();await page.locator('.na-form').waitFor({state:'detached'});
 assert.match(await page.locator('.na-row').textContent(),/Hourly triage[\s\S]*Every 4 hours/);
 a=(await saved())[0];assert.equal(a.schedule.everyHours,4);assert.equal(a.enabled,false,'edit keeps the paused state');

 // delete with inline confirm (Keep first)
 await page.locator('[data-act=delete]').click();await page.locator('.na-confirm').waitFor();await shot('08-confirm');
 await page.locator('[data-act=delete-no]').click();assert.equal((await saved()).length,1,'Keep leaves it');
 await page.locator('[data-act=delete]').click();await page.locator('[data-act=delete-yes]').click();await page.locator('.na-empty').waitFor();
 assert.equal((await saved()).length,0);await shot('09-deleted');
 await page.keyboard.press('Escape');assert.equal(await page.locator('.nx-pane').count(),0,'Escape closes');
 assert.deepEqual(errors,[],'no page errors');
 console.log('PASS');
}finally{await app.close();}
