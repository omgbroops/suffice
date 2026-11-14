import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
import {threadId} from '../electron/threads.mjs';

test('cloud threads get Go live, three panel tabs, activity rows and a rewind confirm that Escape closes',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-cloud-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
 for(const id of ['cloud','plain']){const timestamp=new Date().toISOString();await writeFile(resolve(dir,id+'.jsonl'),[
  {type:'session',version:3,id,timestamp,cwd:home},
  {type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Thread '+id}],timestamp:Date.now()}},
  {type:'message',id:'assistant',parentId:'user',timestamp,message:{role:'assistant',content:[{type:'text',text:'Reply '+id}],timestamp:Date.now(),stopReason:'stop'}},
 ].map(entry=>JSON.stringify(entry)).join('\n')+'\n');}
 const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home})});
 try{
  const page=await app.firstWindow();
  await page.locator('.thread-row').first().waitFor({timeout:15000});
  const key=id=>'suffice-thread-view-v1:'+threadId(resolve(dir,id+'.jsonl'));
  await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({cloud:true,panelOpen:true,tabs:['preview','tests','timeline'],activeTab:'preview'})),key('cloud'));
  await page.reload();
  const open=async text=>{await page.locator('.thread-row').filter({hasText:text}).click();await page.locator('.thread-header').filter({hasText:text}).waitFor();};
  await open('Thread plain');
  assert.equal(await page.locator('.thread-golive').isVisible(),false,'no Go live on a plain thread');
  assert.equal(await page.locator('.cloud-row, [data-tab]').count(),0);
  await open('Thread cloud');
  assert.equal(await page.locator('.thread-golive').isVisible(),true);
  assert.match(await page.locator('.thread-golive').getAttribute('class'),/button button--primary/);
  assert.equal(await page.locator('[role=tab]').count(),3);
  await page.locator('iframe').waitFor();
  // arrow keys move between tabs
  await page.getByRole('tab',{name:'Tests'}).click();
  assert.equal(await page.getByRole('tab',{name:'Tests'}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:'Tests'}).press('Enter');
  await page.getByRole('tab',{name:'Timeline'}).click();
  assert.equal(await page.getByRole('button',{name:/^Rewind to/}).count(),0,'no Rewind on the newest save');
  await page.locator('.cloud-tl-row').nth(1).click();
  await page.getByRole('button',{name:'Rewind to'}).first().waitFor();
  // activity rows open their tab
  await page.getByRole('tab',{name:'Preview'}).click();
  await page.locator('[data-tab="tests"]').first().click();
  assert.equal(await page.getByRole('tab',{name:'Tests'}).getAttribute('aria-selected'),'true');
  await page.getByText('Copy for your agent').first().waitFor();
  // rewind confirm: Escape closes it and focus returns to the trigger
  await page.getByRole('tab',{name:'Timeline'}).click();
  await page.locator('.cloud-tl-row').nth(1).click();
  const trigger=page.getByRole('button',{name:/^Rewind to \d\d:\d\d$/}).first();
  await trigger.click();
  assert.equal(await page.locator('.cloud-tl-confirm').first().isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.cloud-tl-confirm').first().isVisible(),false);
  assert.equal(await page.locator('.cloud-tl-row[aria-selected=true]').evaluate(el=>el===document.activeElement),true,'focus returns to the selected save');
 }finally{await app.close();}
});

