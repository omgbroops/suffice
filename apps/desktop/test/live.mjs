import electronPath from 'electron';
// Explicit opt-in provider smoke test. Not part of test:desktop.
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const project=await mkdtemp(resolve(tmpdir(),'suffice-live-smoke-'));
const expected='SUFFICE_DESKTOP_BRIDGE_OK';
await writeFile(resolve(project,'hello.txt'),expected);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop')],env});
try{
 const page=await app.firstWindow();await page.locator('.composer').waitFor();
 const status=await page.evaluate(()=>window.sufficeDesktop.status());assert.equal(status.authenticated,true,'Sign in using the CLI before the live smoke test');
 await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);
 await page.getByRole('button',{name:'Choose project',exact:true}).click();
 await page.getByRole('button',{name:'New project',exact:true}).click();
 await page.locator('#prompt').fill('Read hello.txt using the file tools. Reply only with its complete content. Do not modify any files or run shell commands.');
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await page.getByRole('button',{name:'Start session',exact:true}).waitFor({timeout:120000});
 const reply=await page.locator('.thread-assistant').innerText();assert.ok(reply.includes(expected),reply);
 assert.equal(await readFile(resolve(project,'hello.txt'),'utf8'),expected);
 await page.screenshot({path:resolve('apps/desktop/desktop-live.png')});
 console.log('PASS: real provider response, repository read, UI streaming and completion; fixture unchanged.');
}finally{await app.close();}
