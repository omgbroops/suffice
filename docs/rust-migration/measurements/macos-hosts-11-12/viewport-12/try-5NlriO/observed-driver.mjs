// The observer stays outside both measured GUI jobs. All host and fixture paths are explicit.
import {execFile} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {createReadStream, constants} from 'node:fs';
import {copyFile, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rename, rm, stat, lstat, writeFile} from 'node:fs/promises';
import {homedir, tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const marker = 'Rust host fixture message 999';
const usage = 'node scripts/rust-migration/measure-macos-hosts.mjs --root STAGED_ROOT --electron-app STAGED_Suffice.app --wry RELEASE_HOST --node PINNED_NODE --output NEW_DIRECTORY [--pairs 5]';
let stopping;
const timestamp = () => performance.now();
const digest = data => createHash('sha256').update(data).digest('hex');
const message = error => error?.stack || String(error);
const run = async (program, args) => (await exec(program, args, {timeout: 15000, maxBuffer: 8*1024*1024})).stdout.trim();
const json = async (path, value) => {
  const temp = path + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(value, null, 2)+'\n', {flag:'wx',mode:0o600});
  await rename(temp,path);
};
async function sha(path) {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export function parseOptions(args) {
  const values={};
  for(let i=0;i<args.length;i+=2) {
    const key=args[i];
    if(!['--root','--electron-app','--wry','--node','--output','--pairs'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(values,key))throw Error(usage);
    values[key]=args[i+1];
  }
  for(const key of ['--root','--electron-app','--wry','--node','--output'])if(!values[key])throw Error(usage);
  const pairs=Number(values['--pairs']??5);
  if(!Number.isInteger(pairs)||pairs<5||pairs>20)throw Error('--pairs must be an integer from 5 to 20');
  return {root:resolve(values['--root']),app:resolve(values['--electron-app']),wry:resolve(values['--wry']),node:resolve(values['--node']),out:resolve(values['--output']),pairs};
}
export function sampleOrder(pairs) {
  return Array.from({length:pairs},(_,i)=>(i%2?['wry','electron']:['electron','wry']).map(host=>({pair:i+1,host}))).flat();
}
export function fixtures(project) {
  const time='2026-01-01T00:00:00.000Z';
  const files=new Map();
  for(let i=0;i<30;i++){
    const title=i===0?'Rust host large transcript':`Rust host fixture thread ${String(i).padStart(2,'0')}`;
    const rows=[{type:'session',version:3,id:'fixture-'+i,timestamp:time,cwd:project}];
    let parentId=null;
    for(let n=0;n<(i===0?1000:2);n++){
      const id='m'+n,role=n%2?'assistant':'user';
      const msg={role,content:[{type:'text',text:'Rust host fixture message '+n}],timestamp:1767225600000};
      if(role==='assistant')msg.stopReason='stop';
      rows.push({type:'message',id,parentId,timestamp:time,message:msg});parentId=id;
    }
    rows.push({type:'session_info',id:'name',parentId,timestamp:time,name:title});
    files.set(String(i).padStart(2,'0')+'.jsonl',rows.map(JSON.stringify).join('\n')+'\n');
  }
  return files;
}
async function treeHashes(dir,prefix='') {
  const hashes={};
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
    const key=prefix+entry.name,path=join(dir,entry.name);
    if(entry.isDirectory())Object.assign(hashes,await treeHashes(path,key+'/'));
    else if(entry.isFile())hashes[key]=await sha(path);
    else throw Error('Unexpected nonregular fixture or renderer path: '+key);
  }
  return hashes;
}
// Hash complete shipped/loaded trees including relative symlink targets.
export function runtimeInputs(c) {
  const trees=['node_modules','packages','apps/desktop','apps/desktop-bridge',
    'apps/desktop-rust/owned-process-hook.cjs','apps/desktop-rust/start-bridge.mjs',
    'apps/desktop-rust/src/measure-fixture.js','scripts/rust-migration/session-native-artifact.mjs',
    'package.json','bun.lock'];
  return [['electron',c.app],['host',c.wry],['node',c.node],...trees.map(path=>[path,join(c.root,path)])];
}
export async function fingerprint(paths) {
  const hash=createHash('sha256');
  const covered=new Map(),symbolic=[];
  let files=0,bytes=0,links=0;
  async function walk(path,key) {
    const item=await lstat(path);
    if(!item.isSymbolicLink())covered.set(path,key);
    if(item.isDirectory()) {
      hash.update(JSON.stringify(['dir',key,item.mode&0o777])+'\n');
      for(const child of (await readdir(path)).sort())await walk(join(path,child),key+'/'+child);
    } else if(item.isSymbolicLink()) {
      const target=await realpath(path);
      symbolic.push({key,target});
      hash.update(JSON.stringify(['link',key,await readlink(path)])+'\n');links++;
    } else if(item.isFile()) {
      hash.update(JSON.stringify(['file',key,item.mode&0o777,item.size,await sha(path)])+'\n');
      bytes+=item.size;files++;
    } else throw Error('Unsupported runtime file type: '+path);
  }
  for(const [key,path] of paths){
    if(await realpath(dirname(path))!==dirname(path))throw Error('Runtime input parent is not canonical: '+path);
    await walk(path,key);
  }
  for(const {key,target} of symbolic){
    const targetKey=covered.get(target);
    if(targetKey===undefined)throw Error('Uncovered runtime symlink target: '+key+' -> '+target);
    hash.update(JSON.stringify(['resolved',key,targetKey])+'\n');
  }
  return {sha256:hash.digest('hex'),files,bytes,links};
}
function equalHashes(a,b) {return Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([k,v])=>b[k]===v);}
export function assess(snapshot,pid,expected) {
  const errors=[],{before,after,members,resource,jetsam,rootStart}=snapshot;
  if(before.error||after.error||!before.physicalBytes||!after.physicalBytes)errors.push('missing kernel ledger');
  if(before.tasksStarted!==after.tasksStarted||before.tasksExited!==after.tasksExited)errors.push('membership changed during sample');
  if(members.length!==after.tasksStarted-after.tasksExited)errors.push('kernel and enumerated live member counts differ');
  if(!members.some(row=>row.pid===pid&&row.start===rootStart)||rootStart==='0')errors.push('root identity missing');
  if(expected&&(expected.rootStart!==rootStart||expected.resource!==resource||expected.jetsam!==jetsam))errors.push('root or coalition identity changed');
  if(members.some(r=>r.pid===process.pid))errors.push('observer included in measured coalition');
  for(const r of members)if(r.resource!==resource||r.jetsam!==jetsam||r.error||r.start==='0')errors.push('unresolved ownership or metrics for PID '+r.pid);
  const rssBytes=members.reduce((n,r)=>n+r.rssBytes,0);
  const memberPhysicalBytes=members.reduce((n,r)=>n+r.physicalBytes,0);
  return {errors,rssBytes,memberPhysicalBytes,physicalBytes:after.physicalBytes,cpuTicks:after.cpuTicks,numer:snapshot.numer,denom:snapshot.denom};
}
async function poll(test,timeout,label,cleanup=false) {
  const deadline=timestamp()+timeout;
  while(timestamp()<deadline){if(stopping&&!cleanup)throw Error('Interrupted by '+stopping);const answer=await test();if(answer)return answer;await delay(25);}
  throw Error(label+' timed out after '+timeout+' ms');
}
async function optionalText(path) {try{return await readFile(path,'utf8');}catch(e){if(e.code==='ENOENT')return '';throw e;}}
function plistValue(value) {
  if(Array.isArray(value))return '<array>'+value.map(plistValue).join('')+'</array>';
  if(typeof value==='boolean')return value?'<true/>':'<false/>';
  const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  if(typeof value==='object')return '<dict>'+Object.entries(value).map(([k,v])=>'<key>'+escape(k)+'</key>'+plistValue(v)).join('')+'</dict>';
  return '<string>'+escape(value)+'</string>';
}
async function jobInfo(label) {
  const info=await run('/bin/launchctl',['print',label]);
  const find=re=>re.exec(info)?.[1]??null;
  return {plist:find(/^\tpath = (.+)/m),pid:Number(find(/^\tpid = (\d+)/m))||null,state:find(/^\tstate = (.+)/m),exit:find(/^\tlast exit code = (.+)/m),resource:find(/resource coalition = \{\s+ID = (\d+)/),jetsam:find(/jetsam coalition = \{\s+ID = (\d+)/)};
}

class DevTools {
  constructor(ws){this.ws=ws;this.pending=new Map();this.id=0;}
  static async connect(url){
    const host=new URL(url);
    if(host.protocol!=='ws:'||host.hostname!=='127.0.0.1')throw Error('CDP endpoint is not local');
    const ws=new WebSocket(url),client=new DevTools(ws);
    ws.onmessage=e=>{
      const data=JSON.parse(String(e.data)),waiter=client.pending.get(data.id);
      if(waiter){client.pending.delete(data.id);data.error?waiter.reject(Error(data.error.message)):waiter.resolve(data.result);}
    };
    ws.onclose=()=>{for(const waiter of client.pending.values())waiter.reject(Error('CDP disconnected'));client.pending.clear();};
    await new Promise((res,rej)=>{const timer=setTimeout(()=>{ws.close();rej(Error('CDP connect timeout'));},4000);ws.onopen=()=>{clearTimeout(timer);res();};ws.onerror=()=>{clearTimeout(timer);rej(Error('CDP websocket failed'));};});
    return client;
  }
  call(method,params={},timeout=55000){
    const id=++this.id;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},timeout);
      this.pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  close(){this.ws.close();}
}
async function attachElectron(profile,entry){
  const endpoint=await poll(async()=>{
    const [port,browser]=(await optionalText(join(profile,'DevToolsActivePort'))).trim().split(/\r?\n/);
    if(!/^\d+$/.test(port)||Number(port)>65535||!browser?.startsWith('/devtools/browser/'))return;
    const base='127.0.0.1:'+port;
    const r=await fetch('http://'+base+'/json/list',{signal:AbortSignal.timeout(1500)}).catch(()=>null);
    if(!r?.ok)return;
    const expected=pathToFileURL(entry).href;
    const targets=await r.json(),target=targets.find(t=>t.type==='page'&&t.url===expected);
    if(target&&new URL(target.webSocketDebuggerUrl).host===base)return {page:target.webSocketDebuggerUrl,browser:'ws://'+base+browser};
  },45000,'trusted packaged renderer');
  const page=await DevTools.connect(endpoint.page);
  try{return {page,browser:await DevTools.connect(endpoint.browser)};}catch(e){page.close();throw e;}
}
async function electronPhase(page,source,action){
  const response=await page.call('Runtime.evaluate',{expression:'('+source+')('+JSON.stringify(action)+')',awaitPromise:true,returnByValue:true});
  if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
  return response.result.value;
}
function readHostEvents(stdout,state) {
  let readCount=0;
  return async(action)=>{
    const event=await poll(async()=>{
      const lines=(await optionalText(stdout)).split('\n').slice(0,-1);
      for(;readCount<lines.length;readCount++){
        const parsed=JSON.parse(lines[readCount]);
        state.events.push({...parsed,parentReceiptMs:timestamp()-state.started});
        if((action==='ready'&&parsed.event==='fixture-ready')||(parsed.event==='fixture-phase'&&parsed.action===action)){readCount++;return parsed;}
        if(parsed.ok===false)throw Error(parsed.reason||'Wry fixture failed');
      }
    },55000,'Wry '+action);
    if(event.ok!==true)throw Error(event.reason||'Wry fixture phase failed');
    return event;
  };
}
export function validatePhase(action,r){
  if(!r||typeof r!=='object')throw Error(action+' has no renderer receipt');
  if(action==='ready'&&(r.threadCount!==30||r.width!==1440||r.height!==900||!(r.devicePixelRatio>0)))throw Error('Unexpected readiness/viewport: '+JSON.stringify(r));
  if(action==='select'&&(r.threadCount!==30||r.marker!==marker||!(r.transcriptCharacters>0)))throw Error('Invalid selection receipt: '+JSON.stringify(r));
  if(action==='settings'&&r.marker!=='Configure OpenAI')throw Error('Missing visible provider settings marker');
  if(action==='pty'&&(r.marker!=='SUFFICE_MACOS_PTY_READY'||r.terminalVisible!==true))throw Error('Missing rendered terminal marker');
}
export function observedIdentities(state) {
  const seen=new Map();
  function add(pid,start) {
    if(pid>0)seen.set(pid+':'+start,{pid,start});
  }
  for(const {raw} of state.snapshots){
    add(state.pid,raw.rootStart);
    for(const member of raw.members)add(member.pid,member.start);
  }
  if(state.pid&&![...seen.values()].some(x=>x.pid===state.pid))add(state.pid,'0');
  return [...seen.values()];
}
export function verifyRetirement(seen,rows,expectedUid=process.getuid?.()) {
  const current=new Map(rows.map(row=>[row.pid,row]));
  return seen.map(previous=>{
    const now=current.get(previous.pid);
    let status='unresolved';
    if(now?.error===3)status='exited'; // Darwin ESRCH.
    else if(now?.error===0&&now.uid===expectedUid&&now.start!=='0'&&previous.start!=='0')status=previous.start===now.start?'still-running':'pid-reused';
    return {...previous,currentStart:now?.start??null,error:now?.error??null,status};
  });
}
export function safeToContinue(cleanup) {
  return cleanup.processesRetired===true&&cleanup.storesResolved===true&&cleanup.scratchResolved===true&&cleanup.sharedProjectIntact===true;
}
export async function projectStamp(project) {
  const file=await realpath(project);
  if(file!==project||(await lstat(file)).isDirectory()===false)throw Error('Shared fixture project must be a canonical directory');
  const info=await stat(file,{bigint:true});
  const tree=await fingerprint([['project',file]]);
  return {...tree,device:String(info.dev),inode:String(info.ino)};
}
function unchangedProject(a,b) {
  return a?.sha256===b.sha256&&a.device===b.device&&a.inode===b.inode;
}
async function removeStore(profile,bin){
  const receipt=join(profile,'.webkit-store-v1');
  try{await lstat(receipt);}catch(e){if(e.code==='ENOENT')return {receipt:false};throw e;}
  const meta=await lstat(receipt),directory=await stat(profile,{bigint:true});
  if(!meta.isFile()||meta.uid!==process.getuid()||(meta.mode&0o077)||meta.size<=32||meta.size>8192)throw Error('Unsafe WebKit receipt');
  const bytes=await readFile(receipt);
  if(bytes.readBigUInt64LE(16)!==directory.dev||bytes.readBigUInt64LE(24)!==directory.ino||bytes.subarray(32).toString()!==await realpath(profile))throw Error('WebKit receipt does not bind to this scratch profile');
  const id=bytes.subarray(0,16).toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))throw Error('Invalid WebKit store UUID');
  const store=join(homedir(),'Library','WebKit',basename(bin),'WebsiteDataStore',id);
  let existed=false;
  try{const info=await lstat(store);existed=true;if(!info.isDirectory()||info.uid!==process.getuid()||await realpath(store)!==store)throw Error('Unsafe WebKit store path');await rm(store,{recursive:true});}
  catch(e){if(e.code!=='ENOENT')throw e;}
  return {receipt:true,id,existed,removedOrAbsent:true};
}

