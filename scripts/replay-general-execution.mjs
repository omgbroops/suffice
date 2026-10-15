// Existing WSL + Bubblewrap execution. No daemon, container image or extra model.
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir,stat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
export const ROOT=resolve(import.meta.dirname,'..');
export const LINUX_RUNTIME='/home/mohammed/suffice-general-runtime';
export const canonicalState='C:/Users/Mohammed/Documents/GitHub/suffice/.suffice/pi';
export const linuxPath=p=>{p=resolve(p).replaceAll('\\','/');const m=/^([A-Za-z]):\/(.*)$/.exec(p);if(!m)throw new Error('Expected local drive path');return '/mnt/'+m[1].toLowerCase()+'/'+m[2];};
function wsl(args){const p=spawnSync('wsl.exe',['-d','Ubuntu','--',...args],{encoding:'utf8',windowsHide:true});if(p.status!==0)throw new Error(p.stderr||p.stdout);return p.stdout.trim();}
export async function stageRuntime(){
 wsl(['mkdir','-p',LINUX_RUNTIME+'/app/.suffice/pi',LINUX_RUNTIME+'/app/.suffice/empty-agent']);
 // Only executable harness source; never benchmark/research/reference directories.
 const files=['package.json','package-lock.json','src/runtime.mjs','src/workspace.mjs','src/symbol-navigation.mjs','src/external-pi-observer.mjs','src/general/tools.mjs','src/general/agent.mjs','src/general/entry.mjs','tests/general-compatibility.mjs','scripts/general-boundary.sh'];
 for(const p of files){const target=LINUX_RUNTIME+'/app/'+p;wsl(['mkdir','-p',target.slice(0,target.lastIndexOf('/'))]);wsl(['cp',linuxPath(resolve(ROOT,p)),target]);}
 return files;
}
const inside=(parent,child)=>{const r=relative(parent,child);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..\\')&&!r.startsWith('../'));};
export async function executeReplay({workspace,receipts,command,dependencies,grader,input='',privateRoots=[],gitMetadata=[],network=true,timeoutMs=600000,maxOutputBytes=8*1024**2}){
 workspace=await realpath(workspace);receipts=resolve(receipts);await mkdir(receipts,{recursive:true});
 if(inside(workspace,receipts))throw new Error('Receipts must be outside actor repository');
 for(const p of privateRoots){const absolute=await realpath(p);if(inside(workspace,absolute)||inside(absolute,workspace))throw new Error('Private evaluation root overlaps actor mount');}
 const marker=resolve(receipts,'execution-boundary.json');await writeFile(marker,JSON.stringify({version:'bwrap-v1',workspace:'/workspace',network,limits:{timeoutMs,addressSpaceBytes:8*1024**3,nodeHeapMiB:512,cpuSeconds:300,fileBytes:64*1024**2}}));
 const args=['-d','Ubuntu','--','sh',LINUX_RUNTIME+'/app/scripts/general-boundary.sh','timeout','--kill-after=3s',Math.ceil(timeoutMs/1000)+'s','bwrap','--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL'];
 if(network)args.push('--share-net');
 args.push('--ro-bind','/usr','/usr','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--tmpfs','/home','--dir','/home/agent','--dir','/etc','--ro-bind','/etc/ssl','/etc/ssl','--ro-bind','/etc/resolv.conf','/etc/resolv.conf','--ro-bind','/etc/hosts','/etc/hosts','--ro-bind','/etc/nsswitch.conf','/etc/nsswitch.conf','--ro-bind',LINUX_RUNTIME,'/node','--ro-bind',LINUX_RUNTIME+'/app','/runtime','--bind',linuxPath(workspace),'/workspace','--bind',linuxPath(receipts),'/receipts','--ro-bind',linuxPath(marker),'/SUFFICE_BOUNDARY','--bind',linuxPath(canonicalState),'/runtime/.suffice/pi');
 for(const p of gitMetadata){const absolute=await realpath(p);for(const hidden of privateRoots)if(inside(absolute,resolve(hidden))||inside(resolve(hidden),absolute))throw new Error('Private data overlaps Git mount');args.push('--ro-bind',linuxPath(absolute),linuxPath(absolute));}
 args.push('--ro-bind',linuxPath(dependencies),'/workspace/node_modules');
 if(grader)args.push('--ro-bind',linuxPath(grader),'/grader'+(grader.endsWith('.mjs')?'.mjs':'.cjs'));
 args.push('--clearenv','--setenv','PATH','/node/bin:/usr/bin:/bin','--setenv','HOME','/home/agent','--setenv','TMPDIR','/tmp','--setenv','SUFFICE_WORKSPACE','/workspace','--setenv','LANG','C.UTF-8','--setenv','NODE_OPTIONS','--max-old-space-size=512 --disable-wasm-trap-handler','--setenv','NODE_NO_WARNINGS','1','--setenv','PI_OFFLINE','1','--setenv','PI_TELEMETRY','0','--setenv','PI_CODING_AGENT_DIR','/runtime/.suffice/pi','--setenv','SUFFICE_EXECUTION_BOUNDARY','bwrap-v1','--setenv','SUFFICE_OBSERVER_DIR','/receipts','--setenv','SUFFICE_OBSERVER_LIMITS',JSON.stringify({maxCostUsd:0.75,maxTurns:60,maxCalls:240}), '--chdir','/workspace','prlimit','--as=8589934592','--cpu=300','--nofile=1024','--fsize=67108864','--',...command);
 await writeFile(resolve(receipts,'execution.json'),JSON.stringify({executable:'wsl.exe',args,inputBytes:Buffer.byteLength(input),privateRoots,mountPolicy:'Evaluator-only deterministic replay: fresh source writable, pinned dependencies read-only, optional unchanged private grader read-only, own receipts writable. No inference command is launched.'},null,2));
 const start=Date.now();
 return new Promise(done=>{
  const p=spawn('wsl.exe',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',outputLimited=false,linuxPid,header='';
  const stop=()=>{if(linuxPid)spawn('wsl.exe',['-d','Ubuntu','--','kill','-TERM',String(linuxPid)],{windowsHide:true,stdio:'ignore'}).unref();else p.kill();};
  const timer=setTimeout(stop,timeoutMs+5000);
  const add=(key,b)=>{if(key==='stdout'&&linuxPid===undefined){header+=b.toString();const end=header.indexOf('\n');if(end===-1)return;const m=/^SUFFICE_LAUNCH_PID=(\d+)\r?$/.exec(header.slice(0,end));if(!m){stderr+='Missing trusted launcher PID';p.kill();return;}linuxPid=Number(m[1]);b=Buffer.from(header.slice(end+1));header='';}if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)+b.length>maxOutputBytes){outputLimited=true;stop();return;}if(key==='stdout')stdout+=b;else stderr+=b;};
  p.stdout.on('data',b=>add('stdout',b));p.stderr.on('data',b=>add('stderr',b));p.on('error',e=>stderr+=e.message);
  p.on('close',async code=>{clearTimeout(timer);const result={exitCode:code,outputLimited,latencyMs:Date.now()-start,stdout,stderr};await writeFile(resolve(receipts,'process-stdout.txt'),stdout);await writeFile(resolve(receipts,'process-stderr.txt'),stderr);await writeFile(resolve(receipts,'execution-result.json'),JSON.stringify({...result,stdout:'[saved]',stderr:'[saved]'},null,2));done(result);});
  p.stdin.on('error',()=>{});p.stdin.end(input);
 });
}
if(process.argv[2]==='stage')console.log(JSON.stringify({staged:await stageRuntime()}));

