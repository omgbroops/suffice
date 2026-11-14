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
  await page.getByRole('button',{name:'Rewind to'}).first().waitFor();
  // activity rows open their tab
  await page.getByRole('tab',{name:'Preview'}).click();
  await page.locator('[data-tab="tests"]').first().click();
  assert.equal(await page.getByRole('tab',{name:'Tests'}).getAttribute('aria-selected'),'true');
  await page.getByText('Copy for your agent').first().waitFor();
  // rewind confirm: Escape closes it and focus returns to the trigger
  await page.getByRole('tab',{name:'Timeline'}).click();
  const trigger=page.getByRole('button',{name:/^Rewind to \d\d:\d\d$/}).first();
  await trigger.click();
  assert.equal(await page.locator('.cloud-confirm').first().isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.cloud-confirm').first().isVisible(),false);
  assert.equal(await trigger.evaluate(el=>el===document.activeElement),true,'focus returns to Rewind here');
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