async function sample(config,definition,files,expectedFiles,project,expectedProject,accounting,helper){
  const {host,pair}=definition,wry=host==='wry';
  const dir=join(config.out,`${String(pair).padStart(2,'0')}-${host}`);
  await mkdir(dir,{mode:0o700});
  const scratch=await mkdtemp(join(tmpdir(),'suffice-macos-pair-'));
  const home=join(scratch,'home'),profile=join(scratch,'profile'),sessions=join(home,'sessions','fixture');
  const stdout=join(scratch,'stdout.log'),stderr=join(scratch,'stderr.log');
  const state={host,pair,scratch,events:[],phases:{},errors:[],cleanup:{},snapshots:[]};
  const persist=()=>json(join(dir,'receipt.json'),state);
  const label='local.suffice.measure.'+randomUUID(),domain='gui/'+process.getuid(),service=domain+'/'+label;
  let fifo,cdp,owned=false,ownershipUncertain=false,identity,clockStart;
  async function snapshot(phase){
    for(let attempt=1;attempt<=5;attempt++){
      const raw=JSON.parse(await run(accounting,['snapshot',String(state.pid)]));
      const summary=assess(raw,state.pid,identity);
      const record={phase,attempt,observerElapsedMs:timestamp()-clockStart,raw,summary};
      state.snapshots.push(record);
      if(!summary.errors.length){
        if(state.job.resource!==raw.resource||state.job.jetsam!==raw.jetsam)throw Error('launchd and kernel coalition IDs disagree');
        identity??={resource:raw.resource,jetsam:raw.jetsam,rootStart:raw.rootStart};
        return record;
      }
      await delay(80);
    }
    throw Error('Process accounting did not reconcile for '+phase);
  }
  try{
    state.projectBefore=await projectStamp(project);
    if(!unchangedProject(state.projectBefore,expectedProject))throw Error('Shared project changed before this sample');
    await mkdir(sessions,{recursive:true});await mkdir(profile);
    for(const [name,data] of files)await writeFile(join(sessions,name),data,{flag:'wx'});
    state.fixtureBefore=await treeHashes(join(home,'sessions'));
    if(!equalHashes(expectedFiles,state.fixtureBefore))throw Error('Initial fixture mismatch');
    const env={SUFFICE_HOME:home,PI_CODING_AGENT_DIR:home,PI_OFFLINE:'1',SUFFICE_SESSION_BACKEND:wry?'rust':'pi',SUFFICE_START_PROJECT:project,SHELL:'/bin/zsh',ZDOTDIR:scratch,PATH:dirname(config.node)+':/usr/bin:/bin:/usr/sbin:/sbin'};
    const argv=wry?[config.wry,'--root',config.root,'--node',config.node,'--home',home,'--profile',profile,'--measure-fixture']:[config.electron,'--user-data-dir='+profile,'--inspect=127.0.0.1:0','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'];
    const job={Label:label,ProgramArguments:argv,WorkingDirectory:config.root,EnvironmentVariables:env,RunAtLoad:true,ProcessType:'Interactive',StandardOutPath:stdout,StandardErrorPath:stderr};
    if(wry){
      job.StandardInPath=join(scratch,'fixture.input');
      await run('/usr/bin/mkfifo',['-m','600',job.StandardInPath]);
      fifo=await open(job.StandardInPath,constants.O_RDWR|constants.O_NONBLOCK);
    }
    const plist=join(scratch,'job.plist');
    await writeFile(plist,'<?xml version="1.0" encoding="UTF-8"?><plist version="1.0">'+plistValue(job)+'</plist>',{mode:0o600});
    state.jobLabel=label;state.argv=argv;await persist();
    clockStart=timestamp();state.started=clockStart;
    try{
      await run('/bin/launchctl',['bootstrap',domain,plist]);
      owned=true;
    }catch(e){
      // launchctl can time out after the job was registered. The random label
      // and exact scratch plist establish ownership before attempting bootout.
      const status=await jobInfo(service).catch(error=>{if(error.code!==113&&error.code!==3)ownershipUncertain=true;return null;});
      if(status?.plist&&await realpath(status.plist).catch(()=>null)===await realpath(plist)){owned=true;state.job=status;}
      throw e;
    }
    state.job=await poll(async()=>{const j=await jobInfo(service);return j.pid&&j.resource&&j.jetsam?j:null;},5000,'launchd job identity');
    state.pid=state.job.pid;
    const waitHost=readHostEvents(stdout,state);
    if(!wry)cdp=await attachElectron(profile,config.entry);const inspectURL=await poll(async()=>(await optionalText(stderr)).match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[\da-f-]+)/)?.[1],4000,'Node inspector');
