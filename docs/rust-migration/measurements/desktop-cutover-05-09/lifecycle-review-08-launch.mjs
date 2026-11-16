import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const binary=resolve(process.argv[2]), root=process.cwd();
const scratch=await realpath(await mkdtemp(join(tmpdir(),'suffice-instance-review-')));
const home=join(scratch,'home'), profile=join(scratch,'profile'), project=join(scratch,'empty-project'), group=join(home,'sessions','group');
const running=new Set(), observed=[], iso='2026-01-01T00:00:00.000Z';
async function until(predicate,timeout=15000){
 const end=Date.now()+timeout;
 while(Date.now()<end){if(await predicate())return;await delay(40);}
 throw Error('deadline waiting on scratch host');
}
async function seed(){
 await mkdir(group,{recursive:true});await mkdir(project);
 for(let i=0;i<30;i++){
  const entries=[{type:'session',version:3,id:'t'+i,timestamp:iso,cwd:project}];let parent=null;
  for(let n=0;n<(i?2:1000);n++){const id='m'+n;entries.push({type:'message',id,parentId:parent,timestamp:iso,message:{role:n%2?'assistant':'user',content:[{type:'text',text:'Rust host fixture message '+n}],timestamp:n}});parent=id;}
  entries.push({type:'session_info',id:'title',parentId:parent,timestamp:iso,name:i?'Rust host fixture thread '+i:'Rust host large transcript'});
  await writeFile(join(group,'f'+i+'.jsonl'),entries.map(JSON.stringify).join('\n')+'\n');
 }
}
function start(){
 const env={...process.env,PI_OFFLINE:'1'}; delete env.SUFFICE_START_PROJECT; delete env.SUFFICE_PROFILE_ROOT;
 const p=spawn(binary,['--root',root,'--node',process.execPath,'--home',home,'--profile',profile,'--smoke','--smoke-pause'],{env,stdio:['pipe','pipe','pipe']});
 running.add(p);p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');let out='',err='';
 p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
 p.on('exit',()=>running.delete(p));
 const state={p,exit:once(p,'exit'),out:()=>out,err:()=>err};observed.push(state);return state;
}
try{
 await seed();
 const owner=start(),endpoint=join(profile,'instance.json');
 await until(()=>owner.out().includes('"event":"ui-ready"'));
 const initial=await readFile(endpoint);assert.equal((await stat(endpoint)).mode&0o777,0o600);
 const secondary=start();await until(()=>secondary.p.exitCode!==null);const [code]=await secondary.exit;
 assert.equal(code,0,secondary.err());assert.ok(!secondary.out().includes('engine-ready'));assert.ok(owner.p.exitCode===null);assert.deepEqual(await readFile(endpoint),initial);
 console.log('PASS second OS process exited zero without a bridge while original owner remained active; receipt unchanged and 0600');
 owner.p.kill('SIGKILL');await owner.exit;
 const old=await readFile(endpoint);
 const replacement=start();
 await until(()=>replacement.out().includes('"event":"ui-ready"'));
 assert.notDeepEqual(await readFile(endpoint),old);
 console.log('PASS replacement acquired the abandoned kernel lock, replaced the stale receipt and rendered 30 synthetic threads');
 replacement.p.stdin.write('{"type":"measure-select"}\n');
 await until(()=>replacement.p.exitCode!==null,30000);
 const [clean]=await replacement.exit;assert.equal(clean,0,replacement.err());assert.match(replacement.out(),/"event":"smoke".*"ok":true/);
 await assert.rejects(stat(endpoint),{code:'ENOENT'});
 console.log('PASS replacement rendered final message and exited zero with endpoint removed');
}catch(error){for(const child of observed){console.error('Host diagnostics',child.p.pid,child.p.exitCode,child.p.signalCode,child.out().slice(-1400),child.err().slice(-1400));}throw error;}finally{for(const p of running)p.kill('SIGKILL');await delay(250);await rm(scratch,{force:true,recursive:true});}
