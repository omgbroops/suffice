import {spawn} from 'node:child_process';
import {open, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {StringDecoder} from 'node:string_decoder';

// argv only: never pass model text through a command shell.
export async function runProcess(command, args, {cwd, input='', timeoutMs=60_000, env=process.env, stdoutPath, stderrPath, maxBytes=8_000_000,signal}={}) {
  for (const path of [stdoutPath, stderrPath].filter(Boolean)) await mkdir(dirname(path), {recursive:true});
  const out=stdoutPath?await open(stdoutPath,'wx'):null;
  let err=null;
  let stdout='', stderr='', size=0, overflow=false, timedOut=false, aborted=false, spawnError=null, writeError=null;
  const decoders={out:new StringDecoder('utf8'),err:new StringDecoder('utf8')};
  env={...env};delete env.NODE_TEST_CONTEXT;delete env.NODE_OPTIONS;
  let writes=Promise.resolve();
  const started=Date.now();
  try {
    err=stderrPath?await open(stderrPath,'wx'):null;
    const result=await new Promise(resolve=>{
      const child=spawn(command,args,{cwd,env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
      const kill=()=>{
        if(!child.pid)return;
        if(process.platform==='win32') {
          const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'});
          killer.on('error',()=>child.kill());
        } else {try {process.kill(-child.pid,'SIGKILL');}catch {child.kill('SIGKILL');}}
      };
      const timer=setTimeout(()=>{timedOut=true;kill();},timeoutMs);
      const stop=()=>{aborted=true;kill();};signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
      const collect=(kind,bytes)=>{
        const file=kind==='out'?out:err;
        if(file)writes=writes.then(()=>file.write(bytes)).catch(e=>{writeError??=e.message;kill();});
        size+=bytes.length;
        if(size>maxBytes){overflow=true;kill();}
        if(kind==='out')stdout=(stdout+decoders.out.write(bytes)).slice(0,maxBytes);
        else stderr=(stderr+decoders.err.write(bytes)).slice(-16_000);
      };
      child.stdout.on('data',b=>collect('out',b));child.stderr.on('data',b=>collect('err',b));
      child.on('error',e=>{spawnError=e.message;});
      child.on('close',(code,exitSignal)=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);resolve({exitCode:code,signal:exitSignal});});
      child.stdin.on('error',()=>{});child.stdin.end(input);
    });
    stdout+=decoders.out.end();stderr+=decoders.err.end();
    await writes;
    return {...result,stdout,stderr,timedOut,overflow,aborted,error:spawnError??writeError,latencyMs:Date.now()-started};
  } finally {await writes;await out?.close();await err?.close();}
}
