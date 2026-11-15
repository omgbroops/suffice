import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';

test('refresh restores a live transcript and pending approval, then continues the original run',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-refresh-approval-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{const page=await app.firstWindow();await page.locator('.composer').waitFor();await app.evaluate(async({ipcMain,BrowserWindow},routerSource)=>{
  const createThreadRouter=new Function(routerSource.replace('export function createThreadRouter','return function createThreadRouter'))();let started=false;globalThis.approvalAnswers=[];globalThis.startedRuns=0;
  const route=createThreadRouter({send:message=>{const pending=globalThis.routePending.get(message.id);if(message.event){BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',message);return;}if(pending){globalThis.routePending.delete(message.id);message.ok?pending.resolve(message.result):pending.reject(new Error(message.error));}},createRuntime:async()=>({}),createHost:({send})=>{let approve;
   return async({id,action,payload={}})=>{
    if(action==='status')send({id,ok:true,result:{authenticated:true}});
    else if(action==='threads')send({id,ok:true,result:started?[{id:'fixture',title:'Approval refresh fixture',project:'Fixture',cwd:process.cwd(),modified:Date.now()}]:[]});
    else if(action==='run'){started=true;globalThis.startedRuns++;send({event:'thread_started',id:'fixture'});send({event:'assistant_start'});send({event:'text',text:'Before refresh.'});send({event:'tool_start',id:'tool',name:'codemode',input:{code:'text(1 + 1);'}});const answer=await new Promise(resolve=>{approve=resolve;send({event:'approval',requestId:7,name:'codemode',input:{code:'text(1 + 1);'}});});send({event:'approval_resolved',requestId:7});send({event:'tool_end',id:'tool',result:{content:[{type:'text',text:'2'}]}});send({event:'assistant_start'});send({event:'text',text:answer?'Continued after refresh.':'Denied after refresh.'});send({id,ok:true,result:{threadId:'fixture',text:answer?'Continued after refresh.':'Denied after refresh.'}});}
    else if(action==='approval-answer'){globalThis.approvalAnswers.push(payload);approve(payload.allow);send({id,ok:true});}
    else if(action==='thread')send({id,ok:true,result:{id:'fixture',title:'Approval refresh fixture',cwd:process.cwd(),messages:[]}});
    else send({id,ok:true,result:null});
   };
  }});
  globalThis.routePending=new Map();let sequence=0;
  for(const action of ['status','threads','run','thread','approval-answer','reset','usage']){ipcMain.removeHandler('suffice:'+action);ipcMain.handle('suffice:'+action,(_e,payload)=>new Promise((resolve,reject)=>{const id=++sequence;globalThis.routePending.set(id,{resolve,reject});void route({id,action,payload:action==='thread'?{id:payload}:payload||{}});}));}
 },await readFile(resolve('apps/desktop/electron/thread-router.mjs'),'utf8'));
 await page.reload();await page.locator('#prompt').fill('Approval refresh fixture');await page.locator('.composer').evaluate(form=>{form.modelsDisabled=false;form.requestSubmit();});const panel=page.getByRole('region',{name:'Agent approval'});await panel.waitFor();await page.locator('#prompt').evaluate(el=>{el.value='Keep this unsent draft';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.reload();await panel.waitFor();await page.locator('.thread-row[data-status=approval]').waitFor();assert.match(await page.locator('.thread-messages').innerText(),/Before refresh/);assert.equal(await panel.locator('code').innerText(),'text(1 + 1);');assert.equal(await app.evaluate(()=>globalThis.startedRuns),1);
 await panel.getByRole('button',{name:'Allow',exact:true}).click();await panel.waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('.composer').dataset.running==='false');assert.deepEqual((await page.locator('.thread-assistant').allTextContents()).map(text=>text.trim()),['Before refresh.','Continued after refresh.']);assert.equal(await page.locator('#prompt').inputValue(),'Keep this unsent draft');assert.deepEqual(await app.evaluate(()=>globalThis.approvalAnswers),[{threadId:'fixture',requestId:7,allow:true}]);
 }finally{await app.close();}
});
