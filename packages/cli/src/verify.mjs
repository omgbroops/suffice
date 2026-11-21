import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFile,execFileSync} from 'node:child_process';
import {commandGate} from './command-gate.mjs';

// Post-attempt verification for the in-session modes. The benchmark gates on
// acceptance tests; in-session we detect the workspace's own test command and
// run it inside the attempt copy — a diff that fails the project's tests is a
// miss, not a win. No test command → the diff proxy stands (ranTests=false).
// Verification is command execution: it only runs when the session's access
// level permits shell work ('full') and SUFFICE_GATE_CMD, when configured,
// approves the test command.

export async function detectTestCommand(dir){
  const pkg=join(dir,'package.json');
  if(existsSync(pkg)){
    try{
      const scripts=JSON.parse(await readFile(pkg,'utf8')).scripts??{};
      if(typeof scripts.test==='string'&&scripts.test.trim()&&!/no test specified/i.test(scripts.test)){
        // npm runs the project's own test script; node_modules is linked in.
        return {command:'npm',args:['test'],kind:'npm',line:'npm test'};
      }
    }catch{ /* unreadable package.json — fall through */ }
  }
  return null;
}

// npm is a .cmd shim on Windows — execFile cannot launch it without a shell.
const npmBin=process.platform==='win32'?'npm.cmd':'npm';
const npmShell=process.platform==='win32';

// Kill the child and its whole process tree: npm spawns the test runner as a
// descendant, and execFile's own timeout only kills the direct child.
function killTree(child){
  if(child.exitCode!==null||child.signalCode!==null) return;
  try{
    if(process.platform==='win32') execFileSync('taskkill',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore'});
    else process.kill(-child.pid,'SIGKILL');
  }catch{ try{ child.kill('SIGKILL'); }catch{} }
}

// Runs the detected test command in `dir`. {ranTests:false} means there was
// nothing to verify against (no test script, insufficient access, or the
// command gate refused); {passed,detail} otherwise. Detail is a short digest
// of failing output for the retry nudge and user notice. `signal` aborts the
// run (used to cancel losers' verification once a race winner claims).
export async function verifyDir(dir,{timeoutMs=120000,access='full',signal}={}){
  const spec=await detectTestCommand(dir);
  if(!spec||access!=='full') return {ranTests:false,passed:null,detail:null};
  if(signal?.aborted) return {ranTests:true,passed:false,detail:'verification aborted'};
  if(process.env.SUFFICE_GATE_CMD){
    try{ await commandGate(spec.line,{signal}); }
    catch{ return {ranTests:false,passed:null,detail:'command gate denied the test run'}; }
  }
  return await new Promise(resolve=>{
    const child=execFile(npmBin,spec.args,{cwd:dir,shell:npmShell,detached:!npmShell,maxBuffer:4*1024*1024},(error,stdout,stderr)=>{
      clearTimeout(timer);signal?.removeEventListener('abort',onAbort);
      const out=String(stdout??'')+'\n'+String(stderr??'');
      if(error===null) return resolve({ranTests:true,passed:true,detail:out.slice(-1200)});
      const tail=out.trim().split('\n').slice(-25).join('\n');
      resolve({ranTests:true,passed:false,detail:(timedOut?`tests timed out after ${Math.round(timeoutMs/1000)}s\n`:'')+tail.slice(-3000)});
    });
    let timedOut=false;
    const onAbort=()=>{killTree(child);};
    signal?.addEventListener('abort',onAbort,{once:true});
    const timer=setTimeout(()=>{timedOut=true;killTree(child);},timeoutMs);
    child.on('error',()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);resolve({ranTests:false,passed:null,detail:'could not run tests'});});
  });
}
