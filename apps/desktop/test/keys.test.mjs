import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import net from 'node:net';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
// Double-tap Option: a fake "Suffice Keys" socket (SUFFICE_KEYS_SOCK, never the real helper) sends "trigger x y"; the floating Ask Suffice window opens near that point, Enter hands the question to the main window as a new thread.
// KEYS_SHOT_DIR=<dir> and KEYS_SHOT_THEME=light|dark save screenshots.
const SELECT='Double-tap Option opens Suffice';
test('keys: trigger opens the floater near the point, Enter makes a thread, Escape closes, Settings switch stops it',{timeout:150000},async()=>{
 const root=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-keys-')));
 const home=resolve(root,'suffice-home'),fakeHome=resolve(root,'home'),project=resolve(root,'project');
 for(const dir of [home,fakeHome,project])await mkdir(dir);
 const sock=resolve(root,'keys.sock'),clients=[];
 const server=net.createServer(c=>{c.on('error',()=>{});clients.push(c);});await new Promise(r=>server.listen(sock,r));
 const env={PATH:process.env.PATH,HOME:fakeHome,TMPDIR:process.env.TMPDIR,LANG:process.env.LANG,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_SESSIONS_SOCKET:'sfx-fix1-keys-'+process.pid,SUFFICE_HISTORY_HOME:resolve(root,'history'),SUFFICE_KEYS_SOCK:sock,SUFFICE_TEST_ASK_RUNNER:resolve('apps/desktop/test/ask-bar-runner.cjs')};
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop/test/ask-bar-hidden-main.cjs'),'--user-data-dir='+resolve(root,'electron'),'--mute-audio'],env});
 const errors=[],theme=process.env.KEYS_SHOT_THEME||'dark';
 try{
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push('main: '+e.message));await page.locator('.composer').waitFor();
  app.on('window',w=>w.on('pageerror',e=>errors.push('window: '+e.message)));
  await page.evaluate(t=>{localStorage.setItem('suffice-model',JSON.stringify({model:'claude-fixture',provider:'anthropic',effort:'medium'}));document.documentElement.dataset.theme=t;localStorage.setItem('suffice-theme',t);},theme);
  const waitClient=async n=>{for(let i=0;i<100&&clients.filter(c=>!c.destroyed).length<n;i++)await new Promise(r=>setTimeout(r,100));assert.ok(clients.filter(c=>!c.destroyed).length>=n,'helper client connected');};
  const trigger=async(x,y)=>{const opened=app.waitForEvent('window',{timeout:15000});clients.at(-1).write(`trigger ${x} ${y}\n`);const bar=await opened;await bar.locator('.ask-panel').waitFor();return bar;};
  const bounds=()=>app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows().find(x=>x.webContents.getURL().includes('ask-bar-floater')),b=w.getBounds();return {b,area:screen.getDisplayNearestPoint({x:b.x,y:b.y}).workArea};});
  await waitClient(1);
  let bar=await trigger(500,400);
  assert.ok(bar.url().endsWith('#ask-bar-floater'),bar.url());
  const {b,area}=await bounds();
  assert.ok(Math.abs(b.x-(500-24))<=2||b.x===area.x,'x near the point '+b.x);assert.ok(b.y>=400&&b.y<=400+40,'y just below the point '+b.y);
  assert.equal(await bar.locator('#ask-input').getAttribute('placeholder'),'Ask Suffice');
  assert.equal(await bar.locator('#ask-screen').isHidden(),true,'no screen chip in the floater');
  if(process.env.KEYS_SHOT_DIR){await page.waitForTimeout(600);await page.screenshot({path:`${process.env.KEYS_SHOT_DIR}/${theme}-main.png`});await bar.screenshot({path:`${process.env.KEYS_SHOT_DIR}/${theme}-floater.png`});}
  // Enter sends a new thread to the main window and closes the floater.
  await page.evaluate(()=>{window.__askThread=null;window.sufficeDesktop.askBar.onThread(id=>{window.__askThread=id;});});
  const closed=bar.waitForEvent('close',{timeout:15000});
  await bar.locator('#ask-input').fill('What is a monad?');await bar.keyboard.press('Enter');await closed;
  await page.waitForFunction(()=>window.__askThread==='a'.repeat(32),null,{timeout:5000});
  const sent=await app.evaluate(()=>globalThis.askPayloads);assert.equal(sent.length,1);assert.equal(sent[0].prompt,'What is a monad?');assert.equal(sent[0].attachments,undefined);
  // Far past the display edge: the floater stays inside the work area. Escape closes it.
  bar=await trigger(99999,99999);
  const far=await bounds();
  assert.ok(far.b.x+far.b.width<=far.area.x+far.area.width&&far.b.y+far.b.height<=far.area.y+far.area.height,'clamped '+JSON.stringify(far));
  const closed2=bar.waitForEvent('close',{timeout:5000});await bar.keyboard.press('Escape').catch(()=>{});await closed2;
  // Settings switch (default on) stops the trigger.
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('.settings-nav-item[data-section="agent"]').click();
  const toggle=page.getByRole('switch',{name:SELECT,exact:true});await toggle.waitFor();
  assert.equal(await toggle.getAttribute('aria-checked'),'true','default on');
  await toggle.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Double-tap Option opens Suffice"]').getAttribute('aria-checked')==='false');
  for(const c of clients.slice(-1))c.write('trigger 300 300\n');
  await page.waitForTimeout(800);assert.equal((await app.windows()).length,1,'no floater while off');
  await toggle.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Double-tap Option opens Suffice"]').getAttribute('aria-checked')==='true');
  await waitClient(1);
  assert.deepEqual(errors,[]);
 }finally{await app.close();server.close();for(const c of clients)c.destroy();}
});
