import {execFileSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import './electron-guard.mjs';
import {_electron} from 'playwright-core';
// Every desktop test launch is hidden and dialog-free unless SUFFICE_TEST_SHOW_WINDOW=1. Importing this file patches _electron.launch once per process,
// so tests that forgot the guard still get: hidden window, no-dialog preload as the first app arg, a private tmux socket and a fresh history dir.
const P='/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs';
export const SHOW=process.env.SUFFICE_TEST_SHOW_WINDOW==='1';
export const guard=SHOW?[]:['-r',P];
// Stops a test's private tmux server (tmux -L <socket>); call in finally so it dies even when the test fails. Never pass 'suffice'.
export const killTmux=socket=>{if(socket&&socket!=='suffice'&&socket!=='default')try{execFileSync('tmux',['-L',socket,'kill-server'],{stdio:'ignore'});}catch{}};
// Pure: what a launch must carry. Returns {args, env}.
export function hardenLaunch(opts={},n=0){
 const env={...(opts.env||process.env)};
 if(!SHOW)env.SUFFICE_TEST_HIDE_WINDOW='1';
 if(!env.SUFFICE_SESSIONS_SOCKET||env.SUFFICE_SESSIONS_SOCKET==='suffice')env.SUFFICE_SESSIONS_SOCKET=`sfx-t-${process.pid}-${n}`;
 if(!env.SUFFICE_HISTORY_HOME)env.SUFFICE_HISTORY_HOME=mkdtempSync(join(tmpdir(),'suffice-test-hist-'));
 let args=[...(opts.args||[])];
 if(!SHOW&&!args.includes(P))args=['-r',P,...args.filter((a,i)=>!(a==='-r'&&args[i+1]===P))];
 return {args,env};
}
const sockets=new Set();let n=0;
if(!_electron.__sufficeHardened){
 _electron.__sufficeHardened=true;
 const orig=_electron.launch.bind(_electron);
 _electron.launch=async opts=>{
  const h=hardenLaunch(opts,n++);sockets.add(h.env.SUFFICE_SESSIONS_SOCKET);
  const app=await orig({...opts,...h});
  const close=app.close.bind(app);
  app.close=async(...a)=>{try{return await close(...a);}finally{killTmux(h.env.SUFFICE_SESSIONS_SOCKET);}};
  return app;
 };
 process.on('exit',()=>sockets.forEach(killTmux));
}
