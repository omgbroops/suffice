import assert from 'node:assert/strict';
import {fork,spawn} from 'node:child_process';
import {once} from 'node:events';
import {copyFile,cp,mkdtemp,mkdir,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

function isolatedEnv(home){
 const env={SUFFICE_HOME:home,PI_CODING_AGENT_DIR:home,PI_OFFLINE:'1'};
 for(const key of ['PATH','TMPDIR','TEMP','TMP','SystemRoot','COMSPEC','USERPROFILE','LOCALAPPDATA','APPDATA'])if(process.env[key])env[key]=process.env[key];
 return env;
}

function startWorker(t,home,backend){
 const env=isolatedEnv(home);
 if(backend)env.SUFFICE_SESSION_BACKEND=backend;
 const worker=fork(new URL('../../desktop/electron/worker-entry.mjs',import.meta.url),[],{env,execArgv:[],stdio:['ignore','ignore','pipe','ipc']});
 const pending=new Map(),events=[];let n=0,stderr='';
 const exited=once(worker,'exit');
 const stop=async()=>{if(worker.exitCode===null&&worker.signalCode===null)worker.kill();await exited;};
 t.after(stop);
 worker.stderr.on('data',part=>{stderr=(stderr+part).slice(-4096);});
 worker.on('exit',code=>{for(const p of pending.values())p.reject(Error('Worker exited '+code+': '+stderr));pending.clear();});
 worker.on('message',message=>{
  if(message.event){events.push(message);return;}
  const p=pending.get(message.id);if(!p)return;
  pending.delete(message.id);message.ok?p.resolve(message.result):p.reject(Error(message.error));
 });
 const request=(action,payload)=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});worker.send({id,action,payload});});
 return {request,events,stop};
}

async function localFixture(t){
 const root=await mkdtemp(join(tmpdir(),'suffice-local-pi-')),home=join(root,'home'),cwd=join(root,'work');
 t.after(()=>rm(root,{recursive:true,force:true}));
 await Promise.all([mkdir(home),mkdir(cwd)]);
 const requests=[];
 const server=createServer(async(req,res)=>{
  let body='';for await(const part of req)body+=part;
  requests.push({path:req.url,body:JSON.parse(body)});
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const chunk=(delta,finish_reason=null,usage)=>res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'local-script',choices:[{index:0,delta,finish_reason}],usage})+'\n\n');
  chunk({role:'assistant',content:'Offline '});chunk({content:'answer'});chunk({},'stop',{prompt_tokens:3,completion_tokens:2,total_tokens:5});
  res.end('data: [DONE]\n\n');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 await writeFile(join(home,'models.json'),JSON.stringify({providers:{'local-script':{baseUrl:'http://127.0.0.1:'+server.address().port+'/v1',api:'openai-completions',apiKey:'offline-fixture',models:[{id:'local-script',name:'Local fixture',reasoning:false,input:['text'],contextWindow:32768,maxTokens:512}]}}}));
 return {root,home,cwd,requests};
}

async function checkTurn(t,backend){
 const {home,cwd,requests}=await localFixture(t);
 const {request,events,stop}=startWorker(t,home,backend);
 assert.equal((await request('status')).authenticated,true);
 const turn=await request('run',{prompt:'Local scripted turn',provider:'local-script',model:'local-script',effort:'off',cwd,clientId:'pending:fixture',desktopSettings:{'allow-network':false,naming:'First message'}});
 assert.equal(turn.text,'Offline answer');
 assert.equal(requests.length,1);assert.equal(requests[0].path,'/v1/chat/completions');assert.equal(requests[0].body.stream,true);
 assert.equal(turn.usage.modelCalls,1);
 assert.equal(events.find(e=>e.event==='thread_started').threadId,turn.threadId);
 assert.equal(events.some(e=>Object.hasOwn(e,'runGeneration')),false);
 assert.equal(events.filter(e=>e.event==='text').map(e=>e.text).join(''),'Offline answer');
 const [row]=await request('threads');assert.equal(row.id,turn.threadId);
 const view=await request('thread',{id:row.id});assert.equal(view.messages.at(-1).content[0].text,'Offline answer');
 const receipts=await readdir(join(home,'events'));assert.equal(receipts.length,1);
 const journal=(await readFile(join(home,'events',receipts[0]),'utf8')).trim().split('\n').map(JSON.parse);
 assert.ok(journal.some(e=>e.type==='provider_request'));assert.ok(journal.some(e=>e.type==='task_end'));
 await request('shutdown');await stop();
 if(backend==='rust'){
  const dir=join(home,'sessions'),files=(await readdir(dir,{recursive:true})).filter(name=>name.endsWith('.jsonl'));
  assert.equal(files.length,1);
  const file=join(dir,files[0]),bytes=await readFile(file);
  const rollback=startWorker(t,home);
  await rollback.request('status');
  const [restored]=await rollback.request('threads');
  assert.equal(restored.id,row.id);
  assert.deepEqual(await rollback.request('thread',{id:restored.id}),view);
  assert.deepEqual(await readFile(file),bytes);
  assert.equal(requests.length,1);
  await rollback.request('shutdown');await rollback.stop();
 }
}
for(const backend of ['rust',undefined])test('real Pi streams a loopback-only turn through the '+(backend||'default JS')+' worker',{timeout:30000},t=>checkTurn(t,backend));

