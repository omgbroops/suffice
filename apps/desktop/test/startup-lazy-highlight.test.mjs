import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const dist=resolve('apps/desktop/dist');
// The eager graph (index.html entry, main chunk, their static imports) must not carry the highlighter or katex.
test('eager chunks exclude shiki and katex',async()=>{
 const seen=new Set(),visit=async f=>{if(seen.has(f))return;seen.add(f);const t=await readFile(resolve(dist,f),'utf8');for(const m of t.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g))await visit('assets/'+m[1]);};
 const files=await readdir(resolve(dist,'assets'));
 await visit('assets/'+files.find(f=>/^index-.*\.js$/.test(f)));await visit('assets/'+files.find(f=>/^main-.*\.js$/.test(f)));
 for(const f of seen){const t=await readFile(resolve(dist,f),'utf8');assert.ok(!/codeToTokens|createHighlighter|katex-html/.test(t),f+' eagerly carries a heavy library');}
});
test('code block opened right after launch is coloured by the lazy highlighter',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-lazyhl-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-lazyhl-proj-')),now=new Date().toISOString();
 const dir=resolve(home,'sessions','one');await mkdir(dir,{recursive:true});
 const e=[{type:'session',version:3,id:'one',timestamp:now,cwd},
  {type:'message',id:'u0',parentId:null,timestamp:now,message:{role:'user',content:[{type:'text',text:'Show code'}],timestamp:1000}},
  {type:'message',id:'a0',parentId:'u0',timestamp:now,message:{role:'assistant',provider:'opencode-go',model:'fixture',content:[{type:'text',text:'Here:\n\n```ts\nlet x=await fetch("/api");\n```\n'}]}}];
 await writeFile(resolve(dir,'thread.jsonl'),e.map(x=>JSON.stringify(x)).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_HISTORY_HOME:resolve(home,'history'),SUFFICE_SESSIONS_SOCKET:'sfx-forge-r2-startup-'+process.pid};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{const page=await app.firstWindow();
  await page.locator('.thread-row').first().click();
  await page.waitForFunction(()=>{const c=document.querySelector('.thread-messages pre code');return c&&c.querySelectorAll('span.syntax-token').length>1;},null,{timeout:30000});
  const text=await page.evaluate(()=>document.querySelector('.thread-messages pre code').textContent);
  assert.equal(text.trim(),'let x=await fetch("/api");');
 }finally{await app.close().catch(()=>{});}
});
