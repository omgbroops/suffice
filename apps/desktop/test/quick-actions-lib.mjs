import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
// Two saved threads in one project folder with real files, plus a stubbed model catalog. Hidden window only.
export const models=[{provider:'atlas',id:'atlas-fixture',name:'Atlas fixture',available:true,efforts:['low','medium','high']},{provider:'xai',id:'grok-fixture',name:'Grok fixture',available:true,efforts:['low','high']}];
export async function launchQuick(prefix='suffice-quick-'){
 const home=await mkdtemp(resolve(tmpdir(),prefix)),project=resolve(home,'project'),folder=resolve(home,'sessions','fixture');
 await mkdir(resolve(project,'src'),{recursive:true});await mkdir(resolve(project,'docs'));await mkdir(folder,{recursive:true});
 for(const [name,text] of [['README.md','# Project'],['src/app.js','export const app=1;'],['src/composer.js','export const composer=1;'],['docs/guide.md','# Guide']])await writeFile(resolve(project,name),text);
 const base=Date.now()-3600000,at=n=>new Date(base+n*1000).toISOString();
 const thread=(file,id,turns)=>{const records=[{type:'session',version:3,id,timestamp:at(0),cwd:project}];let parent=null,n=1;turns.forEach(([question,answer],k)=>{for(const [idx,entry] of [[`s${k}`,{type:'custom',customType:'suffice:turn-start',data:{id:`t${k}`,startedAt:base+n*1000,displayPrompt:question}}],[`u${k}`,{type:'message',message:{role:'user',timestamp:base+n*1000,content:[{type:'text',text:question}]}}],[`a${k}`,{type:'message',message:{role:'assistant',provider:'atlas',model:'atlas-fixture',timestamp:base+n*1000+500,content:[{type:'text',text:answer}],stopReason:'stop'}}],[`e${k}`,{type:'custom',customType:'suffice:turn-end',data:{id:`t${k}`,endedAt:base+n*1000+900}}]]){records.push({id:idx,parentId:parent,timestamp:at(n++),...entry});parent=idx;}});return writeFile(resolve(folder,file),records.map(JSON.stringify).join('\n')+'\n');};
 await thread('a.jsonl','quick-a',[['First question','Answer one with `code`.'],['Second question','Answer two.']]);
 await thread('b.jsonl','quick-b',[['Unrelated planning thread','Planning reply.']]);
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-feat-quick-actions',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-quick-history-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 await app.evaluate(({ipcMain},catalog)=>{ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>catalog);},models);
 const page=await app.firstWindow();await page.setViewportSize({width:1440,height:900});await page.reload();
 await page.waitForFunction(()=>document.querySelector('.composer')?.modelSelection?.model==='atlas-fixture');
 return {app,page,home,project,folder};
}
export const openThread=async(page,title)=>{await page.locator('.thread-row',{hasText:title,hasNotText:/(Edit|Fork) of/}).first().click();await page.locator('.thread-assistant').last().waitFor();await page.waitForFunction(()=>!document.querySelector('.workspace').getAnimations().length);};