const inspector=await DevTools.connect(inspectURL);
async function ev(expr){const out=await inspector.call('Runtime.evaluate',{expression:expr,returnByValue:true});console.log('EV',out.exceptionDetails?.exception?.description??out.result.value);}
const win="process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app/package.json')('electron').BrowserWindow.getAllWindows()[0]";
await ev(`(()=>{const w=${win};return [w.getBounds(),w.getContentBounds(),w.isFullScreen()]})()`);
await ev(`(()=>{const w=${win};w.setContentSize(1440,900,false);return [w.getBounds(),w.getContentBounds()]})()`);
await delay(250);
const measure=async()=> (await cdp.page.call('Runtime.evaluate',{expression:'JSON.stringify({outerHeight,outerWidth,innerHeight,innerWidth,avail:screen.availHeight,y:screenY,screenHeight:screen.height})',returnByValue:true})).result.value;
console.log('content size',await measure());
await ev(`(()=>{const w=${win};w.setBounds({x:30,y:32,width:1440,height:900},false);return [w.getBounds(),w.getContentBounds()]})()`);await delay(100);console.log('set bounds',await measure());
inspector.close();

    let previous,finishStarted;
    for(const action of ['ready','select','settings','pty','finish']){
      const start=action==='ready'?clockStart:timestamp();
      if(action==='finish')finishStarted=start;
      if(wry&&action!=='ready')await fifo.write(JSON.stringify({type:'measure-fixture',action})+'\n');
      const receipt=wry?await waitHost(action):await electronPhase(cdp.page,helper,action);
      const completed=timestamp();
      state.phases[action]={elapsedMs:completed-start,parentElapsedMs:completed-clockStart,receipt};
      validatePhase(action,receipt);
      if(action==='finish')break;
      // Same pause on both hosts, after checking the rendered phase. Three
      // reconciled snapshots show variability; these are not continuous peaks.
      await delay(750);
      for(let index=0;index<3;index++){
        const current=await snapshot(action);
        if(previous){
          const dt=BigInt(current.raw.after.ticks)-BigInt(previous.raw.after.ticks);
          const dc=BigInt(current.raw.after.cpuTicks)-BigInt(previous.raw.after.cpuTicks);
          if(dt<=0n||dc<0n)throw Error('Coalition CPU/clock moved backwards');
          current.interval={previousPhase:previous.phase,wallMs:Number(dt)*current.raw.numer/current.raw.denom/1e6,cpuMs:Number(dc)*current.raw.numer/current.raw.denom/1e6,percentOfOneCore:100*Number(dc)/Number(dt)};
        }
        previous=current;
        if(index<2)await delay(150);
      }
      await persist();
    }
    const observed=new Set(state.snapshots.flatMap(s=>s.raw.members.map(r=>r.name)));
    const missing=wry?['com.apple.WebKit.WebContent','com.apple.WebKit.Networking','com.apple.WebKit.GPU','node'].filter(name=>!observed.has(name)):[...observed].some(name=>name.includes('Renderer'))?[]:['Electron renderer helper'];
    if(missing.length)throw Error('Renderer/helper attribution incomplete: '+missing.join(', '));
    if(cdp)await cdp.browser.call('Browser.close',{},5000).catch(e=>{if(!/disconnected/.test(e.message))throw e;});
    state.exit=await poll(async()=>{const j=await jobInfo(service);return !j.pid&&j.state!=='running'?j:null;},15000,'graceful host exit');
    state.shutdownFromFinishMs=timestamp()-finishStarted;
    if(state.exit.exit!=='0')throw Error('Host exited unsuccessfully: '+JSON.stringify(state.exit));
  }catch(e){state.errors.push({phase:'measurement',message:message(e)});}
  finally{
    cdp?.page.close();cdp?.browser.close();
    if(fifo)await fifo.close().catch(e=>state.errors.push({phase:'fifo',message:message(e)}));
    state.cleanup.processesRetired=!owned&&!ownershipUncertain;
    if(owned){
      try{
        state.job??=await jobInfo(service);
        await run('/bin/launchctl',['bootout',service]);
        state.cleanup.bootedOut=true;
        if(!state.job.resource||!state.job.jetsam)throw Error('Missing coalition IDs for cleanup');
        const seen=observedIdentities(state);
        const pids=[...new Set(seen.map(row=>row.pid))];
        await poll(async()=>{
          const r=JSON.parse(await run(accounting,['members',state.job.resource,state.job.jetsam]));
          state.cleanup.members=r.members;
          state.cleanup.ledger=r.after;
          const rows=[];
          for(let i=0;i<pids.length;i+=128){
            rows.push(...JSON.parse(await run(accounting,['identities',...pids.slice(i,i+128).map(String)])));
          }
          state.cleanup.identities=verifyRetirement(seen,rows);
          const identitiesGone=state.cleanup.identities.every(x=>x.status==='exited'||x.status==='pid-reused');
          return identitiesGone&&r.members.length===0&&(r.after.error===3||(r.after.error===0&&r.after.tasksStarted===r.after.tasksExited));
        },10000,'job/coalition and observed identity cleanup',true);
        state.cleanup.processesRetired=true;
      }catch(e){state.errors.push({phase:'process cleanup',message:message(e)});}
    }
    for(const name of ['stdout.log','stderr.log']){
      try{await copyFile(join(scratch,name),join(dir,name));}
      catch(e){if(e.code!=='ENOENT')state.errors.push({phase:'log retention',message:message(e)});}
    }
    try{
      state.fixtureAfter=await treeHashes(join(home,'sessions'));
      if(!equalHashes(expectedFiles,state.fixtureAfter))throw Error('Saved sessions were created, removed or changed');
    }catch(e){state.errors.push({phase:'session verification',message:message(e)});}
    try{
      state.projectAfter=await projectStamp(project);
      state.cleanup.sharedProjectIntact=unchangedProject(state.projectBefore,expectedProject)&&unchangedProject(state.projectAfter,expectedProject);
      if(!state.cleanup.sharedProjectIntact)throw Error('Shared project changed or was unverifiable');
    }catch(e){state.errors.push({phase:'shared project verification',message:message(e)});}
    state.cleanup.storesResolved=!wry||(!owned&&!ownershipUncertain);
    if(wry&&owned&&state.cleanup.processesRetired){
      try{
        state.cleanup.webkit=await removeStore(profile,config.wry);
        state.cleanup.guestWebkit=await removeStore(join(profile,'guest-browser'),config.wry);
        if(state.phases.ready&&!state.cleanup.webkit.receipt)throw Error('Missing synthetic WK store receipt after renderer readiness');
        state.cleanup.storesResolved=true;
      }catch(e){state.errors.push({phase:'WebKit cleanup',message:message(e)});}
    }
    try{
      if(state.errors.length||!state.cleanup.processesRetired||!state.cleanup.storesResolved){
        state.cleanup.scratchPreserved=true;
      }else{
        await rm(scratch,{recursive:true});state.cleanup.scratchRemoved=true;
      }
      state.cleanup.scratchResolved=true;
    }catch(e){state.errors.push({phase:'scratch cleanup',message:message(e)});}
    state.cleanup.complete=safeToContinue(state.cleanup);
    await persist();
  }
  return state;
}
async function runCampaign(options){
  if(process.platform!=='darwin')throw Error('The coalition observer requires macOS');
  const c={...options};
  for(const key of ['root','app','node','wry'])c[key]=await realpath(c[key]);
  if(!c.app.endsWith('.app')||basename(c.wry)!=='suffice-desktop-rust')throw Error('Expected packaged Electron .app and release suffice-desktop-rust executable');
  await mkdir(c.out,{mode:0o700});c.out=await realpath(c.out);
  const result={schemaVersion:1,createdAt:new Date().toISOString(),scope:'macOS source Wry host versus directly executed packaged Electron; offline synthetic saved session, provider settings and PTY',options:c,pairs:[],errors:[]};
  let project,runtimePaths;
  const stop=signal=>{stopping=signal;};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  try{
    const info=join(c.app,'Contents','Info.plist');
    const plist=JSON.parse(await run('/usr/bin/plutil',['-convert','json','-o','-',info]));
    c.electron=await realpath(join(c.app,'Contents','MacOS',plist.CFBundleExecutable));
    const packageRoot=join(c.app,'Contents','Resources','app');
    const manifest=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
    if(manifest.name!=='suffice-desktop'||manifest.main!=='apps/desktop/electron/main.cjs')throw Error('Expected unpacked packaged Suffice app');
    c.entry=await realpath(join(packageRoot,'apps/desktop/dist/index.html'));
    const installed=await run('/usr/bin/sw_vers',['-productVersion']);
    if(!/^\d+(?:\.\d+)*$/.test(plist.LSMinimumSystemVersion??''))throw Error('Packaged app has no numeric macOS floor');
    result.environment={os:installed,build:await run('/usr/bin/sw_vers',['-buildVersion']),arch:process.arch,node:await run(c.node,['--version']),driverNode:process.version,packagedVersion:manifest.version,minimumMacOS:plist.LSMinimumSystemVersion};
    const osParts=installed.split('.').map(Number),minParts=String(plist.LSMinimumSystemVersion).split('.').map(Number);
    result.environment.meetsPackageOSFloor=[0,1,2].reduce((cmp,i)=>cmp||((osParts[i]||0)-(minParts[i]||0)),0)>=0;
    if(result.environment.node!=='v24.22.2'||process.version!=='v24.22.2')throw Error('Both host and observer require pinned Node 24.22.2');
    const helperPath=join(c.root,'apps/desktop-rust/src/measure-fixture.js'),helper=await readFile(helperPath,'utf8');
    if(!(await readFile(c.wry)).includes(Buffer.from(helper)))throw Error('Wry executable and staged fixture helper do not match');
    const builds={};
    for(const [name,file] of Object.entries({electronExecutable:c.electron,wryExecutable:c.wry,node:c.node,fixtureHelper:helperPath,accountingSource:join(here,'macos-accounting.c'),driver:fileURLToPath(import.meta.url),bridge:join(c.root,'apps/desktop-bridge/main.mjs'),startup:join(c.root,'apps/desktop-rust/start-bridge.mjs'),binding:join(c.root,'apps/desktop-bridge/native',`suffice-session-darwin-${process.arch}.node`)})){
      builds[name]={file,bytes:(await stat(file)).size,sha256:await sha(file)};
    }
    result.artifacts=builds;
    runtimePaths=runtimeInputs(c);
    if(await realpath(join(c.root,'node_modules'))!==join(c.root,'node_modules'))throw Error('Runtime dependencies must be staged in the checkout');
    result.inputFingerprint=await fingerprint(runtimePaths);
    const electronRenderer=await treeHashes(dirname(c.entry)),wryRenderer=await treeHashes(join(c.root,'apps/desktop/dist'));
    await json(join(c.out,'renderers.json'),{electron:electronRenderer,wry:wryRenderer});
    result.sameRenderer=equalHashes(electronRenderer,wryRenderer);
    if(!result.sameRenderer)throw Error('The two staged renderers differ; see renderers.json');
    const accounting=join(c.out,'macos-accounting');
    const flags=['-std=c11','-Wall','-Wextra','-Werror','-O2'];
    await run('/usr/bin/xcrun',['clang',...flags,builds.accountingSource.file,'-o',accounting]);
    result.observer={path:accounting,sha256:await sha(accounting),bytes:(await stat(accounting)).size,flags,
      compiler:await run('/usr/bin/xcrun',['clang','--version']),sdk:await run('/usr/bin/xcrun',['--show-sdk-version']),
      sdkPath:await run('/usr/bin/xcrun',['--show-sdk-path'])};
    project=await realpath(await mkdtemp(join(tmpdir(),'suffice-matched-project-')));
    const expectedProject=await projectStamp(project);
    const files=fixtures(await realpath(project));
    const expected=Object.fromEntries([...files].map(([n,s])=>['fixture/'+n,digest(s)]));
    result.fixture={project,projectStamp:expectedProject,sessionFiles:expected,sessionCount:files.size,largeMessageCount:1000};
    result.method={clock:'external performance.now() from immediately before launchctl bootstrap until observed shared DOM fixture receipt',order:'alternating first host by pair',phases:['ready','select','settings','pty','finish'],accounting:'resource coalition physical footprint, audited summed live RSS, cumulative coalition CPU',scopeLimits:['no OS cache flush','sampled snapshots do not establish continuous peaks','Electron loopback CDP and Wry command/IPC have different delivery overhead','kernel-charged footprint excludes universal services outside the app coalition','source Wry host with external Node/dependencies; no Rust installer size comparison']};
    await json(join(c.out,'campaign.json'),result);
    for(const definition of sampleOrder(c.pairs)){
      if(stopping)throw Error('Interrupted by '+stopping);
      result.preserveProject=true; // A fatal error before the sample receipt must retain its evidence.
      const state=await sample(c,definition,files,expected,project,expectedProject,accounting,helper);
      result.pairs.push({pair:state.pair,host:state.host,receipt:`${String(state.pair).padStart(2,'0')}-${state.host}/receipt.json`,errors:state.errors,resource:state.job?.resource,jetsam:state.job?.jetsam,selectedCharacters:state.phases.select?.receipt.transcriptCharacters,viewport:state.phases.ready?.receipt});
      await json(join(c.out,'campaign.json'),result);
      if(!state.cleanup.complete)throw Error('Cleanup or shared project verification unresolved; stopped before starting another host');
      result.preserveProject=false;
      const pair=result.pairs.filter(s=>s.pair===state.pair);
      if(pair.length===2&&pair.every(s=>s.selectedCharacters)&&pair[0].selectedCharacters!==pair[1].selectedCharacters)result.errors.push('Rendered transcript length differs in pair '+state.pair);
      if(state.job?.resource&&result.pairs.slice(0,-1).some(s=>s.resource===state.job.resource))result.errors.push('Resource coalition reused in pair '+state.pair);
      if(pair.length===2&&pair.every(s=>s.viewport)&&['width','height','devicePixelRatio'].some(k=>pair[0].viewport[k]!==pair[1].viewport[k]))result.errors.push('Viewport or scale mismatch in pair '+state.pair);
    }
  }catch(e){result.errors.push(message(e));}
  finally{
    if(result.observer){
      try{result.observer.finalSha256=await sha(result.observer.path);if(result.observer.finalSha256!==result.observer.sha256)result.errors.push('Compiled observer changed during campaign');}
      catch(e){result.errors.push(message(e));}
    }
    if(result.inputFingerprint){
      try{result.finalInputFingerprint=await fingerprint(runtimePaths);if(result.finalInputFingerprint.sha256!==result.inputFingerprint.sha256)result.errors.push('Measured inputs changed during campaign');}
      catch(e){result.errors.push(message(e));}
    }
    process.off('SIGINT',stop);process.off('SIGTERM',stop);
    if(project&&!result.preserveProject)await rm(project,{recursive:true,force:true}).catch(e=>result.errors.push(message(e)));
    result.completedAt=new Date().toISOString();
    result.complete=result.pairs.length===c.pairs*2&&!result.errors.length&&result.pairs.every(s=>!s.errors.length);
    await json(join(c.out,'campaign.json'),result);
  }
  console.log(JSON.stringify({output:c.out,complete:result.complete,samples:result.pairs.length,errors:result.errors}));
  if(!result.complete)process.exitCode=1;
}
if(import.meta.main)await runCampaign(parseOptions(process.argv.slice(2)));

export { sample };
