import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

test('real utility-process failure recovers saved chats without replay and relaunch restores drafts',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-recovery-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
 const timestamp=new Date().toISOString(),source=[{type:'session',version:3,id:'recovery',timestamp,cwd:home},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Recovery fixture'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n';await writeFile(resolve(dir,'saved.jsonl'),source);
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>_electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 let app=await launch();
 try{
  let page=await app.firstWindow();await page.locator('.thread-row').first().waitFor();const [thread]=await page.evaluate(()=>window.sufficeDesktop.threads());
  const oldPid=await app.evaluate(({app})=>{const worker=app.getAppMetrics().find(item=>item.name==='Suffice harness'||item.serviceName==='Suffice harness');if(!worker)throw new Error('Harness utility process not found');process.kill(worker.pid);return worker.pid;});
  await new Promise(resolve=>setTimeout(resolve,200));
  const restored=await page.evaluate(id=>window.sufficeDesktop.openThread(id),thread.id);assert.equal(restored.messages[0].content[0].text,'Recovery fixture');
  const pid=await app.evaluate(({app})=>app.getAppMetrics().find(item=>item.name==='Suffice harness'||item.serviceName==='Suffice harness')?.pid);assert.notEqual(pid,oldPid);
  await page.locator('.thread-row').first().click();await page.locator('#prompt').fill('Unsaved recovery draft');await page.locator('#prompt').blur();await page.waitForTimeout(300);
  // A real PTY owned by the isolated app must be killed on normal app shutdown.
  const terminalPid=await app.evaluate(async({app})=>{const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/electron/main.cjs');const {createTerminalManager}=require(app.getAppPath()+'/electron/terminals.cjs'),pty=require('node-pty');let pid;const manager=createTerminalManager({resolveCwd:async()=>process.env.SUFFICE_HOME,emit:()=>{},spawn:(...args)=>{const child=pty.spawn(...args);pid=child.pid;return child;}});await manager.create({threadId:'fixture',id:'terminal:11111111-1111-4111-8111-111111111111'});app.on('will-quit',()=>manager.dispose());return pid;});
  await app.close();app=null;
  for(let i=0;i<50;i++){try{process.kill(terminalPid,0);}catch(error){if(error.code==='ESRCH')break;throw error;}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.throws(()=>process.kill(terminalPid,0),error=>error.code==='ESRCH');
  app=await launch();page=await app.firstWindow();await page.locator('.thread-row').first().click();await page.waitForFunction(()=>document.querySelector('#prompt').value==='Unsaved recovery draft');
 }finally{await app?.close();}
});
