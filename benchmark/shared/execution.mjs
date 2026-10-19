// Shared-core campaign boundary derived from broad-execution; original stays unchanged.
import {spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {mkdir,writeFile,realpath,copyFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
export const ROOT=resolve(import.meta.dirname,'../..');
const OLD='/home/eric_qin/suffice-field-v1';
export const canonicalState=OLD+'/.suffice/pi';
const NODE_RUNTIME='/home/eric_qin/suffice-general-runtime';
const LINUX_RUNTIME=ROOT;
const MODEL='gpt-6.1-sol',EFFORT='medium';
const inside=(parent,child)=>{const r=relative(parent,child);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('../'));};
export async function executeIsolated({workspace,receipts,command,input='',codexHome=null,privateRoots=[],gitMetadata=[],dependencyCache=null,network=true,timeoutMs=600000,maxOutputBytes=8*1024**2,observerLimits={maxCostUsd:10,maxTurns:60,maxCalls:240},model=MODEL,effort=EFFORT}){
 workspace=await realpath(workspace);receipts=resolve(receipts);await mkdir(receipts,{recursive:true});
 if(inside(workspace,receipts))throw new Error('Receipts must be outside actor repository');
 for(const p of privateRoots){const absolute=await realpath(p);if(inside(workspace,absolute)||inside(absolute,workspace))throw new Error('Private root overlaps actor');}
 const marker=resolve(receipts,'execution-boundary.json');await writeFile(marker,JSON.stringify({version:'bwrap-v1',workspace:'/workspace',network,limits:{timeoutMs,addressSpaceBytes:2*1024**4,aggregateRssCeilingBytes:4*1024**3,nodeHeapMiB:512,cpuSeconds:300,fileBytes:64*1024**2}}));
 const args=['--kill-after=3s',Math.ceil(timeoutMs/1000)+'s','bwrap','--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL'];
 if(network)args.push('--share-net');
 args.push('--ro-bind','/usr','/usr','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--tmpfs','/home','--dir','/home/agent','--dir','/etc','--ro-bind','/etc/ssl','/etc/ssl','--ro-bind','/etc/resolv.conf','/etc/resolv.conf','--ro-bind','/etc/hosts','/etc/hosts','--ro-bind','/etc/nsswitch.conf','/etc/nsswitch.conf','--ro-bind',NODE_RUNTIME,'/node','--ro-bind',LINUX_RUNTIME,'/runtime','--bind',workspace,'/workspace','--bind',receipts,'/receipts','--ro-bind',marker,'/SUFFICE_BOUNDARY','--tmpfs','/runtime/.suffice','--dir','/runtime/.suffice/pi',...(network?['--bind',canonicalState,'/runtime/.suffice/pi']:[]));
 // Retain auth refresh but hide historical agent transcripts in shared state.
 args.push('--tmpfs','/runtime/.suffice/pi/sessions','--tmpfs','/runtime/.suffice/pi/events','--ro-bind',resolve(ROOT,'benchmark/shared/public'),'/public-contracts','--tmpfs','/runtime/benchmark');
 if(codexHome)args.push('--ro-bind','/home/eric_qin/suffice-codex-runtime-0163','/codexruntime','--bind',codexHome,'/codex-home','--ro-bind',resolve(ROOT,'benchmark/broad-native-worker.mjs'),'/native-worker.mjs');
 for(const p of gitMetadata){const absolute=await realpath(p);for(const hidden of privateRoots)if(inside(absolute,resolve(hidden))||inside(resolve(hidden),absolute))throw new Error('Private root overlaps metadata/dependency mount');args.push('--ro-bind',absolute,absolute);}
 if(dependencyCache){
  const cache=await realpath(dependencyCache);
  if(!inside(resolve(ROOT,'.suffice/shared-core-v1/dependencies'),cache)||!cache.endsWith('/node_modules/.cache'))throw Error('Invalid dependency cache mount');
  // Test-run status caches are writable and private to this command. Package
  // code, dependency locks and all other dependency bytes remain read-only.
  args.push('--tmpfs',cache);
 }
 args.push('--clearenv','--setenv','PATH','/node/bin:/usr/bin:/bin','--setenv','HOME','/home/agent','--setenv','TMPDIR','/tmp','--setenv','LANG','C.UTF-8','--setenv','NODE_OPTIONS','--max-old-space-size=512 --disable-wasm-trap-handler','--setenv','NODE_NO_WARNINGS','1','--setenv','BENCHMARK_MODEL',model,'--setenv','BENCHMARK_EFFORT',effort,'--setenv','PI_OFFLINE','1','--setenv','PI_TELEMETRY','0','--setenv','PI_CODING_AGENT_DIR','/runtime/.suffice/pi','--setenv','SUFFICE_EXECUTION_BOUNDARY','bwrap-v1','--setenv','SUFFICE_OBSERVER_DIR','/receipts','--setenv','SUFFICE_OBSERVER_LIMITS',JSON.stringify(observerLimits),...(codexHome?['--setenv','CODEX_HOME','/codex-home']:[]),'--chdir','/workspace','prlimit','--as=2199023255552','--cpu=300','--nofile=1024','--fsize=67108864','--',...command);
 await writeFile(resolve(receipts,'execution.json'),JSON.stringify({executable:'timeout',args,inputBytes:Buffer.byteLength(input),privateRoots,mountPolicy:'Remote Linux binding: same frozen public/runtime/auth mount policy and process limits; only host paths and transport differ.',host:'sonion'},null,2));
 const started=Date.now();return new Promise(done=>{
  const child=spawn('timeout',args,{detached:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',outputLimited=false,ended=false;
  const stop=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{}};
  let peakRssBytes=0,resourceStop=null;
  const rssTimer=setInterval(()=>{try{
   const rows=new Map();for(const p of readdirSync('/proc').filter(p=>/^\d+$/.test(p))){try{const s=readFileSync('/proc/'+p+'/status','utf8');rows.set(Number(p),{parent:Number(s.match(/^PPid:\s+(\d+)/m)?.[1]),rss:Number(s.match(/^VmRSS:\s+(\d+)/m)?.[1]??0)*1024});}catch{}}
   const pending=[child.pid];let rss=0;while(pending.length){const pid=pending.pop();rss+=rows.get(pid)?.rss??0;for(const[p,v]of rows)if(v.parent===pid)pending.push(p);}
   peakRssBytes=Math.max(peakRssBytes,rss);if(rss>4*1024**3){resourceStop='aggregate_rss_limit';stop();}
  }catch{}},1000);
  const timer=setTimeout(stop,timeoutMs+5000);
  const add=(which,b)=>{if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)+b.length>maxOutputBytes){outputLimited=true;stop();return;}if(which==='out')stdout+=b;else stderr+=b;};
  child.stdout.on('data',b=>add('out',b));child.stderr.on('data',b=>add('err',b));child.on('error',e=>stderr+=e.message);
  child.on('close',async code=>{if(ended)return;ended=true;clearTimeout(timer);clearInterval(rssTimer);const result={peakRssBytes,resourceStop,exitCode:code,outputLimited,latencyMs:Date.now()-started,stdout,stderr};await writeFile(resolve(receipts,'process-stdout.txt'),stdout);await writeFile(resolve(receipts,'process-stderr.txt'),stderr);await writeFile(resolve(receipts,'execution-result.json'),JSON.stringify({...result,stdout:'[saved]',stderr:'[saved]'},null,2));done(result);});child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
