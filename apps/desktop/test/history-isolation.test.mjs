// Test mode must never read the real ~/.claude history: only an explicit SUFFICE_HISTORY_HOME exposes sessions.
import test from 'node:test';
import assert from 'node:assert/strict';
import electronPath from 'electron';
import './electron-guard.mjs';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const SENTINEL='SENTINEL-history-isolation-prompt';
async function run(key,explicitHistory){
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-hist-iso-')));
 const home=resolve(tmp,'home'),data=resolve(tmp,'data'),sfxHome=resolve(tmp,'sfx-home'),project=resolve(tmp,'project');
 for(const d of [data,sfxHome,project])await mkdir(d,{recursive:true});
 const file=resolve(home,'.claude/projects/-tmp-sentinel/s1.jsonl');await mkdir(resolve(file,'..'),{recursive:true});
 const t=new Date().toISOString();
 await writeFile(file,[{type:'user',uuid:'u1',timestamp:t,cwd:'/tmp/sentinel',entrypoint:'cli',message:{content:SENTINEL}},{type:'assistant',uuid:'a1',timestamp:t,message:{content:[{type:'text',text:'ok'}]}}].map(r=>JSON.stringify(r)).join('\n')+'\n');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.SUFFICE_HISTORY_HOME;
 Object.assign(env,{HOME:home,SUFFICE_HOME:sfxHome,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-test-'+key,NODE_PATH:process.env.NODE_PATH||resolve('node_modules')});
 if(explicitHistory)env.SUFFICE_HISTORY_HOME=home;
 let app;
 try{
  app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
  const page=await app.firstWindow();await page.locator('[data-action="send-menu"]').waitFor({state:'attached',timeout:20000});
  return JSON.stringify(await page.evaluate(()=>Promise.all([sufficeDesktop.sessions.list(),sufficeDesktop.sessions.history.list({query:''})])));
 }finally{try{await app?.close();}catch{}try{execFileSync('tmux',['-L','sfx-test-'+key,'kill-server'],{stdio:'ignore'});}catch{}await rm(tmp,{recursive:true,force:true}).catch(()=>{});}
}
test('sentinel history is hidden without SUFFICE_HISTORY_HOME and shown with it',{timeout:120000},async()=>{
 assert.ok(!(await run('hist-iso-default-'+process.pid,false)).includes(SENTINEL),'test mode read HOME history');
 assert.ok((await run('hist-iso-explicit-'+process.pid,true)).includes(SENTINEL),'explicit SUFFICE_HISTORY_HOME ignored (known-positive failed)');
});
