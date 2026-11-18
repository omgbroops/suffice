import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

const SHOTS=process.env.CTX_SHOTS||'';
const big='line\n'.repeat(1200);
const items=[
 {id:'system',kind:'system',label:'System prompt',tokens:3200,fixed:true},
 {id:'skill:review',kind:'skills',label:'review',tokens:120,fixed:true},
 {id:'skill:deploy',kind:'skills',label:'deploy',tokens:90,fixed:true},
 {id:'tool:bash',kind:'tools',label:'bash',tokens:640},
 {id:'tool:read',kind:'tools',label:'read',tokens:410},
 {id:'tool:browser',kind:'tools',label:'browser',tokens:1900},
 {id:'m2:3',kind:'files',label:'/app/src/login.js',tokens:2300},
 {id:'m0:1',kind:'history',label:'You: fix the login redirect bug',tokens:12},
 {id:'m1:2',kind:'history',label:'Assistant: reading the login module',tokens:30,fixed:true},
 {id:'m3:4',kind:'history',label:'bash result',tokens:5200,summaryTokens:80},
 {id:'m4:5',kind:'history',label:'Assistant: the redirect used the wrong URL',tokens:44},
];
const turns=[{n:1,at:1,window:200000,items:items.slice(0,9),removed:[],summaries:false},{n:2,at:2,window:200000,items,removed:['tool:browser'],summaries:true}];

