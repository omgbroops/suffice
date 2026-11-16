import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';

const binary=process.env.SUFFICE_BROWSER_PROFILE_FIXTURE;
test('WK root and guest keep separate cookies and storage across process restarts for two profiles',{skip:!(process.platform==='darwin'&&binary),timeout:65000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'suffice-wk-store-'));
 const rows=new Map();
 const server=createServer((req,res)=>{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/result'){rows.set(url.searchParams.get('key'),[url.searchParams.get('local'),url.searchParams.get('cookie')]);res.end('ok');return;}
   if(!['/root','/guest'].includes(url.pathname)){res.writeHead(404);res.end();return;}
   const run=url.searchParams.get('run'),key=run+url.pathname,scope=run[0]+url.pathname;
   res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');
   res.end(`<script>
    const prior=localStorage.getItem('marker')||'';
    const cookie=document.cookie.replace(/^marker=/,'');
    localStorage.setItem('marker',${JSON.stringify(scope)});
    document.cookie='marker='+${JSON.stringify(scope)}+'; Max-Age=600; Path=/';
    fetch('/result?'+new URLSearchParams({key:${JSON.stringify(key)},local:prior,cookie}));
   </script>`);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 async function launch(args,run){
   const child=spawn(binary,args,{stdio:['pipe','ignore','pipe']});let errors='';child.stderr.on('data',s=>errors+=s);
   const exit=new Promise((r,j)=>{child.once('exit',(code,signal)=>r({code,signal}));child.once('error',j);});
   try{
     if(run){const end=Date.now()+10000;while(child.exitCode===null&&Date.now()<end&&(!rows.has(run+'/root')||!rows.has(run+'/guest')))await delay(40);
       assert.ok(rows.has(run+'/root')&&rows.has(run+'/guest'),'missing browser receipts '+run+' '+errors);child.stdin.end('close\n');}
     const outcome=await exit;assert.equal(outcome.code,0,run+' '+outcome.signal+' '+errors);
   }finally{if(child.exitCode===null)child.kill('SIGKILL');}
 }
 const touched=new Set();
 try{
   for(const run of ['a1','b1','a2','b2']) {
     const profile=join(dir,run[0]);touched.add(profile);await launch(['open',profile,origin,run],run);
     for(const surface of ['/root','/guest']){
       const expected=run[1]==='1'?'':run[0]+surface;
       assert.deepEqual(rows.get(run+surface),[expected,expected],run+surface);
     }
   }
 }finally{
   try{for(const path of touched)await launch(['remove',path]);}
   finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
 }
});
