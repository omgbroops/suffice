import electronPath from 'electron';
// Hidden capture of the CLI-session UI against a fake agent, a temp tmux socket and a synthetic history home.
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,rm,utimes,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const REAL=process.env.SUFFICE_REAL_CLAUDE==='1';
const output=resolve('apps/desktop/visual-review/sessions-ui');await mkdir(output,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-sessions-ui-')));
const socket=`sfx-cap-${process.pid}`;
const home=resolve(tmp,'home'),project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice');
for(const d of [project,data,suffice])await mkdir(d,{recursive:true});
const j=(...rows)=>rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
const day=24*3600e3,old=(n)=>new Date(Date.now()-n*day);
async function seed(rel,body,when){const p=resolve(home,rel);await mkdir(resolve(p,'..'),{recursive:true});await writeFile(p,body);await utimes(p,when,when);}
await seed('.claude/projects/-tmp-api-server/c1.jsonl',j(
 {type:'user',uuid:'u1',timestamp:old(1).toISOString(),cwd:'/tmp/api-server',entrypoint:'cli',message:{content:'Add rate limiting to the API'}},
 {type:'assistant',uuid:'a1',timestamp:old(1).toISOString(),message:{content:[{type:'text',text:'Added a token bucket limiter in `limiter.js`.'}]}}),old(1));
await seed('.claude/projects/-tmp-docs-site/c2.jsonl',j(
 {type:'user',uuid:'u2',timestamp:old(4).toISOString(),cwd:'/tmp/docs-site',entrypoint:'cli',message:{content:'Fix broken links in the docs'}},
 {type:'assistant',uuid:'a2',timestamp:old(4).toISOString(),message:{content:[{type:'text',text:'Fixed 6 links.'}]}}),old(4));
await seed('.codex/sessions/2026/11/01/rollout-2026-11-01T00-00-00-x3.jsonl',j(
 {type:'session_meta',payload:{id:'x3',cwd:'/tmp/cli-tool',timestamp:old(2).toISOString()}},
 {type:'response_item',timestamp:old(2).toISOString(),payload:{type:'message',role:'user',content:[{text:'Port the parser to Rust'}]}}),old(2));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',
 SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs'),
 SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:REAL?process.env.HOME:home,
 NODE_PATH:process.env.NODE_PATH||'/Users/abhayg/suffice-desktop-wt/voice/node_modules'});
if(REAL){const bin=resolve(tmp,'bin');await mkdir(bin);const real=execFileSync('which',['claude'],{encoding:'utf8'}).trim();
 await writeFile(resolve(bin,'claude'),`#!/bin/sh\nexec ${real} --model haiku "$@"\n`,{mode:0o755});env.PATH=bin+':'+env.PATH;
 for(const k of ['SUFFICE_TEST_AGENT','SUFFICE_TEST_CLAUDE_AGENT'])delete env[k];}