test('context chip opens the inspector; removals and summaries-only reach the next run',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-ctx-ui-')),history=resolve(home,'history'),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-agent-context-inspector-'+process.pid,SUFFICE_HISTORY_HOME:history};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 const stderr=[];app.process().stderr.on('data',d=>stderr.push(String(d)));
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain},{items,turns})=>{
   globalThis.runs=[];
   for(const action of ['run','thread','threads','context','abort'])ipcMain.removeHandler('suffice:'+action);
   ipcMain.handle('suffice:threads',()=>[{id:'t1',title:'Fix login redirect',project:'app',cwd:process.cwd(),modified:Date.now(),status:'done'}]);
   ipcMain.handle('suffice:thread',(_e,id)=>({id,title:'Fix login redirect',cwd:process.cwd(),messages:[{role:'user',timestamp:1,content:[{type:'text',text:'fix the login redirect bug'}]},{role:'assistant',timestamp:5,content:[{type:'text',text:'The redirect used the wrong URL; fixed in login.js.'}]}]}));
   ipcMain.handle('suffice:context',(_e,id)=>id==='t1'?{window:200000,items,turns}:null);
   ipcMain.handle('suffice:abort',()=>{});
   ipcMain.handle('suffice:run',(_e,payload)=>{globalThis.runs.push(payload);return {text:'ok',threadId:payload.threadId};});
  },{items,turns});
  await page.reload();await page.locator('.composer').waitFor();
  const shot=async name=>{if(!SHOTS)return;for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(250);const b64=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1440,900);await new Promise(r=>setTimeout(r,250));return (await w.webContents.capturePage()).toPNG().toString('base64');});await writeFile(resolve(SHOTS,`${name}-${theme}.png`),Buffer.from(b64,'base64'));}await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});};

  // the start footer shows the count (0 tokens) but there is nothing to inspect before a thread is open
  assert.equal((await page.locator('.context-chip').textContent()).trim(),'0');
  assert.equal(await page.locator('.context-chip').evaluate(e=>e.closest('.composer-meta-left')!==null),true);
  await page.locator('.thread-row').filter({hasText:'Fix login redirect'}).click();
  const chip=page.getByRole('button',{name:'Context inspector'});await chip.waitFor();
  await page.waitForFunction(()=>document.querySelector('.context-chip').textContent.trim()==='14k');
  await shot('01-chip');

  // open from the chip: five categories with counts, total in the header
  await chip.click();const panel=page.getByRole('dialog',{name:'Context inspector'});await panel.waitFor();
  assert.equal(await chip.getAttribute('aria-expanded'),'true');
  assert.match(await panel.locator('.context-total').innerText(),/13,946 tokens of 200k/);
  assert.deepEqual(await panel.locator('.context-group-name').allInnerTexts(),['System','Skills','Files','Tool schemas','History']);
  assert.ok(await panel.locator('.context-seg').count()===5);
  await panel.locator('.context-group[data-kind=tools]').locator('summary').click();
  await panel.locator('.context-group[data-kind=skills]').locator('summary').click();
  await page.mouse.move(5,5);
  await page.waitForTimeout(300);
  const gap=await page.evaluate(()=>document.querySelector('.composer').getBoundingClientRect().top-document.querySelector('.context-inspector').getBoundingClientRect().bottom);
  assert.ok(Math.abs(gap-8)<=1,'panel sits 8px above the composer, got '+gap+' '+await page.evaluate(()=>{const p=document.querySelector('.context-inspector'),c=document.querySelector('.composer');return JSON.stringify([p.style.cssText,innerHeight,c.getBoundingClientRect().top,p.getBoundingClientRect().bottom,getComputedStyle(p).transform])}));
  await shot('02-open');

  // remove a tool schema: total drops by its tokens, row is struck, undo restores
  const total=()=>panel.locator('.context-total').innerText().then(t=>Number(t.match(/^([\d,]+)/)[1].replace(/,/g,'')));
  const before=await total();
  await panel.getByRole('button',{name:'Remove browser from the next turn'}).click();
  assert.equal(await total(),before-1900);
  assert.equal(await panel.locator('.context-item[data-id="tool:browser"]').getAttribute('data-removed'),'');
  await shot('03-removed');
  // fixed items (system prompt, assistant turns with tool calls) offer no removal
  assert.equal(await panel.getByRole('button',{name:/Remove System prompt|Remove Assistant: reading/}).count(),0);

  // summaries only: the long tool result counts as its summary
  const sw=panel.getByRole('switch',{name:'Summaries only'});await sw.click();await page.mouse.move(5,5);
  assert.equal(await sw.getAttribute('aria-checked'),'true');
  assert.equal(await total(),before-1900-5200+80);
  assert.match(await panel.locator('.context-item[data-id="m3:4"]').innerText(),/80 \(summary\)/);
  await shot('04-summaries');
  await page.waitForFunction(()=>document.querySelector('.context-chip').textContent.trim()==='6.9k');

  // an earlier turn is read-only and shows what it sent
  await panel.getByRole('button',{name:'Turn 2'}).click();
  assert.equal(await panel.getByRole('switch',{name:'Summaries only'}).isDisabled(),true);
  assert.equal(await panel.locator('.context-remove').count(),0);
  assert.equal(await panel.locator('.context-item[data-id="tool:browser"]').getAttribute('data-removed'),'');
  assert.equal(await panel.locator('.context-item',{hasText:'bash result'}).locator('.context-item-tokens').innerText(),'80 (summary)');
  assert.equal(await panel.locator('.settings-switch').getAttribute('aria-disabled'),'true');
  await shot('05-turn');
  await panel.getByRole('button',{name:'Next turn'}).click();

  // Escape closes and returns focus to the chip
  await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.activeElement.className.includes('context-chip')),true);

  // sending: removals ride along once, summaries stay on
  await page.locator('#prompt').fill('now fix the tests');await page.locator('.composer').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>true);await page.waitForTimeout(400);
  const runs=await app.evaluate(()=>globalThis.runs);
  assert.equal(runs.length,1);assert.deepEqual(runs[0].context,{exclude:['tool:browser'],summaries:true});
  await page.locator('#prompt').fill('and the docs');await page.locator('.composer').evaluate(f=>f.requestSubmit());
  await page.waitForTimeout(400);
  const second=(await app.evaluate(()=>globalThis.runs))[1];
  assert.deepEqual(second.context,{exclude:[],summaries:true},'removals last one message');

  // empty state: a chat with nothing in context yet
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:context');ipcMain.handle('suffice:context',()=>({window:null,items:[],turns:[]}));});
  await page.evaluate(()=>document.dispatchEvent(new Event('suffice:usage-change')));await chip.click();await panel.waitFor();
  assert.match(await panel.innerText(),/Nothing in context yet/);
  await shot('06-empty');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
 const crash=stderr.join('').split('\n').filter(l=>l.includes('[no-dialog]'));assert.deepEqual(crash,[]);
});
