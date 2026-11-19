import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

test('composer: voice becomes Send when text is typed, rows are placed, density scales the geometry',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-screen-')),project=resolve(home,'p');await mkdir(project,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-screen-layout-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'hist')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  const vis=sel=>page.locator(sel).isVisible();
  // Empty box: + , dictate and voice; no Send; no Tools chip, no toolbar, no suggestion banner.
  assert.equal(await vis('.composer-row [data-action="attach"]'),true);assert.equal(await vis('.composer-row .dictate-button'),true);assert.equal(await vis('.composer-row .voice-start'),true);assert.equal(await vis('.composer-row .send-group'),false);
  assert.equal(await page.locator('.composer-toolbar,.tools-chip,.usage-hint:not([hidden])').count(),0);
  // Row below: project on the left, access and model on the right.
  assert.equal(await vis('.project-bar .project-picker'),true);assert.equal(await vis('.composer-top .access-mode-picker'),true); // layout moved: project below-left, access above the boxassert.equal(await vis('.composer-meta-right .model-button'),true);
  await page.locator('#prompt').fill('hello');
  assert.equal(await vis('.composer-row .voice-start'),false);assert.equal(await vis('.composer-row .send-group'),true);
  await page.locator('#prompt').fill('');
  assert.equal(await vis('.composer-row .voice-start'),true);
  // Concentric radius: button radius + inset = box radius.
  const g=await page.evaluate(()=>{const f=getComputedStyle(document.querySelector('.composer')),b=getComputedStyle(document.querySelector('.composer-row .voice-start'));return {box:parseFloat(f.borderTopLeftRadius),btn:parseFloat(b.borderTopLeftRadius),inset:parseFloat(f.paddingLeft)};});
  assert.equal(g.btn+g.inset,g.box);
  // Density: Compact < Comfy < Spacious for the composer button and the gap below the box.
  const size=()=>page.evaluate(()=>({btn:document.querySelector('.composer-row .voice-start').getBoundingClientRect().height,gap:parseFloat(getComputedStyle(document.querySelector('.composer-meta')).marginTop)}));
  const out={};for(const [id,name] of [['compact','Compact'],['comfy','Comfy'],['spacious','Spacious']]){await page.evaluate(d=>document.documentElement.setAttribute('data-density',d),id);out[name]=await size();}
  assert.ok(out.Compact.btn<out.Comfy.btn&&out.Comfy.btn<out.Spacious.btn,JSON.stringify(out));assert.ok(out.Compact.gap<out.Comfy.gap&&out.Comfy.gap<out.Spacious.gap,JSON.stringify(out));
  // The setting is validated and applied: Settings > Appearance > Density.
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();
  await page.getByRole('button',{name:'Density',exact:true}).click();await page.getByRole('menuitemradio',{name:'Spacious',exact:true}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.density==='spacious');
 }finally{await app.evaluate(({app})=>app.quit()).catch(()=>{});await new Promise(r=>app.process().once('exit',r)).catch(()=>{});await rm(home,{recursive:true,force:true});}
});
