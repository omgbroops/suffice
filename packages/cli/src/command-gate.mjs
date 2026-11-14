import {spawn} from 'node:child_process';
import {nativeShellPath} from './shell.mjs';

// The hook is trusted operator configuration. Tool input travels only on stdin.
export async function commandGate(command,{signal,hook=process.env.SUFFICE_GATE_CMD,timeoutMs=10000,toolName='Bash'}={}){
 if(!hook)return;
 signal?.throwIfAborted();
 const executable=nativeShellPath()||'/bin/sh';
 return new Promise((resolve,reject)=>{
  let settled=false,stderr='';
  const child=spawn(executable,['-c',hook],{windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','ignore','pipe']});
  const kill=()=>{if(!child.pid)return;if(process.platform==='win32'){const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill();}}};
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
  const abort=()=>{kill();finish(new Error('Command gate cancelled'));};
  const timer=setTimeout(()=>{kill();finish(new Error('Command gate timed out'));},timeoutMs);
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
  child.stdin.on('error',()=>{});
  child.on('error',()=>finish(new Error('Command gate could not start')));
  child.on('close',code=>finish(code===0?undefined:new Error(stderr.trim()||'Command gate denied execution')));
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){abort();return;}
  child.stdin.end(JSON.stringify({tool_name:toolName,tool_input:{command}}));
 });
}
