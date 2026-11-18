import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {createHarnessHost} from '../electron/worker.mjs';
import {reviewPrompt,parseFindings} from '../electron/review.mjs';

const SHOTS=process.env.REVIEW_SHOTS||'';
const FINDINGS=[{path:'src/math.js',line:2,severity:'high',message:'Divides by zero when count is 0.',fix:'Return 0 when count is 0.'},{path:'src/math.js',line:5,severity:'low',message:'Unused variable total.',fix:'Remove it.'},{path:'src/other.js',line:1,severity:'medium',message:'Not in the diff paths.'},{path:'src/math.js',line:'x',severity:'high',message:'bad line'}];

test('reviewPrompt carries each file diff; parseFindings keeps valid findings in known files only',()=>{
 const prompt=reviewPrompt([{path:'src/math.js',text:'@@ -1 +1 @@\n+x'}]);assert.match(prompt,/### src\/math\.js\n@@ -1 \+1 @@/);assert.match(prompt,/ONLY a JSON array/);
 const found=parseFindings('Here you go:\n```json\n'+JSON.stringify(FINDINGS)+'\n```',['src/math.js']);assert.deepEqual(found.map(f=>[f.line,f.severity]),[[2,'high'],[5,'low']]);
 assert.deepEqual(parseFindings('[]'),[]);assert.throws(()=>parseFindings('no json here'),/did not return findings/);
});

test('host review action runs a read-only in-memory session on the chosen model and returns parsed findings',async()=>{
 const messages=[];let options,prompt,disposed=0;
 const host=createHarnessHost({home:await mkdtemp(resolve(tmpdir(),'suffice-review-home-')),send:message=>messages.push(message),createRuntime:async()=>({isUsingSubscription:()=>false,getAvailable:async()=>[{id:'fake-1',provider:'fake',name:'Fake'}]}),createSession:async opts=>{options=opts;return {run:async text=>{prompt=text;return JSON.stringify(FINDINGS);},dispose:async()=>{disposed++;}};}});
 await host({id:1,action:'status'});const cwd=await mkdtemp(resolve(tmpdir(),'suffice-review-cwd-'));
 await host({id:2,action:'review',payload:{cwd,prompt:'review me',paths:['src/math.js'],model:'fake-1',provider:'fake',effort:'low'}});
 const reply=messages.find(m=>m.id===2);assert.equal(reply.ok,true,reply.error);assert.equal(reply.result.findings.length,2);assert.equal(prompt,'review me');assert.equal(options.access,'read');assert.equal(options.model,'fake-1');assert.equal(options.sessionManager.getSessionFile(),undefined);assert.equal(disposed,1);
 await host({id:3,action:'review',payload:{cwd,prompt:'x',model:'nope',provider:'fake',effort:'low'}});assert.match(messages.find(m=>m.id===3).error,/Model unavailable/);
});

test('Review changes in the Changes panel annotates diff lines; Apply fix sends a follow-up through the composer',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-review-ui-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-review-project-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});await mkdir(resolve(cwd,'src'),{recursive:true});
 const git=args=>promisify(execFile)('git',['-C',cwd,...args],{windowsHide:true});await git(['init','-q']);
 await writeFile(resolve(cwd,'src/math.js'),'export function mean(values, count) {\n  return 0;\n}\n');await git(['add','.']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']);
 await writeFile(resolve(cwd,'src/math.js'),'export function mean(values, count) {\n  return values.reduce((a, b) => a + b, 0) / count;\n}\nexport function spread(values) {\n  const total = 0;\n  return Math.max(...values) - Math.min(...values);\n}\n');
 const now=new Date().toISOString();await writeFile(resolve(dir,'one.jsonl'),[{type:'session',version:3,id:'review-fixture',timestamp:now,cwd},{type:'message',id:'user',parentId:null,timestamp:now,message:{role:'user',content:[{type:'text',text:'Review fixture'}],timestamp:Date.now()}}].map(value=>JSON.stringify(value)).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-agent-review-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Fake provider: the review IPC returns what a model would, and records what the page asked for.
  await app.evaluate(({ipcMain},findings)=>{globalThis.reviewCalls=[];globalThis.runCalls=[];ipcMain.removeHandler('suffice:review');ipcMain.removeHandler('suffice:run');
   ipcMain.handle('suffice:review',async(_e,payload)=>{globalThis.reviewCalls.push(payload);await new Promise(resolve=>setTimeout(resolve,600));return {findings:findings.filter(f=>f.path==='src/math.js'&&Number.isInteger(f.line))};});
   ipcMain.handle('suffice:run',(_e,payload)=>{globalThis.runCalls.push(payload);return new Promise(()=>{});});},FINDINGS);
  await page.setViewportSize({width:1440,height:900});await page.locator('.thread-row').click();
  await page.locator('.composer').evaluate(form=>{form.modelSelection={provider:'fake',model:'fake-1',effort:'low'};});
  await page.getByRole('button',{name:'Toggle right panel',exact:true}).click();await page.locator('.panel-launcher').getByRole('button',{name:'Changes',exact:true}).click();
  const row=page.locator('.change-row[data-path="src/math.js"]');await row.waitFor();await row.click();await page.locator('.panel-code').waitFor();await page.evaluate(()=>document.documentElement.style.setProperty('--right-panel-width','790px'));await page.waitForTimeout(150);
  const shot=async name=>{if(!SHOTS)return;await mkdir(SHOTS,{recursive:true});await writeFile(resolve(SHOTS,name+'.png'),Buffer.from(await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')),'base64'));};
  const themes=async name=>{for(const theme of ['dark','light']){await page.locator('html').evaluate((el,value)=>{el.dataset.theme=value;},theme);await page.waitForTimeout(200);await shot(`${name}-${theme}`);}await page.locator('html').evaluate(el=>{el.dataset.theme='dark';});};
  assert.equal(await page.locator('.review-note').count(),0);await themes('1-idle');
  const button=page.getByRole('button',{name:'Review changes',exact:true});await button.click();
  await page.locator('.review-button[aria-busy="true"]').waitFor();assert.equal(await page.locator('.review-status').innerText(),'Reviewing…');await themes('2-running');
  await page.locator('.review-note').first().waitFor();assert.equal(await page.locator('.review-note').count(),2);
  assert.deepEqual(await app.evaluate(()=>globalThis.reviewCalls),[{model:'fake-1',provider:'fake',effort:'low'}]);
  assert.equal(await page.locator('.review-status').innerText(),'2 findings');assert.equal(await page.locator('.review-badge').innerText(),'2');
  // The note sits directly under line 2 of the new file.
  const placed=await page.locator('.review-note').first().evaluate(note=>note.previousElementSibling.querySelector('.code-number:nth-of-type(2)').textContent);assert.equal(placed,'2');
  assert.equal(await page.locator('.review-note[data-severity="high"] .review-message').innerText(),'Divides by zero when count is 0.');await themes('3-findings');
  await page.getByRole('button',{name:'Split diff',exact:true}).click();await page.locator('.panel-code[data-layout="split"] .review-note').first().waitFor();await themes('4-split');await page.getByRole('button',{name:'Split diff',exact:true}).click();await page.locator('.panel-code[data-layout="unified"] .review-note').first().waitFor();
  await page.locator('.review-note[data-severity="high"] .review-apply').click();
  await page.waitForFunction(()=>true);const runs=await app.evaluate(async()=>{for(let i=0;i<50&&!globalThis.runCalls.length;i++)await new Promise(r=>setTimeout(r,50));return globalThis.runCalls;});
  assert.equal(runs.length,1);assert.match(runs[0].prompt,/^Fix this review finding in src\/math\.js at line 2 \(high\): Divides by zero when count is 0\.\nSuggested fix: Return 0 when count is 0\./);
  assert.equal(await page.locator('.review-note[data-severity="high"] .review-apply').innerText(),'Sent');
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:review');ipcMain.handle('suffice:review',()=>{throw new Error('Model unavailable. Connect this provider in Settings.');});});
  await button.click();await page.locator('.review-status',{hasText:'Model unavailable'}).waitFor();await themes('5-error');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
