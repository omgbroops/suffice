// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): the Issues page, driven from the sidebar entry like a user.
// SHOT_DIR sets the screenshot folder. Private tmux socket only; the live "suffice" socket is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {guard} from './electron-guard.mjs';
import {groupIssues,threadPrompt,ago,code} from '../src/issues-model.js';
const {createIssueStore,pullRef}=createRequire(import.meta.url)('../electron/issues.cjs');

test('issue store: numbering, validation, patching, persistence, pull request parsing',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'sfx-issues-store-')),store=createIssueStore(dir);
 const a=await store.create('p1',{title:'  First  '}),b=await store.create('p1',{title:'Second',priority:'high'}),c=await store.create('p2',{title:'Other project'});
 assert.deepEqual([a.n,b.n,c.n],[1,2,1],'numbers count per project');
 assert.equal(a.title,'First');assert.equal(a.status,'todo');assert.equal(b.priority,'high');
 assert.equal((await store.list('p1')).length,2);assert.equal((await store.list('p2')).length,1);
 await assert.rejects(store.create('p1',{title:'   '}),/title/);
 await assert.rejects(store.create('p1',{title:'x',status:'nope'}),/status/);
 await assert.rejects(store.update(a.id,{priority:'huge'}),/priority/);
 await assert.rejects(store.update('missing',{title:'x'}),/not found/);
 const u=await store.update(a.id,{status:'review',assignee:'claude',threads:[{id:'t1',title:'T'}],prs:[{ref:'https://github.com/o/r/pull/12'},{ref:'7'}]});
 assert.equal(u.status,'review');assert.equal(u.assignee,'claude');assert.deepEqual(u.prs,[{ref:'#12',url:'https://github.com/o/r/pull/12'},{ref:'#7'}]);
 assert.equal((await store.update(a.id,{assignee:null})).assignee,null);
 const fresh=createIssueStore(dir);assert.equal((await fresh.list('p1')).find(i=>i.id===a.id).threads[0].id,'t1','survives a restart');
 assert.equal(JSON.parse(await readFile(resolve(dir,'issues.json'),'utf8')).length,3);
 await store.remove(b.id);assert.equal((await store.list('p1')).length,1);
 assert.equal((await store.create('p1',{title:'Third'})).n,2,'a number is reused only after the highest is gone');
 assert.throws(()=>pullRef('https://evil.example/pull/1'),/pull request/);assert.throws(()=>pullRef('abc'),/pull request/);
 assert.deepEqual(pullRef('#34'),{ref:'#34'});
});

test('issue model: grouping, open filter, prompt',()=>{
 const i=(n,status,modified)=>({n,status,modified,title:'t'+n,body:''});
 const list=[i(1,'done',5),i(2,'progress',1),i(3,'progress',9),i(4,'backlog',2),i(5,'canceled',3)];
 assert.deepEqual(groupIssues(list,'open').map(g=>[g.status,g.items.map(x=>x.n)]),[['backlog',[4]],['progress',[3,2]]]);
 assert.deepEqual(groupIssues(list,'all').map(g=>g.status),['backlog','progress','done','canceled']);
 assert.equal(threadPrompt({title:'Fix it',body:' why \n'}),'Fix it\n\nwhy');assert.equal(threadPrompt({title:'Fix it',body:''}),'Fix it');
 assert.equal(code({n:12}),'ISS-12');assert.equal(ago(Date.now()-90*60000),'1h');
});

