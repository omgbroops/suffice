// Cloud walk: a cloud thread in the neon-mech skin, then the Preview, Tests and Timeline tabs.
// usage: node apps/desktop/test/cloud-walk.mjs <shots-dir>   (after the desktop build)
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
import {threadId} from '../electron/threads.mjs';
const out=resolve(process.argv[2]||'cloud-shots');await mkdir(out,{recursive:true});
const home=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-cloud-walk-')));
const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
const t=new Date().toISOString();
await writeFile(resolve(dir,'larder.jsonl'),[{type:'session',version:3,id:'larder',timestamp:t,cwd:home},
 {type:'message',id:'u',parentId:null,timestamp:t,message:{role:'user',content:[{type:'text',text:'Add a pantry order page to larder'}],timestamp:Date.now()}},
 {type:'message',id:'a',parentId:'u',timestamp:t,message:{role:'assistant',content:[{type:'text',text:'The order page is up. I ran the checkout test and it fails when the quantity is negative.'}],provider:'fake',model:'fake-model-1',usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()}}].map(e=>JSON.stringify(e)).join('\n')+'\n');
const key='suffice-thread-view-v1:'+threadId(resolve(dir,'larder.jsonl'));
const errors=[];
const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1',SUFFICE_FAKE_SIGNED_IN:'1'})});
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('.composer').waitFor();
 await page.evaluate(([k])=>{localStorage.setItem('suffice-background','neon-mech');localStorage.setItem(k,JSON.stringify({cloud:true,panelOpen:true,tabs:['preview','tests','timeline'],activeTab:'preview'}));},[key]);
 await page.reload();await page.locator('.nx-nav').waitFor();
 await page.locator('.thread-row').first().click();await page.locator('.thread-header').waitFor();await page.locator('iframe').waitFor();
 await page.waitForTimeout(800);
 const shot=n=>page.screenshot({path:resolve(out,n+'.png'),timeout:30000});
 await shot('01-thread-cloud');
 await page.getByRole('tab',{name:'Preview'}).click();await page.waitForTimeout(400);await shot('02-preview');
 await page.getByRole('tab',{name:'Tests'}).click();await page.waitForTimeout(300);await shot('03-tests');
 await page.getByRole('tab',{name:'Timeline'}).click();await page.waitForTimeout(300);
 await page.getByRole('button',{name:/^Rewind to \d\d:\d\d$/}).nth(1).click();await page.waitForTimeout(300);await shot('04-timeline');
 console.log(JSON.stringify({errors}));
}finally{await app.close();}
