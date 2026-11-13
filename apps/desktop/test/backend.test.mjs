import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {gitArgs,HARDEN,createRunner}=require('../electron/git.cjs');
const store=require('../electron/json-store.cjs');
const {createTtlCache}=require('../electron/ttl-cache.cjs');
const {createBusy}=require('../electron/busy.cjs');
const {createKnownPaths}=require('../electron/known-paths.cjs');
const {validate,createAutomations}=require('../electron/automations.cjs');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'suffice-be-'));

test('git runner: hooks and fsmonitor off, root before user args', () => {
  const args=gitArgs('/repo',['log','--','x']);
  assert.deepEqual(args.slice(0,HARDEN.length),HARDEN);
  assert.ok(args.includes('core.fsmonitor=false')&&args.includes('core.hooksPath=/dev/null'));
  assert.deepEqual(args.slice(HARDEN.length),['-C','/repo','log','--','x']);
  assert.throws(()=>gitArgs('',['log']),/No project selected/);
  assert.throws(()=>gitArgs(undefined,['log']),/No project selected/);
});

test('git runner: GIT_DIR and GIT_CONFIG_* never reach the child', async () => {
  const seen=[];
  process.env.GIT_DIR='/elsewhere';process.env.GIT_CONFIG_COUNT='1';process.env.GIT_CONFIG_KEY_0='core.hooksPath';
  try{
    const {git}=createRunner(async(cmd,args,options)=>{seen.push({cmd,args,env:options.env});return {stdout:' out\n'};});
    assert.equal(await git('/repo',['status']),'out');
    assert.equal(seen[0].cmd,'git');
    assert.deepEqual(Object.keys(seen[0].env).filter(k=>k==='GIT_DIR'||k.startsWith('GIT_CONFIG')),[]);
    assert.equal(seen[0].env.GIT_TERMINAL_PROMPT,'0');
  }finally{delete process.env.GIT_DIR;delete process.env.GIT_CONFIG_COUNT;delete process.env.GIT_CONFIG_KEY_0;}
});

test('known paths: projects and thread cwds only, absolute only', () => {
  const k=createKnownPaths({projects:{paths:()=>['/a/proj']},threadCwds:()=>new Set(['/b/thread'])});
  assert.ok(k.isProject('/a/proj')&&k.isProject('/a/proj/'));
  assert.ok(!k.isProject('/b/thread'));
  assert.ok(k.isKnown('/b/thread')&&k.isKnown('/a/proj'));
  for(const bad of ['/etc','/a/proj/../other','relative','',null,undefined,{},['/a/proj']])assert.ok(!k.isKnown(bad),String(bad));
});

test('automations: project must be registered at save and at run', async () => {
  const dir=tmp(),proj=path.join(dir,'p');fs.mkdirSync(proj);
  const body={name:'n',prompt:'p',projectPath:proj,schedule:{kind:'hourly'}};
  assert.throws(()=>validate(body,()=>false),/not in your project list/);
  let registered=true,ran=0;
  const a=createAutomations({file:path.join(dir,'a.json'),run:async()=>{ran++;return {};},isRegistered:()=>registered});
  const item=a.save(body);
  registered=false;
  const result=await a.runNow(item.id);
  assert.equal(result.lastStatus,'error');assert.match(result.lastError,/not in your project list/);
  assert.equal(ran,0);
});

test('json store: corrupt file moves to .bad, writes are atomic and private', () => {
  const dir=tmp(),file=path.join(dir,'sub','s.json');
  assert.deepEqual(store.read(file,[]),[]);
  fs.mkdirSync(path.dirname(file));fs.writeFileSync(file,'{"half":');
  assert.deepEqual(store.read(file,['fallback'],()=>{}),['fallback']);
  assert.equal(fs.existsSync(file),false);
  assert.equal(fs.readFileSync(`${file}.bad`,'utf8'),'{"half":');
  store.write(file,{a:1});
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{a:1});
  assert.equal(fs.statSync(file).mode&0o777,0o600);
  const fresh=path.join(dir,'fresh','s.json');store.write(fresh,{});
  assert.equal(fs.statSync(path.dirname(fresh)).mode&0o077,0);
  assert.deepEqual(fs.readdirSync(path.dirname(file)).filter(n=>n.endsWith('.tmp')),[]);
});

