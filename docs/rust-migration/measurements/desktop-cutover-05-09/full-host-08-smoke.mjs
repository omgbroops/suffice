import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),sandbox=await mkdtemp(join(tmpdir(),'suffice-fullhost-08-')),home=join(sandbox,'home'),profile=join(sandbox,'profile'),project=join(sandbox,'project'),dir=join(home,'sessions','fixture');
await Promise.all([mkdir(dir,{recursive:true}),mkdir(profile),mkdir(project)]);
const iso='2026-01-01T00:00:00.000Z',fixtures=[];
for(let i=0;i<30;i++){
 const entries=[{type:'session',version:3,id:`fixture-${i}`,timestamp:iso,cwd:project}];let parent=null;
 for(let n=0;n<(i===0?1000:2);n++){const id=`m${n}`,role=n%2?'assistant':'user';entries.push({type:'message',id,parentId:parent,timestamp:iso,message:{role,content:[{type:'text',text:`Rust host fixture message ${n}`}],timestamp:1767225600000,...(role==='assistant'?{stopReason:'stop'}:{})}});parent=id;}
 entries.push({type:'session_info',id:'name',parentId:parent,timestamp:iso,name:i===0?'Rust host large transcript':`Rust host fixture thread ${String(i).padStart(2,'0')}`});
 const content=entries.map(JSON.stringify).join('\n')+'\n';fixtures.push(content);await writeFile(join(dir,`${String(i).padStart(2,'0')}.jsonl`),content);
}
const hash=values=>createHash('sha256').update(values.join('')).digest('hex');
const child=spawn(join(root,'apps/desktop-rust/target/release/suffice-desktop-rust'),['--root',root,'--home',home,'--profile',profile,'--node',process.execPath,'--smoke'],{cwd:root,env:{...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home},stdio:['pipe','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',x=>{stdout+=x;process.stdout.write(x)});child.stderr.on('data',x=>{stderr+=x;process.stderr.write(x)});
let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},60000);
const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}))});clearTimeout(timer);
const after=await Promise.all(fixtures.map((_,i)=>readFile(join(dir,`${String(i).padStart(2,'0')}.jsonl`),'utf8')));
const events=stdout.split('\n').flatMap(s=>{try{return [JSON.parse(s)]}catch{return []}});
const result={sandbox,pid:child.pid,exit,timedOut,fixtureBefore:hash(fixtures),fixtureAfter:hash(after),events,stderr,ok:exit.code===0&&!timedOut&&hash(fixtures)===hash(after)&&events.some(e=>e.event==='smoke'&&e.ok)&&events.some(e=>e.event==='shutdown'&&e.ok)};
await writeFile(join(root,'.ci-logs/full-host-08-smoke.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
