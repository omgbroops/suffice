import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const [rootArg,outputArg,executableArg,runsArg]=process.argv.slice(2);
const iterations=runsArg?Number(runsArg.replace(/^--runs=/,'')):5;
if(!Number.isInteger(iterations)||iterations<1||iterations>20)throw Error('Use --runs=1 through --runs=20');
if(!rootArg||!outputArg)throw new Error('Usage: node measure-desktop.mjs <baseline-checkout-root> <output.json> [packaged-executable]');
const root=resolve(rootArg),output=resolve(outputArg),require=createRequire(join(root,'package.json'));
await mkdir(dirname(output),{recursive:true});await (await open(output,'wx')).close();
const electronPath=executableArg?resolve(executableArg):require('electron'),{_electron}=require('playwright-core');
const script=join(dirname(fileURLToPath(import.meta.url)),'process-tree.ps1'),exec=promisify(execFile);
const sandbox=await mkdtemp(join(tmpdir(),'suffice-measure-')),home=join(sandbox,'home'),project=join(sandbox,'project'),profile=join(sandbox,'profile'),sessions=join(home,'sessions','fixture');
await mkdir(sessions,{recursive:true});await mkdir(project,{recursive:true});
const iso='2026-01-01T00:00:00.000Z';
for(let i=0;i<30;i++){
 const title=i===0?'Benchmark large transcript':`Benchmark thread ${String(i).padStart(2,'0')}`;
 const entries=[{type:'session',version:3,id:`benchmark-${i}`,timestamp:iso,cwd:project}];let parent=null;
 for(let n=0;n<(i===0?1000:2);n++) {const id=`m${n}`,role=n%2?'assistant':'user';entries.push({type:'message',id,parentId:parent,timestamp:iso,message:{role,content:[{type:'text',text:`${title} message ${n} deterministic fixture`}],timestamp:1767225600000,...(role==='assistant'?{stopReason:'stop'}:{})}});parent=id;}
 entries.push({type:'session_info',id:'name',parentId:parent,timestamp:iso,name:title});
 await writeFile(join(sessions,`${String(i).padStart(2,'0')}.jsonl`),entries.map(JSON.stringify).join('\n')+'\n');
}
const result={schemaVersion:1,createdAt:new Date().toISOString(),root,output,sandbox,platform:process.platform,arch:process.arch,node:process.version,electronPath,method:{iterations:5,profile:'first launch fresh, subsequent launches same profile',osCache:'not flushed; no OS-cold claim',ready:'composer visible and 30 fixture thread rows present',transcript:'click large thread until message 999 rendered',memory:'Windows CIM process tree instantaneous working set and private bytes; CPU core-percent from matching PID cumulative CPU deltas over idle wall time',terminal:'IPC create/write, marker received in terminal event, close',offline:'PI_OFFLINE=1, isolated SUFFICE_HOME and Electron userData, no model request'},samples:[],limitations:[]};
if(process.platform!=='win32')result.limitations.push('Process-tree measurements and process cleanup checks require Windows PowerShell and CIM; unavailable on this platform.');
const save=async()=>{await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');};
async function snapshot(pid){if(process.platform!=='win32')return null;const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-RootPid',String(pid)],{timeout:15000,maxBuffer:4*1024*1024});return JSON.parse(stdout);}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
result.method.iterations=iterations;
for(let iteration=0;iteration<iterations;iteration++){
 const sample={iteration:iteration+1,profile:iteration?'warm':'fresh',errors:[],events:[]};result.samples.push(sample);let app,pid,known=[];const launchStart=performance.now();
 try{
  const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath:electronPath,args:[...(executableArg?[]:[join(root,'apps/desktop')]),'--user-data-dir='+profile],cwd:root,env,timeout:60000});pid=app.process().pid;sample.pid=pid;sample.isPackaged=await app.evaluate(({app})=>app.isPackaged);if(sample.isPackaged!==Boolean(executableArg))throw new Error('Packaged state differs from requested launch mode');
  const page=await app.firstWindow();page.on('pageerror',e=>sample.errors.push({source:'page',message:e.message}));page.on('console',m=>{if(m.type()==='error')sample.errors.push({source:'console',message:m.text()});});
  await page.locator('.composer').waitFor({state:'visible',timeout:60000});await page.waitForFunction(()=>document.querySelectorAll('.thread-row').length===30,null,{timeout:60000});sample.readyMs=performance.now()-launchStart;
  await delay(1000);sample.idle=await snapshot(pid);const cpuStart=performance.now();await delay(2000);sample.idleSecond=await snapshot(pid);sample.idleIntervalMs=performance.now()-cpuStart;if(sample.idle&&sample.idleSecond){const first=new Map(sample.idle.processes.map(p=>[p.pid,p.cpuTimeMs]));const matched=sample.idleSecond.processes.filter(p=>first.has(p.pid));sample.idleCpu={matchedPids:matched.map(p=>p.pid),corePercent:100*matched.reduce((sum,p)=>sum+Math.max(0,p.cpuTimeMs-first.get(p.pid)),0)/sample.idleIntervalMs,note:'Matching PID deltas only; short-lived processes excluded and PID reuse is possible.'};}known=[...new Set([...(sample.idle?.processes?.map(p=>p.pid)||[]),...(sample.idleSecond?.processes?.map(p=>p.pid)||[])])];
  const start=performance.now();await page.locator('.thread-row').filter({hasText:'Benchmark large transcript'}).click();await page.locator('.thread-assistant').filter({hasText:'Benchmark large transcript message 999 deterministic fixture'}).waitFor({timeout:60000});sample.transcriptOpenMs=performance.now()-start;
  sample.active=await snapshot(pid);known=[...new Set([...known,...(sample.active?.processes?.map(p=>p.pid)||[])])];
  sample.terminal=await page.evaluate(async()=>{const thread=(await window.sufficeDesktop.threads()).find(t=>t.title==='Benchmark large transcript');const id='terminal:11111111-1111-4111-8111-111111111111',marker='SUFFICE_MEASURE_MARKER_84721',times={},start=performance.now();let finish,buffer='';const markerPromise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Terminal marker timeout')),20000);finish=window.sufficeDesktop.onTerminalEvent(e=>{if(e.id===id&&e.type==='data'){buffer+=e.data;if(buffer.split(/\r?\n/).some(line=>line.trim()===marker)){clearTimeout(timer);resolve(performance.now()-start);}} });});try{await window.sufficeDesktop.terminalCreate({threadId:thread.id,id,cols:80,rows:24});times.createMs=performance.now()-start;await window.sufficeDesktop.terminalWrite({threadId:thread.id,id,data:`echo SUFFICE_MEASURE_"MARKER_84721"\r`});times.markerMs=await markerPromise;const close=performance.now();await window.sufficeDesktop.terminalClose({threadId:thread.id,id});times.closeMs=performance.now()-close;return times;}finally{finish?.();}});
 }catch(error){sample.errors.push({source:'harness',message:error.stack||String(error)});}finally{
  if(app){const start=performance.now();try{await Promise.race([app.close(),delay(10000).then(()=>{throw new Error('Shutdown exceeded 10 seconds');})]);sample.shutdownMs=performance.now()-start;}catch(error){sample.errors.push({source:'shutdown',message:error.message});try{const child=app.process();const current=await snapshot(pid);const rootProcess=current?.processes?.find(p=>p.pid===pid);if(process.platform==='win32'&&child.pid===pid&&child.exitCode===null&&rootProcess&&/^(electron|suffice)(\.exe)?$/i.test(rootProcess.name)){await exec('taskkill.exe',['/PID',String(pid),'/T','/F'],{timeout:10000});sample.forcedCleanup={pid,verifiedName:rootProcess.name};}else sample.errors.push({source:'cleanup',message:'Forced cleanup skipped: launched root PID could not be verified alive.'});}catch(cleanupError){sample.errors.push({source:'cleanup',message:cleanupError.message});}}}
  await delay(500);if(process.platform==='win32'&&known.length){try{const checks=await Promise.all(known.map(async id=>({pid:id,tree:await snapshot(id)})));sample.cleanup={observedPids:known,remaining:checks.filter(x=>x.tree.processes?.some(p=>p.pid===x.pid)).map(x=>x.pid),note:'PID reuse can cause false positives; descendants first observed after snapshots may be missed'};}catch(error){sample.errors.push({source:'cleanup',message:error.message});}}
  await save();
 }
 if(iteration>=1&&result.samples.slice(-2).every(s=>s.readyMs===undefined)){result.limitations.push('Stopped after two consecutive startup failures.');break;}
}
result.completedAt=new Date().toISOString();await save();
if(result.samples.some(s=>s.errors.length))process.exitCode=1;
