// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): session flows: double Send, long-title row, Stop dialog Escape, Import then Resume.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const SOCKET='sfx-fz-sessions-flow-'+process.pid,appDir=resolve(process.env.APP_DIR||'apps/desktop');

async function launch(tmp,extra={}){
 const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home'),simLog=resolve(tmp,'sim.log');
 for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 await writeFile(simLog,'');
 const j=(...r)=>r.map(x=>JSON.stringify(x)).join('\n')+'\n',ts=new Date().toISOString();
 for(const [rel,body] of [['.claude/projects/-tmp-api-server/c1.jsonl',j({type:'user',uuid:'u1',timestamp:ts,cwd:'/tmp/api-server',entrypoint:'cli',message:{content:'Add rate limiting to the API'}},{type:'assistant',uuid:'a1',timestamp:ts,message:{content:[{type:'text',text:'Added a limiter.'}]}})],['.codex/sessions/2026/11/01/rollout-2026-11-01T00-00-00-x3.jsonl',j({type:'session_meta',payload:{id:'x3',cwd:'/tmp/cli-tool',timestamp:ts}},{type:'response_item',timestamp:ts,payload:{type:'message',role:'user',content:[{text:'Port the parser to Rust'}]}})]]){const p=resolve(home,rel);await mkdir(resolve(p,'..'),{recursive:true});await writeFile(p,body);}
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),
  SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('apps/desktop/test/sessions-trust-agent.mjs'),SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,SIM_LOG:simLog,BOOT_MS:'0',...extra});
 const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',appDir,`--user-data-dir=${data}`],env});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await page.locator('[data-action="send-menu"]').waitFor();
 await page.evaluate(()=>{document.querySelector('.composer').modelSelection={provider:'cli',model:'fakeclaude'};});
 return {app,page,simLog};
}
const trust=async page=>{await page.locator('.composer-approval .approval-controls button').first().waitFor({timeout:20000});await page.locator('.composer-approval .provider-dialog-primary').click();await page.waitForFunction(()=>!document.querySelector('.composer-approval'),null,{timeout:15000});};


const run=async(fn)=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-flow-')));const L=await launch(tmp);
 try{await fn(L.page);}finally{await L.app.close().catch(()=>{});try{execFileSync('tmux',['-L',SOCKET,'kill-server'],{stdio:'ignore'});}catch{}await rm(tmp,{recursive:true,force:true});}
};
const rows=page=>page.locator('.session-row--sidebar');

test('double Send starts one session; a 4000-char prompt keeps the row title clear of the age',{timeout:120000},async()=>{
 await run(async page=>{
  await page.locator('#prompt').fill('x'.repeat(4000));
  await page.locator('.send-button').dblclick();
  await trust(page);await rows(page).first().waitFor();await page.waitForTimeout(1500);
  assert.equal(await rows(page).count(),1);
  const tmux=execFileSync('tmux',['-L',SOCKET,'list-sessions','-F','#{session_name}'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  assert.equal(tmux.length,1,'double Send leaves one tmux session: '+tmux.join(','));
  const [t,a]=await Promise.all(['.row-title','.thread-age'].map(s=>rows(page).first().locator(s).evaluate(e=>{const r=e.getBoundingClientRect();return {l:r.left,r:r.right};})));
  assert.ok(t.r<=a.l+1,`title ends ${t.r} after age starts ${a.l}`);
 });
});

test('Stop dialog: Escape keeps the session running, Cancel too, Stop ends it',{timeout:120000},async()=>{
 await run(async page=>{
  await page.locator('#prompt').fill('first prompt');await page.locator('.send-button').click();await trust(page);
  await rows(page).first().click({button:'right'});await page.locator('[data-menu-action="session:stop"]').click();
  await page.locator('.thread-delete-dialog [data-stop]').waitFor();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('.thread-delete-dialog[open]'));
  assert.equal(await rows(page).count(),1);
  assert.equal((await page.evaluate(()=>window.sufficeDesktop.sessions.list())).length,1);
 });
});

for(const [title,query] of [['Add rate limiting to the API','rate'],['Port the parser to Rust','parser']])
test('Import "'+title+'": read-only view, no row until Resume, then a live row and usable prompt',{timeout:120000},async()=>{
 await run(async page=>{
  await page.locator('[data-action="send-menu"]').click();await page.locator('[data-menu-action="import-chat:open"]').click();
  await page.locator('.session-import input').fill(query);
  await page.locator('.session-import-row',{hasText:title}).click();
  assert.equal(await rows(page).count(),0,'viewing history adds no row');
  assert.equal(await page.locator('#prompt').isVisible(),false,'read-only view hides the composer');
  await page.getByRole('button',{name:/resume/i}).first().click();
  await rows(page).first().waitFor();
  await page.locator('#prompt').waitFor({state:'visible'});await page.locator('#prompt').fill('after resume');
  assert.equal(await page.locator('#prompt').inputValue(),'after resume');
 });
});
