import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
test('composer queue, send contrast, transcript files and shared editor preferences',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-queue-'));
 await writeFile(resolve(home,'desktop-settings.json'),JSON.stringify({'working-send':'Queue'}));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.queueRuns=[];globalThis.queueSteers=[];globalThis.openedFiles=[];globalThis.externalOpens=[];
   for(const action of ['run','thread','threads','steer','models','files','file','file-open-options','file-open-in'])ipcMain.removeHandler('suffice:'+action);
   ipcMain.handle('suffice:files',()=>({project:'Fixture',entries:[]}));ipcMain.handle('suffice:file',(_e,path)=>{globalThis.openedFiles.push(path);return {path,text:'linked preview content'};});ipcMain.handle('suffice:file-open-options',()=>[{id:'folder',label:'Show in Explorer'},{id:'terminal',label:'Windows Terminal'}]);ipcMain.handle('suffice:file-open-in',(_e,value)=>globalThis.externalOpens.push(value));
   ipcMain.handle('suffice:models',()=>[{id:'fixture',provider:'openai',name:'Fixture',available:true,efforts:['low']}]);
   ipcMain.handle('suffice:threads',()=>[]);ipcMain.handle('suffice:thread',(_e,id)=>({id,title:'Initial',cwd:process.cwd(),messages:[]}));
   ipcMain.handle('suffice:steer',(_e,payload)=>globalThis.queueSteers.push(payload.prompt));
   ipcMain.handle('suffice:run',(_e,payload)=>new Promise(resolve=>{globalThis.queueRuns.push({payload,resolve});BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'thread_started',id:'fixture-thread',threadId:'fixture-thread',clientId:payload.clientId});}));
  });
  await page.reload();await page.locator('#prompt').fill('Initial');await page.addStyleTag({content:'* { transition:none!important; animation:none!important; }'});
  for(const theme of ['light','dark'])for(const solid of [false,true]){
   await page.evaluate(({theme,solid})=>{document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle('solid-surfaces',solid);},{theme,solid});await page.waitForTimeout(300);
   const colors=await page.evaluate(()=>{const group=document.querySelector('.send-group'),button=group.querySelector('.send-button');return {disabled:button.disabled,bg:getComputedStyle(group).backgroundColor,fg:getComputedStyle(button).color};},{theme,solid});assert.equal(colors.disabled,false);assert.equal(colors.bg,theme==='light'?'rgb(24, 24, 24)':'rgb(237, 237, 237)');assert.equal(colors.fg,theme==='light'?'rgb(255, 255, 255)':'rgb(23, 23, 23)');
  }
  await page.locator('.composer').evaluate(form=>form.requestSubmit());
  await page.getByRole('button',{name:'Stop task',exact:true}).waitFor();
  await page.locator('#prompt').fill('Queued followup');await page.getByRole('button',{name:'Queue message',exact:true}).click();
  await page.locator('.queued-message-text').filter({hasText:'Queued followup'}).waitFor();assert.equal(await app.evaluate(()=>globalThis.queueRuns.length),1);
  assert.ok(await page.locator('.queued-message').evaluate(row=>row.getBoundingClientRect().height<=28));
  assert.equal(await page.locator('.queued-messages').evaluate(panel=>getComputedStyle(panel).backgroundColor),await page.locator('.composer').evaluate(form=>getComputedStyle(form).backgroundColor));
  await page.locator('#prompt').fill('Delete me');await page.getByRole('button',{name:'Queue message',exact:true}).click();
  await page.locator('.queued-message').filter({hasText:'Delete me'}).getByRole('button',{name:'Delete queued message'}).click();assert.equal(await page.locator('.queued-message').count(),1);
  await page.locator('#prompt').fill('Steer instead');await page.locator('#prompt').press('Control+Enter');
  await page.waitForFunction(()=>document.querySelector('#prompt').value==='');assert.deepEqual(await app.evaluate(()=>globalThis.queueSteers),['Steer instead']);
  await app.evaluate(()=>globalThis.queueRuns[0].resolve({threadId:'fixture-thread',text:'Finished initial'}));
  await page.waitForFunction(()=>document.querySelector('.thread-messages').textContent.includes('Queued followup'));
  assert.equal(await app.evaluate(()=>globalThis.queueRuns[1].payload.prompt),'Queued followup');assert.equal(await page.locator('.queued-message').count(),0);
  await app.evaluate(()=>globalThis.queueRuns[1].resolve({threadId:'fixture-thread',text:'[External file](C:/outside/linked.txt)'}));
  await page.locator('.thread-assistant a').filter({hasText:'External file'}).click();
  await page.waitForFunction(()=>document.querySelector('.right-panel-content')?.textContent.includes('linked preview content'),{},{timeout:5000}).catch(async error=>{throw new Error(error.message+' '+JSON.stringify({reads:await app.evaluate(()=>globalThis.openedFiles),panel:await page.locator('.right-panel-content').textContent(),anchor:await page.locator('.thread-assistant a').evaluate(a=>a.outerHTML),errors}));});assert.deepEqual(await app.evaluate(()=>globalThis.openedFiles),['C:/outside/linked.txt']);
  await page.getByRole('button',{name:'Open in…',exact:true}).click();assert.equal((await app.evaluate(()=>globalThis.externalOpens)).length,0);await page.getByRole('menuitem',{name:'Show in Explorer',exact:true}).click();assert.equal((await app.evaluate(()=>globalThis.externalOpens))[0].application,'folder');
  await page.getByRole('button',{name:'Open in…',exact:true}).click();await page.getByRole('menuitem',{name:'Windows Terminal',exact:true}).click();
  await page.getByRole('button',{name:'Open in…',exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.sufficeDesktop.preferences()))['file-open-app'],'terminal');
  await page.getByRole('button',{name:'Wrap lines',exact:true}).click();assert.equal((await page.evaluate(()=>window.sufficeDesktop.preferences()))['wrap-lines'],true);
  await page.getByRole('button',{name:'Open in…',exact:true}).click();await page.locator('.file-open-menu').waitFor({state:'visible'});await page.locator('#prompt').click();await page.locator('.file-open-menu').waitFor({state:'hidden'});
  await page.evaluate(()=>{document.documentElement.classList.remove('solid-surfaces');document.dispatchEvent(new CustomEvent('suffice-toast',{detail:'Example notification'}));});await page.getByRole('button',{name:'Okay',exact:true}).waitFor();assert.equal(await page.locator('.toast').evaluate(el=>el.matches(':popover-open')),true);assert.match(await page.locator('.toast').evaluate(el=>getComputedStyle(el).backdropFilter),/blur\(20px\)/);await page.getByRole('button',{name:'Okay',exact:true}).click();await page.locator('.toast').waitFor({state:'hidden'});

 }finally{await app.close();}
});
