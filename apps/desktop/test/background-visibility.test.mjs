import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';

test('chat and settings background visibility persist independently and fade to solid',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-background-')),sessions=resolve(home,'sessions','fixture');await mkdir(sessions,{recursive:true});
 const timestamp=new Date().toISOString();await writeFile(resolve(sessions,'chat.jsonl'),[{type:'session',version:3,id:'background-fixture',timestamp,cwd:home},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Background fixture'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{
  const page=await app.firstWindow();await page.locator('.thread-row').first().waitFor();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();
  const settings=page.getByRole('switch',{name:'Show background in settings',exact:true}),chat=page.getByRole('switch',{name:'Show background in chat',exact:true});
  assert.equal(await settings.getAttribute('aria-checked'),'true');assert.equal(await chat.getAttribute('aria-checked'),'true');
  await settings.click();await page.waitForFunction(()=>document.documentElement.classList.contains('hide-settings-background'));
  assert.equal(await page.locator('.thread-backdrop').evaluate(el=>getComputedStyle(el).transitionProperty),'opacity');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.thread-backdrop')).opacity==='1');
  await chat.click();await page.waitForFunction(()=>document.documentElement.classList.contains('hide-chat-background'));
  await page.getByRole('button',{name:'Suffice home',exact:true}).click();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.thread-backdrop')).opacity==='0');
  await page.locator('.thread-row').first().click();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.thread-backdrop')).opacity==='1');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await settings.click();await page.waitForFunction(()=>!document.documentElement.classList.contains('hide-settings-background'));await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.thread-backdrop')).opacity)<1);
  await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();assert.equal(await settings.getAttribute('aria-checked'),'true');assert.equal(await chat.getAttribute('aria-checked'),'false');
  await page.getByRole('group',{name:'Mode',exact:true}).getByRole('button',{name:'Light',exact:true}).click();await settings.click();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.thread-backdrop')).opacity==='1');
 }finally{await app.close();}
});
