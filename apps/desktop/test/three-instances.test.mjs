// Hidden test (SUFFICE_TEST_HIDE_WINDOW=1): 3 Suffice instances share SUFFICE_HOME and a project, each with its own sessions socket and history.
import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {_electron} from 'playwright-core';
import {guard,killTmux} from './electron-guard.mjs';
test('three instances writing shared project memory never tear it',{timeout:180000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-3x-'))),shared=resolve(tmp,'shared'),project=resolve(tmp,'proj');
 await mkdir(shared);await mkdir(project);
 const mod=pathToFileURL(resolve('apps/desktop/electron/engine-settings.mjs')).href,apps=[],sockets=[];
 try{
  for(let n=0;n<3;n++){
   const socket=`sfx-fl2-voice2-${process.pid}-${n}`;sockets.push(socket);
   const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:shared,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:resolve(tmp,'h'+n)};delete env.ELECTRON_RUN_AS_NODE;
   const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(tmp,'d'+n)],env});apps.push(app);
   await (await app.firstWindow()).locator('.composer').waitFor();
  }
  const texts=apps.map((_,n)=>String(n).repeat(3500));
  // each instance's main process spawns its own writer (Electron's main has no dynamic import)
  const code=`import(process.argv[1]).then(async m=>{for(let i=0;i<40;i++)await m.rememberProject(process.argv[2],process.argv[3],process.argv[4]);})`;
  await Promise.all(apps.map((app,n)=>app.evaluate(({},a)=>new Promise((ok,bad)=>{const {execFile}=process.mainModule?.require?process.mainModule.require('node:child_process'):require('node:child_process');execFile(process.execPath,['--input-type=module','-e',a.code,a.mod,a.shared,a.project,a.text],{env:{ELECTRON_RUN_AS_NODE:'1'}},e=>e?bad(e):ok());}),{code,mod,shared,project,text:texts[n]})));
  const dir=resolve(shared,'project-memory'),files=await readdir(dir);
  assert.equal(files.length,1,'no temp files left');
  assert.ok(texts.includes(await readFile(resolve(dir,files[0]),'utf8')));
 }finally{for(const a of apps)await a.close().catch(()=>{});for(const s of sockets)killTmux(s);await rm(tmp,{recursive:true,force:true});}
});
