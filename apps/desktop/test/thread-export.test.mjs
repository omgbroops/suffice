import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';import electronPath from 'electron';import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {toMarkdown,toHtml} from '../electron/thread-export.mjs';
const thread={title:'Fix <login> bug',cwd:'/p',messages:[{role:'user',content:[{type:'text',text:'Fix it'}]},{role:'assistant',content:[{type:'text',text:'Editing.'},{type:'toolCall',id:'c1',name:'edit',text:JSON.stringify({path:'a.js',oldText:'let a=1',newText:'let a=2'})}]},{role:'toolResult',toolCallId:'c1',toolName:'edit',content:[{type:'text',text:'ok ```fence```'}]}]};
test('markdown and html carry messages, collapsed tool calls and diffs; html is escaped and self-contained',()=>{
 const md=toMarkdown(thread);assert.match(md,/^# Fix <login> bug/);assert.match(md,/## You\n\nFix it/);assert.match(md,/<details>\n<summary>edit<\/summary>/);assert.match(md,/-let a=1\n\+let a=2/);assert.match(md,/````\nok ```fence```\n````/);
 const html=toHtml(thread);assert.match(html,/<title>Fix &lt;login&gt; bug<\/title>/);assert.match(html,/<details><summary>edit<\/summary>/);assert.match(html,/<span class="del">-let a=1<\/span>/);assert.doesNotMatch(html,/<script|<link|src=|https?:/);
});
test('thread menu and Cmd+K export write real files through a stubbed save dialog and copy to a stubbed clipboard',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-export-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});const ts=new Date().toISOString();
 const entries=[{type:'session',version:3,id:'export-fixture',timestamp:ts,cwd:home},{type:'message',id:'u1',parentId:null,timestamp:ts,message:{role:'user',content:[{type:'text',text:'Fix it'}],timestamp:Date.now()}},{type:'message',id:'a1',parentId:'u1',timestamp:ts,message:{role:'assistant',content:[{type:'text',text:'Editing now.'},{type:'toolCall',id:'c1',name:'edit',arguments:{path:'a.js',oldText:'let a=1',newText:'let a=2'}}],timestamp:Date.now()}},{type:'message',id:'t1',parentId:'a1',timestamp:ts,message:{role:'toolResult',toolCallId:'c1',toolName:'edit',content:[{type:'text',text:'Edited a.js'}],isError:false,timestamp:Date.now()}}];
 await writeFile(resolve(dir,'chat.jsonl'),entries.map(JSON.stringify).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-pre-export-share',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-export-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 const shots=process.env.EXPORT_SHOTS;
 try{
  const out={md:resolve(home,'out.md'),html:resolve(home,'out.html')};
  await app.evaluate(({dialog,clipboard},out)=>{globalThis.saves=[];globalThis.clip=[];let n=0;dialog.showSaveDialog=async(...a)=>{const o=a.at(-1);globalThis.saves.push(o);return {canceled:false,filePath:o.filters[0].extensions[0]==='md'?out.md:out.html};};clipboard.writeText=t=>globalThis.clip.push(t);},out);
  const page=await app.firstWindow();await page.setViewportSize?.({width:1440,height:900});const row=page.locator('.thread-row').first();await row.waitFor();await row.click();
  const shot=async name=>{if(!shots)return;for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:resolve(shots,`${name}-${theme}.png`)});}};
  await row.click({button:'right'});await page.getByRole('menuitem',{name:'Export',exact:true}).click();await shot('menu');
  await page.getByRole('menuitem',{name:'Markdown file',exact:true}).click();
  await page.waitForFunction(()=>true);await new Promise(r=>setTimeout(r,500));
  const md=await readFile(out.md,'utf8');assert.match(md,/## You\n\nFix it/);assert.match(md,/Editing now\./);assert.match(md,/<summary>edit<\/summary>/);assert.match(md,/-let a=1\n\+let a=2/);assert.match(md,/Edited a\.js/);
  assert.equal(await app.evaluate(()=>globalThis.saves[0].filters[0].extensions[0]),'md');
  await page.keyboard.press('Meta+k');await page.getByRole('combobox').fill('Export thread');await shot('palette');
  await page.getByRole('option',{name:/Export thread as HTML/}).click();await new Promise(r=>setTimeout(r,500));
  const html=await readFile(out.html,'utf8');assert.match(html,/^<!doctype html>/);assert.match(html,/<details><summary>edit<\/summary>/);assert.match(html,/class="del">-let a=1/);assert.doesNotMatch(html,/<script|<link|https?:/);
  await row.click({button:'right'});await page.getByRole('menuitem',{name:'Export',exact:true}).click();await page.getByRole('menuitem',{name:'Copy as Markdown',exact:true}).click();await new Promise(r=>setTimeout(r,500));
  const clip=await app.evaluate(()=>globalThis.clip);assert.equal(clip.length,1);assert.equal(clip[0],md);
  await shot('toast');
 }finally{await app.close();}
});
