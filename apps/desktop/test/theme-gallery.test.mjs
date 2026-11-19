import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const shots='/Users/abhayg/suffice-desktop-wt/ui-shots/forge/feat/themes-gallery';
test('theme gallery applies instantly, previews use real tokens, choice persists',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-themes-')),sock='sfx-feat-themes-'+process.pid;await mkdir(shots,{recursive:true});
 const launch=()=>_electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env:(()=>{const e={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:sock,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete e.ELECTRON_RUN_AS_NODE;return e;})()});
 let app=await launch();
 try{
  let page=await app.firstWindow();await page.locator('.composer').waitFor();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();
  const cards=page.locator('[data-theme-card]');assert.equal(await cards.count(),9);
  // one card per look; the mode tiles pick dark/light, and the cards redraw in the live mode
  const mode=async m=>{await page.locator(`[data-theme-tile="${m}"]`).click();await page.waitForFunction(x=>document.documentElement.dataset.theme===x,m);};
  const pick=async(id,m)=>{await mode(m);await page.locator(`[data-theme-card="${id}"]`).click();await page.locator(`[data-theme-card="${id}"][aria-pressed=true]`).waitFor();};
  // preview cards resolve their own tokens, independent of the app theme
  const tokens=()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.theme-preview')].map(p=>[p.dataset.palette+'-'+p.dataset.theme,getComputedStyle(p).getPropertyValue('--surface-thread').trim()])));
  await mode('dark');const bg=await tokens();await mode('light');Object.assign(bg,await tokens());
  assert.equal(await page.locator('.theme-preview[data-theme=dark]').count(),0,'light mode draws no dark cards');
  assert.equal(bg['oled-dark'],'#000');assert.equal(bg['oled-light'],'#fff');assert.notEqual(bg['paper-light'],bg['graphite-light']);assert.notEqual(bg['default-dark'],bg['default-light']);
  assert.equal(await page.locator('[data-theme-card][aria-pressed=true]').count(),1);
  // the shell that actually paints the window (sidebar sheet + wallpaper veil) must differ per palette, not only --surface-thread
  const shell={};
  for(const id of ['default','paper','graphite']){
   await pick(id,'light');await page.waitForTimeout(150);
   shell[id]=await page.evaluate(()=>{const g=(e,p)=>getComputedStyle(e,p);const w=document.querySelector('.app-wallpaper');return [g(document.body,'::before').backgroundColor,w?g(w,'::after').backgroundColor:'',g(document.querySelector('.settings-card')).backgroundColor].join('|')});
  }
  assert.notEqual(shell.paper,shell.default);assert.notEqual(shell.graphite,shell.default);assert.notEqual(shell.paper,shell.graphite);
  for(const k of [0,1,2])for(const [x,y] of [['paper','default'],['graphite','default'],['paper','graphite']])assert.notEqual(shell[x].split('|')[k],shell[y].split('|')[k],`${x} vs ${y} shell part ${k}`);
  for(const [id,m] of [['oled','dark'],['paper','light'],['graphite','dark'],['default','light']]){
   await pick(id,m);
   assert.equal(await page.evaluate(()=>[document.documentElement.dataset.palette,document.documentElement.dataset.theme].join('-')),`${id}-${m}`);
   assert.equal(await page.locator('.settings-theme[aria-pressed=true] .settings-theme-name').first().textContent(),m==='dark'?'Dark':'Light');
  }
  await pick('graphite','light');
  // dark/light shots of every palette state
  for(const m of ['dark','light'])for(const id of ['default','oled','paper','graphite']){
   await pick(id,m);await page.locator('.settings-content').evaluate(el=>el.scrollTo(0,0));await page.waitForTimeout(250);
   const img=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.capturePage().then(i=>i.toPNG().toString('base64')));
   await import('node:fs/promises').then(f=>f.writeFile(`${shots}/${id}-${m}.png`,Buffer.from(img,'base64')));
  }
  await pick('paper','dark');
  await app.close();
  app=await launch();page=await app.firstWindow();await page.locator('.composer').waitFor();
  assert.equal(await page.evaluate(()=>[document.documentElement.dataset.palette,document.documentElement.dataset.theme].join('-')),'paper-dark');
 }finally{await app.close().catch(()=>{});}
});
