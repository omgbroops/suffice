// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): fork a thread at a message, see the lineage, ask a side chat; driven by clicks and keys.
// SHOT_DIR sets the screenshot folder. Main-process IPC is stubbed: no model is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {guard} from './electron-guard.mjs';

test('fork at a message, lineage on rows and transcript, side chat drawer that never touches the thread',{timeout:240000},async()=>{
 const shots=resolve(process.env.SHOT_DIR||'/Users/abhayg/suffice-desktop-wt/ui-shots/forge/feat/forks-sidechats');await mkdir(shots,{recursive:true});
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-forks-'))),project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{PI_OFFLINE:'1',SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:`sfx-feat-forks-${process.pid}`,SUFFICE_HISTORY_HOME:home});
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),`--user-data-dir=${data}`],env});
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.composer').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  const shot=async(name,theme,keep=false)=>{await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);if(!keep)await page.mouse.move(700,60);await page.waitForFunction(()=>[...document.querySelectorAll('.thread-messages > .thread-message')].every(e=>getComputedStyle(e).opacity==='1'));await page.waitForTimeout(700);const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(b64,'base64'));};
  const both=async(name,keep)=>{await shot(name,'dark',keep);await shot(name,'light',keep);await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});};
  const source=()=>page.locator('.thread-row').filter({has:page.locator('.thread-card-title',{hasText:/^Plan the Postgres migration$/})});
  const A='a'.repeat(32),B='b'.repeat(32),now=Date.now();
  await app.evaluate(({ipcMain,BrowserWindow},{A,B,now,project})=>{
   const text=t=>[{type:'text',text:t}],turn=id=>({id,startedAt:now-600000,endedAt:now-590000,provider:'anthropic',model:'claude-sonnet-4',modelName:'Claude Sonnet 4',effort:'low'});
   const messages=[
    {entryId:'u1',role:'user',timestamp:now-600000,content:text('Plan the Postgres migration for the billing service'),turn:turn('t1')},
    {entryId:'a1',role:'assistant',timestamp:now-595000,content:text('Start with a **dual-write phase**: write to both databases, read from the old one, and compare results for a week.\n\n1. Add the new schema behind a flag\n2. Backfill history in batches\n3. Switch reads once the diff is empty'),turn:turn('t1')},
    {entryId:'u2',role:'user',timestamp:now-300000,content:text('What should the rollback plan look like?'),turn:turn('t2')},
    {entryId:'a2',role:'assistant',timestamp:now-295000,content:text('Keep the old database writable until the cutover is a week old. Rolling back is then a flag flip, not a restore.'),turn:turn('t2')}];
   globalThis.forks=[];globalThis.sides=[];globalThis.runs=0;globalThis.messagesOf={[A]:messages,[B]:messages.slice(0,2)};
   globalThis.threads=[{id:A,title:'Plan the Postgres migration',project:'billing',cwd:project,modified:now-290000,status:'done',provider:'anthropic',branch:'main'},
    {id:'c'.repeat(32),title:'Audit color tokens for contrast',project:'billing',cwd:project,modified:now-3600000,status:'done',provider:'openai'}];
   for(const a of ['run','thread','threads','models','fork-thread','side-run','side-end'])ipcMain.removeHandler('suffice:'+a);
   ipcMain.handle('suffice:models',()=>[{id:'fixture',provider:'anthropic',name:'Fixture',available:true,efforts:['low']}]);
   ipcMain.handle('suffice:threads',()=>globalThis.threads);
   ipcMain.handle('suffice:thread',(_e,id)=>({id,title:globalThis.threads.find(t=>t.id===id)?.title||id,cwd:project,messages:globalThis.messagesOf[id]||[],running:false}));
   ipcMain.handle('suffice:run',()=>{globalThis.runs++;return globalThis.live?{text:'Ship it behind a flag.',threadId:'a'.repeat(32)}:{};});
   ipcMain.handle('suffice:fork-thread',(_e,id,at)=>{globalThis.forks.push({id,at});if(!globalThis.threads.some(t=>t.id===B))globalThis.threads.unshift({id:B,title:'Fork of Plan the Postgres migration',project:'billing',cwd:project,modified:Date.now(),status:'done',provider:'anthropic',parent:id});return {id:B,cwd:project};});
   ipcMain.handle('suffice:side-run',(_e,payload)=>{globalThis.sides.push(payload);const w=BrowserWindow.getAllWindows()[0];const answer=`Rolling back means flipping the read flag back to the old database. It stays writable for **seven days** after cutover, so no restore is needed.`;w.webContents.send('suffice:event',{event:'assistant_start',clientId:payload.clientId});w.webContents.send('suffice:event',{event:'text',text:answer,clientId:payload.clientId});return {text:answer};});
   ipcMain.handle('suffice:side-end',(_e,id)=>{globalThis.sides.push({ended:id});return null;});
  },{A,B,now,project});
  await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('suffice-thread-view'))localStorage.removeItem(k);});
  await page.reload();await page.locator('.thread-row').first().waitFor();
  await page.addStyleTag({content:'* { transition:none!important; animation:none!important; }'});
  await source().click();
  await page.locator('.thread-message.thread-assistant').first().waitFor();
  assert.equal(await page.locator('.thread-fork-origin').count(),0,'an original thread has no origin note');

  // fork at an assistant message through the message toolbar
  await page.locator('.thread-message.thread-assistant').first().hover();
  await page.locator('.message-actions-slot[data-role=assistant] .message-fork').first().waitFor();
  await both('fork-button',true);
  await page.locator('.message-actions-slot[data-role=assistant] .message-fork').first().click();
  await page.locator('.thread-fork-origin').waitFor();
  assert.deepEqual(await app.evaluate(()=>globalThis.forks),[{id:A,at:{entryId:'a1',before:false}}]);
  assert.match(await page.locator('.thread-fork-origin').innerText(),/Forked from Plan the Postgres migration/);
  assert.equal(await page.locator('.thread-message').count(),2,'history stops at the fork point');
  const row=page.locator('.thread-row',{hasText:'Fork of Plan the Postgres migration'});
  assert.match(await row.locator('.thread-fork').innerText(),/Plan the Postgres migration/);
  await both('fork-open');
  // the lineage link goes back to the source
  await page.locator('.thread-fork-origin-link').click();
  await page.locator('.thread-message').nth(3).waitFor();assert.equal(await page.locator('.thread-message').count(),4);
  assert.equal(await page.locator('.thread-fork-origin').count(),0);
  await row.locator('.thread-card-title').click();await page.locator('.thread-fork-origin').waitFor();
  await row.locator('.thread-fork').click();await page.waitForFunction(()=>document.querySelectorAll('.thread-messages > .thread-message').length===4&&!document.querySelector('.thread-fork-origin'));

  // fork before a user message puts that message back in the composer
  await source().click();await page.locator('.thread-message').nth(3).waitFor();
  await page.locator('.thread-message.thread-user').nth(1).hover();
  await page.getByRole('button',{name:'Fork before this message and edit it'}).last().click();
  await page.waitForFunction(()=>document.querySelector('#prompt').value==='What should the rollback plan look like?');
  assert.deepEqual((await app.evaluate(()=>globalThis.forks)).at(-1),{id:A,at:{entryId:'u2',before:true}});
  await page.evaluate(()=>{const p=document.querySelector('#prompt');p.value='';p.dispatchEvent(new Event('input'));});

  // side chat: reach it from the island button, ask, never touch the thread
  await source().click();await page.locator('.thread-message').nth(3).waitFor();
  const toggle=page.locator('.side-chat-toggle');assert.equal(await toggle.isVisible(),true);
  await toggle.click();
  await page.waitForFunction(()=>document.body.classList.contains('side-chat-open')&&!document.querySelector('.side-chat').inert);
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  await page.waitForFunction(()=>document.activeElement.className==='side-chat-input');
  assert.ok(await page.locator('.side-chat-empty').isVisible());
  await both('side-empty');
  await page.keyboard.type('How do I roll this back?');await page.keyboard.press('Enter');
  await page.locator('.side-chat-assistant').filter({hasText:'flipping the read flag'}).waitFor();
  assert.deepEqual((await app.evaluate(()=>globalThis.sides)).map(s=>[s.threadId,s.prompt]),[[A,'How do I roll this back?']]);
  assert.equal(await app.evaluate(()=>globalThis.runs),0,'a side question never starts a run in the thread');
  assert.equal(await page.locator('.thread-messages > .thread-message').count(),4,'the thread transcript is unchanged');
  assert.equal(await page.locator('#prompt').inputValue(),'');
  await page.keyboard.type('And the data written meanwhile?');
  await both('side-answered');
  // the drawer follows the open thread
  await page.locator('.thread-row',{hasText:'Audit color tokens'}).click();
  await page.waitForFunction(()=>document.querySelector('.side-chat-empty'));
  assert.equal(await page.locator('.side-chat-message').count(),0);
  await source().click();
  await page.waitForFunction(()=>document.querySelectorAll('.side-chat-message').length===2);
  assert.equal(await page.locator('.side-chat-input').inputValue(),'And the data written meanwhile?','a draft is kept per thread');
  // fresh side chat ends the snapshot; Escape and the shortcut close/open it
  await page.locator('[data-side="new"]').click();await page.waitForFunction(()=>!document.querySelector('.side-chat-message'));
  assert.ok((await app.evaluate(()=>globalThis.sides)).some(s=>s.ended===A));
  await page.locator('.side-chat-input').focus();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.body.classList.contains('side-chat-open'));
  await page.keyboard.press('Control+Shift+U');await page.waitForFunction(()=>document.body.classList.contains('side-chat-open'));
  await page.locator('[data-side="close"]').click();await page.waitForFunction(()=>!document.body.classList.contains('side-chat-open'));
  // a message sent in this view can be forked right away, without reopening the thread
  await app.evaluate(({},{A,now})=>{const text=t=>[{type:'text',text:t}];globalThis.live=true;globalThis.messagesOf[A]=[...globalThis.messagesOf[A],{entryId:'u3',role:'user',timestamp:now,content:text('Summarize the plan')},{entryId:'a3',role:'assistant',timestamp:now,content:text('Ship it behind a flag.')}];},{A,now});
  await source().click();await page.locator('.thread-message').nth(3).waitFor();
  await page.locator('#prompt').fill('Summarize the plan');await page.locator('#prompt').press('Enter');
  await page.locator('.thread-message.thread-assistant').filter({hasText:'Ship it behind a flag.'}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.thread-status'));
  await page.locator('.thread-message.thread-assistant').last().hover();
  await page.locator('.message-toolbar:not([hidden]) .message-fork').last().click();
  await page.waitForFunction(()=>document.querySelector('.thread-fork-origin'));
  assert.deepEqual((await app.evaluate(()=>globalThis.forks)).at(-1),{id:A,at:{entryId:'a3',before:false}});

  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
