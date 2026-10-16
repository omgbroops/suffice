import {mkdir,writeFile} from 'node:fs/promises';
const d='.suffice/field/private';await mkdir(d,{recursive:true});
await writeFile(d+'/h02.test.mjs',`import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {default:fetch}=await import(pathToFileURL(resolve(process.env.SUFFICE_WORKSPACE,'src/index.js')));
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r));
const close=s=>new Promise(r=>s.close(r));
test('consumed keepalive responses do not accumulate retained socket listeners',async()=>{
 const server=http.createServer((req,res)=>res.end('payload:'+req.url));await listen(server);
 const agent=new http.Agent({keepAlive:true,maxSockets:1,maxFreeSockets:1});
 const snapshots=[];const sockets=new Set();
 try{for(let i=0;i<24;i++){
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/'+i,{agent});
  assert.equal(await r.text(),'payload:/'+i);await new Promise(setImmediate);
  const sock=Object.values(agent.freeSockets).flat()[0];assert.ok(sock,'socket retained for reuse');
  sockets.add(sock);snapshots.push({data:sock.listenerCount('data'),close:sock.listenerCount('close')});
 }
 console.log(JSON.stringify({socketCount:sockets.size,snapshots}));
 assert.equal(sockets.size,1,'the reproduction must actually reuse a socket');
 for(const event of ['data','close'])assert.ok(snapshots.at(-1)[event]<=snapshots[2][event]+1,'retained '+event+' listeners grow with requests');
 }finally{agent.destroy();await close(server);}
});
test('premature chunked response still rejects instead of accepting incomplete content',async()=>{
 const server=net.createServer(socket=>socket.once('data',()=>socket.end('HTTP/1.1 200 OK\\r\\nTransfer-Encoding: chunked\\r\\nConnection: close\\r\\n\\r\\n5\\r\\nhello\\r\\n')));
 await listen(server);
 try{await assert.rejects(async()=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/');await r.text();});}
 finally{await close(server);}
});
test('aborted streamed response still rejects and releases resources',async()=>{
 const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.write('partial');});
 await listen(server);const agent=new http.Agent({keepAlive:true});const c=new AbortController();
 try{const r=await fetch('http://127.0.0.1:'+server.address().port+'/',{agent,signal:c.signal});const body=r.text();c.abort();await assert.rejects(body);}
 finally{agent.destroy();server.closeAllConnections();await close(server);}
});
`);
await writeFile(d+'/l01-check.cjs',`const fs=require('node:fs'),path=require('node:path');
const root=process.env.SUFFICE_WORKSPACE;
const ts=require(path.join(root,'node_modules/typescript'));
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:false}}).outputText,f);
const Semaphore=require(path.join(root,'src/Semaphore.ts')).default;
const assert=require('node:assert/strict');
const tick=()=>new Promise(setImmediate);
const deadline=setTimeout(()=>{console.error('Incomplete behavioral verification');process.exit(2)},8000);
(async()=>{
 const huge=2147483628;
 const empty=new Semaphore(huge);const [before,unlock]=await empty.acquire();
 assert.equal(before,huge);assert.equal(empty.getValue(),huge-1);unlock();assert.equal(empty.getValue(),huge);
 const s=new Semaphore(0);const events=[];
 const a=s.waitForUnlock(1).then(()=>events.push('small'));
 const b=s.waitForUnlock(huge).then(()=>events.push('large'));
 const start=performance.now();s.setValue(huge);await Promise.all([a,b]);
 assert.deepEqual(events.slice().sort(),['large','small']);assert.equal(s.getValue(),huge);
 const elapsed=performance.now()-start;
 // A queued high-priority acquisition blocks same/lower-priority observers,
 // while eligible higher-priority waiters must be notified without consuming.
 const q=new Semaphore(0);const observations=[];
 const acquire=q.acquire(huge+1,10).then(([value,release])=>{assert.equal(value,huge+1);observations.push('acquire');return release;});
 const hi=q.waitForUnlock(huge,11).then(()=>observations.push('hi'));
 const lo=q.waitForUnlock(1,9).then(()=>observations.push('lo'));
 q.setValue(huge);await hi;await tick();assert.deepEqual(observations,['hi']);assert.equal(q.getValue(),huge);
 q.release();const release=await acquire;await tick();assert.deepEqual(observations,['hi','acquire']);release();await lo;
 assert.deepEqual(observations,['hi','acquire','lo']);
 assert.equal(q.getValue(),huge+1);
 console.log(JSON.stringify({accepted:true,largeCapacity:huge,firstDispatchMs:elapsed,events,observations}));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>clearTimeout(deadline));
`);
