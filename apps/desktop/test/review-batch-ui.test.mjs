import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const SHOTS=process.env.REVIEW_SHOTS;
const base=Array.from({length:80},(_,i)=>`const value${i+1} = ${i+1};`);
const edit=(lines,changes)=>lines.map((text,i)=>changes[i+1]??text);
const changes={4:'const value4 = "one";',24:'const value24 = "two";',44:'const value44 = "three";',64:'const value64 = "four";'};

test('Changes: accept, reject, comment, one Send with outcome chips, errors stay sent',{timeout:120000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-review-batch-ui-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-review-batch-project-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});await mkdir(resolve(cwd,'src'),{recursive:true});
 const git=args=>promisify(execFile)('git',['-C',cwd,...args],{windowsHide:true});await git(['init','-q']);
 await writeFile(resolve(cwd,'src/calc.js'),base.join('\n')+'\n');await git(['add','.']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']);
 const changed=edit(base,changes);await writeFile(resolve(cwd,'src/calc.js'),changed.join('\n')+'\n');
 const now=new Date().toISOString();await writeFile(resolve(dir,'one.jsonl'),[{type:'session',version:3,id:'review-batch-fixture',timestamp:now,cwd},{type:'message',id:'user',parentId:null,timestamp:now,message:{role:'user',content:[{type:'text',text:'Review the calculator'}],timestamp:Date.now()}}].map(value=>JSON.stringify(value)).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fr-batched-inline-review-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,fileURLToPath(new URL('..',import.meta.url)),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Fake worker: canned replies in the shape the agent is asked for; records each turn.
  await app.evaluate(()=>{globalThis.turns=[];globalThis.reply=prompt=>{const ids=[...prompt.matchAll(/^\[(\w+)\]/gm)].map(m=>m[1]);return {text:'Updated.\n'+JSON.stringify([{id:ids[0],outcome:'fixed'},{id:ids[1],outcome:'skipped'},{id:ids[2],outcome:'no change needed'}])};};
   globalThis.sufficeTestRun=async payload=>{globalThis.turns.push(payload);await new Promise(resolve=>setTimeout(resolve,500));return globalThis.reply(payload.prompt);};});
  await page.setViewportSize({width:1440,height:900});await page.locator('.thread-row').click();
  await page.locator('.composer').evaluate(form=>{form.modelSelection={provider:'fake',model:'fake-1',effort:'low'};});
  await page.getByRole('button',{name:'Toggle right panel',exact:true}).click();await page.locator('.panel-launcher').getByRole('button',{name:'Changes',exact:true}).click();
  const row=page.locator('.change-row[data-path="src/calc.js"]');await row.waitFor();await row.click();await page.locator('.panel-code').waitFor();await page.evaluate(()=>document.documentElement.style.setProperty('--right-panel-width','790px'));await page.waitForTimeout(150);
  const shot=async name=>{if(!SHOTS)return;await mkdir(SHOTS,{recursive:true});for(const theme of ['dark','light']){await page.locator('html').evaluate((el,value)=>{el.dataset.theme=value;},theme);await page.waitForTimeout(250);await writeFile(resolve(SHOTS,`${name}-${theme}.png`),Buffer.from(await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')),'base64'));}await page.locator('html').evaluate(el=>{el.dataset.theme='dark';});};
  const tools=page.locator('.review-hunk-tools');assert.equal(await tools.count(),4);await shot('1-hunks');
  // Reject hunk 4: restored on disk immediately, the other three hunks stay.
  await tools.nth(3).getByRole('button',{name:'Reject change'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.review-hunk-tools').length===3);
  assert.equal(await readFile(resolve(cwd,'src/calc.js'),'utf8'),edit(changed,{64:base[63]}).join('\n')+'\n');
  // Accept hunk 1; it survives a reload of the panel.
  await tools.nth(0).getByRole('button',{name:'Accept change'}).click();await page.locator('.code-line.hunk.is-accepted').waitFor();
  assert.equal(await tools.nth(0).locator('.review-outcome').innerText(),'Accepted');
  // Comment on the added line of each hunk through the gutter button.
  for(const [i,needle] of ['"one"','"two"','"three"'].entries()){
   const line=page.locator('.code-line.addition',{hasText:needle});await line.hover();await line.locator('.review-gutter').click();
   await page.locator('.review-compose textarea').fill('Comment '+(i+1));await page.locator('.review-compose').getByRole('button',{name:'Add comment'}).click();
   await page.locator('.review-card .review-message',{hasText:'Comment '+(i+1)}).waitFor();
  }
  assert.equal(await page.locator('.review-card').count(),3);
  assert.equal(await page.locator('.review-send').innerText(),'Send 3 comments to agent');await shot('2-comments');
  // Footer clears the content: nothing sits under it.
  const box=await page.locator('.review-footer').boundingBox(),scroll=await page.locator('.panel-scroll').boundingBox();assert.ok(scroll.y+scroll.height<=box.y+1);
  await page.locator('.review-send').click();await page.locator('.review-footer[data-busy="true"]').waitFor();assert.equal(await page.locator('.review-card[data-state="sent"]').count(),3);await shot('3-sending');
  await page.locator('.review-card[data-state="fixed"]').waitFor();
  assert.deepEqual(await page.locator('.review-card .review-outcome').allInnerTexts(),['Fixed','Skipped','No change needed']);
  const turns=await app.evaluate(()=>globalThis.turns);assert.equal(turns.length,1);assert.match(turns[0].prompt,/Comment 1[\s\S]*Comment 2[\s\S]*Comment 3/);assert.match(turns[0].prompt,/src\/calc\.js:\d+/);assert.equal(await page.locator('.review-footer').count(),0);await shot('4-outcomes');
  // A malformed reply never turns into 'fixed': the card stays sent with an error row.
  const line=page.locator('.code-line.addition',{hasText:'"two"'});await line.hover();await line.locator('.review-gutter').click();await page.locator('.review-compose textarea').fill('Again');await page.locator('.review-compose').getByRole('button',{name:'Add comment'}).click();
  await app.evaluate(()=>{globalThis.reply=()=>({text:'Everything is fixed.'});});
  await page.locator('.review-send').click();await page.locator('.review-card[data-state="sent"] .review-error').waitFor();
  assert.equal(await page.locator('.review-card',{hasText:'Again'}).locator('.review-outcome').innerText(),'Sent');await shot('5-error');
  await page.locator('.review-reopen').click();await page.locator('.review-card[data-state="open"]').waitFor();
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
