import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFile} from 'node:child_process';

// Post-attempt verification for the in-session modes. The benchmark gates on
// acceptance tests; in-session we detect the workspace's own test command and
// run it inside the attempt copy — a diff that fails the project's tests is a
// miss, not a win. No test command → the diff proxy stands (ranTests=false).

export async function detectTestCommand(dir){
  const pkg=join(dir,'package.json');
  if(existsSync(pkg)){
    try{
      const scripts=JSON.parse(await readFile(pkg,'utf8')).scripts??{};
      if(typeof scripts.test==='string'&&scripts.test.trim()&&!/no test specified/i.test(scripts.test)){
        // npm runs the project's own test script; node_modules is linked in.
        return {command:'npm',args:['test'],kind:'npm'};
      }
    }catch{ /* unreadable package.json — fall through */ }
  }
  return null;
}

// Runs the detected test command in `dir`. {ranTests:false} means there was
// nothing to verify against; {passed,detail} otherwise. Detail is a short
// digest of failing output for the retry nudge and user notice.
export async function verifyDir(dir,{timeoutMs=120000}={}){
  const spec=await detectTestCommand(dir);
  if(!spec) return {ranTests:false,passed:null,detail:null};
  return await new Promise(resolve=>{
    const child=execFile(spec.command,spec.args,{cwd:dir,timeout:timeoutMs,maxBuffer:4*1024*1024},(error,stdout,stderr)=>{
      const out=String(stdout??'')+'\n'+String(stderr??'');
      if(error===null) return resolve({ranTests:true,passed:true,detail:out.slice(-1200)});
      const timedOut=error.killed||error.signal==='SIGTERM';
      const tail=out.trim().split('\n').slice(-25).join('\n');
      resolve({ranTests:true,passed:false,detail:(timedOut?`tests timed out after ${Math.round(timeoutMs/1000)}s\n`:'')+tail.slice(-3000)});
    });
    child.on('error',err=>resolve({ranTests:false,passed:null,detail:`could not run tests: ${err.message}`}));
  });
}
