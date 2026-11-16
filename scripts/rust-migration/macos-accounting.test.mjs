import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {mkdir,mkdtemp,realpath,rm,symlink,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {assess,fingerprint,fixtures,observedIdentities,projectStamp,runtimeInputs,safeToContinue,verifyRetirement,parseOptions,sampleOrder,validatePhase} from './measure-macos-hosts.mjs';

test('requires independent outputs and at least five alternating pairs',()=>{
  const args=['--root','root','--electron-app','App.app','--wry','host','--node','node','--output','new'];
  assert.equal(parseOptions(args).pairs,5);
  assert.throws(()=>parseOptions([...args,'--pairs','4']));
  assert.throws(()=>parseOptions([...args,'--output','other']));
  assert.deepEqual(sampleOrder(2),[{host:'electron',pair:1},{host:'wry',pair:1},{host:'wry',pair:2},{host:'electron',pair:2}]);
});

test('fixed real renderer workload has 30 sessions, selected marker and one shared project',()=>{
  const files=fixtures('/example');
  assert.equal(files.size,30);
  const first=files.get('00.jsonl').trim().split('\n').map(JSON.parse);
  assert.equal(first[0].cwd,'/example');
  assert.equal(first.filter(e=>e.type==='message').length,1000);
  assert.equal(first.at(-2).message.content[0].text,'Rust host fixture message 999');
  assert.throws(()=>validatePhase('select',{threadCount:29,transcriptCharacters:10,marker:'wrong'}));
  assert.throws(()=>validatePhase('pty',{marker:'SUFFICE_MACOS_PTY_READY',terminalVisible:false}));
});

test('rejects churn, missing/foreign members, and a reused root PID',()=>{
  const raw={numer:125,denom:3,rootStart:'11',resource:'50',jetsam:'51',before:{error:0,physicalBytes:400,tasksStarted:2,tasksExited:0},after:{error:0,physicalBytes:402,tasksStarted:2,tasksExited:0,cpuTicks:'123'},members:[{pid:4,ppid:1,start:'11',resource:'50',jetsam:'51',error:0,rssBytes:20,physicalBytes:100},{pid:8,ppid:1,start:'12',resource:'50',jetsam:'51',error:0,rssBytes:25,physicalBytes:300}]};
  assert.deepEqual(assess(raw,4).errors,[]);
  assert.equal(assess(raw,4).rssBytes,45);
  assert.equal(assess(raw,4).physicalBytes,402);
  assert.ok(assess(raw,4,{resource:'50',jetsam:'51',rootStart:'10'}).errors.length);
  for(const alter of [r=>r.members.pop(),r=>r.members[1].resource='62',r=>r.members[1].error=1,r=>r.before.tasksExited++,r=>r.after.error=1]){
    const r=structuredClone(raw);alter(r);assert.ok(assess(r,4).errors.length);
  }
});

test('a disposable GUI-domain job has independently reconcilable coalition attribution',{
  skip:process.platform!=='darwin'||process.env.SUFFICE_MACOS_ACCOUNTING_TEST!=='1',timeout:25000
},async()=>{
  const exec=promisify(execFile),dir=await mkdtemp(join(tmpdir(),'suffice-coalition-method-'));
  const observer=join(dir,'account'),job=join(dir,'job.plist'),label='local.suffice.method.'+randomUUID(),domain='gui/'+process.getuid();
  let registered=false;
  try{
    await exec('/usr/bin/xcrun',['clang','-std=c11','-Wall','-Wextra','-Werror','-O2',fileURLToPath(new URL('./macos-accounting.c',import.meta.url)),'-o',observer]);
    await writeFile(job,`<?xml version="1.0"?><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>/bin/sleep</string><string>15</string></array><key>RunAtLoad</key><true/><key>ProcessType</key><string>Interactive</string></dict></plist>`);
    await exec('/bin/launchctl',['bootstrap',domain,job]);registered=true;
    let first;
    const end=Date.now()+6000;
    while(Date.now()<end&&!first){
      const {stdout}=await exec('/bin/launchctl',['print',domain+'/'+label]);
      const pid=Number(/^\tpid = (\d+)/m.exec(stdout)?.[1]);
      if(pid){
        try{const raw=JSON.parse((await exec(observer,['snapshot',String(pid)])).stdout);
          if(!assess(raw,pid).errors.length&&raw.members.some(r=>r.name==='sleep'))first=raw;
        }catch{}
      }
      if(!first)await delay(50);
    }
    assert.ok(first,'missing stable sleep process accounting');
    assert.ok(first.members.every(r=>r.resource===first.resource&&r.jetsam===first.jetsam&&r.rssBytes>0));
    const owner=first.members.find(row=>row.name==='sleep');
    const readIdentity=async(...pids)=>JSON.parse((await exec(observer,['identities',...pids])).stdout);
    const observed=await readIdentity(String(owner.pid));
    assert.deepEqual(observed,[{pid:owner.pid,start:owner.start,error:0,uid:process.getuid()}]);
    const missing=await readIdentity('2147483647');
    assert.equal(missing[0].error,3);
    assert.equal(missing[0].uid,null);
    await assert.rejects(exec(observer,['identities','0']));
    await assert.rejects(exec(observer,['identities','-1']));
    await assert.rejects(exec(observer,['identities','4294967297']));
    await exec('/bin/launchctl',['bootout',domain+'/'+label]);registered=false;
    let rows;
    for(let i=0;i<40;i++){rows=JSON.parse((await exec(observer,['members',first.resource,first.jetsam])).stdout);if(!rows.members.length)break;await delay(25);}
    assert.deepEqual(rows.members,[]);
    const old=verifyRetirement([{pid:owner.pid,start:owner.start}],await readIdentity(String(owner.pid)));
    assert.ok(['exited','pid-reused'].includes(old[0].status));
  }finally{
    if(registered)await exec('/bin/launchctl',['bootout',domain+'/'+label]).catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
});

test('runtime fingerprint covers complete desktop imports and binds workspace symlinks to hashed contents',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'suffice-input-coverage-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const desktop=join(root,'apps/desktop'),modules=join(root,'node_modules');
  await mkdir(join(desktop,'src/backgrounds'),{recursive:true});
  await mkdir(join(modules,'@suffice'),{recursive:true});
  const inputs=runtimeInputs({root,app:'/unused/app',wry:'/unused/host',node:'/unused/node'})
    .filter(([key])=>key==='apps/desktop'||key==='node_modules');
  const settings=join(desktop,'src/settings-data.js'),presets=join(desktop,'src/backgrounds/presets.js');
  await writeFile(settings,'settings v1');await writeFile(presets,'presets v1');
  await symlink('../../apps/desktop',join(modules,'@suffice/desktop'));
  const first=await fingerprint(inputs);
  await writeFile(settings,'settings v2');
  const second=await fingerprint(inputs);
  assert.notEqual(first.sha256,second.sha256,'directly imported settings source changed');
  await writeFile(join(modules,'@suffice/desktop/src/backgrounds/presets.js'),'presets v2');
  assert.notEqual((await fingerprint(inputs)).sha256,second.sha256,'workspace link target contents changed');
  const outside=join(root,'unmeasured-file');await writeFile(outside,'mutable');
  await symlink(outside,join(modules,'unmeasured'));
  await assert.rejects(fingerprint(inputs),/Uncovered runtime symlink target/);
  await rm(outside);
  await assert.rejects(fingerprint(inputs),{code:'ENOENT'});
});

test('retirement audit includes foreign members from rejected snapshots and requires positive identity evidence',()=>{
  const seen=observedIdentities({pid:10,snapshots:[
    {summary:{errors:['foreign member']},raw:{rootStart:'100',members:[{pid:10,start:'100'},{pid:20,start:'200'},{pid:30,start:'0'}]}},
    {summary:{errors:[]},raw:{rootStart:'100',members:[{pid:10,start:'100'}]}}
  ]});
  assert.deepEqual(seen,[{pid:10,start:'100'},{pid:20,start:'200'},{pid:30,start:'0'}]);
  const uid=process.getuid?.()??0;
  const retired=verifyRetirement(seen,[{pid:10,error:3},{pid:20,start:'200',uid,error:0},{pid:30,start:'300',uid,error:0}],uid);
  assert.deepEqual(retired.map(r=>r.status),['exited','still-running','unresolved']);
  const after=verifyRetirement(seen,[{pid:10,error:3},{pid:20,start:'250',uid,error:0},{pid:30,error:3}],uid);
  assert.deepEqual(after.map(r=>r.status),['exited','pid-reused','exited']);
  assert.deepEqual(verifyRetirement(seen,[{pid:10,error:1}]).map(r=>r.status),['unresolved','unresolved','unresolved']);
  const clean={processesRetired:true,storesResolved:true,scratchResolved:true,sharedProjectIntact:true};
  assert.equal(safeToContinue(clean),true);
  for(const field of Object.keys(clean))assert.equal(safeToContinue({...clean,[field]:false}),false);
});

test('empty directories, created files and changed bytes invalidate the shared fixture project',async t=>{
  const project=await realpath(await mkdtemp(join(tmpdir(),'suffice-project-stamp-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const before=await projectStamp(project);
  await mkdir(join(project,'created'));
  assert.notEqual((await projectStamp(project)).sha256,before.sha256);
  await rm(join(project,'created'),{recursive:true});
  assert.equal((await projectStamp(project)).sha256,before.sha256);
  const file=join(project,'file');await writeFile(file,'v1');
  const first=await projectStamp(project);
  assert.notEqual(first.sha256,before.sha256);
  await writeFile(file,'v2');
  assert.notEqual((await projectStamp(project)).sha256,first.sha256);
});
