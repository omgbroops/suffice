// Hidden regression capture: standard chat with a multi-tool activity group. OUT=<png> writes the shot; prints measured tool-widget spacing + summaries as JSON.
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-nc-')));
const dirs=['project','data','suffice','home'].map(d=>resolve(tmp,d));for(const d of dirs)await mkdir(d,{recursive:true});
const [project,data,suffice,home]=dirs;
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-r2-session-transcript-'+process.pid,SUFFICE_HISTORY_HOME:home});
const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 const send=v=>app.evaluate(({BrowserWindow},v)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',v),v);
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:run');ipcMain.handle('suffice:run',()=>new Promise(()=>{}));});
 await page.locator('#prompt').fill('Regression fixture');await page.locator('#prompt').press('Enter');
 await page.locator('.thread-status').waitFor();
 await send({event:'thread_started',id:'nc-regression'});await page.waitForTimeout(500);
 for(const [i,name] of ['codemode','codemode','codemode'].entries()){await send({event:'tool_start',id:'t'+i,name,input:{code:'return '+i+';'}});await send({event:'tool_output',id:'t'+i,result:{content:[{type:'text',text:'out '+i}]}});}
 await send({event:'text',text:'Done.'});await page.waitForTimeout(800);
 const m=await page.evaluate(()=>({widgets:[...document.querySelectorAll('.thread-activity-log > .tool-widget')].map(e=>getComputedStyle(e).marginBottom),summaries:[...document.querySelectorAll('.thread-activity > summary')].map(e=>e.textContent.trim())}));
 if(!m.widgets.length)throw new Error('no tool widgets rendered');
 console.log(JSON.stringify(m));
 if(process.env.OUT){const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(process.env.OUT,Buffer.from(b,'base64'));}
}finally{await app.close().catch(()=>{});}
