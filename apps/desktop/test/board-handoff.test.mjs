import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,realpath,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {createBoardHandoff} from '../electron/board-handoff.mjs';

const ts=new Date().toISOString(),now=Date.now();
const user=(id,parentId,text)=>({type:'message',id,parentId,timestamp:ts,message:{role:'user',content:[{type:'text',text}],timestamp:now}});
const assistant=(id,parentId,content)=>({type:'message',id,parentId,timestamp:ts,message:{role:'assistant',content,api:'x',provider:'p',model:'m',usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:now}});
const SHOTS=process.env.SHOT_DIR||'';

test('handoff text: done from edits, open from the unanswered turn, notes recalled, record written',async()=>{
 const root=await mkdtemp(resolve(tmpdir(),'bh-unit-')),bh=createBoardHandoff({root});
 await bh.saveNote('/p',{name:'db-choice',description:'Postgres over SQLite for migrations',type:'project',body:'x'});
 const messages=[{role:'user',content:[{type:'text',text:'Plan the Postgres migration'}]},{role:'assistant',content:[{type:'toolCall',id:'c',name:'edit',arguments:{path:'a.sql',old_string:'a',new_string:'b'}}]},{role:'user',content:[{type:'text',text:'now add the rollback'}]}];
 const {text,runId}=await bh.handoff({title:'Migration',messages},'/p');
 assert.match(text,/Done\n- Edited a\.sql/);assert.match(text,/Open\n- Unanswered: now add the rollback/);assert.match(text,/db-choice: Postgres over SQLite/);
 assert.ok((await readdir(resolve(root,'handoffs'))).includes(runId+'.json'));
 await assert.rejects(bh.handoff({title:'t',messages:[]},'/p'),/nothing to hand off/);
});

test('desktop: Hand off opens a new thread seeded with the summary; Settings keeps project memory notes',{timeout:240000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-bh-'))),project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
 for(const d of [project,data,suffice,home,resolve(suffice,'sessions','fixture')])await mkdir(d,{recursive:true});
 const lines=[{type:'session',version:3,id:'source',timestamp:ts,cwd:project},user('u1',null,'Plan the Postgres migration'),assistant('a1','u1',[{type:'text',text:'Editing the schema.'},{type:'toolCall',id:'c1',name:'edit',arguments:{path:'schema.sql',old_string:'a',new_string:'b'}}]),{type:'message',id:'t1',parentId:'a1',timestamp:ts,message:{role:'toolResult',toolCallId:'c1',toolName:'edit',content:[{type:'text',text:'ok'}],isError:false,timestamp:now}},assistant('a2','t1',[{type:'text',text:'Schema updated.'}]),user('u2','a2','Now add the rollback script')];
 await writeFile(resolve(suffice,'sessions','fixture','2026-01-01T00-00-00-000Z_source.jsonl'),lines.map(JSON.stringify).join('\n')+'\n');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{PI_OFFLINE:'1',SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:`sfx-fl2-board-handoff-${process.pid}`,SUFFICE_HISTORY_HOME:home});
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),`--user-data-dir=${data}`],env});
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.composer').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  const shot=async name=>{if(!SHOTS)return;await mkdir(SHOTS,{recursive:true});for(const t of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},t);await page.mouse.move(700,60);await page.waitForTimeout(700);const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(SHOTS,`${name}-${t}.png`),Buffer.from(b64,'base64'));}await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});};
  // Settings: add a note through the form, see it listed, then remove a second one.
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-section="projects"]').click();
  await page.locator('.memory-name').fill('db-choice');await page.locator('.memory-desc').fill('Postgres over SQLite for migrations');await page.locator('.memory-body').fill('Decided in review.');
  await page.locator('.memory-form button[type=submit]').click();await page.locator('.memory-item[data-note="db-choice"]').waitFor();
  await page.locator('.memory-name').fill('Temp Note');await page.locator('.memory-desc').fill('Scratch');await page.locator('.memory-form button[type=submit]').click();
  await page.locator('.memory-item[data-note="temp-note"]').waitFor();
  await shot('memory-notes');
  await page.getByRole('button',{name:'Remove temp-note'}).click();await page.locator('.memory-item[data-note="temp-note"]').waitFor({state:'detached'});
  assert.equal(await page.locator('.memory-item').count(),1);
  await page.keyboard.press('Escape');await page.locator('.composer').waitFor();
  // Thread menu: Hand off.
  const row=page.locator('.thread-row').filter({has:page.locator('.thread-card-title',{hasText:/Plan the Postgres migration/})});await row.waitFor();
  await row.click({button:'right'});
  const item=page.locator('.thread-context-menu [data-menu-action="thread:handoff"]');await item.waitFor();await shot('thread-menu');
  await item.click();
  await page.waitForFunction(()=>document.querySelector('#prompt')?.value.startsWith('Handoff from'));
  const draft=await page.locator('#prompt').inputValue();
  assert.match(draft,/Done\n- Edited schema\.sql/);assert.match(draft,/Open\n- Unanswered: Now add the rollback script/);assert.match(draft,/Project notes\n- db-choice: Postgres over SQLite/);assert.match(draft,/Recent conversation/);
  assert.equal(await page.locator('.thread-view').count(),0,'new thread, not the source thread');
  await shot('handoff-draft');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
