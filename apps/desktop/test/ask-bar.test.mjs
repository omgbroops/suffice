import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {deflateSync,crc32} from 'node:zlib';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
// Drives the screen-aware ask bar like a person: Settings switch, the global shortcut (a fake registry in ask-bar-hidden-main.cjs, so no real OS shortcut), the permission flow and the answer.
// The macOS prompt and the screen capture are stubbed (SUFFICE_TEST_SCREEN_*) and the model run is stubbed (SUFFICE_TEST_ASK_RUNNER); every window stays hidden.
// ASK_SHOT_DIR=<dir> and ASK_SHOT_THEME=light|dark save a screenshot of each state.
const ACCELERATOR='Control+Alt+Space';
function png(width,height){
 const rows=[];for(let y=0;y<height;y++){const row=Buffer.alloc(1+width*3);for(let x=0;x<width;x++){const bar=y>24&&y<40&&x>30&&x<260,card=y>70&&y<170&&x>30&&x<width-30;const v=bar?220:card?58:28+Math.round(y/height*18);row[1+x*3]=v;row[2+x*3]=v;row[3+x*3]=card?v+10:v;}rows.push(row);}
 const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);body.copy(out,4);out.writeUInt32BE(crc32(body),8+data.length);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
}
async function launch(screen){
 const root=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-askbar-')));
 const home=resolve(root,'suffice-home'),fakeHome=resolve(root,'home'),project=resolve(root,'project'),image=resolve(root,'screen.png');
 for(const dir of [home,fakeHome,project])await mkdir(dir);
 await writeFile(image,png(640,400));
 const env={PATH:process.env.PATH,HOME:fakeHome,TMPDIR:process.env.TMPDIR,LANG:process.env.LANG,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_SESSIONS_SOCKET:'sfx-feat-local-agent-'+process.pid,SUFFICE_HISTORY_HOME:resolve(root,'history'),SUFFICE_TEST_SCREEN_STATUS:screen,SUFFICE_TEST_SCREEN_IMAGE:image,SUFFICE_TEST_ASK_RUNNER:resolve('apps/desktop/test/ask-bar-runner.cjs')};
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop/test/ask-bar-hidden-main.cjs'),'--user-data-dir='+resolve(root,'electron'),'--mute-audio'],env});
 const errors=[];const page=await app.firstWindow();page.on('pageerror',error=>errors.push('main: '+error.message));await page.locator('.composer').waitFor();
 app.on('window',other=>other.on('pageerror',error=>errors.push('window: '+error.message)));
 await page.evaluate(theme=>{localStorage.setItem('suffice-model',JSON.stringify({model:'claude-fixture',provider:'anthropic',effort:'medium'}));window.sufficeSetTheme?.(theme);document.documentElement.dataset.theme=theme;localStorage.setItem('suffice-theme',theme);},process.env.ASK_SHOT_THEME||'dark');
 return {app,page,errors,image,root};
}
const shotTo=async(page,name)=>{if(process.env.ASK_SHOT_DIR){const okay=page.getByRole('button',{name:'Dismiss',exact:true});if(await okay.count())await okay.first().click().catch(()=>{});await page.waitForTimeout(600);await page.screenshot({path:`${process.env.ASK_SHOT_DIR}/${process.env.ASK_SHOT_THEME||'dark'}-${name}.png`});}};
const pressShortcut=app=>app.evaluate(({},key)=>{const callback=globalThis.shortcuts.get(key);if(!callback)throw new Error('shortcut not registered');callback();},ACCELERATOR);
const registered=app=>app.evaluate(({},key)=>globalThis.shortcuts.has(key),ACCELERATOR);
const openBar=async app=>{const opened=app.waitForEvent('window',{timeout:15000});await pressShortcut(app);const bar=await opened;await bar.locator('.ask-panel').waitFor();return bar;};
const turnOn=async page=>{await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('.settings-nav-item[data-section="agent"]').click();const toggle=page.getByRole('switch',{name:'Screen-aware ask bar',exact:true});await toggle.waitFor();if(await toggle.getAttribute('aria-checked')!=='true')await toggle.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Screen-aware ask bar"]').getAttribute('aria-checked')==='true');};

test('ask bar: off by default, Settings switch, shortcut, permission flow, answer, send to thread',{timeout:150000},async t=>{
 const {app,page,errors,image}=await launch('not-determined');
 try{
  await t.test('off by default: no shortcut, the spotlight command points to Settings',async()=>{
   assert.equal(await registered(app),false);
   assert.equal(await page.evaluate(async()=>(await window.sufficeDesktop.preferences())['local-agent']??false),false);
   await page.keyboard.press('Control+k');const input=page.getByRole('combobox',{name:'Search threads and commands'});await input.waitFor();await input.fill('screen');
   await page.getByRole('option').filter({hasText:'Ask about my screen'}).click();
   await page.getByText('Turn on the screen-aware ask bar in Settings first.').waitFor();
   await page.getByRole('switch',{name:'Screen-aware ask bar',exact:true}).waitFor();
   assert.equal(await page.getByRole('switch',{name:'Screen-aware ask bar',exact:true}).getAttribute('aria-checked'),'false');
   await shotTo(page,'settings-off');
  });
  await t.test('the switch registers and unregisters the global shortcut and is stored',async()=>{
   const toggle=page.getByRole('switch',{name:'Screen-aware ask bar',exact:true});
   await toggle.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Screen-aware ask bar"]').getAttribute('aria-checked')==='true');
   assert.equal(await registered(app),true);
   assert.equal(await page.evaluate(async()=>(await window.sufficeDesktop.preferences())['local-agent']),true);
   await shotTo(page,'settings-on');
   await toggle.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Screen-aware ask bar"]').getAttribute('aria-checked')==='false');
   assert.equal(await registered(app),false);
   await toggle.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Screen-aware ask bar"]').getAttribute('aria-checked')==='true');
   assert.equal(await registered(app),true);
   await page.keyboard.press('Escape');
  });
  await page.evaluate(()=>localStorage.setItem('suffice-model',JSON.stringify({model:'claude-fixture',provider:'anthropic',effort:'medium'})));
  let bar;
  await t.test('the shortcut opens the bar; pressing it again closes it',async()=>{
   bar=await openBar(app);
   assert.ok(bar.url().endsWith('#ask-bar'),bar.url());
   assert.deepEqual(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>w.isVisible())),[false,false],'hidden');
   const closed=bar.waitForEvent('close',{timeout:5000});await pressShortcut(app);await closed;
   assert.equal((await app.windows()).length,1);
   bar=await openBar(app);
   assert.equal(await bar.locator('#ask-input').evaluate(el=>document.activeElement===el),true,'field is focused');
   assert.equal(await bar.locator('#ask-screen').getAttribute('aria-pressed'),'true');
   assert.equal(await bar.locator('#ask-model').textContent(),'claude-fixture');
   assert.equal(await bar.locator('.ask-panel').getAttribute('role'),'dialog');
   await shotTo(bar,'idle');
  });
  await t.test('geometry: concentric radii (14 outer, 6 padding, 8 inner)',async()=>{
   const g=await bar.evaluate(()=>{const r=s=>getComputedStyle(document.querySelector(s));return {panel:r('.ask-panel').borderTopLeftRadius,pad:r('.ask-panel').paddingTop,field:r('.ask-field').borderTopLeftRadius,chip:r('.ask-chip').borderTopLeftRadius,send:r('.ask-send').borderTopLeftRadius};});
   assert.deepEqual(g,{panel:'14px',pad:'6px',field:'8px',chip:'8px',send:'8px'});
   assert.equal(parseFloat(g.panel)-parseFloat(g.pad),parseFloat(g.field));
  });
  await t.test('permission flow: explains first, sends nothing until allowed, then asks with the screenshot',async()=>{
   await bar.locator('#ask-input').fill('What is on my screen?');await bar.keyboard.press('Enter');
   await bar.locator('#ask-permission').waitFor();
   assert.equal(await bar.locator('#ask-permission-title').textContent(),'Allow screen recording');
   assert.match(await bar.locator('#ask-permission-text').textContent(),/only when you press Ask/);
   assert.equal(await app.evaluate(()=>globalThis.askPayloads?.length||0),0,'nothing sent before access');
   await shotTo(bar,'permission');
   await bar.locator('#ask-allow').click();await bar.locator('#ask-permission').waitFor({state:'hidden'});
   await bar.locator('#ask-input').focus();await bar.keyboard.press('Enter');
   await bar.locator('.ask-panel[data-state="answering"]').waitFor({timeout:5000});
   await bar.waitForFunction(()=>/The screen shows/.test(document.querySelector('#ask-answer').textContent),null,{timeout:5000});
   await bar.locator('.ask-panel[data-state="answered"]').waitFor({timeout:5000});
   await bar.locator('#ask-answer strong').waitFor();
   assert.equal(await bar.locator('#ask-answer strong').textContent(),'settings');
   assert.equal(await bar.locator('#ask-meta').textContent(),'Screen attached');
   assert.equal(await bar.locator('#ask-meta img').count(),1);
   const sent=await app.evaluate(()=>globalThis.askPayloads);
   assert.equal(sent.length,1);
   const {readFile}=await import('node:fs/promises');
   assert.equal(sent[0].prompt,'What is on my screen?');
   assert.deepEqual([sent[0].model,sent[0].provider,sent[0].effort],['claude-fixture','anthropic','medium']);
   assert.equal(sent[0].attachments.length,1);assert.equal(sent[0].attachments[0].type,'image/png');
   assert.equal(sent[0].attachments[0].data,(await readFile(image)).toString('base64'));
   assert.equal(sent[0].askBar,true);
   await shotTo(bar,'answered');
  });
  await t.test('the answer thread is kept out of the sidebar until sent; Send to new thread hands it to the main window and closes the bar',async()=>{
   assert.equal(await app.evaluate(()=>globalThis.askPayloads.at(-1).clientId.startsWith('askbar:')),true);
   await page.evaluate(()=>{window.__askThread=null;window.sufficeDesktop.askBar.onThread(id=>{window.__askThread=id;});});
   const closed=bar.waitForEvent('close',{timeout:5000});
   await bar.getByRole('button',{name:'Send to new thread'}).click();await closed;
   await page.waitForFunction(()=>window.__askThread==='a'.repeat(32),null,{timeout:5000});
   assert.equal((await app.windows()).length,1);
  });
  await t.test('without the screen toggle nothing is attached; Escape closes; errors show in place',async()=>{
   bar=await openBar(app);
   await bar.locator('#ask-screen').click();assert.equal(await bar.locator('#ask-screen').getAttribute('aria-pressed'),'false');
   await bar.locator('#ask-input').fill('Plain question');await bar.keyboard.press('Enter');
   await bar.locator('.ask-panel[data-state="answered"]').waitFor({timeout:5000});
   assert.equal(await bar.locator('#ask-meta').textContent(),'Answered');
   const last=await app.evaluate(()=>globalThis.askPayloads.at(-1));assert.equal(last.attachments,undefined);
   await bar.locator('#ask-input').fill('please fail');await bar.keyboard.press('Enter');
   await bar.locator('.ask-panel[data-state="error"]').waitFor({timeout:5000});
   assert.match(await bar.locator('#ask-answer').textContent(),/Model unavailable/);
   await shotTo(bar,'error');
   assert.equal(await bar.locator('#ask-input').inputValue(),'please fail','question stays editable');
   const closed=bar.waitForEvent('close',{timeout:5000});await bar.keyboard.press('Escape').catch(()=>{});await closed;
  });
  await t.test('Settings off closes an open bar and frees the shortcut',async()=>{
   bar=await openBar(app);
   await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('.settings-nav-item[data-section="agent"]').click();await page.getByRole('switch',{name:'Screen-aware ask bar',exact:true}).waitFor();
   const closed=bar.waitForEvent('close',{timeout:5000});
   await page.getByRole('switch',{name:'Screen-aware ask bar',exact:true}).click();await closed;
   assert.equal(await registered(app),false);
  });
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});