test('json store: a failed write leaves the old file and no tmp', () => {
  const dir=tmp(),file=path.join(dir,'s.json');
  store.write(file,{old:true});
  const circular={};circular.me=circular;
  assert.throws(()=>store.write(file,circular));
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{old:true});
  assert.deepEqual(fs.readdirSync(dir),['s.json']);
});

test('busy: foreground and background both count', () => {
  const b=createBusy();
  assert.equal(b.count(),0);
  const end=b.begin('background');
  assert.equal(b.count(),1);assert.equal(b.count('foreground'),0);
  const end2=b.begin('foreground');
  assert.equal(b.count(),2);
  end();end();assert.equal(b.count(),1);
  end2();assert.equal(b.count(),0);
});

test('worktree-create: busy at start or just before reset is refused', async () => {
  const home=tmp(),repo=tmp();
  process.env.SUFFICE_HOME=home;
  const sh=(...a)=>execFileSync('git',['-C',repo,...a],{stdio:'pipe'});
  sh('init','-q');sh('-c','user.name=t','-c','user.email=t@t','commit','-q','--allow-empty','-m','x');
  const handlers={};
  let busy=false,resets=0;
  const projects={add:async p=>{busy=flip;return {id:'1',name:'w',path:p};},git:async()=>({branch:'b'})};
  let flip=false;
  require('../electron/composer-ipc.cjs').register({handle:(n,f)=>{handlers[n]=f;},projects,request:async a=>{if(a==='reset')resets++;},getProject:()=>repo,setProject:()=>{},isBusy:()=>busy});
  busy=true;
  await assert.rejects(handlers['worktree-create'](),/Stop the current task first/);
  busy=false;flip=true;
  await assert.rejects(handlers['worktree-create'](),/Stop the current task first/);
  assert.equal(resets,0);
  flip=false;busy=false;
  const made=await handlers['worktree-create']();
  assert.equal(resets,1);assert.ok(made.path.startsWith(fs.realpathSync(home)));
  delete process.env.SUFFICE_HOME;
});

test('ttl cache: hit inside ttl, reload after, failures not kept, concurrent callers share', async () => {
  let t=0,loads=0;
  const c=createTtlCache({ttl:100,now:()=>t});
  const load=async()=>++loads;
  assert.deepEqual(await Promise.all([c.get('k',load),c.get('k',load)]),[1,1]);
  t=99;assert.equal(await c.get('k',load),1);
  t=100;assert.equal(await c.get('k',load),2);
  assert.equal(await c.get('other',load),3);
  await assert.rejects(c.get('bad',async()=>{throw new Error('no');}));
  assert.equal(await c.get('bad',async()=>'ok'),'ok');
});

test('a hostile repo filter does not run through the git runner',async()=>{
 const dir=tmp(),repo=path.join(dir,'r'),flag=path.join(dir,'PWNED');
 const g=(...a)=>execFileSync('git',['-C',repo,...a]);
 fs.mkdirSync(repo);g('init','-q');g('config','user.email','t@t');g('config','user.name','t');
 fs.writeFileSync(path.join(repo,'f'),'a\n');g('add','f');g('commit','-qm','a');
 fs.writeFileSync(path.join(repo,'.gitattributes'),'* filter=x diff=x\n');
 g('config','filter.x.clean',`sh -c 'touch "${flag}"; cat'`);g('config','diff.x.textconv',`sh -c 'touch "${flag}"; cat "$0"'`);
 fs.writeFileSync(path.join(repo,'f'),'b\n');
 const {git}=createRunner();
 await git(repo,['status','--porcelain']);await git(repo,['diff','--no-ext-diff','--','f']);
 assert.equal(fs.existsSync(flag),false);
});
