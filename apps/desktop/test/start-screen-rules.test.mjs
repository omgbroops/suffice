import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
test('Start screen rules: no pill/circle radius, hover grows the label before the menu opens, git lives in the project menu',{timeout:100000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-startrules-')),cwd=resolve(home,'proj');await mkdir(cwd,{recursive:true});
 await writeFile(resolve(cwd,'a.js'),'1\n');execFileSync('git',['-C',cwd,'init','-q','-b','main']);execFileSync('git',['-C',cwd,'add','a.js']);execFileSync('git',['-C',cwd,'-c','user.name=F','-c','user.email=f@example.invalid','commit','-qm','f']);
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:cwd,SUFFICE_SESSIONS_SOCKET:'sfx-fix2-screen2-test',SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>[{provider:'anthropic',id:'claude-haiku',name:'Claude Haiku',available:true,efforts:['low','medium','high']}]);});
  const page=await app.firstWindow();await page.evaluate(()=>localStorage.setItem('suffice-model',JSON.stringify({provider:'anthropic',model:'claude-haiku',effort:'medium'})));await page.reload();
  await page.locator('.composer').waitFor();await page.locator('.project-picker .project-name').filter({hasText:'proj'}).waitFor();await page.waitForTimeout(1500);
  // (1) radius: nothing visible that paints a surface is a pill or circle
  const bad=await page.evaluate(()=>{const out=[];for(const el of document.querySelectorAll('.workspace *')){if(el.closest('canvas,svg'))continue;const r=el.getBoundingClientRect(),cs=getComputedStyle(el);if(r.width<2||r.height<2||cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0)continue;const paints=cs.backgroundColor!=='rgba(0, 0, 0, 0)'||parseFloat(cs.borderTopWidth)>0||cs.boxShadow!=='none';if(!paints)continue;const v=cs.borderTopLeftRadius,px=v.endsWith('%')?parseFloat(v)/100*r.height:parseFloat(v);if(px>0&&px>=r.height/2)out.push(`${el.tagName}.${el.className} ${px}px h${r.height}`);}return out;});
  assert.deepEqual(bad,[],'pill or circle shapes on the start screen');
  // (3) git text: none on the screen or composer row
  const text=await page.locator('.workspace').innerText();assert.doesNotMatch(text,/No Git|Isolate in worktree|\bmain\b/);
  assert.equal(await page.locator('.composer-meta :is(.git-pill,.worktree-toggle),.project-bar :is(.git-pill,.worktree-toggle)').count(),0);
  // (2) hover: label grows (smoothly) before the dropdown opens
  for(const sel of ['.access-mode-picker','.effort-picker']){
   const el=page.locator(sel);await page.mouse.move(5,5);
   const w0=await el.evaluate(n=>n.querySelector('span:not(.icon)').getBoundingClientRect().width);assert.equal(w0,0,sel+' rests as an icon');
   const b=await el.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);const dur=await el.evaluate(n=>getComputedStyle(n.querySelector('span:not(.icon)')).transitionDuration.split(',')[0]);
   await page.waitForTimeout(260);const w1=await el.evaluate(n=>n.querySelector('span:not(.icon)').getBoundingClientRect().width);
   assert.ok(w1>20&&dur==='0.16s',`${sel} label grows over 160 ms (${dur}, ${w0} -> ${w1})`);
   assert.equal(await page.locator('.popover:not([hidden])').count(),0,'menu not open yet');
   await el.click();await page.locator('.popover:not([hidden])').first().waitFor();await page.keyboard.press('Escape');
  }
  // git moved into the project menu
  await page.mouse.move(5,5);await page.locator('.project-picker').click();
  const menu=page.locator('.project-menu:not(.branch-menu)');await menu.waitFor({state:'visible'});
  assert.match(await menu.innerText(),/main/);assert.match(await menu.innerText(),/Isolate in worktree/);
 }finally{await Promise.race([app.close(),new Promise(r=>setTimeout(r,5000))]).catch(()=>{});try{process.kill(app.process().pid,'SIGKILL');}catch{}try{execFileSync('tmux',['-L','sfx-fix2-screen2-test','kill-server'],{stdio:'ignore'});}catch{}}
});
