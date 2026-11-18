import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
test('sidebar: sort menu reorders with one check, drag reorders rows and moves into a section, Teamwork follows its setting',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-sidebar-order-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{const page=await app.firstWindow();await page.locator('.composer').waitFor();
 await app.evaluate(({ipcMain})=>{const now=Date.now();ipcMain.removeHandler('suffice:threads');ipcMain.handle('suffice:threads',()=>[
  {id:'a',title:'Fix webhooks',project:'Halo Pay',provider:'openai',status:'done',modified:now-1000},
  {id:'b',title:'Audit tokens',project:'Pixel',provider:'openai',status:'done',modified:now-2000},
  {id:'c',title:'Run billing',project:'Northwind',provider:'anthropic',status:'done',modified:now-3000},
  {id:'d',title:'Old thread',project:null,provider:'anthropic',status:'done',modified:now-90*864e5}]);});
 await page.evaluate(()=>{localStorage.removeItem('suffice-sidebar-preferences-v1');});await page.reload();await page.locator('.thread-card').last().waitFor();
 const order=()=>page.locator('.thread-card').evaluateAll(n=>n.map(x=>x.dataset.thread));
 assert.deepEqual(await order(),['a','b','c','d']);
 // Sort by Name reorders rows (Today group: Audit, Fix, Run) and ticks exactly one entry
 const sort=async name=>{await page.locator('[data-action="sidebar-menu"]').click();await page.getByRole('menuitem',{name:'Sort by',exact:true}).click();await page.getByRole('menuitemradio',{name,exact:true}).or(page.getByRole('menuitem',{name,exact:true})).first().click();};
 await sort('Name');await page.waitForFunction(()=>document.querySelector('.thread-card').dataset.thread==='b');
 assert.deepEqual(await order(),['b','a','c','d']);
 await page.locator('[data-action="sidebar-menu"]').click();await page.getByRole('menuitem',{name:'Sort by',exact:true}).click();
 assert.equal(await page.locator('.popover--submenu [aria-checked="true"]').count(),1);assert.match(await page.locator('.popover--submenu [aria-checked="true"]').innerText(),/Name/);await page.keyboard.press('Escape');
 // drag a row onto another in the same group: order changes and Sort flips to Manual
 await page.locator('[data-thread="c"]').dragTo(page.locator('[data-thread="b"]'),{targetPosition:{x:20,y:3}});
 await page.waitForFunction(()=>document.querySelector('.thread-card').dataset.thread==='c');
 assert.deepEqual((await order()).slice(0,3),['c','b','a']);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('suffice-sidebar-preferences-v1')).sort),'manual');
 // drag a row onto a section header moves it into that section
 await page.locator('[data-thread="d"]').click({button:'right'});await page.getByRole('menuitem',{name:'Move to section',exact:true}).click();await page.getByRole('menuitem',{name:'New section',exact:true}).click();await page.locator('#thread-rename-input').fill('Launch');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>[...document.querySelectorAll('.thread-group-name')].some(n=>n.textContent==='Launch'));
 await page.locator('[data-thread="a"]').dragTo(page.locator('.thread-group-toggle[data-kind="section"]',{hasText:'Launch'}));
 await page.waitForFunction(()=>document.querySelector('.thread-project-group:has([data-thread="a"]) .thread-group-name')?.textContent==='Launch');
 // Teamwork is hidden until its Settings toggle is on
 assert.equal(await page.locator('.teamwork-nav').isVisible(),false);
 await page.keyboard.press('Meta+,');await page.getByText('Teamwork in sidebar',{exact:true}).waitFor();await page.getByText('Teamwork in sidebar',{exact:true}).locator('xpath=ancestor::*[.//*[@role="switch" or @type="checkbox"]][1]').locator('[role="switch"],[type="checkbox"]').first().click();
 await page.waitForFunction(()=>!document.querySelector('.teamwork-nav').hidden);
 }finally{await app.close();}
});
