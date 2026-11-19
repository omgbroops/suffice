import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import http from 'node:http';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

// Boxes tab against a local fake of the box API: list, scrub checkpoints, restore, fork, and the not-connected state.
// Set BOXES_SHOTS=<dir> to also write dark/light 1440x900 screenshots.
function fakeApi(){
 const vms=[{id:'vm-aaaaaaaa01',name:'agent-run-a',state:'running'},{id:'vm-bbbbbbbb02',name:'scratch',state:'stopped'}];
 const cks={'vm-aaaaaaaa01':[{id:'ck-1',vm_id:'vm-aaaaaaaa01',name:'after-install',created_at:'2026-11-18T10:00:00Z'},{id:'ck-2',vm_id:'vm-aaaaaaaa01',name:'tests-green',created_at:'2026-11-18T11:00:00Z'},{id:'ck-3',vm_id:'vm-aaaaaaaa01',name:'broken-refactor',created_at:'2026-11-18T12:00:00Z'}],'vm-bbbbbbbb02':[]};
 const calls=[];
 const server=http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{
  calls.push({method:req.method,url:req.url,auth:req.headers.authorization,body:b?JSON.parse(b):null});
  const send=(s,o)=>{res.writeHead(s,{'content-type':'application/json'});res.end(JSON.stringify(o));};
  const m=req.url.match(/^\/vms\/([^/]+)\/(checkpoints|rewind|fork)$/);
  if(req.method==='GET'&&req.url==='/vms')return send(200,{data:vms});
  if(m&&m[2]==='checkpoints'&&req.method==='GET')return send(200,{data:cks[m[1]]||[]});
  if(m&&m[2]==='rewind'){const list=cks[m[1]];list.push({id:'ck-safe',vm_id:m[1],name:'before-restore',created_at:'2026-11-18T13:00:00Z'});return send(200,{ok:true});}
  if(m&&m[2]==='fork'){const v={id:'vm-cccccccc03',name:'fork-of-agent-run-a',state:'running'};vms.push(v);cks[v.id]=[];return send(201,v);}
  send(404,{error:{code:'not_found',message:'no'}});});});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r({server,calls,vms,cks,url:'http://127.0.0.1:'+server.address().port})));
}
test('boxes tab: list, checkpoints, restore, fork and not-connected state',{timeout:120000},async()=>{
 const fake=await fakeApi();
 const home=await mkdtemp(resolve(tmpdir(),'suffice-boxes-ui-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-boxes-project-'));
 const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
 const timestamp=new Date().toISOString();await writeFile(resolve(dir,'one.jsonl'),[
  {type:'session',version:3,id:'one',timestamp,cwd},
  {type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Thread one'}],timestamp:Date.now()}},
  {type:'message',id:'assistant',parentId:'user',timestamp,message:{role:'assistant',content:[{type:'text',text:'Reply one'}],timestamp:Date.now(),stopReason:'stop'}},
 ].map(e=>JSON.stringify(e)).join('\n')+'\n');
 const shots=process.env.BOXES_SHOTS;if(shots)await mkdir(shots,{recursive:true});
 const launch=async(extra,tag)=>{const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fr-boxes-'+tag,SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-boxes-hist-')),...extra};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron-'+tag)],env});const stderr=[];app.process().stderr.on('data',d=>stderr.push(String(d)));
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await page.locator('.thread-row').filter({hasText:'Thread one'}).click();await page.locator('.thread-header').filter({hasText:'Thread one'}).waitFor();
  await page.getByRole('button',{name:'Toggle right panel'}).click();await page.locator('.panel-launcher').getByRole('button',{name:'Boxes',exact:true}).click();
  return {app,page,stderr};};
 const shotOf=(app,page)=>async name=>{if(!shots)return;for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(250);const image=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.capturePage().then(i=>i.toPNG().toString('base64')));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(image,'base64'));}await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});};
 try{
  {const {app,page,stderr}=await launch({},'off');try{
   await page.getByText('Boxes are not connected').waitFor();await shotOf(app,page)('not-connected');
   assert.deepEqual(stderr.filter(l=>l.includes('[no-dialog]')),[]);}finally{await app.close();}}
  const {app,page,stderr}=await launch({SUFFICE_BOXES_URL:fake.url,SUFFICE_BOXES_TOKEN:'tok-test'},'on');const shot=shotOf(app,page);
  try{
   const cks=page.locator('.boxes-checkpoints .rewind-item');await cks.nth(2).waitFor();
   assert.equal(await page.locator('.boxes-list .rewind-item').count(),2);
   assert.match(await cks.nth(0).innerText(),/broken-refactor/);assert.match(await cks.nth(2).innerText(),/after-install/);
   assert.equal(await cks.nth(0).getAttribute('aria-selected'),'true');
   assert.equal(fake.calls[0].auth,'Bearer tok-test');
   await shot('timeline');
   // Pick tests-green with the keyboard, confirm and restore.
   await cks.nth(0).focus();await page.keyboard.press('ArrowDown');assert.equal(await cks.nth(1).getAttribute('aria-selected'),'true');
   await page.getByRole('button',{name:'Restore…'}).click();await page.locator('.rewind-actions').waitFor();await shot('confirm');
   await page.getByRole('button',{name:'Cancel'}).click();await page.getByRole('button',{name:'Restore…'}).waitFor();
   await page.getByRole('button',{name:'Restore…'}).click();await page.locator('.rewind-actions').getByRole('button',{name:'Restore',exact:true}).click();
   await page.locator('.rewind-line',{hasText:'Restored to'}).waitFor();
   const rw=fake.calls.find(c=>c.url.endsWith('/rewind'));assert.deepEqual(rw.body,{checkpoint:'ck-2'});assert.equal(rw.method,'POST');
   assert.equal(await cks.count(),4);assert.match(await cks.nth(0).innerText(),/before-restore/);await shot('restored');
   // Fork from the selected checkpoint.
   await cks.nth(1).click();await page.getByRole('button',{name:'Fork box'}).click();
   await page.locator('.rewind-line',{hasText:'Forked'}).waitFor();
   const fk=fake.calls.find(c=>c.url.endsWith('/fork'));assert.equal(fk.body.checkpoint,'ck-3');
   assert.equal(await page.locator('.boxes-list .rewind-item').count(),3);await shot('forked');
   // End jumps to the last checkpoint, Home back to the first.
   await cks.nth(1).focus();await page.keyboard.press('End');assert.equal(await cks.nth(await cks.count()-1).getAttribute('aria-selected'),'true');
   await page.keyboard.press('Home');assert.equal(await cks.nth(0).getAttribute('aria-selected'),'true');
   // Long unbroken names wrap instead of widening the scroller.
   fake.cks['vm-bbbbbbbb02']=Array.from({length:40},(_,i)=>({id:'ck-l'+i,vm_id:'vm-bbbbbbbb02',name:('long-name-'+i+'-').padEnd(120,'x'),created_at:'2026-11-18T10:00:00Z'}));
   await page.locator('.boxes-list .rewind-item[data-id="vm-bbbbbbbb02"]').click();await cks.nth(39).waitFor();
   assert.equal(await page.locator('.rewind-scroll').evaluate(n=>n.scrollWidth<=n.clientWidth),true);
   // Boxes created or removed elsewhere appear without reopening the tab.
   fake.vms.push({id:'vm-dddddddd04',name:'made-elsewhere',state:'running'});
   await page.locator('.boxes-list .rewind-item[data-id="vm-dddddddd04"]').waitFor({timeout:10000});
   fake.vms.splice(fake.vms.findIndex(v=>v.id==='vm-dddddddd04'),1);
   await page.locator('.boxes-list .rewind-item[data-id="vm-dddddddd04"]').waitFor({state:'detached',timeout:10000});
   assert.deepEqual(stderr.filter(l=>l.includes('[no-dialog]')),[]);
  }finally{await app.close();}
 }finally{fake.server.close();}
});
