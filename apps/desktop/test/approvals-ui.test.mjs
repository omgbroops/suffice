import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';

test('composer approvals preserve drafts, isolate threads, and send explicit Allow/Deny answers',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-approval-ui-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{const page=await app.firstWindow();await page.locator('.composer').waitFor();await app.evaluate(({ipcMain,BrowserWindow})=>{
  globalThis.answers=[];globalThis.pending=new Map();
  for(const action of ['run','thread','threads','approval-answer'])ipcMain.removeHandler('suffice:'+action);
  ipcMain.handle('suffice:threads',()=>[]);ipcMain.handle('suffice:thread',(_e,id)=>({id,title:id,messages:[]}));
  ipcMain.handle('suffice:approval-answer',(_e,payload)=>globalThis.answers.push(payload));
  ipcMain.handle('suffice:run',(_e,payload)=>new Promise(resolve=>{const id=payload.prompt;globalThis.pending.set(id,resolve);BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'thread_started',id,threadId:id,clientId:payload.clientId});}));
 });await page.evaluate(()=>localStorage.setItem('suffice-settings-v1',JSON.stringify({'code-font':'Geist Mono'})));await page.reload();const submit=async text=>{await page.locator('#prompt').fill(text);await page.locator('.composer').evaluate(form=>{form.modelsDisabled=false;form.requestSubmit();});await page.locator('.thread-row').filter({hasText:text}).waitFor();};
 const emit=event=>app.evaluate(({BrowserWindow},event)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',event),event);
 await submit('one');await page.locator('#prompt').fill('Keep this draft');
 const code='const result = await tools.bash({command: "git status --short"});\ntext(result.output);\n'+Array.from({length:36},(_,i)=>`// Preview line ${i+1}`).join('\n');
 await emit({event:'approval',threadId:'one',requestId:1,name:'codemode',input:{code}});const panel=page.getByRole('region',{name:'Agent approval'});await panel.waitFor();assert.equal(await panel.locator('code').textContent(),code);assert.equal(await page.locator('#prompt').isVisible(),false);assert.equal(await page.locator('dialog[open]').count(),0);
 await page.locator('.thread-row[data-status=approval]').waitFor();assert.equal(await page.locator('.thread-row[data-status=approval] .thread-state').getAttribute('aria-label'),'Needs approval');await page.waitForFunction(()=>{const el=document.querySelector('.thread-row[data-status=approval] .thread-state svg');return el&&getComputedStyle(el).animationName==='none';});
 await emit({event:'changes',threadId:'one',diff:{scope:'chat',added:0,removed:0,files:0,partial:true}});await page.waitForFunction(()=>document.querySelector('.thread-row')._threadDetails.diff?.partial);assert.equal(await page.locator('.thread-row .thread-diff').count(),0);
 await page.locator('.thread-row[data-thread=one]').hover();await page.locator('.thread-hover-card:not([hidden])').waitFor();assert.match(await page.locator('.thread-hover-card').innerText(),/Needs approval/);assert.doesNotMatch(await page.locator('.thread-hover-card').innerText(),/Chat changes/);assert.equal(await page.locator('.thread-hover-card .thread-state').evaluate(el=>getComputedStyle(el).color),await page.locator('.thread-row[data-thread=one] .thread-state').evaluate(el=>getComputedStyle(el).color));await page.mouse.move(900,500);
 await emit({event:'changes',threadId:'one',diff:{scope:'chat',added:14,removed:9,files:1,partial:true}});await page.waitForFunction(()=>document.querySelector('.thread-row')._threadDetails.diff?.added===14);await page.waitForTimeout(400);await page.mouse.move(900,500);await page.locator('.thread-row[data-thread=one]').hover();await page.locator('.thread-hover-card:not([hidden]) .thread-added').waitFor();assert.equal(await page.locator('.thread-hover-card .thread-added').evaluate(el=>getComputedStyle(el).color),await page.locator('.thread-row .thread-added').evaluate(el=>getComputedStyle(el).color));assert.notEqual(await page.locator('.thread-hover-card .thread-added').evaluate(el=>getComputedStyle(el).color),await page.locator('.thread-hover-card .thread-removed').evaluate(el=>getComputedStyle(el).color));await page.mouse.move(900,500);
 await panel.locator('code .syntax-token').first().waitFor();const font=await panel.locator('code').evaluate(el=>getComputedStyle(el).fontFamily);assert.match(font,/Geist Mono/);
 for(const theme of ['light','dark']){await page.locator('html').evaluate((el,theme)=>el.dataset.theme=theme,theme);const colors=await panel.locator('code .syntax-token').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).color));assert.ok(new Set(colors).size>2,'Approval code must have distinct syntax colors in '+theme);}
 const rail=panel.locator('.sidebar-scroll-rail');await rail.waitFor();assert.equal(await panel.locator('.approval-preview').evaluate(el=>getComputedStyle(el).scrollbarWidth),'none');const bounds=await rail.boundingBox(),previewBounds=await panel.locator('.approval-preview').boundingBox();assert.ok(Math.abs(previewBounds.x+previewBounds.width-bounds.x-bounds.width)<=4);assert.ok(bounds.y-previewBounds.y>=5);assert.ok(previewBounds.y+previewBounds.height-bounds.y-bounds.height>=5);await rail.click({position:{x:3,y:bounds.height-8}});await page.waitForFunction(()=>document.querySelector('.approval-preview').scrollTop>0);
 for(const theme of ['light','dark']){await page.locator('html').evaluate((el,theme)=>el.dataset.theme=theme,theme);await page.screenshot({path:resolve(home,'approval-'+theme+'.png'),animations:'disabled'});}
 await page.getByRole('button',{name:'New session',exact:true}).click();await panel.waitFor({state:'hidden'});await submit('two');
 await emit({event:'approval',threadId:'two',requestId:1,name:'bash',input:{command:'pwd'}});await panel.waitFor();await panel.getByRole('button',{name:'Allow',exact:true}).click();await panel.waitFor({state:'hidden'});
 await page.locator('.thread-row').filter({hasText:'one'}).click();await panel.waitFor();await panel.getByRole('button',{name:'Deny',exact:true}).click();await panel.waitFor({state:'hidden'});assert.equal(await page.locator('#prompt').inputValue(),'Keep this draft');
 assert.deepEqual(await app.evaluate(()=>globalThis.answers),[{threadId:'two',requestId:1,allow:true},{threadId:'one',requestId:1,allow:false}]);
 await emit({event:'approval',threadId:'one',requestId:2,name:'bash',input:{command:'do something'}});await panel.waitFor();await emit({event:'approval_resolved',threadId:'one',requestId:2});await panel.waitFor({state:'hidden'});assert.equal((await app.evaluate(()=>globalThis.answers)).length,2);
 await app.evaluate(()=>{for(const [threadId,finish] of globalThis.pending)finish({threadId,text:'Finished'});});console.log('Approval screenshots: '+home);
 }finally{await app.close();}
});
