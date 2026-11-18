// Hidden capture of the restyled settings pages (dark + light). Usage: SHOTS_TAG=before|after node apps/desktop/test/settings-polish.capture.mjs
import electronPath from 'electron';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const tag=process.env.SHOTS_TAG||'after',out='/Users/abhayg/suffice-desktop-wt/ui-shots/forge/final/polish-settings';
const pages=[['general','General'],['appearance','Appearance'],['models','Models'],['agent','Agent'],['mcps','Tools & MCP'],['usage','Usage'],['projects','Projects'],['shortcuts','Shortcuts'],['account','Account']];
const home=await mkdtemp(resolve(tmpdir(),'suffice-polish-')),sock='sfx-conv-polish-settings';await mkdir(out,{recursive:true});
const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:sock,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
try{
 const page=await app.firstWindow();await page.locator('.composer').waitFor();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 for(const mode of ['dark','light']){
  await page.evaluate(m=>{document.documentElement.dataset.theme=m;},mode);
  for(const [id,title] of pages){
   await page.locator('.settings-nav-item',{hasText:new RegExp('^\\s*'+title.replace(/[&]/g,'\\&')+'\\s*$')}).first().click();await page.waitForTimeout(400);
   if(id==='appearance'){const h=page.locator('h2:has-text("Type")').first();await h.scrollIntoViewIfNeeded().catch(()=>{});await page.waitForTimeout(200);}
   const img=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.capturePage().then(i=>i.toPNG().toString('base64')));
   await writeFile(`${out}/${tag}-${id}-${mode}.png`,Buffer.from(img,'base64'));
  }
 }
}finally{await app.close().catch(()=>{});}
