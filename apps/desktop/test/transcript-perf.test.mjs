import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
// Real render path: a seeded 700-pair pi thread is opened through the sidebar and scrolled.
test('long thread windows its DOM, colors lazy code, and keeps scroll stable',{timeout:180000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-tperf-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-tperf-proj-')),now=new Date().toISOString();
 const dir=resolve(home,'sessions','long');await mkdir(dir,{recursive:true});
 const e=[{type:'session',version:3,id:'long',timestamp:now,cwd}];let p=null;
 for(let i=0;i<700;i++){e.push({type:'message',id:'u'+i,parentId:p,timestamp:now,message:{role:'user',content:[{type:'text',text:`Question ${i}`}],timestamp:1000+i}});
  e.push({type:'message',id:'a'+i,parentId:'u'+i,timestamp:now,message:{role:'assistant',provider:'opencode-go',model:'fixture',content:[{type:'text',text:`## Answer ${i}\n\n- item a\n- item b\n\n\`\`\`ts\nlet x${i}=await fetch('/api');\n\`\`\`\n\n${i%50===7?'```mermaid\ngraph TD; A-->B\n```\n\n':''}Inline $e^{i\\pi}+1=0$\n\n${'Long paragraph text. '.repeat(i%7*12)}\n`}]}});p='a'+i;}
 await writeFile(resolve(dir,'thread.jsonl'),e.map(x=>JSON.stringify(x)).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_HISTORY_HOME:resolve(home,'history'),SUFFICE_SESSIONS_SOCKET:'sfx-r2-transcript-perf'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{const page=await app.firstWindow();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  const start=Date.now();await page.locator('.thread-row').first().click();
  await page.waitForFunction(()=>document.querySelector('.thread-messages')?.children.length>=1400,null,{timeout:60000});
  const opened=Date.now()-start;
  await page.waitForTimeout(1500);
  const stat=()=>page.evaluate(()=>{const b=document.querySelector('.thread-messages'),t=b.parentElement,tr=t.getBoundingClientRect();
   const visible=[...b.querySelectorAll('.thread-assistant')].filter(a=>{const x=a.getBoundingClientRect();return x.bottom>tr.top&&x.top<tr.bottom;});
   const code=visible.flatMap(a=>[...a.querySelectorAll('pre code:not(.language-mermaid)')]),mer=visible.flatMap(a=>[...a.querySelectorAll('.thread-diagram svg')]).length,raw=visible.flatMap(a=>[...a.querySelectorAll('code.language-mermaid')]).length,form=document.querySelector('.thread-composer, form')?.getBoundingClientRect();
   return {nodes:b.querySelectorAll('*').length,lazy:b.querySelectorAll('[data-lazy-markdown]').length,visible:visible.length,visibleEmpty:visible.filter(a=>!a.firstElementChild).length,code:code.length,colored:code.filter(c=>c.querySelector('span')).length,mer,raw,bottom:tr.bottom,win:innerHeight,gap:t.scrollHeight-t.clientHeight-t.scrollTop,sh:t.scrollHeight};});
  const first=await stat();
  assert.ok(opened<20000,'open took '+opened+' ms');
  assert.ok(first.visible>0&&first.visibleEmpty===0,'visible answers must be rendered: '+JSON.stringify(first));
  assert.ok(first.code>0&&first.colored===first.code,'visible code must be highlighted: '+JSON.stringify(first));
  assert.ok(first.bottom<=first.win-16,'scroller ends above the window bottom strip: '+JSON.stringify(first));
  assert.ok(first.gap<40,'opens at the bottom: '+JSON.stringify(first));
  await page.evaluate(()=>{window.__f=[];let l=performance.now(),a=null,pa=0,ps=0;const t=document.querySelector('.thread-messages').parentElement;(function f(n){window.__f.push(n-l);l=n;const tr=t.getBoundingClientRect();requestAnimationFrame(f);})(l);});
  await page.mouse.move(700,400);
  for(let i=0;i<40;i++){await page.mouse.wheel(0,-600);await page.waitForTimeout(60);}
  await page.waitForTimeout(1200);
  const up=await stat();
  assert.ok(up.visible>0&&up.visibleEmpty===0,'rendered after scrolling up: '+JSON.stringify(up));
  assert.ok(up.code>0&&up.colored===up.code,'lazy code highlighted after scroll: '+JSON.stringify(up));
  await page.evaluate(()=>{const t=document.querySelector('.thread-messages').parentElement;for(const a of t.querySelectorAll('.thread-assistant')){if(a.querySelector('code.language-mermaid,.thread-diagram')){a.scrollIntoView({block:'center'});break;}}});
  await page.waitForTimeout(2500);
  const mer=await stat();
  assert.ok(mer.raw===0&&mer.mer>0,'lazy mermaid becomes a diagram: '+JSON.stringify(mer));
  const idle=await page.evaluate(async()=>{const t=document.querySelector('.thread-messages').parentElement;t.scrollTop=t.scrollHeight*.5;await new Promise(r=>setTimeout(r,800));const tr=t.getBoundingClientRect(),a=[...t.querySelector('.thread-messages').children].find(c=>{const r=c.getBoundingClientRect();return r.bottom>tr.top+tr.height/2;}),y=a.getBoundingClientRect().top,w=[];for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,100));w.push(Math.abs(a.getBoundingClientRect().top-y));}return Math.max(...w);});
  assert.ok(idle<4,'anchor moved '+idle+' px while idle');
  // Reading position: after each wheel step settles, the centre message must not drift while no input arrives.
  const drift=()=>page.evaluate(async()=>{const t=document.querySelector('.thread-messages').parentElement,tr=t.getBoundingClientRect(),a=[...t.querySelector('.thread-messages').children].find(c=>{const r=c.getBoundingClientRect();return r.bottom>tr.top+tr.height/2;}),y=a.getBoundingClientRect().top;await new Promise(r=>setTimeout(r,250));return a.isConnected?Math.abs(a.getBoundingClientRect().top-y):0;});
  let worst=0;for(let i=0;i<40;i++){await page.mouse.wheel(0,600);await page.waitForTimeout(i%2?60:350);if(!(i%2))worst=Math.max(worst,await drift());}
  await page.waitForTimeout(1200);
  assert.ok(worst<4,'reading anchor drifted '+worst+' px after a wheel step');
  const f=await page.evaluate(()=>window.__f.slice(5).sort((a,b)=>a-b));
  assert.ok(f[Math.floor(f.length*.95)]<60,'wheel frame p95 '+f[Math.floor(f.length*.95)]+' ms');
  await page.evaluate(()=>{const t=document.querySelector('.thread-messages').parentElement;t.scrollTop=0;});
  await page.waitForTimeout(1500);
  const top=await stat();
  assert.ok(top.nodes<12000,'DOM stays bounded at the top: '+JSON.stringify(top));
  assert.ok(top.lazy>300,'distant blocks are unrendered: '+JSON.stringify(top));
  assert.ok(top.visible>0&&top.visibleEmpty===0,JSON.stringify(top));
 }finally{await app.close();await rm(home,{recursive:true,force:true});await rm(cwd,{recursive:true,force:true});}
});
