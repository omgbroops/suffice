import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,copyFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {runInThisContext} from 'node:vm';
import {rendererFrames} from '../renderer-transport.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const createReceiver=runInThisContext(await readFile(join(repo,'apps/desktop-rust/src/renderer-receiver.js'),'utf8'));
const imageLength=4*Math.ceil(20*1024*1024/3);
const header='surrogate=\ud800 and supplementary=🌍';
const state=message=>({title:message.title===header,images:message.images.map((s,i)=>s.length===imageLength&&s===['A','B','C'][i].repeat(imageLength))});

test('UTF-8 fragment receiver retains surrogate pairs at a slice boundary and recovers after malformed input',()=>{
 const messages=[];const receive=createReceiver(m=>messages.push(m));
 const json=JSON.stringify({type:'event',channel:'c',args:['']});const prefix=json.indexOf('["')+2;
 const value='a'.repeat(256*1024-prefix-1)+'🌍\ud800';
 const wire=JSON.stringify({type:'event',channel:'c',args:[value]});const frames=[...rendererFrames(wire,Buffer.byteLength(wire),1)];
 assert.ok(frames.length>1);receive(frames[0]);assert.equal(messages.length,0);
 assert.throws(()=>receive({...frames[1],offset:1}),/order/);
 for(const frame of frames)receive(frame);
 assert.ok(messages[0].args[0]===value);
 assert.throws(()=>receive({...frames[0],total:513*1024*1024}),/Invalid/);
 assert.throws(()=>receive({...frames[0],data:'/w==',total:1}));
});

async function fixture(dir, useHost=false) {
 const root=join(dir,'checkout'),host=join(root,'apps/desktop-rust'),electron=join(root,'apps/desktop/electron'),dist=join(root,'apps/desktop/dist');
 await Promise.all([mkdir(electron,{recursive:true}),mkdir(dist,{recursive:true})]);
 if(useHost){
   // A directory junction works on Windows without file-symlink privileges.
   await symlink(join(repo,'apps/desktop-rust'),host,process.platform==='win32'?'junction':'dir');
   await copyFile(join(repo,'apps/desktop/electron/preload.cjs'),join(electron,'preload.cjs'));
 }
 const receipt=join(dir,'receipt.json');
 await writeFile(join(electron,'main.cjs'),`
 const {BrowserWindow,ipcMain,sufficeBrowserFactory}=require('electron');
 const win=new BrowserWindow();
 const surface=sufficeBrowserFactory({win});
 ipcMain.handle('suffice:status',async()=>{
   const token='bridge-test';
   const opened=await surface.command({action:'open',token});
   let rejected=false;
   try{await surface.command({action:'navigate',url:'https://example.test/'+String.fromCharCode(0xd800),token});}catch(e){rejected=e.message.includes('cannot represent');}
   await surface.command({action:'close',token});
   return opened.token===token&&rejected;
 });
 ipcMain.handle('suffice:browser',(_e,request)=>{
   if(request.check!=='\\ud800')throw Error('Invocation lost an unpaired surrogate');
   win.webContents.send('suffice:event',{kind:'before',text:'\\udfff'});
   return {title:${JSON.stringify(header)},images:['A','B','C'].map(c=>c.repeat(${imageLength}))};
 });
 ipcMain.handle('suffice:desktop-preference',(_e,result)=>{require('node:fs').writeFileSync(${JSON.stringify(receipt)},JSON.stringify(result));return true;});
 win.loadFile('fixture');`);
 return {root,dist,receipt};
}
function launch(command,args,env){
 const child=spawn(command,args,{env,stdio:['pipe','pipe','pipe']});
 let stderr='';child.stderr.on('data',d=>{stderr=(stderr+d).slice(-5000);});
 const exit=new Promise((r,j)=>{child.once('error',j);child.once('exit',(code,signal)=>r({code,signal}));});
 return {child,exit,stderr:()=>stderr};
}

test('real Node bridge fragments a three-image history and preserves event order through stdout backpressure',{timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'suffice-wire-'));
 const {root}=await fixture(dir);
 const {child,exit,stderr}=launch(process.execPath,[join(repo,'apps/desktop-bridge/main.mjs'),'--root',root,'--profile',join(dir,'profile'),'--wait-for-host'],{...process.env,SUFFICE_HOME:join(dir,'home'),PI_OFFLINE:'1'});
 const messages=[];let count=0,total=0,maxBytes=0;
 const receive=createReceiver(m=>messages.push(m.type==='reply'?state(m.result):m.args[0]));
 const send=m=>child.stdin.write(JSON.stringify(m)+'\n');
 try{
  for await(const line of createInterface({input:child.stdout})){
    const frame=JSON.parse(line);if(frame.type==='bootstrap-ready')send({type:'host-start',rendererTransport:'fragments-v1'});
    if(frame.type==='ready')send({type:'invoke-json',channel:'suffice:browser',id:1,argsJson:JSON.stringify([{check:'\ud800'}])});
    if(frame.type!=='renderer-chunk')continue;
    count++;maxBytes=Math.max(maxBytes,Buffer.byteLength(line));total=Math.max(total,frame.total);
    if(count%40===0)await delay(1);
    receive(frame);
    if(messages.length===2){send({type:'shutdown'});break;}
  }
  assert.equal((await exit).code,0,stderr());assert.deepEqual(messages,[{kind:'before',text:'\udfff'},{title:true,images:[true,true,true]}]);
  assert.ok(count>100&&maxBytes<=1024*1024+256&&total>80*1024*1024);
 }finally{if(child.exitCode===null)child.kill();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

const hostBinary=process.env.SUFFICE_TRANSPORT_TEST_HOST;
test('real Wry host delivers three 20 MiB images and an unpaired surrogate into its trusted document',{skip:!hostBinary,timeout:100000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'suffice-wry-wire-'));
 const {root,dist,receipt}=await fixture(dir,true);
 const script=`
 (async()=>{const seen=[];window.sufficeDesktop.onEvent(e=>seen.push(e.kind==='before'&&e.text==='\\udfff'));
 try{const nativeSurface=await window.sufficeDesktop.status();const item=await window.sufficeDesktop.browser({check:'\\ud800'});const expected=['A','B','C'];const result={nativeSurface,title:item.title===${JSON.stringify(header)},images:item.images.map((s,i)=>s===expected[i].repeat(${imageLength})),events:seen};await window.sufficeDesktop.desktopPreference(result);}
 catch(e){await window.sufficeDesktop.desktopPreference({error:e.message});}})();`;
 await writeFile(join(dist,'index.html'),'<!doctype html><html><body>Local transfer fixture<script>'+script+'</script></body></html>');
 const {child,stderr,exit}=launch(resolve(hostBinary),['--root',root,'--node',process.execPath,'--home',join(dir,'home'),'--profile',join(dir,'profile')],{...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1'});
 child.stdout.resume();
 try{
  const end=Date.now()+85000;let result;
  while(Date.now()<end&&child.exitCode===null){try{result=JSON.parse(await readFile(receipt,'utf8'));break;}catch{}await delay(100);}
  assert.deepEqual(result,{nativeSurface:true,title:true,images:[true,true,true],events:[true]},stderr());
 }finally{child.kill('SIGTERM');await exit;await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
