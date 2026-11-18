// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): CLI-session approval cards against the fake Claude on a private tmux socket.
// SHOT_DIR sets the screenshot folder; APP_DIR runs another checkout's app (BEFORE=1 only takes screenshots, no assertions).
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const KEY='session-approvals',SOCKET=`sfx-test-${KEY}-${process.pid}`,BEFORE=process.env.BEFORE==='1';
const appDir=resolve(process.env.APP_DIR||'apps/desktop');
const shots=resolve(process.env.SHOT_DIR||tmpdir()+'/sfx-approval-shots');

test('session approval cards',{timeout:240000},async()=>{
 await mkdir(shots,{recursive:true});
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-approval-')));
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home'),simLog=resolve(tmp,'sim.log');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 await writeFile(simLog,'');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),
  SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('apps/desktop/test/sessions-approval-agent.mjs'),SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,SIM_LOG:simLog});
 const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',appDir,`--user-data-dir=${data}`],env});
 const pid=app.process().pid;
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  assert.equal(await app.evaluate(()=>process.env.SUFFICE_SESSIONS_SOCKET),SOCKET,'private tmux socket reaches the app');
  await page.locator('[data-action="send-menu"]').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  const shot=async n=>{await page.waitForTimeout(350);const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,n),Buffer.from(b64,'base64'));};
  // Agents are chosen in the model picker now (no send-menu item): start through the API, then open its sidebar row.
  await page.evaluate(p=>sufficeDesktop.sessions.start({agent:'fakeclaude',cwd:p}),project);
  await page.reload();await page.locator('[data-action="send-menu"]').waitFor();
  await page.locator('.sidebar-cli-sessions .thread-row').first().click();
  await page.locator('.thread-header').waitFor();
  const sid=await page.evaluate(async()=>(await sufficeDesktop.sessions.list()).at(-1).id);
  const type=t=>page.evaluate(([i,t])=>sufficeDesktop.sessions.send(i,t),[sid,t]);
  const card=page.locator('.composer-approval:not([hidden])');
  const open=async(cmd,title)=>{await type(cmd);await page.waitForFunction(t=>document.querySelector('.composer-approval:not([hidden]) h3')?.textContent.includes(t),title,{timeout:15000}).catch(async e=>{throw new Error(e.message+' | ui='+JSON.stringify(await page.evaluate(i=>{const u=sufficeDesktop.sessions.ui(i);return {p:u?.prompt,m:u?.meta,n:u?.items?.length};},sid))+' | log='+(await readFile(simLog,'utf8')).replace(/\n/g,'')+' | h3='+await page.locator('.composer-approval h3').allTextContents());});};
  const gone=()=>page.waitForFunction(()=>!document.querySelector('.composer-approval:not([hidden])'),null,{timeout:15000}).catch(async e=>{throw new Error(e.message+' | log='+(await readFile(simLog,'utf8')).replace(/\n/g,'')+' | ui='+JSON.stringify(await page.evaluate(i=>sufficeDesktop.sessions.ui(i)?.prompt,sid)));});
  const keys=async()=>(await readFile(simLog,'utf8')).split('\n').filter(Boolean).map(l=>JSON.parse(l));
  const label=()=>card.locator('.approval-action span').textContent();

  // bash permission (pending Bash tool in the JSONL)
  await open('/bash','Do you want to proceed?');await page.waitForTimeout(500);
  await shot('bash-permission.png');
  if(!BEFORE){
   assert.equal(await label(),'Command');
   assert.ok(await card.locator('.approval-action .icon').count(),'action icon');
   assert.equal(await card.locator('.approval-preview-host > pre.approval-preview').count(),1);
   assert.match(await card.locator('pre.approval-preview').textContent(),/rm -rf build/);
   assert.equal(await card.locator('.approval-controls .provider-dialog-button').count(),3);
   assert.equal(await card.locator('.approval-controls .provider-dialog-primary').textContent(),'Yes Ctrl+↵');
   assert.equal(await page.locator('.composer').getAttribute('data-approval'),'true');
   assert.ok(await page.evaluate(()=>[...document.querySelector('.composer').children].every(c=>c.matches('.composer-approval')||c.inert)),'other composer children inert');
   // The card floats above the composer; the composer stays visible (same placement as standard chat, see approvals-ui.test).
   assert.ok(await page.evaluate(()=>{const c=document.querySelector('.composer-approval').getBoundingClientRect(),f=document.querySelector('.composer').getBoundingClientRect();return c.bottom<=f.top&&f.height>0&&!!document.querySelector('.composer textarea').offsetParent;}),'card above visible composer');
   await page.keyboard.press('Tab');await shot('focus-visible.png'); // keyboard focus ring on a button
   await page.evaluate(()=>{window.__k=[];for(const t of ['keydown'])document.addEventListener(t,e=>window.__k.push([e.key,e.defaultPrevented,e.target.tagName+'.'+e.target.className]),true);});await page.keyboard.press('1');await gone();
   assert.equal((await keys()).at(-1),'1','pressing 1 answers option index 0');
  }else{await type('1');await gone().catch(()=>{});}

  // decline: click "No, and tell Claude..." and Escape both hand the composer back, and the next message reaches the agent
  for(const via of ['click','escape']){
   await open('/bash','Do you want to proceed?');
   if(!BEFORE){
    if(via==='click')await card.locator('.approval-controls .provider-dialog-button',{hasText:'No, and tell Claude'}).click();else{await card.hover();await page.keyboard.press('Escape');}
    await page.waitForFunction(()=>{const c=document.querySelector('.composer');return c&&!('approval' in c.dataset)&&!document.querySelector('.composer-approval:not([hidden])');},null,{timeout:3000}).catch(async e=>{throw new Error(via+': '+e.message+' | log='+(await readFile(simLog,'utf8')).replace(/\n/g,'')+' | ui='+JSON.stringify(await page.evaluate(i=>sufficeDesktop.sessions.ui(i)?.prompt,sid)));});
    assert.equal((await keys()).at(-1),'3',via+' sends the deny option');
    assert.ok(await page.evaluate(()=>document.activeElement?.matches('.composer textarea')),via+': textarea focused');
    const msg='after-'+via;await page.keyboard.type(msg);await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    assert.ok((await keys()).join('').includes(msg),via+': follow-up reached the fake agent');
    await shot('decline-'+via+'.png');
   }else{await type('3');await gone().catch(()=>{});}
  }

  // long command, preview scrolled
  await open('/long','Do you want to proceed?');
  await page.locator('pre.approval-preview').evaluate(e=>{e.scrollTop=e.scrollHeight;});
  await shot('long-command-scrolled.png');
  if(!BEFORE){assert.ok(await page.locator('pre.approval-preview').evaluate(e=>e.scrollHeight>e.clientHeight),'long preview scrolls');}
  await type('4');await gone().catch(()=>{});

  // edit
  await open('/edit','make this edit');
  if(!BEFORE)assert.equal(await label(),'Edit greet.js');
  await shot('edit-permission.png');await type('3');await gone().catch(()=>{});

  // plan
  await open('/plan','Would you like to proceed?');
  await shot('plan-approval.png');
  if(!BEFORE){
   assert.equal(await label(),'Plan');
   const text=await card.locator('.approval-plan').evaluate(e=>[...e.querySelectorAll('*')].filter(n=>!n.children.length).map(n=>n.textContent.trim()));
   assert.ok(text.includes('Context')&&text.includes('Change'),'Context and Change are separate elements: '+JSON.stringify(text));
   assert.ok(!text.some(t=>/Context.*Change/.test(t)));
   assert.deepEqual(await card.locator('.approval-controls .provider-dialog-button').allTextContents(),['Tell Claude what to change','Yes, manually approve edits','Yes, and use auto mode Ctrl+↵']); // Allow sits last
   assert.equal(await card.locator('.provider-dialog-primary').textContent(),'Yes, and use auto mode Ctrl+↵');
   await page.keyboard.press('Escape'); // deny option: "Tell Claude what to change"
   await gone();assert.equal((await keys()).at(-1),'3');
  }else{await type('3');await gone().catch(()=>{});}

  // question
  await open('/ask','Which color');
  await shot('question.png');
  if(!BEFORE){
   assert.deepEqual(await card.locator('.approval-controls .provider-dialog-button').allTextContents(),['Type something.','Blue','Red Ctrl+↵']);
   assert.equal(await card.locator('.approval-action').count(),0,'a plain question has no tool preview');
   await page.keyboard.press('Escape');await page.waitForTimeout(400);
   assert.ok(await card.count(),'Escape does nothing when the CLI has no deny option');
  }
  await type('1');await gone().catch(()=>{});

  // folder trust
  await open('/trust','Is this a project');
  await shot('folder-trust.png');
  if(!BEFORE){
   assert.equal(await label(),'Folder');
   await page.keyboard.press('Escape');await gone();assert.equal((await keys()).at(-1),'2','Escape picks "No, exit"');
  }else{await type('2');await gone().catch(()=>{});}
  assert.deepEqual(errors,[]);
 }finally{
  await Promise.race([app.close(),new Promise(r=>setTimeout(r,5000))]).catch(()=>{});
  try{process.kill(pid,'SIGKILL');}catch{}
  try{execFileSync('tmux',['-L',SOCKET,'kill-server'],{stdio:'ignore'});}catch{}
  await rm(tmp,{recursive:true,force:true});
 }
});
