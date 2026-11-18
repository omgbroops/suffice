// verify-1: session chat stress through the real app (hidden window, fake agent via tui-sim). Temporary; deleted after the run.
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {guard} from './electron-guard.mjs';

const ROOT='/Users/abhayg/suffice-desktop-wt/ui-join2',SIM=resolve(ROOT,'packages/backend/tools/tui-sim'),DIST=resolve(ROOT,'apps/desktop/dist');
const OUT='/Users/abhayg/suffice-desktop-wt/ui-shots/r2-verify/1',SOCKET='sfx-r2-verify-1';
await mkdir(OUT,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-v1-')));
const data=resolve(tmp,'data'),project=resolve(tmp,'demo-project');
for(const d of [data,resolve(data,'sessions'),project,resolve(tmp,'home'),resolve(tmp,'suffice')])await mkdir(d,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:resolve(tmp,'suffice'),SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_DIST:DIST,SUFFICE_TEST_NODE:process.execPath,
 SUFFICE_TEST_SIM_AGENT:resolve(SIM,'sim.mjs'),SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:resolve(tmp,'home'),NODE_PATH:process.env.NODE_PATH||'/Users/abhayg/suffice-desktop-wt/voice/node_modules'});

const results=[];
const rec=(id,pass,detail)=>{results.push({id,pass,detail});console.log(id,pass===null?'INFO':pass?'PASS':'FAIL',JSON.stringify(detail).slice(0,500));};
const INSTALL=`(()=>{if(window.__sw)return;window.__sw=1;window.__gap=0;window.__idle=0;let last=performance.now();
 const f=t=>{window.__gap=Math.max(window.__gap,t-last);last=t;requestAnimationFrame(f);};requestAnimationFrame(f);
 let since=0;setInterval(()=>{const idle=!document.querySelector('.thread-status,.composer-approval:not([hidden]),.session-picker');if(!idle)since=0;else if(!since)since=performance.now();window.__idle=since?performance.now()-since:0;},100);})()`;
const SNAP=`(()=>{const t=e=>(e?.textContent||'').replace(/\\s+/g,' ').trim();
 const users=[...document.querySelectorAll('.thread-messages .thread-user')].map(t);
 const card=document.querySelector('.composer-approval:not([hidden])'),p=document.querySelector('#prompt'),sb=document.querySelector('.send-button');
 return {users,asst:document.querySelectorAll('.thread-messages .thread-assistant').length,working:!!document.querySelector('.thread-status'),
  card:card?t(card.querySelector('h3')):null,prompt:p?p.value:null,composerDisabled:!!p?.disabled,
  send:sb?{label:sb.getAttribute('aria-label')||sb.title||'',disabled:sb.disabled}:null,header:t(document.querySelector('.thread-header')).slice(0,80),
  nodes:document.querySelectorAll('.thread-messages *').length,total:document.querySelectorAll('*').length,
  termVisible:!!document.querySelector('.session-terminal .xterm'),
  thread:!!document.querySelector('.thread-messages'),
  sessRows:document.querySelectorAll('.sidebar-cli-sessions .thread-row').length};})()`;
const CLIP=`(()=>{const out=[];for(const e of document.querySelectorAll('body *')){if(e.childElementCount||!/^\\s*Auto\\b/.test(e.textContent||'')||e.offsetParent===null)continue;
 const r=e.getBoundingClientRect(),clipped=[];for(let a=e.parentElement;a&&a!==document.body;a=a.parentElement){const cs=getComputedStyle(a);if(cs.overflowX!=='visible'){const ar=a.getBoundingClientRect();if(r.right>ar.right+0.5||r.left<ar.left-0.5)clipped.push((a.className||a.tagName).toString().slice(0,40));}}
 out.push({text:e.textContent.trim().slice(0,12),right:Math.round(r.right),vw:innerWidth,clipped,pastWindow:r.right>innerWidth});}return out;})()`;

