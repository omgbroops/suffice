import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {guard} from './electron-guard.mjs';
const require=createRequire(import.meta.url),electronPath=require('electron'),{_electron}=require('playwright-core');
test('frame: 240 sidebar, opaque 12px panel with 8px margin, 28px header controls',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-frame-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});const timestamp=new Date().toISOString();
 await writeFile(resolve(dir,'chat.jsonl'),[{type:'session',version:3,id:'frame',timestamp,cwd:home},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Frame fixture'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{const page=await app.firstWindow();await page.locator('.thread-row').first().click();await page.locator('.thread-header').waitFor();
  const g=await page.evaluate(()=>{const w=document.querySelector('.workspace'),s=document.querySelector('.sidebar'),c=getComputedStyle(w),r=w.getBoundingClientRect(),b=document.querySelector('.sidebar-tools .button').getBoundingClientRect();return {sidebar:s.getBoundingClientRect().width,radius:c.borderTopLeftRadius,bg:c.backgroundColor,top:r.top,right:innerWidth-r.right,bottom:innerHeight-r.bottom,btn:[b.width,b.height]};});
  assert.equal(g.sidebar,240);assert.equal(g.radius,'12px');assert.deepEqual([g.top,g.right,g.bottom],[8,8,8]);assert.deepEqual(g.btn,[28,28]);assert.match(g.bg,/^rgb\(/);
 }finally{await app.close();}
});
