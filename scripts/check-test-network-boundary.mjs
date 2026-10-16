// Local-only diagnostic of the existing Node test runner's permission boundary.
// No remote hosts, credentials, inference or changes to frozen test infrastructure.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const server=http.createServer((_req,res)=>res.end('local-permission-probe'));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const code=`fetch(${JSON.stringify(url)}).then(r=>r.text()).then(t=>console.log(JSON.stringify({networkSucceeded:t==='local-permission-probe'}))).catch(e=>console.log(JSON.stringify({networkSucceeded:false,code:e.cause?.code??e.code})))`;
const child=spawn(process.execPath,['--permission','-e',code],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
const timer=setTimeout(()=>child.kill(),5000);
const exitCode=await new Promise(r=>child.once('close',r));clearTimeout(timer);
await new Promise(r=>server.close(r));
let observed;try{observed=JSON.parse(stdout.trim());}catch{observed={parseFailed:true};}
const result={at:new Date().toISOString(),node:process.version,flags:['--permission'],target:'ephemeral loopback-only HTTP server',exitCode,observed,stderr,remoteTraffic:false,modelCalls:0,scope:'Filesystem permissions alone do not establish network isolation. This probe does not establish whether any benchmark actor actually used networking; inspect saved programs separately.'};
await writeFile(resolve(import.meta.dirname,'../reports/evidence-network-boundary.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
