import electronPath from 'electron';
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {branchFixture} from './branch-fixture.mjs';
const SHOTS=process.env.WT_SHOTS||'';
const exists=p=>stat(p).then(()=>true,()=>false);

test('own-worktree thread: toggle creates it, header shows branch, diff, PR dry run, merge, discard',{timeout:120000},async()=>{
 const {cwd,git}=await branchFixture(),home=await mkdtemp(resolve(tmpdir(),'suffice-wt-ui-')),history=await mkdtemp(resolve(tmpdir(),'suffice-wt-hist-'));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:cwd,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_PR_DRY_RUN:'1',SUFFICE_SESSIONS_SOCKET:'sfx-agent-worktree-per-thread',SUFFICE_HISTORY_HOME:history};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 const stderr=[];app.process().stderr.on('data',d=>stderr.push(String(d)));
 const shot=async(page,name)=>{if(!SHOTS)return;for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(250);const png=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.capturePage().then(i=>i.toPNG().toString('base64')));await writeFile(resolve(SHOTS,`${name}-${theme}.png`),Buffer.from(png,'base64'));}};
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({ipcMain,BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setContentSize(1440,900);ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>[{id:'fixture',provider:'openai',name:'Fixture model',efforts:['low','medium','high']}]);});
  await page.reload();await page.locator('.composer').waitFor();await page.waitForFunction(()=>!document.querySelector('.git-pill')?.disabled&&!document.querySelector('.worktree-toggle').hidden);
  const toggle=page.getByRole('switch',{name:/Isolate in worktree/});assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await shot(page,'1-toggle-off');
  await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'true');await shot(page,'2-toggle-on');
  // Real send path: the run fails offline, but the worktree is made before the agent starts.
  await page.locator('#prompt').fill('make b.txt');await page.locator('.composer').evaluate(el=>el.requestSubmit());
  let path,branch;for(let i=0;i<60&&!path;i++){const list=(await git('worktree','list','--porcelain')).split('\n\n');const extra=list.find(block=>block.includes('branch refs/heads/agent/'));if(extra){path=extra.match(/^worktree (.+)$/m)[1];branch=extra.match(/branch refs\/heads\/(.+)$/m)[1];}else await page.waitForTimeout(500);}
  if(!path)console.log('DEBUG',await page.evaluate(()=>String(document.querySelector('.composer').ownWorktree)),await page.evaluate(()=>document.body.innerText.slice(0,600)),stderr.join('').slice(0,800));assert.ok(path,'worktree created by the send');assert.match(path,/worktrees/);assert.equal(await git('branch','--show-current'),'main');
  // Thread whose cwd is that worktree (no model offline, so the session is written directly).
  const folder=resolve(home,'sessions/fixture'),timestamp=new Date().toISOString();await mkdir(folder,{recursive:true});
  await writeFile(resolve(folder,'wt.jsonl'),[{type:'session',version:3,id:'wt-fixture',timestamp,cwd:path},{type:'message',id:'u',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'make b.txt'}],timestamp:Date.now()}},{type:'message',id:'a',parentId:'u',timestamp,message:{role:'assistant',content:[{type:'text',text:'Created b.txt in the worktree.'}],timestamp:Date.now(),stopReason:'stop'}}].map(JSON.stringify).join('\n')+'\n');
  await writeFile(resolve(path,'b.txt'),'work');
  await page.reload();await page.locator('.thread-row').filter({hasText:'make b.txt'}).first().click();
  const bar=page.locator('.worktree-bar');await bar.waitFor({state:'visible'});
  assert.equal((await bar.locator('.worktree-branch').textContent()).trim(),branch);await page.getByText('0 commits, 1 uncommitted').waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.worktree-toggle')].every(t=>t.hidden));
  await shot(page,'3-header');
  await page.getByRole('button',{name:'Open diff'}).click();const diff=page.getByRole('dialog',{name:'Worktree diff'});await diff.waitFor();assert.match(await diff.textContent(),/b\.txt/);assert.match(await diff.textContent(),/\+work/);await shot(page,'4-diff');await diff.getByRole('button',{name:'Close'}).click();assert.equal(await diff.isHidden(),true);
  await page.getByRole('button',{name:'Create PR'}).click();await page.getByText(/PR dry run: git push -u origin agent\/.* ; gh pr create/).waitFor();await shot(page,'5-pr-dry-run');
  await page.getByRole('button',{name:/Merge into main/}).click();await page.getByText('Merged into main').waitFor();assert.equal(await readFile(resolve(cwd,'b.txt'),'utf8'),'work');await page.waitForFunction(()=>document.querySelector('.worktree-note').textContent.startsWith('0 commits'));await shot(page,'6-merged');
  const discard=page.getByRole('button',{name:'Discard'});await discard.click();await page.getByRole('button',{name:'Confirm discard'}).waitFor();await shot(page,'7-confirm-discard');await page.getByRole('button',{name:'Confirm discard'}).click();await bar.waitFor({state:'hidden'});
  assert.equal(await exists(path),false);assert.equal(await git('branch','--list',branch),'');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
 assert.ok(!stderr.join('').includes('[no-dialog] uncaught'),stderr.join(''));
});
