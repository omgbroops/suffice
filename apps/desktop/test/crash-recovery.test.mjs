import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import electronPath from 'electron';
import {_electron} from 'playwright-core';

test('forced app termination preserves saved chats and drafts for a fresh launch',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-crash-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
 const timestamp=new Date().toISOString(),file=resolve(dir,'saved.jsonl'),source=[{type:'session',version:3,id:'crash-fixture',timestamp,cwd:home},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Crash recovery fixture'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n';await writeFile(file,source);
 const env={...process.env,SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;const launch=()=>_electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 let app=await launch();
 try{
  let page=await app.firstWindow();await page.locator('.thread-row').first().click();await page.locator('.thread-transcript[aria-busy="false"]').waitFor();await page.locator('#prompt').fill('Draft before forced exit');await page.locator('#prompt').blur();for(let attempt=0;;attempt++){const saved=await page.evaluate(async()=>Object.values(await window.sufficeDesktop.viewStates()).some(value=>JSON.parse(value).draft==='Draft before forced exit'));if(saved)break;assert.ok(attempt<100,'Draft backup must be acknowledged before forced exit');await new Promise(resolve=>setTimeout(resolve,50));}
  const child=app.process(),exit=once(child,'exit');
  // Force-quit the isolated app's process tree, like Task Manager's End task.
  if(process.platform==='win32')await promisify(execFile)('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});
  else {const pids=await app.evaluate(({app})=>app.getAppMetrics().map(item=>item.pid));for(const pid of pids.filter(pid=>pid!==child.pid)){try{process.kill(pid,'SIGKILL');}catch{}}child.kill('SIGKILL');}
  await exit;await app.close().catch(()=>{});app=null;
  assert.equal(await readFile(file,'utf8'),source);app=await launch();page=await app.firstWindow();await page.locator('.thread-row').first().waitFor();await page.locator('.thread-row').first().click();await page.waitForFunction(()=>document.querySelector('#prompt').value==='Draft before forced exit');assert.equal(await readFile(file,'utf8'),source);
 }finally{await app?.close();}
});