test('issues page: sidebar entry, create, edit, link, start a thread, persist',{timeout:300000},async()=>{
 const shots=resolve(process.env.SHOT_DIR||'/Users/abhayg/suffice-desktop-wt/ui-shots/forge/feat/issues');await mkdir(shots,{recursive:true});
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-issues-'))),SOCKET=`sfx-feat-issues-${process.pid}`;
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{PI_OFFLINE:'1',SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,
  SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath});
 let stderr='';
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),`--user-data-dir=${data}`],env});
 app.process().stderr.on('data',d=>{stderr+=d;});
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.composer').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  const shot=async(name,theme)=>{await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.mouse.move(1000,880);await page.waitForTimeout(350);const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(b64,'base64'));};
  const both=async name=>{await shot(name,'dark');await shot(name,'light');await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});};
  const now=Date.now();
  await app.evaluate(({ipcMain,BrowserWindow},now)=>{
   globalThis.runs=[];
   globalThis.threads=[{id:'old1',title:'Investigate slow cold starts',project:'demo-project',provider:'anthropic',status:'done',modified:now-86400000},{id:'old2',title:'Port the toast stack',project:'demo-project',provider:'openai',status:'idle',modified:now-3*86400000}];
   ipcMain.removeHandler('suffice:threads');ipcMain.handle('suffice:threads',()=>globalThis.threads);
   ipcMain.removeHandler('suffice:thread');ipcMain.handle('suffice:thread',(_e,id)=>({id,title:globalThis.threads.find(t=>t.id===id)?.title||id,messages:[],running:false}));
   ipcMain.removeHandler('suffice:run');ipcMain.handle('suffice:run',(_e,payload)=>{globalThis.runs.push(payload);globalThis.threads.unshift({id:'started1',title:payload.prompt.split('\n')[0],project:'demo-project',provider:'anthropic',status:'working',modified:Date.now()});return {threadId:'started1',text:'ok'};});
  },now);
  await page.reload();await page.locator('.thread-row').first().waitFor();
  await page.waitForFunction(()=>document.documentElement.dataset.projectId);
  const nav=page.locator('.issues-nav');
  const issuesOnDisk=async()=>JSON.parse(await readFile(resolve(data,'issues.json'),'utf8'));

  // sidebar entry -> empty state
  assert.equal(await nav.isVisible(),true);
  await nav.click();await page.locator('.issues-view').waitFor({state:'visible'});
  assert.equal(await nav.getAttribute('aria-current'),'page');
  assert.equal(await page.locator('.issues-empty-title').innerText(),'No issues yet');
  assert.equal(await page.locator('.issues-sub').innerText(),'demo-project');
  await both('empty');

  // create from the empty state, edit title, status, priority, assignee, description
  await page.locator('[data-act=new]').click();
  await page.locator('.issue-title').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.activeElement.className),'issue-title','title is focused on create');
  await page.keyboard.type('Cold start p95 regression on machine boot');await page.keyboard.press('Enter');
  await page.locator('[data-field=status]').click();
  await page.locator('.issues-menu [role=menuitemradio]',{hasText:'In progress'}).click();
  await page.locator('[data-field=priority]').click();
  await page.locator('.issues-menu [role=menuitemradio]',{hasText:'High'}).click();
  await page.locator('[data-field=assignee]').click();
  await page.locator('.issues-menu [role=menuitemradio]',{hasText:'Claude'}).click();
  await page.locator('.issue-body').fill('Boot to first event regressed after the last pool change.\n\nRepro: reconnect 50 times, compare the 2s timeout.');await page.locator('.issue-title').focus();
  await page.waitForFunction(async()=>(await window.sufficeDesktop.issues.list(document.documentElement.dataset.projectId))[0]?.body.startsWith('Boot to first'));
  let rows=await issuesOnDisk();
  assert.equal(rows.length,1);assert.equal(rows[0].title,'Cold start p95 regression on machine boot');assert.deepEqual([rows[0].status,rows[0].priority,rows[0].assignee,rows[0].n],['progress','high','claude',1]);

  // link pull requests: a bad value is refused, a GitHub link and a bare number are kept
  await page.locator('[data-act=link-pr]').click();await page.locator('.issue-input').fill('not a pr');await page.keyboard.press('Enter');
  await page.locator('.toast',{hasText:'pull request'}).waitFor();
  assert.doesNotMatch(await page.locator('.toast',{hasText:'pull request'}).innerText(),/remote method/);await page.locator('.toast button').click();
  await page.locator('[data-act=link-pr]').click();await page.locator('.issue-input').fill('https://github.com/acme/forge/pull/134');await page.keyboard.press('Enter');
  await page.locator('[data-kind=pr]').first().waitFor();
  await page.locator('[data-act=link-pr]').click();await page.locator('.issue-input').fill('#140');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('[data-kind=pr]').length===2);
  assert.deepEqual((await issuesOnDisk())[0].prs.map(p=>p.ref),['#134','#140']);

  // link an existing thread from the menu
  await page.locator('[data-act=link-thread]').click();
  await shot('menu-link-thread','dark');
  await page.locator('.issues-menu [role=menuitemradio]',{hasText:'Investigate slow cold starts'}).click();
  await page.locator('[data-kind=thread][data-id=old1]').waitFor();
  await both('issue-page');

  // list: more issues across groups, tabs, collapse
  await page.evaluate(async()=>{const id=document.documentElement.dataset.projectId,api=window.sufficeDesktop.issues;
   const a=await api.create({projectId:id,fields:{title:'Document the device daemon handshake',status:'backlog',priority:'low'}});
   await api.create({projectId:id,fields:{title:'Wire the OTLP exporter into workers',status:'todo',priority:'medium',assignee:'codex'}});
   const r=await api.create({projectId:id,fields:{title:'Ready to merge lists pulls with red checks',status:'review',priority:'urgent',assignee:'claude'}});await api.update({id:r.id,patch:{prs:[{ref:'136'}]}});
   await api.create({projectId:id,fields:{title:'Prune dead stacking tokens',status:'done'}});
   await api.create({projectId:id,fields:{title:'Retire the old queue panel',status:'canceled'}});});
  await page.locator('.issue-back').click();
  await page.waitForFunction(()=>document.querySelectorAll('.issue-row').length===4);
  assert.deepEqual(await page.locator('.issues-group-head').allInnerTexts().then(a=>a.map(s=>s.replace(/\s+/g,' ').trim())),['Backlog 1','Todo 1','In progress 1','In review 1'].map(s=>s));
  assert.equal(await nav.locator('.issues-count').innerText(),'4');
  await both('list');
  await page.locator('[data-tab=all]').click();
  assert.equal(await page.locator('.issues-group-head').count(),6);
  assert.equal(await page.locator('.issue-row').count(),4,'done and canceled stay collapsed');
  await page.locator('.issues-group[data-status=done] .issues-group-head').click();
  assert.equal(await page.locator('.issue-row').count(),5);
  await both('list-all');
  await page.locator('[data-tab=open]').click();

  // start a thread from the issue: composer gets the issue text, the run carries it, the thread links back
  await page.locator('.issue-row',{hasText:'Cold start p95'}).click();
  await page.locator('[data-act=start]').click();
  await page.waitForFunction(()=>!document.querySelector('.issues-view:not([hidden])'));
  const runs=await app.evaluate(()=>globalThis.runs);
  assert.equal(runs.length,1);assert.match(runs[0].prompt,/^Cold start p95 regression on machine boot\n\nBoot to first event regressed/);
  await page.waitForFunction(async()=>(await window.sufficeDesktop.issues.list(document.documentElement.dataset.projectId)).some(i=>i.threads.some(t=>t.id==='started1')));
  const linked=(await issuesOnDisk()).find(i=>i.title.startsWith('Cold start'));
  assert.deepEqual(linked.threads.map(t=>t.id),['old1','started1']);assert.equal(linked.status,'progress');
  // a plain send afterwards is not linked
  assert.equal(await page.evaluate(()=>document.querySelector('.composer').dataset.issue||''),'');

  // reopen from the entry: the linked thread opens from the page, state survives a reload
  await page.reload();await page.locator('.thread-row').first().waitFor();await page.waitForFunction(()=>document.documentElement.dataset.projectId);
  await page.locator('.issues-nav').click();await page.locator('.issue-row',{hasText:'Cold start p95'}).click();
  await page.locator('[data-kind=thread][data-id=started1]').waitFor();
  await shot('issue-linked','dark');await shot('issue-linked','light');await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
  await page.locator('[data-kind=thread][data-id=old1] .issue-link-main').click();
  await page.waitForFunction(()=>!document.querySelector('.issues-view:not([hidden])'));

  // keyboard + interop: Escape steps back then closes; opening Needs you closes Issues
  await page.locator('.issues-nav').click();await page.locator('.issue-row').first().click();
  await page.keyboard.press('Escape');await page.locator('.issues-list-page').waitFor({state:'visible'});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.issues-view:not([hidden])'));
  await page.locator('.issues-nav').click();await page.locator('.needs-nav').click();
  await page.waitForFunction(()=>document.querySelector('.issues-view').hidden&&!document.querySelector('.needs-view').hidden);
  await page.locator('.needs-nav').click();

  // delete needs a second click; an abandoned blank issue is cleaned up on leaving
  await page.locator('.issues-nav').click();
  await page.locator('.issues-add').click();await page.locator('.issue-back').click();
  await page.waitForFunction(()=>document.querySelectorAll('.issue-row').length===4);
  assert.equal((await issuesOnDisk()).filter(i=>i.title==='New issue').length,0);
  await page.locator('.issue-row',{hasText:'Wire the OTLP'}).click();
  await page.locator('[data-act=delete]').click();assert.equal(await page.locator('[data-act=delete]').innerText(),'Confirm delete');
  await page.locator('[data-act=delete]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.issue-row').length===3);
  assert.equal((await issuesOnDisk()).some(i=>i.title.startsWith('Wire the OTLP')),false);

  assert.deepEqual(errors,[]);
  assert.equal(/\[no-dialog\]/.test(stderr),false,'main process stayed quiet: '+stderr.slice(0,400));
 }finally{await app.close().catch(()=>{});}
});
