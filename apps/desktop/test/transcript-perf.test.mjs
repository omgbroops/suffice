import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
// Real render path: a seeded 400-pair pi thread is opened through the sidebar.
test('long thread renders a bounded DOM, lazy-fills near the viewport, and clears the header pill',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-tperf-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-tperf-proj-')),now=new Date().toISOString();
 const dir=resolve(home,'sessions','long');await mkdir(dir,{recursive:true});
 const e=[{type:'session',version:3,id:'long',timestamp:now,cwd}];let p=null;
 for(let i=0;i<400;i++){e.push({type:'message',id:'u'+i,parentId:p,timestamp:now,message:{role:'user',content:[{type:'text',text:`Question ${i}`}],timestamp:1000+i}});
  e.push({type:'message',id:'a'+i,parentId:'u'+i,timestamp:now,message:{role:'assistant',provider:'opencode-go',model:'fixture',content:[{type:'text',text:`## Answer ${i}\n\n- item a\n- item b\n\n\`\`\`ts\nlet x${i}=1;\n\`\`\`\n\nInline $e^{i\\pi}+1=0$\n`}]}});p='a'+i;}
 await writeFile(resolve(dir,'thread.jsonl'),e.map(x=>JSON.stringify(x)).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_HISTORY_HOME:resolve(home,'history'),SUFFICE_SESSIONS_SOCKET:'sfx-r2-transcript-perf'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{const page=await app.firstWindow();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await page.locator('.thread-row').first().click();
  await page.waitForFunction(()=>document.querySelector('.thread-messages')?.children.length>=800,null,{timeout:60000});
  await page.waitForTimeout(1500);
  const r=await page.evaluate(()=>{const b=document.querySelector('.thread-messages'),t=b.parentElement,tr=t.getBoundingClientRect();
   const visible=[...b.querySelectorAll('.thread-assistant')].filter(a=>{const x=a.getBoundingClientRect();return x.bottom>tr.top&&x.top<tr.bottom;});
   return {top:b.children.length,nodes:b.querySelectorAll('*').length,lazy:b.querySelectorAll('[data-lazy-markdown]').length,visible:visible.length,visibleEmpty:visible.filter(a=>!a.firstElementChild).length,mask:getComputedStyle(t).maskImage,trTop:tr.top,cv:getComputedStyle(b.children[5]).contentVisibility};});
  assert.ok(r.top>=800,JSON.stringify(r));
  assert.ok(r.nodes<8000,'eager render of 400 answers is ~25k nodes: '+JSON.stringify(r));
  assert.ok(r.lazy>300,JSON.stringify(r));
  assert.ok(r.visible>0&&r.visibleEmpty===0,'visible answers must be rendered: '+JSON.stringify(r));
  assert.equal(r.mask,'none');assert.ok(r.trTop>=54,'transcript starts below the header pill: '+JSON.stringify(r));assert.equal(r.cv,'auto');
 }finally{await app.close();}
});
