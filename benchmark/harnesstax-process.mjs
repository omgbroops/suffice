// Own the actor's process group so cancellation stops inference before grading.
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const pidFile='/agent-home/actor.pid';
export async function stopActor(path=pidFile) {
  const pid=Number(await readFile(path,'utf8').catch(()=>''));
  if(!Number.isSafeInteger(pid)||pid<=1)return;
  for(const signal of ['SIGTERM','SIGKILL']) {
    try {process.kill(-pid,signal);} catch(e) {if(e.code!=='ESRCH')throw e;}
    if(signal==='SIGTERM')await new Promise(resolve=>setTimeout(resolve,1000));
  }
}
export async function startActor(executable='/runtime-bin/node',args=['/runtime/benchmark/harnesstax-worker.mjs'],path=pidFile) {
  const child=spawn(executable,args,{
    detached:true,stdio:'inherit',cwd:process.cwd(),env:process.env});
  await writeFile(path,String(child.pid));
  const result=await new Promise((resolve,reject)=>{
    child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));
  });
  return result.code??1;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='stop')await stopActor();
  else process.exitCode=await startActor();
}