test('a cloud thread shows Cloud on the composer chip and puts activity rows after the message they follow',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-cloud-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
 for(const id of ['cloud','plain']){const timestamp=new Date().toISOString();await writeFile(resolve(dir,id+'.jsonl'),[
  {type:'session',version:3,id,timestamp,cwd:home},
  {type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Thread '+id}],timestamp:Date.now()}},
  {type:'message',id:'assistant',parentId:'user',timestamp,message:{role:'assistant',content:[{type:'text',text:'Reply '+id}],timestamp:Date.now(),stopReason:'stop'}},
 ].map(entry=>JSON.stringify(entry)).join('\n')+'\n');}
 const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home})});
 try{
  const page=await app.firstWindow();
  await page.locator('.thread-row').first().waitFor({timeout:15000});
  await page.evaluate(k=>{localStorage.setItem('suffice-background','neon-mech');localStorage.setItem(k,JSON.stringify({cloud:true,panelOpen:true,tabs:['preview','tests','timeline'],activeTab:'preview'}));},'suffice-thread-view-v1:'+threadId(resolve(dir,'cloud.jsonl')));
  await page.reload();await page.locator('.nx-chip[data-nx="env"]').waitFor({timeout:15000});
  const open=async text=>{await page.locator('.thread-row').filter({hasText:text}).click();await page.locator('.thread-header').filter({hasText:text}).waitFor();};
  const chip=()=>page.locator('.nx-chip[data-nx="env"] span').textContent();
  await open('Thread cloud');
  assert.equal(await chip(),'Cloud');
  // user message, its rows, the reply, then the rows that follow the reply
  const order=await page.locator('.thread-messages').evaluate(h=>[...h.children].map(c=>c.matches('.thread-user')?'user':c.matches('.thread-assistant')?'reply':c.matches('.thread-cloud-rows')?'rows'+c.children.length:'other'));
  assert.deepEqual(order.filter(x=>x!=='other'),['user','rows2','reply','rows2']);
  await open('Thread plain');
  assert.equal(await chip(),'Local');
  assert.equal(await page.locator('.thread-cloud-rows').count(),0);
 }finally{await app.close();}
});

test('at 820 and 1024 px the cloud panel leaves the composer 320 px and shows every tab label whole',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-cloud-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
 const timestamp=new Date().toISOString();await writeFile(resolve(dir,'cloud.jsonl'),[
  {type:'session',version:3,id:'cloud',timestamp,cwd:home},
  {type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Thread cloud'}],timestamp:Date.now()}},
  {type:'message',id:'assistant',parentId:'user',timestamp,message:{role:'assistant',content:[{type:'text',text:'Reply cloud'}],timestamp:Date.now(),stopReason:'stop'}},
 ].map(entry=>JSON.stringify(entry)).join('\n')+'\n');
 const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home})});
 try{
  const page=await app.firstWindow();
  await page.locator('.thread-row').first().waitFor({timeout:15000});
  await page.evaluate(k=>{localStorage.setItem('suffice-background','neon-mech');localStorage.setItem(k,JSON.stringify({cloud:true,panelOpen:true,tabs:['preview','tests','timeline'],activeTab:'timeline'}));},'suffice-thread-view-v1:'+threadId(resolve(dir,'cloud.jsonl')));
  for(const w of [820,1024]){
   await page.setViewportSize({width:w,height:1000});await page.reload();
   await page.locator('.thread-row').filter({hasText:'Thread cloud'}).click();await page.locator('[role=tab]').first().waitFor();await page.waitForTimeout(400);
   const m=await page.evaluate(()=>{const strip=document.querySelector('.right-panel-tabs').getBoundingClientRect();return {strip:[strip.left,strip.right],panel:document.querySelector('.right-sidebar').getBoundingClientRect().width,rects:[...document.querySelectorAll('[role=tab]')].map(t=>{const r=t.getBoundingClientRect();return [r.left,r.right];}),composer:document.querySelector('.composer').getBoundingClientRect().width,tabs:[...document.querySelectorAll('[role=tab]')].map(t=>{const r=t.getBoundingClientRect();return {name:t.textContent.trim(),inside:r.left>=strip.left-1&&r.right<=strip.right+1,whole:t.scrollWidth<=t.clientWidth+1};})};});
   assert.ok(m.composer>=320,`composer ${m.composer}px at ${w}`);
   assert.equal(m.tabs.length,3);
   for(const t of m.tabs)assert.ok(t.inside&&t.whole,`tab ${t.name} clipped at ${w}: ${JSON.stringify(t)} ${JSON.stringify(m)}`);
  }
 }finally{await app.close();}
});
