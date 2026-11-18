import electronPath from 'electron';
// Hidden test: Cmd+K History scope finds a past session by words that exist only in its message bodies, shows a snippet, and Enter opens the transcript.
// SHOT_DIR saves dark + light screenshots at 1440x900. Private tmux socket and a synthetic history home only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,rm,utimes,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const SOCKET='sfx-fl2-history-search-'+process.pid,SHOTS=process.env.SHOT_DIR;
const j=(...r)=>r.map(x=>JSON.stringify(x)).join('\n')+'\n',day=24*3600e3,old=n=>new Date(Date.now()-n*day);

test('Cmd+K history scope: full-text snippet, open reads the session',{timeout:180000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-hs-')));
 const home=resolve(tmp,'home'),project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice');
 for(const d of [project,data,suffice])await mkdir(d,{recursive:true});
 const seed=async(rel,body,when)=>{const p=resolve(home,rel);await mkdir(resolve(p,'..'),{recursive:true});await writeFile(p,body);await utimes(p,when,when);};
 await seed('.claude/projects/-tmp-api-server/c1.jsonl',j(
  {type:'user',uuid:'u1',timestamp:old(1).toISOString(),cwd:'/tmp/api-server',entrypoint:'cli',message:{content:'Add rate limiting to the API'}},
  {type:'assistant',uuid:'a1',timestamp:old(1).toISOString(),message:{content:[{type:'text',text:'I added a token bucket limiter in limiter.js that refills one request per second per client.'}]}}),old(1));
 await seed('.claude/projects/-tmp-docs-site/c2.jsonl',j(
  {type:'user',uuid:'u2',timestamp:old(4).toISOString(),cwd:'/tmp/docs-site',entrypoint:'cli',message:{content:'Fix broken links in the docs'}},
  {type:'assistant',uuid:'a2',timestamp:old(4).toISOString(),message:{content:[{type:'text',text:'Fixed 6 links.'}]}}),old(4));
 await seed('.codex/sessions/2026/11/01/rollout-2026-11-01T00-00-00-x3.jsonl',j(
  {type:'session_meta',payload:{id:'x3',cwd:'/tmp/cli-tool',timestamp:old(2).toISOString()}},
  {type:'response_item',timestamp:old(2).toISOString(),payload:{type:'message',role:'user',content:[{text:'Port the parser to Rust'}]}}),old(2));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',PI_OFFLINE:'1',SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:home,
  SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs')});
 const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
 const pid=app.process().pid;
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.locator('.composer').waitFor();await page.emulateMedia({reducedMotion:'reduce'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  const shot=async name=>{if(!SHOTS)return;await mkdir(SHOTS,{recursive:true});const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(SHOTS,name),Buffer.from(b,'base64'));};
  const theme=t=>page.evaluate(x=>{document.documentElement.dataset.theme=x;},t);
  for(const t of ['dark','light']){
   await theme(t);
   await page.keyboard.press('Meta+k');
   const tab=page.locator('.spotlight [role=tab][data-scope=history]');await tab.click();
   await page.waitForFunction(()=>document.querySelectorAll('.spotlight-history').length===3);
   await shot(`history-recent-${t}.png`);
   await page.locator('#spotlight-query').fill('token bucket');
   await page.waitForFunction(()=>document.querySelectorAll('.spotlight-history').length===1);
   const row=page.locator('.spotlight-history');
   assert.match(await row.locator('.spotlight-snippet').textContent(),/token bucket limiter/);
   assert.deepEqual(await row.locator('.spotlight-snippet mark').allTextContents().then(a=>a.map(s=>s.toLowerCase())),['token','bucket']);
   assert.match(await row.textContent(),/Claude Code · api-server/);
   // nothing covered: the row sits inside the dialog and its meta is not clipped to zero
   const ok=await page.evaluate(()=>{const d=document.querySelector('.spotlight').getBoundingClientRect(),r=document.querySelector('.spotlight-history').getBoundingClientRect(),m=document.querySelector('.spotlight-history-meta').getBoundingClientRect();return r.left>=d.left&&r.right<=d.right&&m.width>20;});
   assert.ok(ok,'row inside dialog');
   await shot(`history-search-${t}.png`);
   await page.locator('#spotlight-query').fill('zzzqqq');
   await page.waitForFunction(()=>document.querySelector('.spotlight-empty')?.textContent==='No past sessions found');
   await page.locator('#spotlight-query').fill('a'.repeat(5000)); // over the 4096 string cap: must search, not show the unfiltered list
   await page.waitForFunction(()=>document.querySelector('.spotlight-empty')?.textContent==='No past sessions found');
   await page.locator('#spotlight-query').fill('token bucket');
   await page.waitForFunction(()=>document.querySelectorAll('.spotlight-history').length===1);
   await page.keyboard.press('Enter');
   await page.waitForFunction(()=>!document.querySelector('.spotlight').open);
   await page.locator('.thread-messages',{hasText:'token bucket limiter'}).waitFor();
   assert.match(await page.locator('.thread-header').textContent(),/Add rate limiting to the API/);
   await shot(`history-open-${t}.png`);
  }
 }finally{
  await app.close().catch(()=>{});
  try{process.kill(pid,0);process.kill(pid);}catch{}
  try{execFileSync('tmux',['-L',SOCKET,'kill-server'],{stdio:'ignore'});}catch{}
  await rm(tmp,{recursive:true,force:true}).catch(()=>{});
 }
});
