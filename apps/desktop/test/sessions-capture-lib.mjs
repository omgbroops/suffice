// Hidden launch + capture for CLI-session UI tests. Fake agents only, a private tmux socket, a synthetic history home.
// Run with the worktree root as cwd. Nothing is shown on screen: SUFFICE_TEST_HIDE_WINDOW=1 and webContents.capturePage.
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,rm,utimes,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const j=(...rows)=>rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
const day=24*3600e3,old=n=>new Date(Date.now()-n*day);

export async function launch({key,out}={}){
 if(!key||!/^[\w-]+$/.test(key))throw new Error('launch({key}) needs a key like "sessions-split"');
 const socket='sfx-test-'+key,output=resolve(out||`/Users/abhayg/suffice-desktop-wt/ui-shots/${key}`);await mkdir(output,{recursive:true});
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-sessions-')));
 const home=resolve(tmp,'home'),project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),sfxHome=resolve(tmp,'sfx-home');
 for(const d of [project,data,sfxHome])await mkdir(d,{recursive:true});
 const seed=async(rel,body,when)=>{const p=resolve(home,rel);await mkdir(resolve(p,'..'),{recursive:true});await writeFile(p,body);await utimes(p,when,when);};
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
 Object.assign(env,{SUFFICE_HOME:sfxHome,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',
  SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs'),
  SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:home,
  NODE_PATH:process.env.NODE_PATH||resolve('node_modules')});
 let app,pid,page;
 const close=async()=>{
  try{await app?.close();}catch{}
  if(pid){try{process.kill(pid,0);process.kill(pid);}catch{}}
  try{execFileSync('tmux',['-L',socket,'kill-server'],{stdio:'ignore'});}catch{}
  await rm(tmp,{recursive:true,force:true}).catch(()=>{});
 };
 try{
  app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),`--user-data-dir=${data}`],env});pid=app.process().pid;
  page=await app.firstWindow();page.setDefaultTimeout(12000);
  page.on('console',m=>{if(m.type()==='error')console.error('PAGE',m.text().slice(0,200));});
  page.on('pageerror',e=>console.error('PAGEERROR',e.message));
  await page.locator('[data-action="send-menu"]').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
  await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
  // The socket env must have reached the main process: a throwaway fake session reports the attach command it would use.
  const r=await page.evaluate(async cwd=>{const s=await sufficeDesktop.sessions.start({agent:'fake',cwd});const cmd=await sufficeDesktop.sessions.attachCommand(s.id);await sufficeDesktop.sessions.stop(s.id).catch(()=>{});return cmd;},project);
  if(!String(r).includes('-L '+socket))throw new Error('session socket did not reach the app: '+r);
 }catch(e){await close();throw e;}
 const capture=async name=>{
  const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  const p=resolve(output,name.endsWith('.png')?name:name+'.png');await writeFile(p,Buffer.from(b64,'base64'));return p;
 };
 return {page,app,project,socket,output,capture,close};
}
