import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=await mkdtemp(join(tmpdir(),'suffice-native-fixture-'));
const sessions=join(root,'home','sessions','fixture'), project=join(root,'project');
await mkdir(sessions,{recursive:true}); await mkdir(project,{recursive:true});
const title='Benchmark large transcript', timestamp='2026-01-01T00:00:00.000Z';
const entries=[{type:'session',version:3,id:'fixture',timestamp,cwd:project}];
for(let n=0;n<1000;n++) entries.push({type:'message',id:`m${n}`,parentId:n?`m${n-1}`:null,timestamp,message:{role:n%2?'assistant':'user',content:[{type:'text',text:`${title} message ${n} deterministic fixture`}],timestamp:1767225600000}});
entries.push({type:'session_info',id:'name',parentId:'m999',timestamp,name:title});
const file=join(sessions,'fixture.jsonl'); await writeFile(file,entries.map(JSON.stringify).join('\n')+'\n');
const hash=b=>createHash('sha256').update(b).digest('hex'); const before=hash(await readFile(file));
try {
 const exe=resolve('apps/desktop-native/target/release/suffice-desktop-native.exe');
 const child=spawn(exe,['--home',join(root,'home'),'--project',project,'--smoke','--hold-seconds','2'],{stdio:['ignore','pipe','pipe']});
 let out='',err=''; child.stdout.on('data',x=>out+=x); child.stderr.on('data',x=>err+=x);
 const timer=setTimeout(()=>child.kill(),60000); const code=await new Promise((res,rej)=>{child.on('error',rej);child.on('exit',res)});clearTimeout(timer);
 assert.equal(code,0,err); const events=out.trim().split('\n').map(JSON.parse);
 assert(events.some(e=>e.event==='ready' && e.sessions===1)); assert(events.some(e=>e.event==='selection' && e.messages===1000 && e.marker_found && e.layout_completed)); assert(events.some(e=>e.event==='shutdown' && e.ok)); assert.equal(hash(await readFile(file)),before);
 console.log(JSON.stringify({ok:true,events,fixtureUnchanged:true}));
} finally {await rm(root,{recursive:true,force:true});}
