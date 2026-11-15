import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {open,readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import readline from 'node:readline';

const [rootArg,outputArg]=process.argv.slice(2);
if(!rootArg||!outputArg||process.platform!=='win32')throw new Error('Usage on Windows: node measure-probes.mjs REPOSITORY_ROOT NEW_OUTPUT.json');
const root=resolve(rootArg),output=resolve(outputArg),treeScript=join(dirname(fileURLToPath(import.meta.url)),'process-tree.ps1'),exec=promisify(execFile),file=await open(output,'wx');
const binaries={native:join(root,'experiments/rust-desktop-probe/target/release/suffice-rust-desktop-probe.exe'),wry:join(root,'experiments/wry-desktop-probe/target/release/suffice-wry-probe.exe')};
const result={schemaVersion:1,createdAt:new Date().toISOString(),node:process.version,platform:process.platform,method:{iterations:5,order:'alternate launch order each iteration',startup:'parent monotonic wall time from spawn to ready JSONL event',snapshots:'CIM descendant tree approximately 2 and 3 seconds after ready; shared or reparented WebView2 processes may not be captured',cpu:'matched-PID cumulative CPU-time delta divided by wall time; 100% is one core',scope:'Architecture probes with synthetic in-memory UI; workload differs from full Electron application, so no full-app equivalent or parity claim.',cache:'no OS cache flush'},binaries:{},samples:[],errors:[]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function snapshot(pid){const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-File',treeScript,'-RootPid',String(pid)],{timeout:8000,maxBuffer:4*1024*1024});return JSON.parse(stdout);}
async function measure(kind,iteration){
 const s={kind,iteration,events:[],errors:[],stderr:''},started=performance.now(),child=spawn(binaries[kind],['--probe'],{windowsHide:false,stdio:['ignore','pipe','pipe']});s.pid=child.pid;
 let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});let readyDone=false;
 const lines=readline.createInterface({input:child.stdout});lines.on('line',line=>{try{const value=JSON.parse(line);s.events.push({atMs:performance.now()-started,value});if(value.event==='ready'&&!readyDone){readyDone=true;s.readyMs=performance.now()-started;readyResolve(true);}}catch{s.errors.push(`Invalid JSONL: ${line}`);}});
 child.stderr.setEncoding('utf8');child.stderr.on('data',part=>s.stderr+=part);
 const exit=new Promise(resolve=>{child.once('error',e=>{s.errors.push(e.message);resolve({code:null,signal:null});});child.once('close',(code,signal)=>resolve({code,signal}));});
 const reached=await Promise.race([ready,exit.then(()=>false),delay(15000).then(()=>false)]);
 if(reached){try{await delay(2000);const t1=performance.now();s.idle=await snapshot(child.pid);await delay(1000);s.idleSecond=await snapshot(child.pid);const t2=performance.now();s.intervalMs=t2-t1;const map=new Map((s.idle.processes||[]).map(p=>[p.pid,p.cpuTimeMs])),matching=(s.idleSecond.processes||[]).filter(p=>map.has(p.pid));s.idleCpu={matchedPids:matching.map(p=>p.pid),corePercent:100*matching.reduce((sum,p)=>sum+Math.max(0,p.cpuTimeMs-map.get(p.pid)),0)/s.intervalMs};if(!matching.some(p=>p.pid===child.pid))s.errors.push('Root absent from second snapshot; measurement invalid');}catch(e){s.errors.push(`Snapshot: ${e.message}`);}}else s.errors.push('Ready event not observed before exit or timeout');
 let status=await Promise.race([exit,delay(10000).then(()=>null)]);if(!status){child.kill();status=await exit;s.errors.push('Probe exceeded shutdown deadline');}s.exit=status;
 const event=name=>s.events.find(x=>x.value.event===name)?.value,shutdown=event('shutdown');if(status.code!==0||!shutdown?.ok)s.errors.push('Shutdown or exit verification failed');
 if(kind==='native'){const x=event('selection');if(!x?.text_matches||!x?.resize_verified||x?.messages!==1000)s.errors.push('Native selection, resize or 1000-message verification failed');}else if(!event('verified')?.ok)s.errors.push('Wry verification failed');
 return s;
}
try{
 for(const [name,path] of Object.entries(binaries)){const b=await readFile(path);result.binaries[name]={path,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}
 for(let i=0;i<5;i++){const order=i%2?['wry','native']:['native','wry'];for(const kind of order)result.samples.push(await measure(kind,i+1));}
 if(result.samples.some(s=>s.errors.length))process.exitCode=1;
}catch(e){result.errors.push(e.stack||String(e));process.exitCode=1;}finally{result.completedAt=new Date().toISOString();await file.writeFile(JSON.stringify(result,null,2)+'\n');await file.close();}