const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),`--user-data-dir=${data}`],env});
let page;const appPid=app.process().pid;try{
 page=await app.firstWindow();page.on('console',m=>{if(m.type()==='error')console.error('PAGE',m.text().slice(0,200));});const errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.locator('[data-action="send-menu"]').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 const shot=n=>page.screenshot({path:resolve(output,n)});
 if(!REAL){
 // (d) start menu
 await page.locator('[data-action="send-menu"]').click();await page.waitForTimeout(300);
 await shot('start-menu.png');
 await page.locator('[data-menu-action="import-chat:open"]').click();
 await page.locator('.session-import-row').first().waitFor();await page.waitForTimeout(350);
 await shot('import.png');          // (e)
 await page.keyboard.press('Escape');await page.waitForTimeout(300);
 await page.locator('[data-action="send-menu"]').click();await page.waitForTimeout(250);
 await page.locator('[data-menu-action="cli-session:fake"]').click();
 await page.locator('.session-row').first().waitFor();
 await page.locator('.thread-header--session').waitFor();
 await page.locator('#prompt').fill('hello');await page.locator('#prompt').press('Enter');
 await page.locator('.thread-message',{hasText:'ECHO:hello'}).waitFor({timeout:15000});
 await page.waitForTimeout(900);
 await shot('chat.png');            // (a)+(b) sidebar row with state and Chat view
 await page.locator('.session-toggle button',{hasText:'Terminal'}).click();
 await page.locator('.session-terminal .xterm-rows').waitFor({timeout:15000});
 await page.waitForFunction(()=>document.querySelector('.session-terminal .xterm-rows')?.textContent.includes('ECHO:hello'),null,{timeout:15000});
 await page.waitForTimeout(300);
 await shot('terminal.png');        // (c)
  // fake Claude: rich chat
  await page.locator('.new-session').click();await page.locator('[data-action="send-menu"]').waitFor({state:'visible'});await page.waitForTimeout(400);
  await page.locator('[data-action="send-menu"]').click();await page.waitForTimeout(250);
  await page.locator('[data-menu-action="cli-session:fakeclaude"]').click();
  await page.locator('.composer-approval:not([hidden])').waitFor({timeout:20000});await page.waitForTimeout(600);
  await shot('chat-prompt.png');
  await page.locator('.session-status').waitFor({timeout:5000});await shot('chat-working.png');
  await page.locator('.composer-approval button',{hasText:/^\s*(1\.\s*)?Yes\s*$/}).first().click();await page.waitForTimeout(300);if(await page.locator('dialog.detail-dialog[open]').count())throw new Error('detail dialog opened after Yes');
  await page.waitForFunction(()=>!document.querySelector('.session-status')&&document.querySelector('.session-run')?.dataset.running==='false',null,{timeout:15000});await page.waitForTimeout(500);
  await shot('chat-summary-collapsed.png');
  {const r=page.locator('.session-run:has(.tool-diff)').first();if(!await r.evaluate(e=>e.open)){await r.locator('> summary').click();await page.waitForTimeout(400);}}
  await shot('chat-summary-open.png');
  // subagent blocks: a2 running, a1 done with a nested child
  const subs=page.locator('.session-sub'),scrollTo=l=>l.evaluate(e=>e.scrollIntoView({block:'center'}));
  if(await subs.count()!==2)throw new Error('expected 2 subagent blocks, got '+await subs.count());
  const runText=await page.locator('.session-run:has(.session-sub) > summary').first().textContent();if(!/ran 1 subagent.*running 1 subagent/.test(runText))throw new Error('run summary: '+runText);
  await scrollTo(subs.nth(1));await page.waitForTimeout(200);await shot('subagent-running.png');
  await scrollTo(subs.nth(0));await page.waitForTimeout(200);await shot('subagent-done-collapsed.png');
  await subs.nth(0).locator('> summary').click();await page.waitForTimeout(400);await scrollTo(subs.nth(0));await shot('subagent-open.png');
  await subs.nth(0).locator('.session-run:has(.session-sub)').first().locator('> summary').click();await page.waitForTimeout(300);
  await subs.nth(0).locator('.session-sub').first().locator('> summary').click();await page.waitForTimeout(400);await scrollTo(subs.nth(0).locator('.session-sub').first());await shot('subagent-nested.png');
  await page.locator('.tool-widget:has(.tool-diff) summary').first().click().catch(()=>{});
  await page.waitForTimeout(400);
  await page.locator('.thread-messages').evaluate(e=>{e.querySelector('.tool-diff')?.scrollIntoView({block:'center'});});await page.waitForTimeout(300);
  await shot('chat-diff-open.png');
  await page.locator('.thread-messages').evaluate(e=>{e.scrollTop=0;});await page.waitForTimeout(200);
  await shot('chat-full-1.png');
  await page.locator('.thread-messages').evaluate(e=>{e.scrollTop=e.scrollHeight;});await page.waitForTimeout(200);
  await shot('chat-full-2.png');
  // CLI controls against the stand-in's typed screens
  {const sl=await page.evaluate(()=>sufficeDesktop.sessions.list());console.log('SL',JSON.stringify(sl.map(x=>[x.id,x.agent,x.kind,x.state])));const sid=(sl.filter(x=>x.agent==='fakeclaude').at(-1)||sl.at(-1)).id;
   const type=async t=>{await page.evaluate(([i,t])=>sufficeDesktop.sessions.send(i,t),[sid,t]);await page.waitForTimeout(1800);};
   const reset=async()=>{await page.keyboard.press('Escape');await type('/clear');await page.mouse.click(720,450);await page.waitForTimeout(300);};
   await type('/clear');
   await page.locator('.session-ctl').first().click();await page.waitForTimeout(350);await shot('ctl-model-picker.png');await page.keyboard.press('Escape');await page.waitForTimeout(200);
   await page.locator('.session-ctl').nth(2).click();await page.waitForTimeout(350);await shot('ctl-mode.png');await page.keyboard.press('Escape');await page.waitForTimeout(200);
   await page.locator('#prompt').click();await page.keyboard.type('/co');await page.waitForTimeout(400);await shot('ctl-slash.png');await page.keyboard.press('Escape');await page.locator('#prompt').fill('');
   await type('/model');await shot('ctl-native-picker.png');await reset();
   await type('/queue');await shot('ctl-queued.png');await reset();
   await type('/bg');await page.waitForSelector('.session-bg',{timeout:8000});await page.locator('.session-bg').click();await page.waitForTimeout(350);await shot('ctl-background.png');await page.keyboard.press('Escape');await reset();
   await type('/plan');await shot('ctl-plan-approval.png');
   const rowState=()=>page.evaluate(()=>{const r=document.querySelector('.session-row[aria-pressed="true"]');const t=r?.querySelector('.thread-state');return t?[t.getAttribute('data-status'),t.getAttribute('aria-label'),t.className,t.textContent.trim()].join('|'):'none';});
   console.log('badge12 prompt-open',await rowState());
   await page.evaluate(i=>sufficeDesktop.sessions.control(i,'keys',{keys:['enter']}),sid);await page.waitForTimeout(1800);
   console.log('badge12 after-answer',await rowState(),'prompt',await page.evaluate(i=>!!sufficeDesktop.sessions.ui(i)?.prompt,sid));await reset();
   await type('/ask');await shot('ctl-question.png');await reset();
   await type('/ctx');await shot('ctl-usage.png');await reset();
   await type('/queue');await shot('ctl-stop.png');await reset();
   console.log('badge',JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('.session-row')].map(r=>r.innerText.replace(/\s+/g,' ')))));}
  // venom frames, animation slowed 4x so capturePage latency does not skew timings
  const SLOW=4;await page.evaluate(n=>{window.__motionSlow=n;},SLOW);
  const grab=(clickJs,times,extra)=>app.evaluate(async({BrowserWindow},{clickJs,times,SLOW,extra})=>{
   const w=BrowserWindow.getAllWindows()[0],out=[],t0=Date.now();
   await w.webContents.executeJavaScript(clickJs);
   const jobs=times.map(t=>new Promise(r=>setTimeout(async()=>{out.push([t,(await w.webContents.capturePage()).toPNG().toString('base64'),Date.now()-t0]);r();},t*SLOW)));
   if(extra)jobs.push(new Promise(r=>setTimeout(async()=>{await w.webContents.executeJavaScript(extra.js);r();},extra.at*SLOW)));
   await Promise.all(jobs);return out.sort((a,b)=>a[0]-b[0]);},{clickJs,times,SLOW,extra});
  const save=async(rows,prefix)=>{const log=[];for(const [i,r] of rows.entries()){await writeFile(resolve(output,`${prefix}-${i}.png`),Buffer.from(r[1],'base64'));log.push({frame:i,at:r[0],actualMs:r[2]});}return log;};
  const T="document.querySelector('.session-toggle button:last-child').click()",C="document.querySelector('.session-toggle button:first-child').click()";
  const frames={};
  frames.spread=await save(await grab(T,[0,60,120,200,300,420,520]),'spread');
  await page.waitForTimeout(600*SLOW);
  await shot('terminal-prompt.png');
  frames.retract=await save(await grab(C,[0,80,160,240,320]),'retract');
  await page.waitForTimeout(500*SLOW);await shot('chat-after-retract.png');
  frames.interrupt=await save(await grab(T,[170,270,500],{at:150,js:C}),'interrupt');
  await page.waitForTimeout(500*SLOW);
  await writeFile(resolve(output,'venom-timing.json'),JSON.stringify({slow:SLOW,frames},null,1));
  await page.evaluate(()=>{window.__motionSlow=1;});
 }else{
  await page.locator('[data-action="send-menu"]').click();await page.waitForTimeout(250);
  await page.locator('[data-menu-action="cli-session:claude"]').click();
  await page.locator('.thread-header--session').waitFor();
  const sid=await page.evaluate(async()=>(await sufficeDesktop.sessions.list())[0].id);
  const U=()=>page.evaluate(id=>{const u=sufficeDesktop.sessions.ui(id);return {prompt:u?.prompt?.title||null,model:u?.meta?.model||null,mode:u?.meta?.mode||null,status:!!u?.status,kinds:(u?.items||[]).map(i=>i.kind+(i.category?':'+i.category:'')+(i.id&&i.kind==='notice'?':'+i.text:''))};},sid);
  const log=[],fail=[];const t0=Date.now();
  // trust prompt via the card
  while(Date.now()-t0<60000){const u=await U();
   if(u.prompt){log.push('prompt:'+u.prompt);const pr=await page.evaluate(id=>sufficeDesktop.sessions.ui(id).prompt,sid);const o=pr.options.find(x=>/trust/i.test(x.label))||pr.options.find(x=>/^yes/i.test(x.label))||pr.options[0];
    await page.evaluate(([id,i])=>sufficeDesktop.sessions.control(id,'answerPrompt',{index:i}),[sid,o.index]);await page.waitForTimeout(2500);continue;}
   if(u.model)break;await page.waitForTimeout(1000);}
  const waitMeta=async(k,re)=>{try{await page.waitForFunction(([id,k,re])=>new RegExp(re,'i').test(sufficeDesktop.sessions.ui(id)?.meta?.[k]||''),[sid,k,re],{timeout:20000});return true;}catch{return false;}};
  const pick=async(idx,re)=>{await page.locator('.session-ctl').nth(idx).click();await page.waitForTimeout(400);await page.locator('.popover .menu-item',{hasText:re}).first().click();};
  const mask=[page.locator('.session-title')];
  log.push('start '+JSON.stringify(await U()));
  // (a) model
  await pick(0,/sonnet/i);const a1=await waitMeta('model','sonnet');log.push('a sonnet '+a1);await page.waitForTimeout(600);await shot('real-ctl-model.png');
  await pick(0,/haiku/i);const a2=await waitMeta('model','haiku');log.push('a haiku '+a2);if(!a1||!a2)fail.push('model');
  // (b) mode
  const m0=(await U()).mode;log.push('mode0 '+m0);
  const ci=await page.locator('.session-ctl').count()-1;
  await pick(ci,/plan/i);const b1=await waitMeta('mode','plan');log.push('b plan '+b1);await page.waitForTimeout(600);await shot('real-ctl-mode.png');
  await pick(ci,new RegExp(m0&&!/plan/i.test(m0)?m0.replace(/[^a-z]/gi,'.'):'manual','i'));const b2=await waitMeta('mode',m0&&!/plan/i.test(m0)?m0.replace(/[^a-z]/gi,'.'):'manual|default');log.push('b back '+b2);if(!b1||!b2)fail.push('mode');
  // (c) interrupt
  await page.locator('#prompt').fill('run: sleep 8 && echo done');await page.locator('#prompt').press('Enter');
  const t1=Date.now();
  for(let i=0;i<60;i++){const u=await U();if(u.prompt){const pr=await page.evaluate(id=>sufficeDesktop.sessions.ui(id).prompt,sid);const o=pr.options.find(x=>/^yes/i.test(x.label))||pr.options[0];log.push('c prompt:'+pr.title);await page.evaluate(([id,i])=>sufficeDesktop.sessions.control(id,'answerPrompt',{index:i}),[sid,o.index]);break;}if(Date.now()-t1>3000)break;await page.waitForTimeout(500);}
  await page.waitForTimeout(300);
  const wasWorking=await page.evaluate(()=>document.querySelector('.session-run')?.dataset.running==='true'||!!document.querySelector('.session-status'));log.push('c working '+wasWorking);
  await page.locator('.send-button').click();
  let intr=false;try{await page.waitForFunction(id=>(sufficeDesktop.sessions.ui(id)?.items||[]).some(i=>i.kind==='notice'&&/interrupted/i.test(i.text||'')),sid,{timeout:15000});intr=true;}catch{}
  log.push('c interrupted '+intr);if(!intr)fail.push('interrupt');
  await page.waitForTimeout(800);await shot('real-ctl-interrupt.png');
  await writeFile(resolve(output,'real-claude-log.json'),JSON.stringify({fail,log},null,1));
  await page.evaluate(id=>sufficeDesktop.sessions.stop(id),sid).catch(()=>{});
  if(fail.length)throw new Error('real run failed: '+fail.join(','));
 }
 await writeFile(resolve(output,'verification.json'),JSON.stringify({viewport:{width:1440,height:900},pageErrors:errors},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({ready:true,output}));
}catch(e){try{await page.screenshot({path:'/private/tmp/claude-501/-Users-abhayg--claude/88968a81-d5d8-4bde-b35e-a21bdddc9620/scratchpad/fail.png'});}catch{}try{console.error('DBG',JSON.stringify(await page.evaluate(async()=>({u:await Promise.all((await sufficeDesktop.sessions.list()).map(async x=>[x.id,(u=>JSON.stringify({m:u?.meta,p:u?.prompt,s:u?.status,n:u?.items?.length}))(sufficeDesktop.sessions.ui(x.id))])),h:document.querySelector('.thread-header--session')?.outerHTML.slice(0,900),term:!!document.querySelector('.session-terminal:not([hidden])'),t:document.querySelector('.session-terminal')?.innerHTML.slice(0,200),r:document.querySelector('.session-terminal .xterm-rows')?.textContent.slice(0,300)}))));}catch{}console.error('FAIL',e.message.slice(0,1500));process.exitCode=1;}finally{
 await Promise.race([app.close(),new Promise(r=>setTimeout(r,5000))]).catch(()=>{});
 try{process.kill(appPid,'SIGKILL');}catch{}
 try{execFileSync('tmux',['-L',socket,'kill-server'],{stdio:'ignore'});}catch{}
 await rm(tmp,{recursive:true,force:true});
}
process.exit(process.exitCode||0);
