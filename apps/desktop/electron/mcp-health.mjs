import {spawn} from 'node:child_process';
// Minimal MCP client: initialize, then tools/list. Covers stdio (newline JSON) and streamable HTTP.
const PROTOCOL='2025-06-18',CLIENT={name:'suffice-health',version:'1'};
export const estimateTokens=tools=>Math.ceil(JSON.stringify(tools.map(t=>({name:t.name,description:t.description||'',input_schema:t.inputSchema||t.parameters||{}}))).length/4);// shortcut: chars/4, swap for a tokenizer when the backend ships one
const rpc=(id,method,params)=>({jsonrpc:'2.0',id,method,params});
async function listStdio(config,{cwd,track,timeout}){
 const child=spawn(config.command,config.args||[],{cwd,env:{...process.env,...config.env},stdio:['pipe','pipe','pipe'],windowsHide:true});track?.(child);
 let buffer='',stderr='',timedOut=false;const waiting=new Map();
 const done=new Promise((_,reject)=>{child.once('error',e=>reject(new Error(e.code==='ENOENT'?'Command not found: '+config.command:e.message)));child.once('exit',code=>reject(new Error(timedOut?'Timed out':'Server exited'+(code!==null?' with code '+code:'')+(stderr.trim()?': '+stderr.trim().split('\n').pop().slice(0,200):''))));});
 done.catch(()=>{});
 child.stderr.on('data',c=>{stderr=(stderr+c).slice(-4000);});
 child.stdout.on('data',c=>{buffer+=c;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);if(!line)continue;let m;try{m=JSON.parse(line);}catch{continue;}if(m.id!==undefined&&waiting.has(m.id)){const [ok,fail]=waiting.get(m.id);waiting.delete(m.id);m.error?fail(new Error(m.error.message||'Server error')):ok(m.result);}}});
 const call=(id,method,params)=>Promise.race([new Promise((ok,fail)=>{waiting.set(id,[ok,fail]);child.stdin.write(JSON.stringify(rpc(id,method,params))+'\n');}),done]);
 const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
 try{
  await call(1,'initialize',{protocolVersion:PROTOCOL,capabilities:{},clientInfo:CLIENT});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const tools=[];let cursor,id=2;do{const r=await call(id++,'tools/list',cursor?{cursor}:{});tools.push(...(r.tools||[]));cursor=r.nextCursor;}while(cursor&&id<12);
  return tools;
 }finally{clearTimeout(timer);child.kill();}
}
async function listHttp(config,{timeout}){
 const signal=AbortSignal.timeout(timeout);let session;
 const post=async(body)=>{
  const res=await fetch(config.url,{method:'POST',signal,headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':PROTOCOL,...config.headers,...(session?{'mcp-session-id':session}:{})},body:JSON.stringify(body)});
  if(res.status===401||res.status===403)throw new Error('Sign in required');
  if(!res.ok)throw new Error('Server answered HTTP '+res.status);
  session=res.headers.get('mcp-session-id')||session;if(body.id===undefined){await res.body?.cancel();return null;}
  const text=await res.text();let m;
  if((res.headers.get('content-type')||'').includes('text/event-stream')){for(const line of text.split('\n'))if(line.startsWith('data:')){try{const x=JSON.parse(line.slice(5));if(x.id===body.id)m=x;}catch{}}}else m=JSON.parse(text);
  if(!m)throw new Error('No answer from server');if(m.error)throw new Error(m.error.message||'Server error');return m.result;
 };
 await post(rpc(1,'initialize',{protocolVersion:PROTOCOL,capabilities:{},clientInfo:CLIENT}));
 await post({jsonrpc:'2.0',method:'notifications/initialized'});
 const tools=[];let cursor,id=2;do{const r=await post(rpc(id++,'tools/list',cursor?{cursor}:{}));tools.push(...(r.tools||[]));cursor=r.nextCursor;}while(cursor&&id<12);
 return tools;
}
export async function checkServer(config,{cwd,track,timeout=15000}={}){
 const started=Date.now();
 try{const tools=await (config.url?listHttp(config,{timeout}):listStdio(config,{cwd,track,timeout}));return {ok:true,tools:tools.map(t=>t.name),tokens:estimateTokens(tools),ms:Date.now()-started,at:Date.now()};}
 catch(e){return {ok:false,error:e.name==='TimeoutError'||e.name==='AbortError'?'Timed out':e.message,tools:[],tokens:0,ms:Date.now()-started,at:Date.now()};}
}
