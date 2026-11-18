import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import electronPath from 'electron';
import {guard} from './electron-guard.mjs';

test('settings nav selection, chat typography/width and wallpaper strength',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-settings-ap-')),folder=resolve(home,'sessions','fixture');await mkdir(folder,{recursive:true});const now=Date.now(),timestamp=new Date(now).toISOString();
 await writeFile(resolve(folder,'fixture.jsonl'),[{type:'session',version:3,id:'ap-fixture',timestamp,cwd:home},{type:'message',id:'u',parentId:null,timestamp,message:{role:'user',timestamp:now-2000,content:[{type:'text',text:'Hello'}]}},{type:'message',id:'a',parentId:'u',timestamp,message:{role:'assistant',provider:'opencode-go',model:'fixture',timestamp:now,content:[{type:'text',text:'A real rendered reply.'}],stopReason:'stop'}}].map(JSON.stringify).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fix3-settings',SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();
  await page.locator('.thread-row').first().click();await page.locator('.thread-assistant').last().waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const selected=()=>page.locator('.settings-nav-item[aria-current=page]').evaluateAll(n=>n.map(el=>el.textContent.trim()));
  assert.equal((await selected()).length,1);
  for(const name of ['Appearance','Agent','Usage']){await page.getByRole('button',{name,exact:true}).click();assert.deepEqual((await selected()).map(t=>t.replace(/\s+/g,' ')),[name],`only ${name} selected`);}
  await page.getByRole('button',{name:'Appearance',exact:true}).click();
  const measure=()=>page.evaluate(()=>{const s=getComputedStyle(document.querySelector('.thread-assistant'));return {w:Math.round(document.querySelector('.thread-messages').getBoundingClientRect().width),size:s.fontSize,family:s.fontFamily};});
  // Settings hides the transcript, so leave it, measure the real chat, then come back.
  const chat=async()=>{await page.getByRole('button',{name:'Back to chats',exact:true}).click();await page.locator('.thread-assistant').last().waitFor({state:'visible'});const m=await measure();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();return m;};
  const pick=async(label,option)=>{await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('menuitemradio',{name:option,exact:true}).click();};
  await pick('Chat width','Narrow');const narrow=await chat();await pick('Chat width','Wide');const wide=await chat();
  assert.ok(wide.w>narrow.w,`chat width ${narrow.w} -> ${wide.w}`);
  await pick('Font size','12 px');const small=await chat();await pick('Font size','15 px');const big=await chat();
  assert.equal(small.size,'12px');assert.equal(big.size,'15px');
  await pick('Interface font','Geist Mono');const mono=await chat();await pick('Interface font','Inter');const sans=await chat();
  assert.notEqual(mono.family,sans.family);
  const alpha=()=>page.locator('.settings-main').evaluate(el=>{const m=getComputedStyle(el).backgroundColor.match(/[\d.]+/g);return m.length>3?Number(m[3]):1;});
  const slider=page.locator('[data-range=surface-opacity]');
  assert.equal(await page.getByText('Dimming',{exact:true}).count(),0);
  await slider.fill('10');const faint=await alpha();await slider.fill('90');const strong=await alpha();
  assert.ok(strong<faint,`panel alpha ${faint} -> ${strong}`);
 }finally{await app.close();}
});
