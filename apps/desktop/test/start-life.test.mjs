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
test('Start screen: greeting, Needs-you, real-state Try placeholder, 3 recent cards, Tab to use',{timeout:90000},async()=>{
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
  const shot=async p=>{await mkdir(SUFFICE_DIR(),{recursive:true});await writeFile(p,Buffer.from(await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')),'base64'));};
  const SUFFICE_DIR=()=>SHOTS;
  if(SHOTS)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await page.locator('.life-card').first().waitFor();
  assert.match(await page.locator('.life-hello').textContent(),/^(Still up|Good (morning|afternoon|evening))$/);
  assert.match(await page.locator('.life-where').textContent(),/proj on main/);
  assert.equal(await page.locator('.life-card').count(),3);
  assert.equal(await page.locator('.life-needs').getAttribute('data-count'),'0');
  await page.waitForFunction(()=>/^Try: Fix the failing test “retries after a timeout”  ·  Tab to use$/.test(document.querySelector('#prompt').placeholder));
  const entrance=await page.evaluate(()=>[...document.querySelectorAll('.life-in')].map(e=>{const a=e.getAnimations()[0];return a?a.effect.getComputedTiming().endTime:0;}));
  assert.ok(Math.max(...entrance)<=400,'entrance under 400ms: '+entrance);
  if(SHOTS)for(const th of ['dark','light']){await page.evaluate(t=>{localStorage.setItem('suffice-theme',t);},th);await page.reload();await page.locator('.life-card').first().waitFor();await page.waitForTimeout(900);await shot(resolve(SHOTS,'home-'+th+'.png'));}
  // Needs-you: a thread waiting on approval raises the count and the pill opens it.
  await page.evaluate(()=>{const r=document.querySelector('.sidebar .thread-row');r.dataset.status='approval';r.append(document.createElement('i'));});
  await page.waitForFunction(()=>document.querySelector('.life-needs').dataset.count==='1');
  assert.equal(await page.locator('.life-needs').textContent(),'1 needs you');
  const raise=async()=>{await page.evaluate(()=>{const r=document.querySelector('.sidebar .thread-row');r.dataset.status='approval';r.append(document.createElement('i'));});await page.waitForFunction(()=>document.querySelector('.life-needs').dataset.count==='1');};
  if(SHOTS)for(const th of ['dark','light']){await page.evaluate(t=>{localStorage.setItem('suffice-theme',t);},th);await page.reload();await page.locator('.life-card').first().waitFor();await raise();assert.equal(await page.evaluate(()=>document.documentElement.getAttribute('data-theme')),th);await page.waitForTimeout(900);await shot(resolve(SHOTS,'needs-'+th+'.png'));}
  await page.evaluate(()=>{const r=document.querySelector('.sidebar .thread-row');r.dataset.status='done';r.append(document.createElement('i'));});
  await page.waitForFunction(()=>document.querySelector('.life-needs').dataset.count==='0');
  // Idle motion stops on typing: the quiet flag is set and the placeholder stops rotating.
  const prompt=page.locator('#prompt');await prompt.click();assert.equal(await page.locator('.agent-area.life-quiet').count(),1);
  await page.keyboard.press('Tab');
  assert.match(await prompt.inputValue(),/^Fix the failing test “retries after a timeout”$/);
  assert.equal(await page.locator('.agent-area.life-quiet').count(),1);
  if(SHOTS){await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await page.waitForTimeout(300);await shot(resolve(SHOTS,'typed-dark.png'));}
  // Clicking a card opens that thread, which hides the start screen.
  await prompt.fill('');await page.locator('.life-card').first().click();await page.locator('.workspace.thread-view').waitFor();assert.equal(await page.locator('.life-head').isVisible(),false);
 }finally{await app.close();}
});