const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve(ROOT,'apps/desktop'),`--user-data-dir=${data}`],env});
const pid=app.process().pid;let stderr='';app.process().stderr?.on('data',d=>{stderr+=d;});
const pageErrors=[];let page;
const tmuxKill=()=>{try{execFileSync('tmux',['-L',SOCKET,'kill-server'],{stdio:'ignore'});}catch{}};
const setScn=async(name,speed=5)=>{for(const d of [data,resolve(data,'sessions')])await writeFile(resolve(d,'sim-run.json'),JSON.stringify({scenario:name,speed,seed:1}));};
const shot=n=>page.screenshot({path:resolve(OUT,n+'.png')}).catch(e=>console.log('shot fail',n,String(e.message).slice(0,120)));
const snap=()=>page.evaluate(SNAP);
const clip=()=>page.evaluate(CLIP);
const idle=(ms=2500,t=120000)=>page.waitForFunction(m=>window.__idle>m,ms,{timeout:t,polling:250}).then(()=>true).catch(()=>false);
const cardUp=(t=60000)=>page.waitForFunction(()=>document.querySelector('.composer-approval:not([hidden])'),null,{timeout:t,polling:200}).then(()=>true).catch(()=>false);
const approveYes=async()=>{const b=page.locator('.composer-approval .approval-controls button').filter({hasText:/yes/i}).first();await b.click({timeout:5000}).catch(()=>{});};
const stopAll=()=>page.evaluate(async()=>{for(const s of await sufficeDesktop.sessions.list())await sufficeDesktop.sessions.stop(s.id).catch(()=>{});}).catch(()=>{});
// start a fake session. text is sent straight after start (the composer start flow does the same), before any trust card is answered.
async function startSess(scn,text){
 await setScn(scn);
 const id=await page.evaluate(async({p,text})=>{const s=await sufficeDesktop.sessions.start({agent:'simclaude',cwd:p});if(text)await sufficeDesktop.sessions.send(s.id,text);return s.id;},{p:project,text});
 await page.waitForTimeout(3000);
 for(let k=0;k<3;k++){await page.reload();await page.locator('[data-action="send-menu"]').waitFor();await page.evaluate(INSTALL);
  if(await page.locator('.sidebar-cli-sessions .thread-row').first().waitFor({timeout:8000}).then(()=>true).catch(()=>false))break;}
 if(!(await page.locator('.sidebar-cli-sessions .thread-row').count()))return id;
 await page.locator('.sidebar-cli-sessions .thread-row').first().click();
 await page.locator('.sidebar-cli-sessions .thread-row[aria-pressed="true"]').waitFor();
 return id;
}
const sendComposer=async(text,how='Enter')=>{const p=page.locator('#prompt');await p.fill(text);await p.press(how);};
const E=(x)=>x;

