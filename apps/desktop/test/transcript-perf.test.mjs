import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
test('long transcripts skip rendering off-screen message blocks',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-tperf-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_HISTORY_HOME:resolve(home,'history'),SUFFICE_SESSIONS_SOCKET:'sfx-r2-transcript-perf'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{const page=await app.firstWindow();await page.locator('.composer').waitFor();
 const r=await page.evaluate(()=>{const t=document.querySelector('.thread-messages').parentElement;t.style.cssText+='overflow:auto;height:600px';const box=document.querySelector('.thread-messages');box.replaceChildren();
  for(let i=0;i<1500;i++){const d=document.createElement('div');d.className=i%2?'thread-user':'thread-assistant';d.textContent='m'+i;d.style.minHeight='200px';box.append(d);}
  const cv=getComputedStyle(box.children[10]).contentVisibility,last=getComputedStyle(box.lastElementChild).contentVisibility;
  const probe=(el)=>el.checkVisibility({contentVisibilityAuto:true});
  let skipped=0;for(const c of box.children)if(!probe(c))skipped++;return {cv,last,skipped,total:box.children.length};});
 assert.equal(r.cv,'auto');assert.equal(r.last,'visible');assert.ok(r.skipped>r.total*0.5,JSON.stringify(r));
 }finally{await app.close();}
});
