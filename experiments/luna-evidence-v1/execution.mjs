// Remote Linux host binding only. Frozen general-v1 agent/tools/config are unchanged.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,realpath,copyFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
export const ROOT=resolve(import.meta.dirname,'../..');
export const EFFORT=process.env.SUFFICE_EVIDENCE_EFFORT??'low';
if(!['low','medium'].includes(EFFORT))throw Error('Unregistered effort');
export const LINUX_RUNTIME='/home/eric_qin/suffice-luna-evidence-v1-'+EFFORT;
const NODE_RUNTIME='/home/eric_qin/suffice-general-runtime';
export const canonicalState=resolve(ROOT,'.suffice/pi');
export const linuxPath=p=>resolve(p);
const inside=(parent,child)=>{const r=relative(parent,child);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('../'));};
export async function stageRuntime(){
 const manifest=JSON.parse(await (await import('node:fs/promises')).readFile(resolve(ROOT,`experiments/luna-evidence-v1/variants/${EFFORT}/source-manifest.json`),'utf8'));
 const crypto=await import('node:crypto');
 for(const [p,entry] of Object.entries(manifest.inputs)){
  const source=resolve(ROOT,`experiments/luna-evidence-v1/variants/${EFFORT}/runtime-source`,p),target=resolve(LINUX_RUNTIME,'app',p);
  const bytes=await (await import('node:fs/promises')).readFile(source);
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==entry.variantSha256)throw new Error('Variant source drift: '+p);
  await mkdir(resolve(target,'..'),{recursive:true});await copyFile(source,target);
 }
 await mkdir(resolve(LINUX_RUNTIME,'app/node_modules'),{recursive:true});
 await mkdir(resolve(LINUX_RUNTIME,'app/.suffice/pi'),{recursive:true});
 return Object.keys(manifest.inputs);
}
export async function executeIsolated({workspace,receipts,command,input='',privateRoots=[],gitMetadata=[],network=true,timeoutMs=600000,maxOutputBytes=8*1024**2,observerLimits={maxCostUsd:10,maxTurns:60,maxCalls:240}}){
 workspace=await realpath(workspace);receipts=resolve(receipts);await mkdir(receipts,{recursive:true});
 if(inside(workspace,receipts))throw new Error('Receipts must be outside actor repository');
 for(const p of privateRoots){const absolute=await realpath(p);if(inside(workspace,absolute)||inside(absolute,workspace))throw new Error('Private root overlaps actor');}
 const marker=resolve(receipts,'execution-boundary.json');await writeFile(marker,JSON.stringify({version:'bwrap-v1',workspace:'/workspace',network,limits:{timeoutMs,addressSpaceBytes:8*1024**3,nodeHeapMiB:512,cpuSeconds:300,fileBytes:64*1024**2}}));
 const args=['--kill-after=3s',Math.ceil(timeoutMs/1000)+'s','bwrap','--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL'];
 if(network)args.push('--share-net');
 args.push('--ro-bind','/usr','/usr','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--tmpfs','/home','--dir','/home/agent','--dir','/etc','--ro-bind','/etc/ssl','/etc/ssl','--ro-bind','/etc/resolv.conf','/etc/resolv.conf','--ro-bind','/etc/hosts','/etc/hosts','--ro-bind','/etc/nsswitch.conf','/etc/nsswitch.conf','--ro-bind',NODE_RUNTIME,'/node','--ro-bind',LINUX_RUNTIME+'/app','/runtime','--ro-bind',NODE_RUNTIME+'/app/node_modules','/runtime/node_modules','--bind',workspace,'/workspace','--bind',receipts,'/receipts','--ro-bind',marker,'/SUFFICE_BOUNDARY','--bind',canonicalState,'/runtime/.suffice/pi');
 for(const p of gitMetadata){const absolute=await realpath(p);for(const hidden of privateRoots)if(inside(absolute,resolve(hidden))||inside(resolve(hidden),absolute))throw new Error('Private root overlaps metadata/dependency mount');args.push('--ro-bind',absolute,absolute);}
 args.push('--clearenv','--setenv','PATH','/node/bin:/usr/bin:/bin','--setenv','HOME','/home/agent','--setenv','TMPDIR','/tmp','--setenv','LANG','C.UTF-8','--setenv','NODE_OPTIONS','--max-old-space-size=512 --disable-wasm-trap-handler','--setenv','NODE_NO_WARNINGS','1','--setenv','PI_OFFLINE','1','--setenv','PI_TELEMETRY','0','--setenv','PI_CODING_AGENT_DIR','/runtime/.suffice/pi','--setenv','SUFFICE_EXECUTION_BOUNDARY','bwrap-v1','--setenv','SUFFICE_OBSERVER_DIR','/receipts','--setenv','SUFFICE_OBSERVER_LIMITS',JSON.stringify(observerLimits),'--chdir','/workspace','prlimit','--as=8589934592','--cpu=300','--nofile=1024','--fsize=67108864','--',...command);
 await writeFile(resolve(receipts,'execution.json'),JSON.stringify({executable:'timeout',args,inputBytes:Buffer.byteLength(input),privateRoots,mountPolicy:'Remote Linux binding: same frozen public/runtime/auth mount policy and process limits; only host paths and transport differ.',host:'sonion'},null,2));
 const started=Date.now();return new Promise(done=>{
  const child=spawn('timeout',args,{detached:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',outputLimited=false,ended=false;
  const stop=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{}};
  const timer=setTimeout(stop,timeoutMs+5000);
  const add=(which,b)=>{if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)+b.length>maxOutputBytes){outputLimited=true;stop();return;}if(which==='out')stdout+=b;else stderr+=b;};
  child.stdout.on('data',b=>add('out',b));child.stderr.on('data',b=>add('err',b));child.on('error',e=>stderr+=e.message);
  child.on('close',async code=>{if(ended)return;ended=true;clearTimeout(timer);const result={exitCode:code,outputLimited,latencyMs:Date.now()-started,stdout,stderr};await writeFile(resolve(receipts,'process-stdout.txt'),stdout);await writeFile(resolve(receipts,'process-stderr.txt'),stderr);await writeFile(resolve(receipts,'execution-result.json'),JSON.stringify({...result,stdout:'[saved]',stderr:'[saved]'},null,2));done(result);});child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
