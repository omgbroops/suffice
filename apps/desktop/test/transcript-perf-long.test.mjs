import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard,killTmux} from './electron-guard.mjs';
// 2280 messages (1140 pairs) in both transcript views: standard chat and CLI-session. Measures nodes, wheel frame p95/max over 120 wheel events and open time.
// PERF_VIEWS=chat,session limits views; PERF_JSON=<file> appends one JSON line per run; PERF_NOASSERT=1 measures without asserting.
// Asserts: wheel p95 <60 ms, settled DOM <12000 nodes, then reopen restores position, find reaches a top message, jump lands on the last message.
const PAIRS=1140,SESSION_PAIRS=1015,SHOTS=process.env.SHOTS;
const views=(process.env.PERF_VIEWS||'chat,session').split(',');
const ROWS_BY={chat:'.thread-row',session:'.sidebar-cli-sessions .thread-row'};let ROWS;
async function boot(view){
 const SOCKET='sfx-forge-r2-perf-'+view+'-'+process.pid;
 const home=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-tperf2-'))),cwd=resolve(home,'proj'),data=resolve(home,'data'),suffice=resolve(home,'suffice');
 for(const d of [cwd,data,suffice,resolve(home,'history')])await mkdir(d,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:view==='chat'?home:suffice,SUFFICE_HISTORY_HOME:resolve(home,'history'),SUFFICE_SESSIONS_SOCKET:SOCKET};delete env.ELECTRON_RUN_AS_NODE;
 const small=resolve(view==='chat'?home:suffice,'sessions','small');await mkdir(small,{recursive:true});
  await writeFile(resolve(small,'thread.jsonl'),[{type:'session',version:3,id:'small',timestamp:'2020-01-01T00:00:00.000Z',cwd},{type:'message',id:'s1',parentId:null,timestamp:'2020-01-01T00:00:00.000Z',message:{role:'user',content:[{type:'text',text:'Tiny thread'}],timestamp:5}},{type:'message',id:'s2',parentId:'s1',timestamp:'2020-01-01T00:00:00.000Z',message:{role:'assistant',provider:'opencode-go',model:'fixture',content:[{type:'text',text:'ok'}]}}].map(x=>JSON.stringify(x)).join('\n')+'\n');
 if(view==='chat'){
  const now=new Date().toISOString(),dir=resolve(home,'sessions','long');await mkdir(dir,{recursive:true});
  const e=[{type:'session',version:3,id:'long',timestamp:now,cwd}];let p=null;
  for(let i=0;i<PAIRS;i++){e.push({type:'message',id:'u'+i,parentId:p,timestamp:now,message:{role:'user',content:[{type:'text',text:`Question ${i}`}],timestamp:1000+i}});
   e.push({type:'message',id:'a'+i,parentId:'u'+i,timestamp:now,message:{role:'assistant',provider:'opencode-go',model:'fixture',content:[{type:'text',text:`## Answer ${i}\n\n- item a\n- item b\n\n\`\`\`ts\nlet x${i}=await fetch('/api');\n\`\`\`\n\nInline $e^{i\\pi}+1=0$\n\n$$\\int_0^1 x^2 dx$$\n\n${i%50===7?'```mermaid\ngraph TD; A-->B\n```\n\n':''}${'Long paragraph text. '.repeat(i%7*12)}\n`}]}});p='a'+i;}
  await writeFile(resolve(dir,'thread.jsonl'),e.map(x=>JSON.stringify(x)).join('\n')+'\n');
 }else Object.assign(env,{SUFFICE_START_PROJECT:cwd,SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('apps/desktop/test/fake-claude-bulk.mjs'),FAKE_BULK_PAIRS:String(SESSION_PAIRS),NODE_PATH:process.env.NODE_PATH||'/Users/abhayg/suffice-desktop-wt/voice/node_modules'});
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+data],env});
 return {app,home,cwd,SOCKET};
}
async function run(view){
 ROWS=ROWS_BY[view];
 const pairs=view==='chat'?PAIRS:SESSION_PAIRS;
 const {app,home,cwd,SOCKET}=await boot(view);
 try{const page=await app.firstWindow();page.setDefaultTimeout(60000);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  let start;
  if(view==='chat'){start=Date.now();await page.locator(ROWS).filter({hasText:'Question 0'}).first().click();}
  else{await page.locator('[data-action="send-menu"]').waitFor();await page.evaluate(([a,p])=>sufficeDesktop.sessions.start({agent:a,cwd:p}),['fakeclaude',cwd]);await page.reload();await page.locator('[data-action="send-menu"]').waitFor();start=Date.now();await page.locator(ROWS).first().click();}
  // last message present = opened (chat: all blocks exist; session: last pair text rendered)
  await page.waitForFunction(n=>{const b=document.querySelector('.thread-messages');return b&&b.textContent.includes('Question '+(n-1));},pairs,{timeout:120000});
  const open=Date.now()-start;await page.waitForTimeout(1500);
  const m=await page.evaluate(()=>{const b=document.querySelector('.thread-messages');return {nodes:b.querySelectorAll('*').length,children:b.children.length};});
  await page.evaluate(()=>{window.__f=[];window.__peak=0;let l=performance.now();(function f(n){window.__f.push(n-l);l=n;if(!(window.__f.length%10))window.__peak=Math.max(window.__peak,document.querySelector('.thread-messages').querySelectorAll('*').length);requestAnimationFrame(f);})(l);});
  await page.mouse.move(700,400);
  for(let i=0;i<120;i++){await page.mouse.wheel(0,i<60?-700:700);await page.waitForTimeout(40);}
  await page.waitForTimeout(3000);
  const f=await page.evaluate(()=>window.__f.slice(5).sort((a,b)=>a-b));
  const nodesAfter=await page.evaluate(()=>document.querySelector('.thread-messages').querySelectorAll('*').length);
  const peak=await page.evaluate(()=>window.__peak);
  const r={view,peak,nodes:m.nodes,nodesAfterScroll:nodesAfter,children:m.children,p95:+f[Math.floor(f.length*.95)].toFixed(1),max:+f.at(-1).toFixed(1),open};
  if(process.env.PERF_JSON)await writeFile(process.env.PERF_JSON,JSON.stringify(r)+'\n',{flag:'a'});
  console.log('PERF '+JSON.stringify(r));
  return {r,app,page,rows:ROWS,pairs,SOCKET};
 }catch(err){await app.close();killTmux(SOCKET);await rm(home,{recursive:true,force:true});throw err;}
}
for(const view of views)test(`${view}: 2280 messages stay light`,{timeout:300000},async()=>{
 const {r,app,page,rows,pairs,SOCKET}=await run(view);
 try{if(process.env.PERF_NOASSERT)return;
  assert.ok(r.p95<60&&Math.max(r.nodes,r.nodesAfterScroll)<12000,'perf: '+JSON.stringify(r));
  const sc=()=>page.evaluate(()=>{const t=document.querySelector('.thread-messages').parentElement,tr=t.getBoundingClientRect(),vis=[...t.querySelectorAll('.thread-user')].filter(u=>{const b=u.getBoundingClientRect();return b.bottom>tr.top&&b.top<tr.bottom;}).map(u=>u.textContent.trim());return {vis,gap:t.scrollHeight-t.clientHeight-t.scrollTop,top:t.scrollTop,sh:t.scrollHeight};});
  // scroll position restores on reopen
  await page.evaluate(()=>{const t=document.querySelector('.thread-messages').parentElement;t.scrollTop=t.scrollHeight*.4;});await page.waitForTimeout(1500);
  const mid=await sc();assert.ok(mid.vis.length>0&&mid.gap>1000,'mid-thread: '+JSON.stringify(mid));
  await page.locator('.thread-row').filter({hasText:'Tiny thread'}).first().click();await page.waitForTimeout(1000);
  await page.locator(rows).filter({hasText:'Question 0'}).first().click();await page.waitForTimeout(3000);
  const back=await sc();assert.ok(back.gap>1000&&back.vis.some(v=>mid.vis.includes(v)),'reopen restores the reading position: '+JSON.stringify({mid,back}));
  // find-in-thread reaches a message near the top, and brings it into view
  const matches=await app.evaluate(({BrowserWindow})=>new Promise(res=>{const w=BrowserWindow.getAllWindows()[0].webContents;w.on('found-in-page',(e,r)=>{if(r.finalUpdate)res(r.matches);});w.findInPage('Question 7');}));
  await page.waitForTimeout(1500);const found=await sc();
  assert.ok(matches>=1&&found.vis.some(v=>/^Question [5-9]$/.test(v))&&found.top<found.sh*.05,'find-in-thread: '+JSON.stringify({matches,found}));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.stopFindInPage('clearSelection'));
  // jump to bottom (what threads-ui bottom(true) does) lands on the last message even though its blocks were unrendered
  await page.evaluate(()=>{const t=document.querySelector('.thread-messages').parentElement;t.scrollTop=t.scrollHeight;});await page.waitForTimeout(2500);
  const end=await page.evaluate(()=>{const t=document.querySelector('.thread-messages').parentElement,tr=t.getBoundingClientRect(),k=[...t.querySelector('.thread-messages').children].at(-1).getBoundingClientRect();return {lastBottom:k.bottom,lastTop:k.top,viewBottom:tr.bottom,viewTop:tr.top,gap:t.scrollHeight-t.clientHeight-t.scrollTop};});
  assert.ok(end.lastBottom<=end.viewBottom+1&&end.lastTop>=end.viewTop&&end.gap<250,'jump to bottom shows the last message: '+JSON.stringify(end));
 }finally{await app.close();killTmux(SOCKET);}
});
