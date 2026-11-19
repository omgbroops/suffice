import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

// Deferred tool discovery as a user sees it: the setting, the "Found 2 tools" step and the Tools rows in context details. SHOTS=<dir> writes 1440x900 dark + light screenshots.
const launch=async name=>{const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-dtd-')));const [project,data,suffice,home]=['project','data','suffice','home'].map(d=>resolve(tmp,d));for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fr-deferred-tool-discovery-'+name+process.pid,SUFFICE_HISTORY_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+data],env});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 const shot=async n=>{if(!process.env.SHOTS)return;await mkdir(process.env.SHOTS,{recursive:true});await page.waitForTimeout(400);const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(process.env.SHOTS,n+'.png'),Buffer.from(b,'base64'));};
 return {app,page,suffice,shot};};

test('Defer tool schemas setting defaults to Auto, can be set Off, and persists',{timeout:90000},async()=>{
 const {app,page,suffice,shot}=await launch('set');
 try{
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Agent',exact:true}).click();
  const row=page.getByRole('button',{name:/Defer tool schemas/});assert.match(await row.innerText(),/Auto/);
  await shot('setting-auto-dark');await row.click();await page.getByText('Off',{exact:true}).click();
  await page.getByRole('button',{name:/Defer tool schemas/}).filter({hasText:'Off'}).waitFor();
  assert.equal(JSON.parse(await readFile(resolve(suffice,'desktop-settings.json'),'utf8'))['defer-tool-schemas'],'Off');
  await page.getByRole('button',{name:/Defer tool schemas/}).click();await page.getByText('On',{exact:true}).first().click();
  await page.getByRole('button',{name:/Defer tool schemas/}).filter({hasText:'On'}).waitFor();
  assert.equal(JSON.parse(await readFile(resolve(suffice,'desktop-settings.json'),'utf8'))['defer-tool-schemas'],'On');
 }finally{await app.close().catch(()=>{});}
});

test('agent turn shows "Found 2 tools" and context details list loaded, deferred and saved tokens',{timeout:90000},async()=>{
 const {app,page,shot}=await launch('run');
 try{
  const usage={cost:.12,totalTokens:48210,windowTokens:21400,windowPercent:11,tools:{loaded:6,deferred:118,saved:36480}};
  await app.evaluate(async({ipcMain,BrowserWindow},{routerSource,usage})=>{
   const createThreadRouter=new Function(routerSource.replace('export function createThreadRouter','return function createThreadRouter'))();let started=false;globalThis.routePending=new Map();
   const hits=[{name:'slack_delete',description:'Delete a Slack channel.',parameters:{type:'object'}},{name:'slack_archive',description:'Archive a Slack channel.',parameters:{type:'object'}}];
   const route=createThreadRouter({send:message=>{const pending=globalThis.routePending.get(message.id);if(message.event){BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',message);return;}if(pending){globalThis.routePending.delete(message.id);message.ok?pending.resolve(message.result):pending.reject(new Error(message.error));}},createRuntime:async()=>({}),createHost:({send})=>async({id,action})=>{
    if(action==='status')send({id,ok:true,result:{authenticated:true}});
    else if(action==='threads')send({id,ok:true,result:started?[{id:'fixture',title:'Archive the channel',project:'Fixture',cwd:process.cwd(),modified:Date.now()}]:[]});
    else if(action==='run'){started=true;send({event:'thread_started',id:'fixture'});send({event:'assistant_start'});send({event:'tool_start',id:'ts',name:'tool_search',input:{query:'archive slack channel'}});send({event:'tool_end',id:'ts',result:{content:[{type:'text',text:JSON.stringify(hits)}],details:{found:hits.map(h=>h.name)}}});send({event:'usage',usage});send({event:'assistant_start'});send({event:'text',text:'Found the Slack tools and archived the channel.'});await new Promise(r=>{globalThis.finishRun=r;});send({id,ok:true,result:{threadId:'fixture',text:'Found the Slack tools and archived the channel.'}});}
    else if(action==='usage')send({id,ok:true,result:usage});
    else if(action==='thread')send({id,ok:true,result:{id:'fixture',title:'Archive the channel',cwd:process.cwd(),messages:[]}});
    else send({id,ok:true,result:null});}});
   let sequence=0;for(const action of ['status','threads','run','thread','reset','usage']){ipcMain.removeHandler('suffice:'+action);ipcMain.handle('suffice:'+action,(_e,payload)=>new Promise((resolve,reject)=>{const id=++sequence;globalThis.routePending.set(id,{resolve,reject});void route({id,action,payload:action==='thread'?{id:payload}:payload||{}});}));}
  },{routerSource:await readFile(resolve('apps/desktop/electron/thread-router.mjs'),'utf8'),usage});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.reload();await page.locator('#prompt').fill('Archive the channel');await page.locator('.composer').evaluate(form=>{form.modelsDisabled=false;form.requestSubmit();});
  await page.locator('.thread-activity > summary').filter({hasText:/^\s*Found 2 tools\s*$/}).waitFor();
  const ring=page.locator('.context-ring');await ring.focus();await page.locator('.context-usage-details').waitFor({state:'visible'});
  const text=await page.locator('.context-usage-details').innerText();
  assert.match(text,/Tools\s*6 loaded · 118 deferred/);assert.match(text,/Tool tokens saved\s*36,480/);
  const box=await page.locator('.context-usage-details').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=1440&&box.y>=0&&box.y+box.height<=900);
  await page.waitForTimeout(800);await page.locator('.thread-activity > summary').filter({hasText:/^\s*Found 2 tools\s*$/}).waitFor();await shot('turn-dark');
  await ring.press('Escape');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();await page.getByRole('group',{name:'Mode',exact:true}).getByRole('button',{name:'Light',exact:true}).click();
  await page.getByRole('button',{name:'Back to chats',exact:true}).click();await page.locator('.thread-activity > summary').filter({hasText:/^\s*Found 2 tools\s*$/}).waitFor();
  await page.locator('.context-ring').focus();await page.locator('.context-usage-details').waitFor({state:'visible'});await shot('turn-light');await app.evaluate(()=>globalThis.finishRun());await page.waitForFunction(()=>document.querySelector('.composer').dataset.running==='false');assert.deepEqual(errors,[]);
 }finally{await app.close().catch(()=>{});}
});
