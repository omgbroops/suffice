import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
test('real desktop handlers open a saved session and use the terminal', {timeout:45000},async()=>{
 const scratch=await mkdtemp(path.join(tmpdir(),'suffice-bridge-')),home=path.join(scratch,'home'),profile=path.join(scratch,'profile'),project=path.join(scratch,'project'),dir=path.join(home,'sessions','fixture');await mkdir(dir,{recursive:true});await mkdir(project);
 const file=path.join(dir,'fixture.jsonl'),timestamp=new Date().toISOString(),source=[{type:'session',version:3,id:'fixture',timestamp,cwd:project},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Bridge fixture'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n';await writeFile(file,source);
 const child=spawn(process.execPath,[path.join(root,'apps/desktop-bridge/main.mjs'),'--root',root,'--profile',profile],{env:{...process.env,SUFFICE_HOME:home,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1'},stdio:['pipe','pipe','pipe']});
 let stderr='',seq=0,readyResolve,readyReject;const ready=new Promise((a,b)=>{readyResolve=a;readyReject=b}),pending=new Map(),events=[];child.stderr.on('data',s=>stderr+=s);child.on('exit',code=>{readyReject(new Error(`Bridge exited ${code}: ${stderr}`));for(const p of pending.values())p.reject(new Error(`Bridge exited ${code}: ${stderr}`));});
 createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{assert.fail(`Non-protocol stdout: ${line}`);}if(m.type==='ready')readyResolve();else if(m.type==='native')child.stdin.write(JSON.stringify({type:'native-reply',id:m.id,ok:false,error:'Unavailable in test'})+'\n');else if(m.type==='reply'){const p=pending.get(m.id);if(p){pending.delete(m.id);m.ok?p.resolve(m.result):p.reject(new Error(m.error));}}else if(m.type==='event')events.push(m);});
 const invoke=(name,...args)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({type:'invoke',id,channel:'suffice:'+name,args})+'\n');});
 try{await ready;assert.ok(await invoke('preferences'));await assert.rejects(invoke('window','minimize'),/Unavailable in test/);await assert.rejects(invoke('clipboard-files'),/unavailable in this host/);const threads=await invoke('threads');assert.equal(threads.length,1);const thread=await invoke('thread',threads[0].id);assert.match(JSON.stringify(thread),/Bridge fixture/);assert.equal(await readFile(file,'utf8'),source);
 const id='terminal:'+randomUUID(),threadId=threads[0].id;await invoke('terminal-create',{threadId,id,cols:80,rows:24});await invoke('terminal-write',{threadId,id,data:'echo bridge_terminal_marker\r'});const deadline=Date.now()+10000;while(Date.now()<deadline&&!events.some(e=>e.channel==='suffice:terminal-event'&&JSON.stringify(e.args).includes('bridge_terminal_marker')))await new Promise(r=>setTimeout(r,50));assert.ok(events.some(e=>e.channel==='suffice:terminal-event'&&JSON.stringify(e.args).includes('bridge_terminal_marker')),'terminal output');await invoke('terminal-close',{threadId,id});child.stdin.write('{"type":"shutdown"}\n');await new Promise((resolve,reject)=>{child.once('exit',code=>code===0?resolve():reject(new Error(`Exit ${code}: ${stderr}`)));});
 }finally{if(child.exitCode===null)child.kill();await rm(scratch,{recursive:true,force:true,maxRetries:20,retryDelay:250});}
});