test('ask bar: denied access points to System Settings and can ask without the screen',{timeout:90000},async()=>{
 const {app,page,errors}=await launch('denied');
 try{
  await turnOn(page);
  await app.evaluate(({shell})=>{globalThis.opened=[];shell.openExternal=async url=>{globalThis.opened.push(url);};});
  const bar=await openBar(app);
  await bar.locator('#ask-input').fill('Look at this');await bar.keyboard.press('Enter');
  await bar.locator('#ask-permission').waitFor();
  assert.equal(await bar.locator('#ask-permission-title').textContent(),'Screen recording is off');
  assert.equal(await bar.locator('#ask-allow').textContent(),'Open System Settings');
  assert.match(await bar.locator('#ask-permission-text').textContent(),/restart Suffice/);
  await shotTo(bar,'denied');
  assert.equal(await app.evaluate(()=>globalThis.askPayloads?.length||0),0);
  await bar.locator('#ask-allow').click();
  assert.deepEqual(await app.evaluate(()=>globalThis.opened),['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']);
  await bar.getByRole('button',{name:'Ask without screen'}).click();
  await bar.locator('.ask-panel[data-state="answered"]').waitFor({timeout:5000});
  const sent=await app.evaluate(()=>globalThis.askPayloads);assert.equal(sent.length,1);assert.equal(sent[0].attachments,undefined);assert.equal(sent[0].prompt,'Look at this');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
