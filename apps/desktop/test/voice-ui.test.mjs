import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
// Launches through a wrapper that keeps every window hidden, unfocused and out of the Dock; the fake media flags keep the real microphone closed.
// The offline voice provider is driven with window.__sufficeVoice.emit, so nothing here needs a network or a sound device.
test('voice: strip, full view, floating orb window, transcript rules, geometry and orb',{timeout:140000},async t=>{
 const root=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-voice-')));
 const home=resolve(root,'suffice-home'),fakeHome=resolve(root,'home'),project=resolve(root,'project');
 for(const dir of [home,fakeHome,project])await mkdir(dir);
 const env={PATH:process.env.PATH,HOME:fakeHome,TMPDIR:process.env.TMPDIR,LANG:process.env.LANG,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project};
 const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop/test/voice-hidden-main.cjs'),'--user-data-dir='+resolve(root,'electron'),'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--mute-audio'],env});
 const errors=[];
 try{
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push('main: '+error.message));await page.locator('.composer').waitFor();
  app.on('window',other=>other.on('pageerror',error=>errors.push('window: '+error.message)));
  await app.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.voiceRuns=[];
   globalThis.mainWindow=()=>BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('voice-orb'));
   for(const action of ['run','thread','threads','models'])ipcMain.removeHandler('suffice:'+action);
   ipcMain.handle('suffice:models',()=>[{id:'fixture',provider:'openai',name:'Fixture',available:true,efforts:['low']}]);
   ipcMain.handle('suffice:threads',()=>[]);ipcMain.handle('suffice:thread',(_e,id)=>({id,title:'Voice',cwd:process.cwd(),messages:[]}));
   ipcMain.handle('suffice:run',(_e,payload)=>new Promise(resolve=>{globalThis.voiceRuns.push({payload,resolve});globalThis.mainWindow().webContents.send('suffice:event',{event:'thread_started',id:'voice-thread',threadId:'voice-thread',clientId:payload.clientId});}));
  });
  const finishRun=text=>app.evaluate(({},text)=>{const run=globalThis.voiceRuns.at(-1);globalThis.mainWindow().webContents.send('suffice:event',{event:'run_completed',threadId:'voice-thread',clientId:run.payload.clientId,result:{text}});run.resolve({threadId:'voice-thread',text});},text);
  await page.reload();await page.locator('.composer').waitFor();await page.locator('.voice-start').waitFor();
  await page.addStyleTag({content:'* { transition:none!important; }'});
  await page.evaluate(()=>{localStorage.setItem('suffice-voice-provider','fake');localStorage.setItem('suffice-voice-autoplay','false');});
  const form=page.locator('form.composer'),strip=page.locator('.voice-strip'),startButton=page.locator('.voice-start'),prompt=page.locator('#prompt'),full=page.locator('.voice-full');
  const word=()=>strip.locator('.voice-word').textContent();
  const attr=()=>form.getAttribute('data-voice');
  const on=()=>page.evaluate(()=>!!document.querySelector('form.composer').dataset.voice);
  const start=async()=>{await startButton.click();await page.waitForFunction(()=>document.querySelector('form.composer').dataset.voice&&window.__sufficeVoice);};
  const end=async()=>{if(await on()){await page.locator('.voice-stop').click();await page.waitForFunction(()=>!document.querySelector('form.composer').dataset.voice);}};
  const emit=async(event,wait=500)=>{await page.evaluate(event=>window.__sufficeVoice.emit(event),event);await page.waitForTimeout(wait);};
  const inThread=()=>page.evaluate(()=>document.querySelector('.workspace').classList.contains('thread-view'));
  const count=selector=>page.locator(selector).count();
  const windows=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({url:w.webContents.getURL(),visible:w.isVisible()})));
  const box=selector=>page.locator(selector).first().boundingBox();
  const sides=['Top','Right','Bottom','Left'];
  const speak=async(output=0.6)=>{for(const v of [output/2,output,output*0.8]){await emit({type:'level',input:0,output:v},130);}};

  await t.test('mic button: names, pressed state, strip, composer size and strip position',async()=>{
   assert.equal(await startButton.count(),1);
   assert.equal(await startButton.getAttribute('aria-label'),'Start voice conversation');assert.equal(await startButton.getAttribute('aria-pressed'),'false');
   assert.equal(await strip.isVisible(),false);assert.equal(await on(),false);
   const before=await form.boundingBox();
   await start();
   assert.equal(await attr(),'on');
   assert.equal(await page.getByRole('button',{name:'Stop voice conversation',exact:true}).count(),1);assert.equal(await startButton.getAttribute('aria-pressed'),'true');
   assert.equal(await strip.isVisible(),true);assert.equal(await strip.getAttribute('role'),'group');
   assert.equal(await prompt.isVisible(),true);assert.equal(await prompt.isEnabled(),true);
   const after=await form.boundingBox(),s=await strip.boundingBox();
   assert.ok(Math.abs(after.width-before.width)<=1,`composer width ${before.width} -> ${after.width}`);assert.ok(Math.abs(after.height-before.height)<=1,`composer height ${before.height} -> ${after.height}`);
   assert.equal(await strip.evaluate(el=>el.nextElementSibling===document.querySelector('form.composer')),true,'strip is directly before the composer form');
   assert.ok(Math.abs(s.width-after.width)<=1,`strip width ${s.width} vs composer ${after.width}`);assert.ok(Math.abs(s.x-after.x)<=1);
   assert.ok(after.y-(s.y+s.height)>=0&&after.y-(s.y+s.height)<=12,'strip sits directly above the composer');
   assert.equal(await strip.locator('canvas.voice-orb').count(),1);assert.equal(await strip.locator('.voice-word').getAttribute('role'),'status');
   for(const source of ['mic','agent'])assert.equal(await strip.locator(`.voice-meter[data-source="${source}"] .voice-bar`).count(),6,source);
   assert.deepEqual(await strip.locator('.voice-control').allTextContents(),['Mute','Full','Stop']);assert.equal(await strip.locator('.voice-mute').getAttribute('aria-pressed'),'false');
   assert.deepEqual(await strip.locator('.voice-orb').evaluate(el=>[el.getBoundingClientRect().width,el.getBoundingClientRect().height]),[20,20]);
   await emit({type:'level',input:1,output:0},130);assert.equal(await strip.locator('.voice-meter[data-source="mic"] .voice-bar').last().getAttribute('data-on'),'true');
   await startButton.click();await page.waitForFunction(()=>!document.querySelector('form.composer').dataset.voice);
   assert.equal(await strip.isVisible(),false);assert.equal(await startButton.getAttribute('aria-pressed'),'false');assert.equal(await startButton.getAttribute('aria-label'),'Start voice conversation');
   assert.equal(await prompt.isEnabled(),true);
  });

  await t.test('status words',async()=>{
   await start();await page.waitForFunction(()=>document.querySelector('.voice-strip .voice-word').textContent==='connecting');
   assert.equal(await word(),'connecting');
   await emit({type:'state',state:'listening'});assert.equal(await word(),'listening');assert.equal(await form.getAttribute('data-voice-state'),'listening');
   await emit({type:'state',state:'speaking'});assert.equal(await word(),'speaking');
   await emit({type:'agent_partial',text:'I added the test.'},100);await emit({type:'agent_final',text:'I added the test.',interrupted:true,heard:'I added'},100);await emit({type:'state',state:'heard'});
   assert.equal(await word(),'heard');
   await emit({type:'state',state:'muted'});assert.equal(await word(),'muted');
   await end();
  });

  await t.test('mute from the strip and the shortcut, full view mirror, start and stop shortcut',async()=>{
   await start();await emit({type:'state',state:'listening'});
   const mute=strip.locator('.voice-mute'),fullMute=page.locator('.voice-full-mute');
   assert.equal(await fullMute.getAttribute('aria-label'),'Mute microphone');
   await mute.click();await page.waitForTimeout(500);
   assert.equal(await mute.getAttribute('aria-pressed'),'true');assert.equal(await mute.textContent(),'Unmute');assert.equal(await word(),'muted');
   assert.equal(await fullMute.getAttribute('aria-label'),'Unmute microphone');assert.equal(await fullMute.getAttribute('aria-pressed'),'true');
   await page.keyboard.press('Control+Shift+U');await page.waitForTimeout(500);
   assert.equal(await mute.getAttribute('aria-pressed'),'false');assert.equal(await mute.textContent(),'Mute');assert.equal(await word(),'listening');
   assert.equal(await fullMute.getAttribute('aria-label'),'Mute microphone');assert.equal(await fullMute.getAttribute('aria-pressed'),'false');
   await page.keyboard.press('Control+Shift+U');await page.waitForTimeout(500);
   assert.equal(await mute.getAttribute('aria-pressed'),'true');assert.equal(await fullMute.getAttribute('aria-label'),'Unmute microphone');
   await page.keyboard.press('Control+Shift+U');await page.waitForTimeout(200);
   await end();
   await page.keyboard.press('Control+Shift+M');await page.waitForFunction(()=>document.querySelector('form.composer').dataset.voice==='on');assert.equal(await strip.isVisible(),true);
   await page.keyboard.press('Control+Shift+M');await page.waitForFunction(()=>!document.querySelector('form.composer').dataset.voice);assert.equal(await strip.isVisible(),false);
   await page.keyboard.press('Control+Shift+U');assert.equal(await on(),false,'mute shortcut does nothing while voice is off');
  });

  await t.test('outside a thread no message elements are added; errors toast, notices do not',async()=>{
   assert.equal(await inThread(),false);
   await start();await emit({type:'state',state:'listening'});
   await emit({type:'user_final',text:'Hello there.'});await emit({type:'agent_partial',text:'Hi.'},100);await emit({type:'agent_final',text:'Hi.'});
   assert.equal(await count('article.thread-message'),0);
   await emit({type:'error',message:'Voice fixture error'});
   assert.equal(await page.getByText('Voice fixture error').count(),1);
   await end();
  });

  await t.test('delegation from the home screen submits through the normal path',async()=>{
   await start();await emit({type:'state',state:'listening'});
   await emit({type:'user_final',text:'Add the voice regression test.'},100);
   await emit({type:'tool_call',id:'call_home',name:'background_agent',args:{prompt:'Add the voice regression test.'}},900);
   assert.equal(await inThread(),true);
   assert.equal(await page.locator('.thread-user').filter({hasText:'Add the voice regression test.'}).count(),1);
   assert.equal(await count('.thread-user[data-voice]'),0);
   assert.equal(await app.evaluate(()=>globalThis.voiceRuns.at(-1).payload.prompt),'Add the voice regression test.');
   await finishRun('Added the regression test.');await page.waitForTimeout(400);
   assert.notEqual(await form.getAttribute('data-running'),'true');
   assert.equal(await on(),true,'voice continues after the task');
  });

  await t.test('transcript rules inside a thread',async()=>{
   assert.equal(await inThread(),true);
   const spoken='article.thread-message[data-voice]';
   await emit({type:'state',state:'listening'});
   await emit({type:'user_partial',text:'Run the whole'});assert.equal(await count(spoken),0,'user partial adds nothing');
   await emit({type:'user_final',text:'Run the whole suite please.'});
   assert.equal(await count('article.thread-message.thread-user[data-voice]'),1);assert.equal(await page.locator('article.thread-message.thread-user[data-voice]').textContent(),'Run the whole suite please.');
   await emit({type:'state',state:'speaking'});
   await emit({type:'agent_partial',text:'Running'},100);await emit({type:'agent_partial',text:'Running **the suite** now'},100);
   assert.equal(await count('article.thread-message.thread-assistant[data-voice]'),1,'partials update one element');
   await emit({type:'agent_final',text:'Running **the suite** now, `npm test` and `# done`.'},100);
   assert.equal(await count('article.thread-message.thread-assistant[data-voice]'),1);
   assert.equal(await page.locator('article.thread-message.thread-assistant[data-voice]').textContent(),'Running the suite now, npm test and done.');
   await emit({type:'agent_partial',text:'Second reply'},100);await emit({type:'agent_final',text:'Second reply'},100);
   assert.equal(await count('article.thread-message.thread-assistant[data-voice]'),2,'a new reply after a final is a new element');
   // A spoken request that becomes a task: the spoken copy goes, the real message stays.
   await emit({type:'user_final',text:'Now fix the flaky test.'},100);assert.equal(await count('article.thread-message.thread-user[data-voice]'),2);
   await emit({type:'tool_call',id:'call_thread',name:'background_agent',args:{prompt:'Now fix the flaky test.'}},900);
   assert.equal(await page.locator('.thread-user[data-voice]').filter({hasText:'Now fix the flaky test.'}).count(),0,'spoken copy removed');
   assert.equal(await page.locator('.thread-user').filter({hasText:'Now fix the flaky test.'}).count(),1,'one real message');
   assert.equal(await app.evaluate(()=>globalThis.voiceRuns.at(-1).payload.prompt),'Now fix the flaky test.');
   await finishRun('Fixed.');await page.waitForTimeout(400);
  });

  await t.test('typing while voice is on does not end the conversation',async()=>{
   assert.equal(await on(),true);
   await emit({type:'state',state:'speaking'});await emit({type:'agent_partial',text:'Talking on'},100);
   await prompt.click();await prompt.pressSequentially('typed words',{delay:20});await page.waitForTimeout(500);
   assert.equal(await prompt.inputValue(),'typed words');
   assert.equal(await on(),true);assert.equal(await strip.isVisible(),true);assert.equal(await startButton.getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>window.__sufficeVoice.conversation.active),true);
   assert.equal(await word(),'listening','typing supersedes the spoken answer');
   await prompt.fill('');
  });

  await t.test('geometry by computed style',async()=>{
   const g=await page.evaluate(sides=>{
    const read=selector=>{const style=getComputedStyle(document.querySelector(selector));return {padding:sides.map(side=>style['padding'+side]),radius:style.borderTopLeftRadius,height:style.height};};
    const s=document.querySelector('.voice-strip').getBoundingClientRect(),c=document.querySelector('form.composer').getBoundingClientRect();
    return {strip:read('.voice-strip'),control:read('.voice-control'),left:[s.left,c.left],right:[s.right,c.right]};
   },sides);
   assert.deepEqual(g.strip.padding,['6px','6px','6px','6px']);assert.equal(g.strip.radius,'12px');
   assert.equal(g.control.radius,'6px');assert.equal(g.control.height,'24px');
   assert.equal(parseFloat(g.strip.radius),parseFloat(g.control.radius)+parseFloat(g.strip.padding[0]));
   assert.ok(Math.abs(g.left[0]-g.left[1])<=1,'left edges '+g.left);assert.ok(Math.abs(g.right[0]-g.right[1])<=1,'right edges '+g.right);
  });

  await t.test('orb: pixelated cells, cell rule, motion, reduced motion, constant box',async()=>{
   const info=selector=>page.locator(selector).evaluate(canvas=>({rendering:getComputedStyle(canvas).imageRendering,bitmap:canvas.width,css:canvas.clientWidth}));
   const cells=css=>Math.max(6,Math.min(120,Math.round(css/(css<40?2:3))));
   const small=await info('.voice-strip .voice-orb');assert.equal(small.css,20);assert.equal(small.rendering,'pixelated');assert.equal(small.bitmap,cells(20));
   await end();
   // Motion: clouds drift while speaking; with reduce-motion nothing changes.
   const frames=async()=>{
    await start();await emit({type:'state',state:'speaking'});await emit({type:'level',input:0,output:0.8},130);
    const read=selector=>page.locator(selector).evaluate(canvas=>canvas.toDataURL());
    const a=await read('.voice-strip .voice-orb'),fa=await read('.voice-full .voice-orb');await page.waitForTimeout(400);
    const b=await read('.voice-strip .voice-orb'),fb=await read('.voice-full .voice-orb');await end();
    return {strip:[a,b],full:[fa,fb]};
   };
   await page.evaluate(()=>document.documentElement.classList.add('reduce-motion'));
   const calm=await frames();assert.equal(calm.strip[0],calm.strip[1]);assert.equal(calm.full[0],calm.full[1]);
   await page.evaluate(()=>document.documentElement.classList.remove('reduce-motion'));
   const live=await frames();assert.notEqual(live.strip[0],live.strip[1],'strip orb drifts');assert.notEqual(live.full[0],live.full[1],'full orb drifts');
   // The CSS box never changes with state or level.
   await start();
   const orbBox=()=>box('.voice-strip .voice-orb');
   await emit({type:'state',state:'listening'});const listening=await orbBox();
   await emit({type:'state',state:'hearing'},100);await emit({type:'level',input:1,output:0},130);const hearing=await orbBox();
   await emit({type:'state',state:'speaking'},100);await emit({type:'level',input:0,output:1},130);const speaking=await orbBox();
   assert.deepEqual(hearing,listening);assert.deepEqual(speaking,listening);
   await end();
  });

  await t.test('full view',async()=>{
   await start();await emit({type:'state',state:'listening'});
   assert.equal(await full.isVisible(),false);
   await page.locator('.voice-expand').click();await full.waitFor();
   assert.equal(await attr(),'full');assert.equal(await full.getAttribute('role'),'dialog');
   await page.waitForTimeout(600); // the orb eases in from scale .9 over 450 ms
   const orb=await page.locator('.voice-full .voice-orb').evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,rendering:getComputedStyle(el).imageRendering,bitmap:el.width}));
   assert.deepEqual([orb.w,orb.h],[168,168]);assert.equal(orb.rendering,'pixelated');assert.equal(orb.bitmap,56);
   assert.equal(await full.locator('.voice-word').textContent(),'listening');
   for(const name of ['mute','end','mini']){
    const r=await page.locator('.voice-full-'+name).evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,radius:getComputedStyle(el).borderTopLeftRadius}));
    assert.deepEqual([r.w,r.h],[40,40],name);assert.equal(r.radius,'50%',name);
   }
   assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('voice-full-mute')),true);
   await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.voice-full').hidden);
   assert.equal(await attr(),'inline');assert.equal(await strip.isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'prompt');
   await page.locator('.voice-expand').click();await full.waitFor();
   await page.locator('.voice-full-mute').click();await page.waitForTimeout(500);assert.equal(await strip.locator('.voice-mute').getAttribute('aria-pressed'),'true');
   await page.locator('.voice-full-mute').click();await page.waitForTimeout(300);
   await page.locator('.voice-full-end').click();await page.waitForFunction(()=>!document.querySelector('form.composer').dataset.voice);
   assert.equal(await full.isVisible(),false);assert.equal(await strip.isVisible(),false);
  });

  await t.test('minimized: a second hidden window mirrors state and sends controls back',async()=>{
   await start();await emit({type:'state',state:'listening'});
   await page.locator('.voice-expand').click();await full.waitFor();
   const opened=app.waitForEvent('window',{timeout:15000});
   await page.locator('.voice-full-mini').click();
   const orbPage=await opened;
   await orbPage.locator('canvas.orb').waitFor();
   assert.ok(orbPage.url().endsWith('#voice-orb'),orbPage.url());
   assert.equal(await attr(),'mini');
   const all=await windows();assert.equal(all.length,2);for(const w of all)assert.equal(w.visible,false,'hidden: '+w.url);
   const orb=await orbPage.locator('canvas.orb').evaluate(el=>({w:el.clientWidth,h:el.clientHeight,rendering:getComputedStyle(el).imageRendering,bitmap:el.width}));
   assert.deepEqual([orb.w,orb.h],[120,120]);assert.equal(orb.rendering,'pixelated');assert.equal(orb.bitmap,40);
   assert.deepEqual(await orbPage.locator('.orb-control').evaluateAll(els=>els.map(el=>el.dataset.action)),['mute','end','expand']);
   await orbPage.getByRole('button',{name:'Mute microphone',exact:true}).waitFor({timeout:5000});
   assert.equal(await orbPage.locator('#app').getAttribute('data-state'),'listening');
   // State relayed from the main window: its mute flips the orb window's button.
   await page.keyboard.press('Control+Shift+U');
   await orbPage.getByRole('button',{name:'Unmute microphone',exact:true}).waitFor({timeout:5000});
   await page.keyboard.press('Control+Shift+U');
   await orbPage.getByRole('button',{name:'Mute microphone',exact:true}).waitFor({timeout:5000});
   // Mute pressed in the orb window acts on the main window.
   await orbPage.locator('[data-action="mute"]').click();
   await page.waitForFunction(()=>document.querySelector('.voice-mute').getAttribute('aria-pressed')==='true',{},{timeout:5000});
   await orbPage.getByRole('button',{name:'Unmute microphone',exact:true}).waitFor({timeout:5000});
   await orbPage.locator('[data-action="mute"]').click();
   await page.waitForFunction(()=>document.querySelector('.voice-mute').getAttribute('aria-pressed')==='false',{},{timeout:5000});
   // End pressed in the orb window stops the conversation and closes that window.
   const closed=orbPage.waitForEvent('close',{timeout:5000});
   await orbPage.locator('[data-action="end"]').click();
   await closed;
   await page.waitForFunction(()=>!document.querySelector('form.composer').dataset.voice);
   assert.equal((await windows()).length,1);
   // Expand returns the main window to the full view and closes the orb window.
   await start();await page.locator('.voice-expand').click();await full.waitFor();
   const again=app.waitForEvent('window',{timeout:15000});await page.locator('.voice-full-mini').click();const second=await again;await second.locator('canvas.orb').waitFor();
   await second.locator('.orb-control').first().waitFor();
   const gone=second.waitForEvent('close',{timeout:5000});await second.locator('[data-action="expand"]').click();await gone;
   await page.waitForFunction(()=>!document.querySelector('.voice-full').hidden);assert.equal(await attr(),'full');assert.equal((await windows()).length,1);
   for(const w of await windows())assert.equal(w.visible,false);
   await page.locator('.voice-full-end').click();await page.waitForFunction(()=>!document.querySelector('form.composer').dataset.voice);
  });

  await t.test('spotlight lists the voice commands and opens the full view',async()=>{
   await page.keyboard.press('Control+k');
   const input=page.getByRole('combobox',{name:'Search threads and commands'});await input.waitFor();await input.fill('voice');
   for(const name of ['Start voice','Voice: full view','Voice: floating orb'])assert.equal(await page.getByRole('option').filter({hasText:name}).count(),1,name);
   await page.getByRole('option').filter({hasText:'Voice: full view'}).click();
   await full.waitFor();assert.equal(await attr(),'full');
   await page.locator('.voice-full-end').click();await page.waitForFunction(()=>!document.querySelector('form.composer').dataset.voice);
  });
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
