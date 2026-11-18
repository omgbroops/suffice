import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import electronPath from 'electron';
import {guard} from './electron-guard.mjs';

test('settings nav selection, chat typography/width and wallpaper strength',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-settings-ap-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const selected=()=>page.locator('.settings-nav-item[aria-current=page]').evaluateAll(n=>n.map(el=>el.textContent.trim()));
  assert.equal((await selected()).length,1);
  for(const name of ['Appearance','Agent','Data & privacy']){await page.getByRole('button',{name,exact:true}).click();assert.deepEqual((await selected()).map(t=>t.replace(/\s+/g,' ')),[name],`only ${name} selected`);}
  await page.getByRole('button',{name:'Appearance',exact:true}).click();
  await page.evaluate(()=>{const el=document.createElement('div');el.className='thread-messages';el.id='probe-chat';el.textContent='probe';document.querySelector('.workspace').append(el);});
  const chat=()=>page.locator('#probe-chat').evaluate(el=>{const s=getComputedStyle(el);return {w:Math.round(el.getBoundingClientRect().width),size:s.fontSize,family:s.fontFamily};});
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
