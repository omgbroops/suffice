import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard,killTmux,openMore} from './electron-guard.mjs';

// Hidden window, fake computer (scripted pages), real backend agent: toggle, start, approval, replay strip, deny, replay, injection flag, cancel, restart.
const shots=process.env.COMPUTER_SHOTS;
const SOCKET='sfx-fl2-computer-use-1';

test('Computer use: Settings toggle, session start, approval on risky actions, replay strip, saved-run replay, injection flag, cancel, restart',{timeout:240000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-computer-ui-'));
 const launch=async body=>{
  const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_NO_SCHEDULER:'1',SUFFICE_COMPUTER_FAKE:'1',SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-computer-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
  try{const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));await page.waitForTimeout(300);
   const shot=async name=>{if(!shots)return;await mkdir(shots,{recursive:true});for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;},theme);await page.waitForTimeout(150);const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(png,'base64'));}await page.locator('html').evaluate(el=>{el.dataset.theme='dark';});};
   await body(page,shot);assert.deepEqual(errors,[]);}
  finally{await app.close();killTmux(SOCKET);}
 };
 const start=async(page,goal,url)=>{
  await page.getByRole('button',{name:'New session'}).last().click();
  await page.locator('[data-field=goal]').fill(goal);await page.locator('[data-field=url]').fill(url);
  await page.locator('.cu-form [data-act=start]').click();
 };
 const expand=async r=>{if(await r.locator('.cu-row').getAttribute('aria-expanded')!=='true')await r.locator('.cu-row').click();};
 const row=(page,goal)=>page.locator('.cu-item',{hasText:goal});

 await launch(async(page,shot)=>{
  // off by default: no sidebar entry, and the backend refuses a start
  assert.equal(await page.locator('.computer-nav').isHidden(),true);
  const refused=await page.evaluate(()=>window.sufficeDesktop.computer.start({goal:'x',url:'https://shop.test/'}).then(()=>'ok',e=>String(e.message)));
  assert.match(refused,/Turn on Computer use in Settings first/);
  // Settings toggle turns the entry on
  await page.locator('[data-action=settings]').first().click();
  await page.locator('[data-section=agent]').click();
  const sw=page.getByRole('switch',{name:'Computer use sessions'});
  assert.equal(await sw.getAttribute('aria-checked'),'false');
  await sw.click();await page.locator('[role=switch][aria-label="Computer use sessions"][aria-checked=true]').waitFor(); // aria-checked flips after the async save
  await page.locator('[data-action=settings]').first().click();
  await openMore(page);await page.locator('.computer-nav').waitFor();
  await openMore(page);await page.locator('.computer-nav').click();await page.locator('.computer-view:not([hidden])').waitFor();
  await page.getByText('No sessions yet').waitFor();await shot('computer-empty');

  // validation
  await page.getByRole('button',{name:'New session'}).last().click();
  await page.locator('.cu-form [data-act=start]').click();await page.locator('.cu-error',{hasText:'Describe what the agent should do'}).waitFor();
  await page.locator('[data-field=goal]').fill('Buy a laptop');await page.locator('[data-field=url]').fill('not a url');
  await page.locator('.cu-form [data-act=start]').click();await page.locator('.cu-error',{hasText:'web address'}).waitFor();
  await page.locator('.cu-form [data-act=close-form]').click();

  // run 1: payment step asks; deny it
  await start(page,'Buy a laptop','https://shop.test/');
  const card=page.locator('.cu-approval');await card.waitFor();
  assert.match(await card.innerText(),/Approval needed[\s\S]*Click "Place order" on shop\.test[\s\S]*Payment/);
  assert.match(await page.locator('.computer-count').innerText(),/1/);
  await shot('computer-approval');
  await card.locator('[data-act=deny]').click();
  await row(page,'Buy a laptop').locator('.cu-row[data-state=done]').waitFor();
  await expand(row(page,'Buy a laptop'));
  const steps=row(page,'Buy a laptop').locator('.cu-step');await steps.nth(1).waitFor();
  assert.equal(await steps.count(),2);
  assert.equal(await steps.nth(0).getAttribute('data-state'),'ok');
  assert.equal(await steps.nth(1).getAttribute('data-state'),'denied');
  assert.match(await steps.nth(1).innerText(),/Place order[\s\S]*Payment[\s\S]*Denied/);
  await shot('computer-strip-denied');

  // run 2: allow everything; the run completes and is saved
  await start(page,'Buy a laptop','https://shop.test/');
  await page.locator('.cu-approval [data-act=allow]').click();
  const done=page.locator('.cu-item [data-state=done]');await page.waitForFunction(()=>document.querySelectorAll('.cu-row[data-state=done]').length===2);
  assert.equal(await page.locator('.cu-approval').count(),0);

  // run 3: same goal replays the saved steps (no model calls), still asks before paying
  await start(page,'Buy a laptop','https://shop.test/');
  await page.locator('.cu-approval [data-act=allow]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.cu-row[data-state=done]').length===3);
  const first=page.locator('.cu-item').first();
  await expand(first);
  await first.locator('.cu-replayed').waitFor();
  assert.match(await first.locator('.cu-replayed').innerText(),/Replayed from a saved run/);
  assert.equal(await first.locator('.cu-step').count(),2);
  await shot('computer-replay');

  // injection: instruction-shaped page text is flagged and the click waits for a human
  await start(page,'Read the news','https://evil.test/');
  const bad=page.locator('.cu-approval');await bad.waitFor();
  assert.match(await bad.innerText(),/Page looks like instructions[\s\S]*looks like instructions to the agent/);
  await shot('computer-injection');
  // cancel instead of answering
  await row(page,'Read the news').locator('[data-act=cancel]').click();
  await row(page,'Read the news').locator('.cu-row[data-state=cancelled]').waitFor();
  assert.equal(await page.locator('.cu-approval').count(),0);
  assert.equal(await page.locator('.computer-count').isHidden(),true);
 });

 // restart: sessions and their steps persist, entry stays on
 await launch(async page=>{
  await openMore(page);await page.locator('.computer-nav').click();await page.locator('.computer-view:not([hidden])').waitFor();
  assert.equal(await page.locator('.cu-row').count(),4);
  assert.equal(await page.locator('.cu-row[data-state=cancelled]').count(),1);
  await expand(page.locator('.cu-item',{hasText:'Buy a laptop'}).last());
  await page.locator('.cu-step').first().waitFor();
  await page.keyboard.press('Escape');await page.locator('.computer-view').waitFor({state:'hidden'});
 });
});
