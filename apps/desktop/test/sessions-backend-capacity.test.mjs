// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1, electron-guard): backend modules reachable from the app. Background start, slots.read, capacity, handoff, views, plugins, projects, symbols.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {killTmux} from './electron-guard.mjs';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';

const SOCKET='sfx-lb-sessions-backend-'+process.pid,appDir=resolve(process.env.APP_DIR||'apps/desktop');

async function launch(tmp,extra={}){
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
 for(const d of [project,data,suffice,home,resolve(data,'sessions/plugins/demo')])await mkdir(d,{recursive:true});
 await writeFile(resolve(data,'sessions/plugins/demo/plugin.json'),JSON.stringify({name:'demo',version:'1.0.0',main:'index.mjs',contributes:{}}));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),
  SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('apps/desktop/test/sessions-trust-agent.mjs'),SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,BOOT_MS:'0',...extra});
 const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',appDir,`--user-data-dir=${data}`],env});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await page.locator('[data-action="send-menu"]').waitFor({state:'attached'});
 await page.evaluate(()=>{document.querySelector('.composer').modelSelection={provider:'cli',model:'fakeclaude'};});
 return {app,page,project};
}
const done=async(app,tmp)=>{await app.close().catch(()=>{});killTmux(SOCKET);await rm(tmp,{recursive:true,force:true});};

test('Start session in background adds a row, shows a toast and does not open it',{timeout:120000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-lb-bg-')));
 const {app,page}=await launch(tmp);
 try{
  await page.locator('#prompt').fill('background job');
  await page.locator('[data-action="send-menu"]').click();
  await page.locator('[data-menu-action="background-send:start"]').click();
  await page.locator('.session-row--sidebar').first().waitFor();
  await page.locator('.toast',{hasText:'started in the background'}).first().waitFor();
  assert.equal(await page.locator('.session-row--sidebar').count(),1);
  assert.equal(await page.locator('.session-row--sidebar[aria-current="true"],.session-row--sidebar.active').count(),0,'background session is not opened');
 }finally{await done(app,tmp);}
});

test('slots.read, capacity, handoff, views, plugins, projects and symbols answer through preload',{timeout:120000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-lb-api-')));
 const {app,page,project}=await launch(tmp,{SUFFICE_MAX_AGENTS:'1'});
 try{
  await writeFile(resolve(project,'a.js'),'export function findMeSymbol(){return 1;}\n');
  await mkdir(resolve(project,'.git'),{recursive:true});await mkdir(resolve(project,'sub'),{recursive:true});
  const r=await page.evaluate(async({project})=>{
   const sx=window.sufficeDesktop.sessions,out={};
   out.cap0=await sx.capacity();
   const s=await sx.start({agent:'fakeclaude',cwd:project});
   out.cap1=await sx.capacity();
   try{await sx.start({agent:'fakeclaude',cwd:project});out.second='started';}catch(e){out.second=e.message;}
   await sx.send(s.id,'hello handoff');
      out.ui=await sx.readSlot(`session:${s.id}:meta`).then(v=>Object.keys(v),e=>e.message);
   out.missing=await sx.readSlot('session:nope:meta').then(()=>'ok',e=>e.message);
   try{out.handoff=await sx.handoff(s.id);out.read=await sx.readHandoff(s.id);}catch(e){out.handoffError=e.message;}
   out.views=await sx.views();out.plugins=await sx.plugins();
   out.resolved=await sx.projects.resolve(project+'/sub/gone/deeper');out.recent=await sx.projects.recent();
   out.symbols=await sx.symbols(project,'findMe');
   return out;},{project});
  assert.deepEqual([r.cap0.running,r.cap0.max,r.cap0.free],[0,1,1]);
  assert.equal(r.cap1.free,0);
  assert.match(r.second,/at capacity \(1 of 1\)/);
  assert.ok(r.ui.includes('value'),'slots.read returns the session meta slot: '+r.ui);
  assert.match(r.missing,/no readable slot/);
  assert.match(r.handoffError,/Nothing to hand off yet/);// the fake agent writes no transcript, so only the wired error path is reachable
  assert.ok(Array.isArray(r.views));
  assert.deepEqual(r.plugins.map(p=>[p.name,p.valid]),[['demo',true]]);
  assert.equal(r.resolved.path,resolve(project,'sub'));assert.equal(r.resolved.root,project);assert.equal(r.resolved.moved,true);
  assert.ok(Array.isArray(r.recent));
  assert.equal(r.symbols.total,1);assert.equal(r.symbols.matches[0].name,'findMeSymbol');
 }finally{await done(app,tmp);}
});
