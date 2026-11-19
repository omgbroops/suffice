import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
// Drives the command menu through its real entry point (Cmd/Ctrl+K) like a user.
// SHOTS=<dir> also captures 1440x900 dark and light screenshots of every state.
const SHOTS=process.env.SHOTS;
test('command menu: tabs, filter chips, actions and settings reached from Cmd+K',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-cmdmenu-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-feat-command-menu-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 if(SHOTS)await mkdir(SHOTS,{recursive:true});
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain,BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setSize(1440,900);ipcMain.removeHandler('suffice:threads');const now=Date.now();ipcMain.handle('suffice:threads',()=>[
   ['Fix webhook retries','Spool','claude','working',2],['Review checkout flow','Suffice','codex','approval',9],['Migrate billing tables','Spool','claude','done',45],['Refactor session store','Suffice','opencode-go','done',130],['Draft release notes','Atlas','codex','idle',600],['Debug flaky sync test','Atlas','claude','failed',1500]
  ].map(([title,project,provider,status,mins],i)=>({id:'t'+i,title,project,provider,status,branch:'main',modified:now-mins*60000,startedAt:now-mins*60000})));});
  await page.reload();await page.locator('.thread-card').last().waitFor();
  const dialog=page.getByRole('dialog',{name:'Search Suffice'}),input=page.getByRole('combobox',{name:'Search threads and commands'});
  const shot=async name=>{if(!SHOTS)return;for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>el.dataset.theme=t,theme);await page.waitForTimeout(250);await page.screenshot({path:resolve(SHOTS,`${name}-${theme}.png`)});}await page.locator('html').evaluate(el=>el.dataset.theme='dark');};
  const options=()=>page.getByRole('option');
  // entry: keyboard shortcut
  await page.keyboard.press('Control+k');await dialog.waitFor();
  assert.deepEqual(await dialog.getByRole('tab').evaluateAll(t=>t.map(x=>x.firstChild.textContent)),['All','Threads','Sessions','Actions','Settings','History']);
  for(const hint of ['Enter','Navigate','Esc'])assert.ok((await dialog.locator('footer').textContent()).includes(hint),hint);
  // rows: status dot, title, project, age
  const first=options().filter({hasText:'Fix webhook retries'});
  assert.equal(await first.locator('.spotlight-dot').getAttribute('aria-label'),'Working');assert.equal(await first.locator('.spotlight-project').textContent(),'Spool');assert.ok((await first.locator('.spotlight-age').textContent()).length>0);
  await page.waitForTimeout(150);await shot('01-all');
  // tabs separate live sessions from threads
  await dialog.getByRole('tab',{name:/^Sessions/}).click();assert.equal(await options().count(),2);
  await shot('02-sessions');
  await dialog.getByRole('tab',{name:/^Threads/}).click();assert.equal(await options().count(),4);
  await dialog.getByRole('tab',{name:/^All/}).click();
  // filter chips: add project, agent, status; remove
  const add=dialog.getByRole('button',{name:'Filter',exact:true});
  await add.click();await dialog.getByRole('menuitem',{name:'Project'}).click();await shot('03-filter-values');await dialog.getByRole('menuitem',{name:'Atlas'}).click();
  assert.equal(await options().count(),2);assert.equal(await dialog.locator('.spotlight-chip').count(),1);assert.equal(await options().count(),2);
  await add.click();await dialog.getByRole('menuitem',{name:'Agent'}).click();await dialog.getByRole('menuitem',{name:'claude'}).click();assert.equal(await options().count(),1);
  await add.click();await dialog.getByRole('menuitem',{name:'Status'}).click();await dialog.getByRole('menuitem',{name:'Failed'}).click();assert.equal(await options().count(),1);assert.equal(await dialog.locator('.spotlight-chip').count(),3);
  await shot('04-chips');
  await dialog.getByRole('button',{name:'Remove filter Status: Failed'}).click();assert.equal(await dialog.locator('.spotlight-chip').count(),2);assert.equal(await options().count(),1);
  await input.press('Backspace');assert.equal(await dialog.locator('.spotlight-chip').count(),1);
  await dialog.getByRole('button',{name:'Remove filter Project: Atlas'}).click();assert.equal(await dialog.locator('.spotlight-chip').count(),0);
  // Esc closes the open filter menu first, then the menu
  await add.click();await page.keyboard.press('Escape');assert.equal(await page.locator('dialog.spotlight').evaluate(el=>el.open),true);assert.equal(await dialog.locator('.spotlight-chipmenu').isHidden(),true);
  // thread open from the menu
  await input.fill('billing');assert.equal(await options().count(),1);await shot('05-search');
  await input.fill('zzzz');await shot('06-empty');
  // actions + settings registered; sidebar menu items are commands too
  await input.fill('');await dialog.getByRole('tab',{name:/^Actions/}).click();await shot('07-actions');
  const actionCount=await options().count();assert.ok(actionCount>=20,'actions registered: '+actionCount);
  await input.fill('sidebar: filter · running');assert.equal(await options().count(),1);await input.press('Enter');
  await page.waitForTimeout(150);assert.equal(await page.locator('.thread-card').count(),1,'Sidebar filter command applied');
  await page.keyboard.press('Control+k');await input.fill('reset');await input.press('Enter');await page.waitForTimeout(150);assert.equal(await page.locator('.thread-card').count(),6);
  await page.keyboard.press('Control+k');await input.fill('light theme');await dialog.getByRole('tab',{name:/^Actions/}).click();await input.press('Enter');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.waitForTimeout(300);await page.keyboard.press('Control+k');await dialog.getByRole('tab',{name:/^Settings/}).click();await shot('08-settings');assert.ok(await options().count()>=10);
  await input.fill('appearance');await input.press('Enter');await page.locator('.settings-main:not([hidden])').waitFor();assert.equal(await page.locator('dialog.spotlight').evaluate(el=>el.open),false);
  await page.keyboard.press('Control+k');await input.press('Escape');assert.equal(await page.locator('dialog.spotlight').evaluate(el=>el.open),false);
 }finally{await app.close();}
});
