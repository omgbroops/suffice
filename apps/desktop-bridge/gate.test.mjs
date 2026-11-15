import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const bridge=path.join(root,'apps/desktop-bridge/main.mjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function startBridge(repo,scratch){
 const child=spawn(process.execPath,[bridge,'--root',repo,'--profile',path.join(scratch,'profile'),'--wait-for-host'],{env:{...process.env,SUFFICE_HOME:path.join(scratch,'home'),PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1'},stdio:['pipe','pipe','pipe']});
 const frames=[],waiters=[];let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
 createInterface({input:child.stdout}).on('line',line=>{const frame=JSON.parse(line);frames.push(frame);for(const waiter of [...waiters])if(waiter.match(frame)){waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(frame);}});
 const wait=match=>{const existing=frames.find(match);if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Timed out waiting for bridge frame: '+stderr)),10000);waiters.push({match,resolve:value=>{clearTimeout(timer);resolve(value);}});});};
 const send=frame=>child.stdin.write(JSON.stringify(frame)+'\n');
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Exit '+code+': '+stderr)));});
 return {child,frames,wait,send,exit};
}
const exists=file=>access(file).then(()=>true,()=>false);
test('host gate prevents main execution until host-start and starts once', {timeout:20000},async()=>{
 const scratch=await mkdtemp(path.join(tmpdir(),'bridge-gate-')),fake=path.join(scratch,'repo'),electron=path.join(fake,'apps','desktop','electron'),marker=path.join(scratch,'loaded'),childMarker=path.join(scratch,'child');await mkdir(electron,{recursive:true});
 const main=`const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(marker)},'loaded\\n');require('node:child_process').fork(${JSON.stringify(path.join(scratch,'child.cjs'))},[],{stdio:'ignore'});const {BrowserWindow,ipcMain}=require('electron');ipcMain.handle('suffice:fixture',()=>true);new BrowserWindow().loadFile('fixture');`;
 await writeFile(path.join(electron,'main.cjs'),main);await writeFile(path.join(scratch,'child.cjs'),`require('node:fs').writeFileSync(${JSON.stringify(childMarker)},'child')`);
 const b=startBridge(fake,scratch);
 try{await b.wait(m=>m.type==='bootstrap-ready');b.send({type:'invoke',id:1,channel:'suffice:fixture',args:[]});const premature=await b.wait(m=>m.type==='reply'&&m.id===1);assert.equal(premature.error,'not ready');await sleep(200);assert.equal(await exists(marker),false);assert.equal(await exists(childMarker),false);assert.equal(b.frames.some(m=>m.type==='ready'),false);
 b.send({type:'host-start'});await b.wait(m=>m.type==='ready');b.send({type:'host-start'});b.send({type:'invoke',id:2,channel:'suffice:fixture',args:[]});assert.equal((await b.wait(m=>m.type==='reply'&&m.id===2)).result,true);for(let n=0;n<40&&!await exists(childMarker);n++)await sleep(50);assert.equal(await exists(childMarker),true);assert.equal(await readFile(marker,'utf8'),'loaded\n');b.send({type:'shutdown'});await b.exit;
 }finally{if(b.child.exitCode===null)b.child.kill();await rm(scratch,{recursive:true,force:true,maxRetries:20,retryDelay:250});}
});
test('pre-start shutdown and EOF exit without loading main', {timeout:20000},async()=>{
 const scratch=await mkdtemp(path.join(tmpdir(),'bridge-gate-stop-'));try{for(const mode of ['shutdown','eof']){const b=startBridge(root,path.join(scratch,mode));await b.wait(m=>m.type==='bootstrap-ready');if(mode==='shutdown')b.send({type:'shutdown'});else b.child.stdin.end();await b.exit;assert.equal(b.frames.some(m=>m.type==='ready'),false);}}finally{await rm(scratch,{recursive:true,force:true,maxRetries:20,retryDelay:250});}
});
test('gated real main serves saved threads after host-start', {timeout:30000},async()=>{
 const scratch=await mkdtemp(path.join(tmpdir(),'bridge-gate-real-')),dir=path.join(scratch,'home','sessions','fixture');await mkdir(dir,{recursive:true});const timestamp=new Date().toISOString();await writeFile(path.join(dir,'saved.jsonl'),[{type:'session',version:3,id:'fixture',timestamp,cwd:scratch},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Gated fixture'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n');const b=startBridge(root,scratch);
 try{await b.wait(m=>m.type==='bootstrap-ready');b.send({type:'host-start'});await b.wait(m=>m.type==='ready');b.send({type:'invoke',id:3,channel:'suffice:threads',args:[]});const reply=await b.wait(m=>m.type==='reply'&&m.id===3);assert.equal(reply.ok,true);assert.equal(reply.result.length,1);b.send({type:'shutdown'});await b.exit;}finally{if(b.child.exitCode===null)b.child.kill();await rm(scratch,{recursive:true,force:true,maxRetries:20,retryDelay:250});}
});
