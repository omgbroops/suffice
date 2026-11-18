import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
// Regression: switching away from a scrolled long thread and back must restore the same message at the same offset.
const seed=async(home,cwd,id,pairs,q='Question')=>{const dir=resolve(home,'sessions',id);await mkdir(dir,{recursive:true});const now=new Date().toISOString(),e=[{type:'session',version:3,id,timestamp:now,cwd}];let p=null;
 for(let i=0;i<pairs;i++){e.push({type:'message',id:'u'+i,parentId:p,timestamp:now,message:{role:'user',content:[{type:'text',text:`${q} ${i}`}],timestamp:1000+i}});
  e.push({type:'message',id:'a'+i,parentId:'u'+i,timestamp:now,message:{role:'assistant',provider:'opencode-go',model:'fixture',content:[{type:'text',text:`## Answer ${i}\n\n- item a\n- item b\n\n\`\`\`ts\nlet x${i}=await fetch('/api');\n\`\`\`\n\nInline $e^{i\\pi}+1=0$\n\n${'Long paragraph text. '.repeat(i%7*12)}\n`}]}});p='a'+i;}
 await writeFile(resolve(dir,'thread.jsonl'),e.map(x=>JSON.stringify(x)).join('\n')+'\n');};
test('thread switch restores the reading position within 2 px',{timeout:240000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-tsw-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-tsw-proj-'));
 await seed(home,cwd,'long',1140);await seed(home,cwd,'other',3,'Elsewhere');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_HISTORY_HOME:resolve(home,'history'),SUFFICE_SESSIONS_SOCKET:'sfx-r2-tperf-fin-'+process.pid};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{const page=await app.firstWindow();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  const rows=page.locator('.thread-row');await rows.first().waitFor();
  const longRow=async()=>{const n=await rows.count();for(let i=0;i<n;i++)if((await rows.nth(i).innerText()).includes('Question 0'))return rows.nth(i);throw new Error('no long row');};
  const otherRow=async()=>{const n=await rows.count();for(let i=0;i<n;i++)if((await rows.nth(i).innerText()).includes('Elsewhere'))return rows.nth(i);throw new Error('no other row');};
  const centre=()=>page.evaluate(()=>{const t=document.querySelector('.thread-messages').parentElement,tr=t.getBoundingClientRect(),cy=tr.top+tr.height/2,kids=[...t.querySelector('.thread-messages').children],i=kids.findIndex(c=>c.getBoundingClientRect().bottom>cy);return {i,text:kids[i].textContent.slice(0,24),y:kids[i].getBoundingClientRect().top};});
  await (await longRow()).click();
  await page.waitForFunction(()=>document.querySelector('.thread-messages')?.children.length>=2200,null,{timeout:90000});
  await page.waitForTimeout(1500);
  await page.mouse.move(700,400);
  for(let i=0;i<120;i++){await page.mouse.wheel(0,-600);await page.waitForTimeout(20);}
  for(const n of [1057,1100]){
   await page.evaluate(n=>{const u=[...document.querySelectorAll('.thread-messages .thread-user')].find(x=>x.textContent.includes('Question '+n+'\n')||x.textContent.trim()==='Question '+n);u.scrollIntoView({block:'center'});},n);
   await page.waitForTimeout(2500);
   const before=await centre();
   await (await otherRow()).click();await page.waitForTimeout(800);
   await (await longRow()).click();await page.waitForTimeout(2000);
   const after=await centre();
   assert.equal(after.i,before.i,`centre message moved: ${JSON.stringify({before,after})}`);
   assert.ok(Math.abs(after.y-before.y)<=2,`offset moved: ${JSON.stringify({before,after})}`);
  }
 }finally{await app.close();await rm(home,{recursive:true,force:true});await rm(cwd,{recursive:true,force:true});}
});
