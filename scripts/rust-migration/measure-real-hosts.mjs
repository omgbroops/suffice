import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,open,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';

const args=process.argv.slice(2), opts={};
for(let i=0;i<args.length;i+=2){if(!['--primary','--output','--pairs'].includes(args[i])||!args[i+1]||opts[args[i]])throw Error('Usage: node measure-real-hosts.mjs --primary ROOT --output NEW.json [--pairs N]');opts[args[i]]=args[i+1];}
if(!opts['--primary']||!opts['--output'])throw Error('Usage: node measure-real-hosts.mjs --primary ROOT --output NEW.json [--pairs N]');
const pairs=Number(opts['--pairs']??5);if(!Number.isInteger(pairs)||pairs<5||pairs>20)throw Error('--pairs must be an integer from 5 to 20');
if(process.platform!=='win32')throw Error('Windows is required');
const root=resolve(opts['--primary']),output=resolve(opts['--output']),node=process.execPath;
const electron=join(root,'release/win-unpacked/Suffice.exe'),rust=join(root,'apps/desktop-rust/target/release/suffice-desktop-rust.exe');
const {_electron}=createRequire(join(root,'package.json'))('playwright-core');
const treeScript=join(dirname(fileURLToPath(import.meta.url)),'process-tree.ps1'),exec=promisify(execFile);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const bounded=(promise,ms,label)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`${label} exceeded ${ms} ms`)),ms);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
await mkdir(dirname(output),{recursive:true});await (await open(output,'wx')).close();
const sandbox=await mkdtemp(join(tmpdir(),'suffice-real-hosts-')),project=join(sandbox,'project');await mkdir(project);
const iso='2026-01-01T00:00:00.000Z',fixture=[];
for(let i=0;i<30;i++){
 const title=i===0?'Rust host large transcript':`Rust host fixture thread ${String(i).padStart(2,'0')}`;
 const entries=[{type:'session',version:3,id:`fixture-${i}`,timestamp:iso,cwd:project}];let parent=null;
 for(let n=0;n<(i===0?1000:2);n++){const id=`m${n}`,role=n%2?'assistant':'user';entries.push({type:'message',id,parentId:parent,timestamp:iso,message:{role,content:[{type:'text',text:`Rust host fixture message ${n}`}],timestamp:1767225600000,...(role==='assistant'?{stopReason:'stop'}:{})}});parent=id;}
 entries.push({type:'session_info',id:'name',parentId:parent,timestamp:iso,name:title});fixture.push(entries.map(JSON.stringify).join('\n')+'\n');
}
const fixtureHash=hash(fixture.join(''));
const result={schemaVersion:1,createdAt:new Date().toISOString(),root,output,platform:process.platform,arch:process.arch,pairs,executables:{electron:{path:electron,bytes:(await stat(electron)).size},rust:{path:rust,bytes:(await stat(rust)).size},node:{path:node,bytes:(await stat(node)).size}},fixture:{sessions:30,largeTranscriptMessages:1000,sha256:fixtureHash},method:{order:'alternating first host by pair',homes:'fresh isolated home and profile for every sample; identical session bytes and project path',offline:'PI_OFFLINE=1; zero model requests',startup:'parent monotonic clock from launch to UI-ready event / Electron 30 rows visible',selection:'parent monotonic clock from click or measure-select write to transcript assertion; Rust includes instrumentation and event transport delay',memory:'instantaneous CIM process-tree snapshots; shared/external WebView2 processes may not be descendants and are excluded',cache:'no OS cache flush',scope:'matched rendered fixture only; no whole-feature parity claim'},samples:[],limitations:['WebView2 is an external shared runtime; its installation size is excluded and shared processes may not appear in the Rust process tree.','CIM snapshots can miss short-lived processes and PID reuse can affect cleanup observations.']};
const save=()=>writeFile(output,JSON.stringify(result,null,2)+'\n');
async function snapshot(pid){const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-File',treeScript,'-RootPid',String(pid)],{timeout:15000,maxBuffer:4*1024*1024});const tree=JSON.parse(stdout);if(!Array.isArray(tree.processes)||!tree.processes.some(p=>p.pid===pid))throw Error(`Root PID ${pid} absent in process snapshot`);return tree;}
async function sample(host,pair){
 const s={host,pair,errors:[],events:[],snapshots:{}};result.samples.push(s);const dir=join(sandbox,`${pair}-${host}`),home=join(dir,'home'),profile=join(dir,'profile'),sessions=join(home,'sessions','fixture');await mkdir(sessions,{recursive:true});await mkdir(profile,{recursive:true});
 for(let i=0;i<fixture.length;i++)await writeFile(join(sessions,`${String(i).padStart(2,'0')}.jsonl`),fixture[i]);
 const actual=[];for(let i=0;i<fixture.length;i++)actual.push(await readFile(join(sessions,`${String(i).padStart(2,'0')}.jsonl`),'utf8'));s.fixtureSha256=hash(actual.join(''));if(s.fixtureSha256!==fixtureHash)throw Error('Fixture hash mismatch');
 const env={...process.env,SUFFICE_HOME:home,PI_OFFLINE:'1'};delete env.ELECTRON_RUN_AS_NODE;let app,child,pid,known=new Set(),started=performance.now(),exitPromise;
 const snap=async name=>{const start=performance.now();const value=await snapshot(pid);value.parentStartMs=start-started;value.parentReceiptMs=performance.now()-started;s.snapshots[name]=value;for(const p of value.processes)known.add(p.pid);};
 try{
  if(host==='electron'){
   app=await _electron.launch({executablePath:electron,args:['--user-data-dir='+profile],cwd:root,env,timeout:60000});child=app.process();pid=child.pid;s.pid=pid;if(!pid)throw Error('Missing Electron PID');
   const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));page.on('pageerror',e=>s.errors.push({source:'page',message:e.message}));page.on('console',m=>{if(m.type()==='error')s.errors.push({source:'console',message:m.text()});});
   if(!await app.evaluate(({app})=>app.isPackaged))throw Error('Electron is not packaged');
   await page.locator('.composer').waitFor({timeout:60000});await page.waitForFunction(()=>document.querySelectorAll('.thread-row[data-thread]').length===30,null,{timeout:60000});s.readyMs=performance.now()-started;s.viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,devicePixelRatio}));if(s.viewport.width!==1440||s.viewport.height!==900)throw Error(`Unexpected Electron viewport: ${JSON.stringify(s.viewport)}`);
   await snap('idle');const select=performance.now();await page.locator('.thread-row[data-thread]').filter({hasText:'Rust host large transcript'}).click();await page.locator('.thread-messages').filter({hasText:'Rust host fixture message 999'}).waitFor({timeout:60000});s.selectionMs=performance.now()-select;await snap('active');
  }else{
   child=spawn(rust,['--root',root,'--home',home,'--profile',profile,'--node',node,'--smoke','--smoke-pause'],{cwd:root,env,windowsHide:true,stdio:['pipe','pipe','pipe']});pid=child.pid;s.pid=pid;if(!pid)throw Error('Missing Rust PID');
   let buffer='',readyResolve,smokeResolve;const ready=new Promise(r=>readyResolve=r),smoke=new Promise(r=>smokeResolve=r);s.stdout='';s.stderr='';
   child.stdout.on('data',chunk=>{const text=chunk.toString();s.stdout+=text;buffer+=text;let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at).trim();buffer=buffer.slice(at+1);try{const event=JSON.parse(line);event.parentElapsedMs=performance.now()-started;s.events.push(event);if(event.event==='ui-ready')readyResolve(event);if(event.event==='smoke')smokeResolve(event);}catch{if(line)s.errors.push({source:'stdout',message:line});}}});child.stderr.on('data',c=>s.stderr+=c.toString());
   exitPromise=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});const early=exitPromise.then(x=>{throw Error(`Rust exited early: ${JSON.stringify(x)}`);});
   const r=await bounded(Promise.race([ready,early]),60000,'Rust UI ready');if(r.ok===false||r.threadCount!==30)throw Error(`Invalid UI ready event: ${JSON.stringify(r)}`);s.readyMs=r.parentElapsedMs;s.viewport={width:r.width,height:r.height,devicePixelRatio:r.devicePixelRatio};if(s.viewport.width!==1440||s.viewport.height!==900||!Number.isFinite(s.viewport.devicePixelRatio))throw Error(`Unexpected Rust viewport: ${JSON.stringify(s.viewport)}`);await snap('idle');const select=performance.now();child.stdin.write(JSON.stringify({type:'measure-select'})+'\n');
   const done=await bounded(Promise.race([smoke,early]),60000,'Rust transcript');if(!done.ok||done.threadCount!==30)throw Error(`Invalid smoke event: ${JSON.stringify(done)}`);s.selectionMs=started+done.parentElapsedMs-select;await snap('active');
  }
 }catch(e){s.errors.push({source:'harness',message:e.stack||String(e)});}finally{
  if(child&&pid){known.add(pid);const shutdownStart=performance.now();try{if(app)await bounded(app.close(),10000,'Electron shutdown');else {const x=await bounded(exitPromise,15000,'Rust shutdown');s.exit=x;if(x.code!==0)throw Error(`Rust exit ${JSON.stringify(x)}`);if(!s.events.some(e=>e.event==='shutdown'&&e.ok===true))throw Error('Missing successful Rust shutdown event');}s.shutdownMs=performance.now()-shutdownStart;}catch(e){s.errors.push({source:'shutdown',message:e.message});try{const current=await snapshot(pid);const match=current.processes.find(p=>p.pid===pid);if(match&&child.exitCode===null){await exec('taskkill.exe',['/PID',String(pid),'/T','/F'],{timeout:10000});s.forcedCleanup={pid,name:match.name};}}catch(cleanup){s.errors.push({source:'cleanup',message:cleanup.message});}}
   await delay(500);s.cleanup={observedPids:[...known],remaining:[]};for(const id of known){try{const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`if (Get-Process -Id ${id} -ErrorAction SilentlyContinue) { 'alive' }`],{timeout:10000});if(stdout.trim())s.cleanup.remaining.push(id);}catch(e){s.errors.push({source:'cleanup',message:e.message});}}if(s.cleanup.remaining.length)s.errors.push({source:'cleanup',message:`Observed PIDs remain: ${s.cleanup.remaining.join(', ')}`});
  }
  await save();
 }
}
try{for(let i=1;i<=pairs;i++){for(const host of i%2?['electron','rust']:['rust','electron'])await sample(host,i);const pair=result.samples.filter(s=>s.pair===i);if(pair.length===2&&pair.every(s=>s.viewport)){const [a,b]=pair.map(s=>s.viewport);if(a.width!==b.width||a.height!==b.height||a.devicePixelRatio!==b.devicePixelRatio){for(const s of pair)s.errors.push({source:'viewport',message:`Viewport mismatch in pair ${i}: ${JSON.stringify(pair.map(x=>({host:x.host,viewport:x.viewport})))}`});await save();}}}}catch(e){result.fatal=e.stack||String(e);}finally{result.completedAt=new Date().toISOString();try{await rm(sandbox,{recursive:true,force:true});result.sandboxRemoved=true;}catch(e){result.sandboxRemoved=false;result.cleanupError=e.message;}await save();}
if(result.fatal||result.samples.length!==pairs*2||result.samples.some(s=>s.errors.length||!s.snapshots.active))process.exitCode=1;
