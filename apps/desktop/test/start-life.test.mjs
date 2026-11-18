import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {createRequire} from 'node:module';
const {parseTodos,parseJunit}=createRequire(import.meta.url)('../electron/repo-hints.cjs');
test('repo hints parse TODO/FIXME lines and JUnit failures',()=>{
 assert.deepEqual(parseTodos('a/b.js:3:  // TODO(x): retry on 5xx\nc.js:9:/* FIXME leak */\nd.js:1:no marker\ne.js:2:TODO'),[{file:'a/b.js',line:3,kind:'TODO',text:'retry on 5xx'},{file:'c.js',line:9,kind:'FIXME',text:'leak'}]);
 assert.deepEqual(parseJunit('<testcase name="ok" classname="a"/><testcase name="saves &quot;x&quot;"><failure message="m"/></testcase><testcase name="fine"></testcase>'),['saves "x"']);
});
const SHOTS=process.env.SUFFICE_START_SHOTS;
test('Start screen: mark and title, typed suggestion from real repo state, three starter cards that fill the composer',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-startlife-')),cwd=resolve(home,'proj');await mkdir(cwd,{recursive:true});
 await writeFile(resolve(cwd,'app.js'),'// TODO: cache the lookup\n');await writeFile(resolve(cwd,'junit.xml'),'<testsuite><testcase name="retries after a timeout"><failure message="x"/></testcase></testsuite>');
 execFileSync('git',['-C',cwd,'init','-q','-b','main']);execFileSync('git',['-C',cwd,'add','app.js']);execFileSync('git',['-C',cwd,'-c','user.name=F','-c','user.email=f@example.invalid','commit','-qm','f']);
 await writeFile(resolve(cwd,'notes.txt'),'dirty\n');
 const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
 const M=(ts,id,p,m)=>({type:'message',id,parentId:p,timestamp:ts,message:{...m,timestamp:Date.parse(ts)}});
 for(const [id,title,ago] of [['one','Fix the flaky sidebar test',35],['two','Add dark mode to settings',190],['three','Explain the session restore flow',1800]]){const ts=new Date(Date.now()-ago*60000).toISOString();
  await writeFile(resolve(dir,id+'.jsonl'),[{type:'session',version:3,id,timestamp:ts,cwd},M(ts,'u',null,{role:'user',content:[{type:'text',text:title}]}),M(ts,'b','u',{role:'assistant',stopReason:'stop',content:[{type:'text',text:'Done.'}]})].map(e=>JSON.stringify(e)).join('\n')+'\n');}
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:cwd,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-feat-start-life-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();page.setDefaultTimeout(8000);
  const shot=async p=>{await mkdir(SHOTS,{recursive:true});await writeFile(p,Buffer.from(await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')),'base64'));};
  if(SHOTS)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await page.locator('.start-card').first().waitFor();
  assert.match(await page.locator('.life-hello').textContent(),/\?$|build/);
  assert.equal(await page.locator('.life-mark').textContent(),'[suffice]');
  assert.equal(await page.locator('.life-label,.life-card').count(),0,'the pick-up strip is gone');
  assert.equal(await page.locator('.start-card').count(),3);
  assert.equal(await page.locator('.start-card canvas.start-card-art').count(),3);
  // Each card carries a distinct image: three different pixel buffers.
  const sums=await page.locator('.start-card-art').evaluateAll(c=>c.map(x=>{const d=x.getContext('2d').getImageData(0,0,x.width,x.height).data;let h=0;for(let i=0;i<d.length;i+=97)h=(h*31+d[i])|0;return h;}));
  assert.equal(new Set(sums).size,3,'distinct card images '+sums);
  assert.equal(await page.locator('.life-needs').count(),0);
  // Typewriter: the placeholder grows one character at a time, ~30 ms each, then rests on the full suggestion.
  const full='Fix the failing test “retries after a timeout”  ·  Tab to use';
  await page.waitForFunction(t=>document.querySelector('#prompt').placeholder===t,full,{timeout:12000});
  const entrance=await page.evaluate(()=>[...document.querySelectorAll('.life-in')].map(e=>{const a=e.getAnimations()[0];return a?a.effect.getComputedTiming().endTime:0;}));
  assert.ok(Math.max(...entrance)<=400,'entrance under 400ms: '+entrance);
  await page.reload();await page.locator('.start-card').first().waitFor();
  const seen=await page.evaluate(()=>new Promise(r=>{const p=document.querySelector('#prompt'),lens=[];const t0=performance.now();const id=setInterval(()=>{const n=p.placeholder.length;if(lens.at(-1)!==n)lens.push(n);if(performance.now()-t0>6000||n>=60){clearInterval(id);r(lens);}},10);}));
  assert.ok(seen.filter(n=>n>0&&n<60).length>=15,'placeholder is typed out, saw '+JSON.stringify(seen));
  // Reduced motion: the suggestion is never typed; the placeholder only ever holds the full text.
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.locator('.start-card').first().waitFor();
  const calm=await page.evaluate(()=>new Promise(r=>{const p=document.querySelector('#prompt'),seen=new Set();const t0=performance.now();const id=setInterval(()=>{seen.add(p.placeholder);if(performance.now()-t0>3500){clearInterval(id);r([...seen]);}},10);}));
  assert.ok(calm.includes(full),'full suggestion shown '+JSON.stringify(calm));
  assert.deepEqual(calm.filter(v=>v!==full&&v!==''&&full.startsWith(v)),[],'no partial text under reduced motion '+JSON.stringify(calm));
  await page.emulateMedia({reducedMotion:'no-preference'});await page.reload();await page.locator('.start-card').first().waitFor();
  if(SHOTS)for(const th of ['dark','light']){await page.evaluate(t=>{localStorage.setItem('suffice-theme',t);},th);await page.reload();await page.locator('.start-card').first().waitFor();await page.waitForTimeout(4000);await shot(resolve(SHOTS,'home-'+th+'.png'));}
  // Needs-you: a thread waiting on approval raises the pill and it opens that thread.
  await page.evaluate(()=>{const r=document.querySelector('.sidebar .thread-row');r.dataset.status='approval';r.append(document.createElement('i'));});
  await page.waitForFunction(()=>document.querySelector('.life-needs')?.dataset.count==='1');
  assert.equal(await page.locator('.life-needs').textContent(),'1 needs you');
  await page.evaluate(()=>{const r=document.querySelector('.sidebar .thread-row');r.dataset.status='done';r.append(document.createElement('i'));});
  await page.waitForFunction(()=>!document.querySelector('.life-needs'));
  // Tab on an empty box writes the real-state suggestion in.
  const prompt=page.locator('#prompt');await prompt.click();await page.keyboard.press('Tab');
  assert.match(await prompt.inputValue(),/^Fix the failing test “retries after a timeout”$/);
  // A starter card fills the composer with its full prompt, ready to send.
  await prompt.fill('');await page.locator('.start-card').nth(1).click();
  assert.match(await prompt.inputValue(),/^Run the tests, find the first failure/);
  assert.equal(await page.locator('.composer').getAttribute('data-has-input'),'true');
  // Opening a thread hides the start screen.
  await prompt.fill('');await page.locator('.sidebar .thread-row').first().click();await page.locator('.workspace.thread-view').waitFor();assert.equal(await page.locator('.life-head').isVisible(),false);
 }finally{await app.close();}
});