const hostBinary=process.env.SUFFICE_TRANSPORT_TEST_HOST;
test('the full Wry renderer Sends through native live admission and displays the real Pi response',{skip:!hostBinary,timeout:85000},async t=>{
 const {root,home,cwd,requests}=await localFixture(t);
 const repo=fileURLToPath(new URL('../../../',import.meta.url)),checkout=join(root,'checkout'),app=join(checkout,'apps','desktop'),profile=join(root,'profile');
 await mkdir(app,{recursive:true});
 // The fixture adds its driver to a disposable copy of the full Vite build.
 // Real product main/preload files retain their checkout-relative module paths.
 for(const name of ['packages','scripts','node_modules','apps/desktop-bridge','apps/desktop-rust','apps/desktop/src','apps/desktop/shared','apps/desktop/assets']){
  const target=join(checkout,name);await mkdir(dirname(target),{recursive:true});
  await symlink(join(repo,name),target,process.platform==='win32'?'junction':'dir');
 }
 await cp(join(repo,'apps/desktop/electron'),join(app,'electron'),{recursive:true});
 await cp(join(repo,'apps/desktop/dist'),join(app,'dist'),{recursive:true});
 await copyFile(join(repo,'apps/desktop/package.json'),join(app,'package.json'));
 const key='suffice-thread-view-v1:'+'f'.repeat(32),receiptFile=join(profile,'thread-views',createHash('sha256').update(key).digest('hex')+'.json');
 const html=join(app,'dist','index.html');
 const drive=`<script>(async()=>{
  const api=window.sufficeDesktop,seen=[];
  const wait=async check=>{for(let i=0;i<280;i++){const value=check();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out waiting for renderer: '+document.body.innerText.slice(-500));};
  try{
   api.onEvent(event=>seen.push(event));
   const form=await wait(()=>{const f=document.querySelector('form.composer');return f?.modelSelection?.model==='local-script'&&f;});
   const prompt=document.querySelector('#prompt');prompt.value='Wry local fixture';prompt.dispatchEvent(new Event('input',{bubbles:true}));
   const button=await wait(()=>form.querySelector('button[type=submit]:not(:disabled)'));button.click();
   const completed=await wait(()=>seen.find(e=>e.event==='run_completed'));
   if(completed.error)throw Error(completed.error);
   const answer=await wait(()=>[...document.querySelectorAll('.thread-assistant')].find(el=>el.getClientRects().length&&el.textContent.includes('Offline answer')));
   await api.saveViewState({key:${JSON.stringify(key)},value:JSON.stringify({draft:'',visible:answer.textContent.trim(),result:completed.result.text,thread:completed.threadId,provider:form.modelSelection.provider,started:seen.some(e=>e.event==='thread_started'&&e.threadId===completed.threadId),stream:seen.filter(e=>e.event==='text').map(e=>e.text).join('')})});
  }catch(error){await api.saveViewState({key:${JSON.stringify(key)},value:JSON.stringify({draft:'',error:error.message})});}
 })();</script>`;
 await writeFile(html,(await readFile(html,'utf8')).replace('</body>',drive+'</body>'));
 const child=spawn(resolve(hostBinary),['--root',checkout,'--node',process.execPath,'--home',home,'--profile',profile],{env:{...isolatedEnv(home),SUFFICE_START_PROJECT:cwd,SUFFICE_TEST_HIDE_WINDOW:'1'},stdio:['pipe','ignore','pipe']});
 const exit=once(child,'exit');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();await exit;});
 let diagnostic='';child.stderr.on('data',data=>{diagnostic=(diagnostic+data).slice(-2400);});
 const end=Date.now()+70000;let receipt;
 while(Date.now()<end&&child.exitCode===null&&child.signalCode===null){
  try{receipt=JSON.parse(JSON.parse(await readFile(receiptFile,'utf8')).value);break;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  await delay(100);
 }
 assert.ok(receipt,diagnostic);assert.equal(receipt.error,undefined);
 assert.match(receipt.visible,/Offline answer/);assert.equal(receipt.result,'Offline answer');assert.equal(receipt.stream,'Offline answer');
 assert.equal(receipt.provider,'local-script');assert.equal(receipt.started,true);assert.match(receipt.thread,/^[a-f0-9]{32}$/);
 assert.equal(requests.length,1);assert.equal(requests[0].path,'/v1/chat/completions');
});
