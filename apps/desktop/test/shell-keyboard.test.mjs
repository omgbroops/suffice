import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const fails=[];const soft=fn=>(...a)=>{try{fn(...a);}catch(e){fails.push(e.message.split('\n')[0]);}};const eq=soft(assert.equal),mt=soft(assert.match),ok=soft(assert.ok);
const active=page=>page.evaluate(()=>{const a=document.activeElement;return a===document.body?'body':a.id||a.getAttribute('aria-label')||a.className});
test('shell keyboard: sidebar toggle, new session, thread menu, spotlight, labels and panel menu keep focus',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-shellkb-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-r2-shell-keyboard-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'hist')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{const page=await app.firstWindow();await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:threads');ipcMain.handle('suffice:threads',()=>Array.from({length:4},(_,i)=>({id:'thread-'+i,title:'Thread '+i,project:'Spool',branch:'fix/x',status:'done',modified:Date.now()-i*60000})));});await page.reload();await page.locator('.thread-card').last().waitFor();
  // duplicate action ids
  eq(await page.locator('[data-action="search-sessions"]').count(),1,'one search-sessions control');
  // sidebar collapse/reopen focus (Ctrl+B)
  await page.locator('#prompt').focus();await page.keyboard.press('Control+b');
  await page.waitForTimeout(400);eq(await active(page),'Open sidebar','collapse focuses Open sidebar');
  await page.keyboard.press('Control+b');await page.waitForTimeout(400);
  eq(await page.evaluate(()=>!!document.activeElement.closest('#session-sidebar')),true,'reopen focuses inside the sidebar: '+await active(page));
  // Ctrl+N focuses the composer
  await page.locator('.thread-card').first().focus();await page.keyboard.press('Control+n');await page.waitForTimeout(300);
  eq(await active(page),'prompt','Ctrl+N focuses #prompt');
  // thread context menu Esc restores focus to the row
  const row=page.locator('.thread-row').first();await row.focus();await page.keyboard.press('ContextMenu');await page.locator('.thread-context-menu [role=menuitem]').first().waitFor();
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  eq(await page.evaluate(()=>document.activeElement?.classList.contains('thread-row')),true,'Esc returns to row: '+await active(page));
  // thread row aria-label spans carry a role
  eq(await page.evaluate(()=>[...document.querySelectorAll('.thread-state[aria-label],.thread-provider[aria-label]')].filter(e=>!e.getAttribute('role')).length),0,'labelled spans have roles');
  // spotlight scope announced
  await page.keyboard.press('Control+k');const input=page.getByRole('combobox',{name:'Search threads and commands'});await input.press('Tab');
  mt(await page.evaluate(()=>document.querySelector('.spotlight [aria-live]')?.textContent||''),/Threads/,'scope change announced');
  await page.keyboard.press('Escape');
  // detail dialog has a name once open
  await page.evaluate(()=>document.querySelector('[data-action="all-prs"]').click());
  const dialog=page.locator('dialog.detail-dialog');await dialog.waitFor({state:'visible',timeout:3000}).catch(()=>{});
  eq(await dialog.isVisible(),true,'detail dialog opened');ok(await dialog.evaluate(d=>d.getAttribute('aria-labelledby')&&document.getElementById(d.getAttribute('aria-labelledby'))?.textContent.trim()),'dialog named');
  // right panel add-tab Enter opens menu
  await page.evaluate(()=>document.querySelector('dialog.detail-dialog').close());
  await page.locator('.thread-card').first().click();
  await page.getByRole('button',{name:'Toggle right panel'}).click();await page.locator('.panel-launcher').getByRole('button',{name:'Files',exact:true}).click();
  const add=page.getByRole('button',{name:'Add panel tab'});await add.focus();await page.keyboard.press('Enter');
  eq(await page.getByRole('menu',{name:'Panel options'}).isVisible(),true,'Add panel tab Enter opens menu');
  eq(await page.evaluate(()=>!!document.activeElement.closest('.panel-tab-menu')),true,'focus moves into panel menu');
 assert.deepEqual(fails,[]);
 }finally{await app.close().catch(()=>{});await rm(home,{recursive:true,force:true});}
});