try{
 page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>pageErrors.push(String(e.message).slice(0,200)));
 await page.locator('[data-action="send-menu"]').waitFor();
 // ---- A: first prompt sent before the trust card is answered (bash-allow starts with a trust card)
 {
  const idA=await startSess('bash-allow','FIRSTPROMPT-ALPHA first message');
  const polls=[];for(let k=0;k<6;k++){polls.push(await page.evaluate(id=>sufficeDesktop.sessions.list().then(l=>l.some(x=>x.id===id)).catch(()=>'err'),idA));await page.waitForTimeout(1500);}
  rec('A0 session survives first prompt sent before trust answer (list polls over 9 s)',polls.every(Boolean),{idA,polls});
  const card=await cardUp();const cardTitle=(await snap()).card;
  await shot('a1-trust-card');
  await approveYes();
  await page.waitForTimeout(500);await page.waitForTimeout(12000);await idle(2500,120000);
  const s=await snap();await shot('a2-after-trust-prompt-before-answer');
  rec('A1 first-prompt-before-trust-answer',s.users.some(u=>u.includes('FIRSTPROMPT-ALPHA')),{card,cardTitle,users:s.users.slice(0,4),asst:s.asst,promptBox:s.prompt,working:s.working});
  await stopAll();
  // control: same flow, prompt typed only after the trust card is answered
  await startSess('bash-allow',null);
  await cardUp();await approveYes();await page.waitForTimeout(1500);await idle(1500,60000);
  await sendComposer('FIRSTPROMPT-CONTROL after trust');
  await page.waitForTimeout(10000);await idle(2500,120000);
  const c=await snap();await shot('a3-control-after-trust');
  rec('A2 control prompt-after-trust',c.users.some(u=>u.includes('FIRSTPROMPT-CONTROL')),{users:c.users.slice(0,4),asst:c.asst,promptBox:c.prompt});
  await stopAll();
 }

 // ---- B: header pill clipping at 1440x900 and 720x540, approval node present while idle
 {
  await startSess('status-idle','HEADER-CHECK prompt');
  await cardUp(20000);await approveYes();await idle(2000,90000);
  await page.waitForTimeout(1500);
  const cl=await clip();const s=await snap();await shot('b1-header-1440');
  rec('B1 Auto pill clip at 1440x900',cl.length?cl.every(x=>!x.clipped.length&&!x.pastWindow):null,{found:cl.length,detail:cl.slice(0,3)});
  const apv=await page.evaluate(()=>{const els=[...document.querySelectorAll('.composer-approval')];return els.map(e=>({hidden:e.hidden,disp:getComputedStyle(e).display,aria:e.getAttribute('aria-label')}));});
  rec('B2 approval section idle state (POLISH: should not be in DOM while idle)',null,{approval:apv,header:s.header});
  await page.setViewportSize({width:720,height:540}).catch(()=>{});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:720,height:540}));
  await page.waitForFunction(()=>innerWidth===720&&innerHeight===540).catch(()=>{});
  await page.waitForTimeout(800);
  const cl2=await clip();await shot('b3-header-720');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  rec('B3 Auto pill clip at 720x540',cl2.length?cl2.every(x=>!x.clipped.length&&!x.pastWindow):null,{found:cl2.length,detail:cl2.slice(0,3),pageHorizontalOverflowPx:overflow});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900).catch(()=>{});
  await stopAll();
 }

 // ---- D: careless actions on a working session
 {
  await startSess('interrupt-then-queue','CARELESS-D start');
  await cardUp(30000);await approveYes();
  await page.waitForFunction(()=>document.querySelector('.thread-status')||document.querySelectorAll('.thread-messages .thread-user').length,null,{timeout:60000,polling:200}).catch(()=>{});
  await idle(1500,60000);
  await sendComposer('CARELESS-D long task');
  await page.waitForFunction(()=>document.querySelector('.thread-status'),null,{timeout:60000,polling:200}).catch(()=>{});
  await page.waitForTimeout(1200);
  let s0=await snap();await shot('d1-working');
  // D1 Enter on an empty composer while the agent works
  await page.locator('#prompt').fill('');await page.locator('#prompt').press('Enter');await page.waitForTimeout(1500);
  let s1=await snap();rec('D1 Enter on empty draft while working',s1.working===true||s0.working===false,{before:s0.working,after:s1.working,usersBefore:s0.users.length,usersAfter:s1.users.length});
  // D2 Ctrl+Enter with text while working (other mode from the setting)
  await sendComposer('CARELESS-STEER-ONE','Control+Enter');await page.waitForTimeout(2500);
  const d2=await page.evaluate(()=>document.body.innerText.split('CARELESS-STEER-ONE').length-1);
  let s2=await snap();await shot('d2-ctrl-enter');
  rec('D2 Ctrl+Enter while working: copies of text on screen',d2>=1&&d2<=2,{copiesOnScreen:d2,prompt:s2.prompt,working:s2.working});
  // D3 double-click send with text while working
  await page.locator('#prompt').fill('CARELESS-DBL');await page.locator('.send-button').dblclick({timeout:5000}).catch(()=>{});
  await page.waitForTimeout(3000);
  const d3=await page.evaluate(()=>document.body.innerText.split('CARELESS-DBL').length-1);await shot('d3-dblclick-send');
  rec('D3 double-click send: copies of text on screen',d3>=1&&d3<=2,{copies:d3});
  // D4 mode-toggle hammered 7 times
  for(let i=0;i<7;i++){await page.locator('.session-mode-toggle').click({timeout:3000}).catch(()=>{});await page.waitForTimeout(40);}
  await page.waitForTimeout(2000);
  const d4=await page.evaluate(()=>({term:!!document.querySelector('.session-terminal .xterm-rows'),termVisible:!!document.querySelector('.session-terminal') && getComputedStyle(document.querySelector('.session-terminal')).display!=='none',thread:!!document.querySelector('.thread-messages')&&getComputedStyle(document.querySelector('.thread-messages')).display!=='none',pressed:document.querySelector('.session-mode-toggle')?.getAttribute('aria-pressed')}));
  await shot('d4-toggle-hammered');
  rec('D4 mode toggle x7 fast: view settles consistent',null,d4);
  // D5 sidebar collapse with Ctrl+B
  await page.keyboard.press('Control+b');await page.waitForTimeout(400);await page.keyboard.press('Control+b');await page.waitForTimeout(600);
  rec('D5 Ctrl+B twice during run',null,{sidebarWidth:await page.evaluate(()=>document.querySelector('.sidebar')?.getBoundingClientRect().width??null),working:(await snap()).working});
  // D6 Escape while working (setting: stop agent with Escape)
  await page.locator('#prompt').click().catch(()=>{});await page.keyboard.press('Escape');await page.waitForTimeout(2000);
  const d6=await snap();await shot('d6-escape-working');
  rec('D6 Escape while working',null,{workingAfter:d6.working,usersAfter:d6.users.length,header:d6.header});
  // D7 resize narrow mid-run
  await startSess('status-idle',null).catch(()=>{});
  await page.waitForTimeout(500);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:720,height:540}));
  await page.waitForFunction(()=>innerWidth===720,null,{timeout:5000}).catch(()=>{});
  await page.waitForTimeout(800);await shot('d7-narrow');
  const d7=await page.evaluate(()=>({sx:document.documentElement.scrollWidth-innerWidth,prompt:!!document.querySelector('#prompt')&&document.querySelector('#prompt').getBoundingClientRect().bottom<=innerHeight+1}));
  rec('D7 narrow window: no page horizontal scroll, composer in view',d7.sx<=0&&d7.prompt,d7);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440).catch(()=>{});
  // D8 paste a 60 KB prompt and send while idle
  await idle(1000,60000);
  const big='BIGPASTE '+'lorem ipsum dolor sit amet '.repeat(2200);
  const t0=Date.now();await page.locator('#prompt').fill(big);const fillMs=Date.now()-t0;
  await page.locator('#prompt').press('Enter');await page.waitForTimeout(2000);
  const d8=await snap();await shot('d8-bigpaste');
  rec('D8 60 KB paste + Enter: app responsive',d8.prompt!==null,{fillMs,promptLen:(d8.prompt||'').length,users:d8.users.length,working:d8.working});
  // D9 whitespace-only send while idle
  await idle(1000,60000);const before9=(await snap()).users.length;
  await page.locator('#prompt').fill('   \n  ');await page.locator('#prompt').press('Enter');await page.waitForTimeout(1200);
  const after9=await snap();
  rec('D9 whitespace-only Enter while idle sends nothing',after9.users.length===before9,{before:before9,after:after9.users.length});
  // D10 stop the session while working, card may be up
  await page.evaluate(async()=>{for(const s of await sufficeDesktop.sessions.list())await sufficeDesktop.sessions.stop(s.id).catch(()=>{});});
  await page.waitForTimeout(2500);const d10=await snap();await shot('d10-stopped');
  rec('D10 stop session externally: no stuck working/card',!d10.working&&!d10.card,{working:d10.working,card:d10.card,header:d10.header});
  await page.waitForTimeout(300);
 }

 // ---- E: switch between two sessions rapidly, check no transcript bleed
 {
  await startSess('read-search','ALPHA-SESSION prompt');
  await cardUp(20000);await approveYes();await idle(1500,90000);
  await startSess('status-idle','BRAVO-SESSION prompt');
  await cardUp(20000);await approveYes();await idle(1500,90000);
  const rows=await page.locator('.sidebar-cli-sessions .thread-row').count();
  let bleed=[];
  for(let i=0;i<10;i++){const k=i%2;await page.locator('.sidebar-cli-sessions .thread-row').nth(k).click({timeout:5000}).catch(()=>{});await page.waitForTimeout(120);}
  await page.waitForTimeout(1500);
  const seen={};
  for(let k=0;k<Math.min(rows,2);k++){await page.locator('.sidebar-cli-sessions .thread-row').nth(k).click().catch(()=>{});await page.waitForTimeout(1200);const s=await snap();seen[k]={title:(await page.locator('.thread-header').textContent()).trim().slice(0,40),users:s.users.slice(0,3)};}
  await shot('e1-after-switching');
  rec('E1 rapid session switching: each session shows only its own prompt',Object.keys(seen).length>=2&&!Object.values(seen).some(v=>v.users.some(u=>u.includes('ALPHA'))&&v.users.some(u=>u.includes('BRAVO'))),{rows,seen});
  await stopAll();
 }

 // ---- F: long session transcript, wheel scroll latency
 {
  await startSess('long-session','LONG-START');
  await cardUp(30000);await approveYes();
  await page.waitForFunction(()=>window.__idle>2500,null,{timeout:300000,polling:500}).catch(()=>{});
  await page.waitForTimeout(1000);
  const dom=await snap();
  const box=await page.locator('.thread-messages').boundingBox().catch(()=>null);
  const lat=[];
  if(box){await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
   for(let i=0;i<120;i++){const t=Date.now();await page.mouse.wheel(0,i%2?-400:400);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));lat.push(Date.now()-t);}}
  lat.sort((a,b)=>a-b);const p95=lat[Math.floor(lat.length*0.95)]??null;
  await shot('f1-long-session');
  rec('F1 long session: wheel p95 under 100 ms (triage blocker was 858 ms on 2280 msgs)',p95===null?null:p95<100,{rows:dom.users.length+dom.asst,nodes:dom.nodes,wheelP95:p95,wheelMax:lat.at(-1)??null});
  await stopAll();
 }

 // ---- G: POLISH watch items seen in triage (sessions)
 {
  rec('G1 triage: first-prompt-lost (see A1/A2) and approval-always-in-DOM (see B2)',null,{note:'covered above'});
 }
}catch(e){rec('fatal',false,String(e.message||e).slice(0,400));await shot('fatal');}
finally{
 try{await page?.evaluate(async()=>{for(const s of await sufficeDesktop.sessions.list())await sufficeDesktop.sessions.stop(s.id).catch(()=>{});}).catch(()=>{});}catch{}
 try{process.kill(pid,'SIGKILL');}catch{}
 tmuxKill();
 const noDialog=stderr.split('\n').filter(l=>/\[no-dialog\]|uncaught|Error/i.test(l)).slice(0,20);
 await writeFile(resolve(OUT,'verify-1-results.json'),JSON.stringify({results,pageErrors:pageErrors.slice(0,20),stderrFlags:noDialog},null,1));
 console.log('PAGE_ERRORS',JSON.stringify(pageErrors.slice(0,10)));
 console.log('STDERR_FLAGS',JSON.stringify(noDialog));
 await rm(tmp,{recursive:true,force:true}).catch(()=>{});
}
