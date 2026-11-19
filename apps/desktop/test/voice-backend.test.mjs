import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
// User flow for the backend voice layer, through the real product path: Settings, Agent, Voice provider; the cost line before a call;
// then a call on the Cascade provider (backend session + cascade). The mic is a generated tone the test switches on and off (window.__tone), speech to
// text is a stub of the main-process handler, speech output is stubbed in the page (nothing is heard), the agent run is a stub.
// Everything stays hidden; screenshots land in ui-shots/frontier/voice-backend (SHOTS=0 skips them).
const SHOTS=process.env.SHOTS==='0'?null:'/Users/abhayg/suffice-desktop-wt/ui-shots/frontier/voice-backend';
test('voice backend: provider choice in Settings, cost before the call, cascade call end to end',{timeout:170000},async t=>{
 const root=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-voice-backend-')));
 const home=resolve(root,'suffice-home'),fakeHome=resolve(root,'home'),project=resolve(root,'project');
 for(const dir of [home,fakeHome,project])await mkdir(dir);
 if(SHOTS)await mkdir(SHOTS,{recursive:true});
 const env={PATH:process.env.PATH,HOME:fakeHome,TMPDIR:process.env.TMPDIR,LANG:process.env.LANG,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_SESSIONS_SOCKET:'sfx-fr-voice-backend-'+process.pid,SUFFICE_HISTORY_HOME:resolve(root,'history')};
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop/test/voice-hidden-main.cjs'),'--user-data-dir='+resolve(root,'electron'),'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--mute-audio'],env});
 const errors=[],logs=[];
 try{
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push('main: '+error.message));page.on('console',m=>logs.push(m.text()));await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.voiceRuns=[];globalThis.transcribed=0;
   globalThis.mainWindow=()=>BrowserWindow.getAllWindows()[0];
   for(const action of ['run','thread','threads','models','voice-transcribe'])ipcMain.removeHandler('suffice:'+action);
   ipcMain.handle('suffice:models',()=>[{id:'fixture',provider:'openai',name:'Fixture',available:true,efforts:['low']}]);
   ipcMain.handle('suffice:threads',()=>[]);ipcMain.handle('suffice:thread',(_e,id)=>({id,title:'Voice',cwd:process.cwd(),messages:[]}));
   ipcMain.handle('suffice:voice-transcribe',()=>{globalThis.transcribed+=1;return {text:'Add a test for the login redirect.'};});
   ipcMain.handle('suffice:run',(_e,payload)=>new Promise(resolve=>{globalThis.voiceRuns.push({payload,resolve});globalThis.mainWindow().webContents.send('suffice:event',{event:'thread_started',id:'voice-thread',threadId:'voice-thread',clientId:payload.clientId});}));
   globalThis.mainWindow().setContentSize(1440,900);
  });
  await page.reload();await page.locator('.composer').waitFor();await page.locator('.voice-start').waitFor();
  await page.addStyleTag({content:'* { transition:none!important; animation:none!important; }'});
  // The test window is hidden, so the mic level meter (which pauses in a hidden document) is told the page is visible. Speech output never reaches the speakers: record what would be said and finish at once.
  await page.evaluate(()=>{const tc=new AudioContext(),dest=tc.createMediaStreamDestination(),gain=tc.createGain(),osc=tc.createOscillator();gain.gain.value=0;osc.connect(gain).connect(dest);osc.start();window.__tone=on=>{gain.gain.value=on?0.5:0;};navigator.mediaDevices.getUserMedia=async()=>dest.stream;Object.defineProperty(document,'hidden',{get:()=>false});window.__spoken=[];speechSynthesis.speak=u=>{window.__spoken.push(u.text);setTimeout(()=>u.onend?.(),20);};speechSynthesis.cancel=()=>{};});
  const shot=async name=>{if(SHOTS){await page.waitForTimeout(250);await page.screenshot({path:`${SHOTS}/${name}.png`});}};
  const until=async(fn,what,ms=25000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await page.waitForTimeout(150);}assert.fail('timed out: '+what+' | word='+(await page.locator('.voice-strip .voice-word').textContent().catch(()=>'?'))+' | toast='+(await page.locator('.toast').allTextContents().catch(()=>'?'))+' | transcribed='+(await app.evaluate(()=>globalThis.transcribed))+' | logs='+logs.slice(-5).join(' ; '));};
  const estimate=page.locator('.voice-estimate'),strip=page.locator('.voice-strip'),startButton=page.locator('.voice-start');
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('suffice-settings-v1')||'{}')['voice-provider']);
  const pick=async name=>{await page.keyboard.press('Control+,');await page.locator('.sidebar > .settings-page').waitFor({state:'visible'});await page.getByRole('button',{name:'Agent',exact:true}).click();
   await page.getByRole('button',{name:'Voice provider',exact:true}).click();await page.getByRole('menuitemradio',{name}).click();await until(async()=>(await stored())===name,'saved '+name);};
  const closeSettings=async()=>{await page.getByRole('button',{name:'Back to chats',exact:true}).click();await page.locator('form.composer').waitFor({state:'visible'});};
  const mode=async name=>{await page.keyboard.press('Control+,');await page.locator('.sidebar > .settings-page').waitFor({state:'visible'});await page.getByRole('button',{name:'Appearance',exact:true}).click();await page.getByRole('group',{name:'Mode',exact:true}).getByRole('button',{name,exact:true}).click();await page.waitForTimeout(200);await closeSettings();};

  await t.test('Settings, Agent: provider row defaults to Cascade, lists both, shows the quotes, saves the choice',async()=>{
   await page.keyboard.press('Control+,');await page.locator('.sidebar > .settings-page').waitFor({state:'visible'});await page.getByRole('button',{name:'Agent',exact:true}).click();
   const row=page.getByRole('button',{name:'Voice provider',exact:true});
   assert.equal((await row.textContent()).trim(),'Cascade');
   const detail=await page.locator('.settings-option',{has:row}).textContent();assert.match(detail,/Cascade: about \$0\.05 for 5 min/);assert.match(detail,/Realtime: about \$0\.75 for 5 min/);
   await row.click();assert.deepEqual(await page.getByRole('menuitemradio').allTextContents(),['Cascade','Realtime']);
   await shot('settings-agent-voice-provider-dark');
   await page.getByRole('menuitemradio',{name:'Realtime'}).click();await until(async()=>(await stored())==='Realtime','saved Realtime');
   await closeSettings();
  });

  await t.test('the cost shows before the call, for the chosen provider, and Cancel starts nothing',async()=>{
   assert.equal(await estimate.isVisible(),false);
   await startButton.click();await estimate.waitFor({state:'visible'});
   assert.equal((await estimate.locator('.voice-estimate-text').textContent()).trim(),'Realtime: About $0.75 for 5 min');
   assert.equal(await strip.isVisible(),false);assert.equal(await page.evaluate(()=>!!document.querySelector('form.composer').dataset.voice),false);
   assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Start call');
   await page.keyboard.press('Escape');assert.equal(await estimate.isVisible(),false);
   await pick('Cascade');await closeSettings();
   await startButton.click();await estimate.waitFor({state:'visible'});
   assert.equal((await estimate.locator('.voice-estimate-text').textContent()).trim(),'Cascade: About $0.05 for 5 min');
   await shot('estimate-before-call-dark');
   await estimate.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await estimate.isVisible(),false);assert.equal(await app.evaluate(()=>globalThis.voiceRuns.length),0);
  });

  await t.test('cascade call: speech goes through backend STT, the agent run and the spoken reply',async()=>{
   await startButton.click();await estimate.getByRole('button',{name:'Start call',exact:true}).click();
   await strip.waitFor({state:'visible'});await until(async()=>(await strip.locator('.voice-word').textContent())==='listening','listening');
   await page.evaluate(()=>window.__tone(true));await page.waitForTimeout(700);await page.evaluate(()=>window.__tone(false)); // one spoken phrase
   await until(async()=>(await app.evaluate(()=>globalThis.voiceRuns.length))===1,'the spoken request reaches the agent');
   assert.ok(JSON.stringify(await app.evaluate(()=>globalThis.voiceRuns[0].payload)).includes('Add a test for the login redirect.'));
   assert.equal(await app.evaluate(()=>globalThis.transcribed),1);
   await shot('call-working-dark');
   await app.evaluate(()=>{const run=globalThis.voiceRuns.at(-1);globalThis.mainWindow().webContents.send('suffice:event',{event:'run_completed',threadId:'voice-thread',clientId:run.payload.clientId,result:{text:'I added the test.'}});run.resolve({threadId:'voice-thread',text:'I added the test.'});});
   await until(async()=>(await page.evaluate(()=>window.__spoken)).length>0,'reply is spoken');
   assert.deepEqual(await page.evaluate(()=>window.__spoken),['I added the test.']);
   await until(async()=>(await strip.locator('.voice-word').textContent())==='listening','back to listening');
   await shot('call-listening-dark');
   await page.locator('.voice-stop').click();await until(async()=>!(await strip.isVisible()),'call ended');
  });

  await t.test('the offline fake provider is free: no estimate, the call starts at once',async()=>{
   await page.evaluate(()=>localStorage.setItem('suffice-voice-provider','fake'));
   await startButton.click();await strip.waitFor({state:'visible'});assert.equal(await estimate.isVisible(),false);
   await page.locator('.voice-stop').click();await until(async()=>!(await strip.isVisible()),'fake call ended');
   await page.evaluate(()=>localStorage.removeItem('suffice-voice-provider'));
  });

  await t.test('light theme screenshots',async()=>{
   await mode('Light');
   await startButton.click();await estimate.waitFor({state:'visible'});await shot('estimate-before-call-light');await page.keyboard.press('Escape');
   await page.keyboard.press('Control+,');await page.locator('.sidebar > .settings-page').waitFor({state:'visible'});await page.getByRole('button',{name:'Agent',exact:true}).click();await shot('settings-agent-voice-provider-light');
   await page.getByRole('button',{name:'Voice provider',exact:true}).click();await page.getByRole('menuitemradio',{name:'Cascade'}).click();await closeSettings();
   await mode('Dark');
  });
  assert.deepEqual(errors,[]);
 }finally{await app.close().catch(()=>{});}
});
