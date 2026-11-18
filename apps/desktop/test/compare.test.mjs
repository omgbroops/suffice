// Drives Best-of-N from the composer send menu in a hidden window with a fake provider.
// SHOTS=<dir> also writes dark and light screenshots of every state.
import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

test('composer send menu Compare runs fake models in worktrees, then keeps or discards',{timeout:120000},async()=>{
 const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-compare-'))),project=resolve(tmp,'demo'),home=resolve(tmp,'home'),shots=process.env.SHOTS;
 if(shots)await mkdir(shots,{recursive:true});
 await mkdir(project);const git=(...args)=>execFileSync('git',['-C',project,...args],{encoding:'utf8'});
 git('init','-q','-b','main');git('config','user.email','t@example.com');git('config','user.name','t');
 await writeFile(resolve(project,'package.json'),JSON.stringify({scripts:{test:"node -e \"process.exit(require('fs').existsSync('feature.txt')?0:1)\""}}));
 await writeFile(resolve(project,'README.md'),'# demo\n');git('add','-A');git('commit','-qm','init');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_COMPARE_AGENT:resolve('apps/desktop/test/compare-agent.mjs'),COMPARE_DELAY:'1200',SUFFICE_SESSIONS_SOCKET:'sfx-agent-best-of-n-'+process.pid,SUFFICE_HISTORY_HOME:resolve(tmp,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(tmp,'electron')],env});
 const errors=[];app.process().stderr?.on('data',data=>{if(/no-dialog/.test(String(data)))errors.push(String(data));});
 try{
  const page=await app.firstWindow();await page.locator('.composer').waitFor();
  const shot=async name=>{if(!shots)return;await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.waitForTimeout(250);const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,name+'.png'),Buffer.from(b64,'base64'));};
  const open=async()=>{await page.locator('#prompt').fill('Add a feature file');await page.locator('[data-action="send-menu"]').click();await page.getByRole('menuitem',{name:'Compare models'}).click();await page.locator('.compare-dialog').waitFor();await page.locator('.compare-model').first().waitFor();};
  for(const theme of ['dark','light']){
   await page.evaluate(theme=>{localStorage.setItem('suffice-theme',theme);},theme);await page.reload();await page.locator('.composer').waitFor();
   await open();
   assert.equal(await page.locator('.compare-prompt').inputValue(),'Add a feature file');
   assert.equal(await page.locator('.compare-model[aria-checked="true"]').count(),2);
   await shot(`1-setup-${theme}`);
   const run=async()=>{
   await page.locator('.compare-model').nth(2).click();assert.equal(await page.locator('.compare-model[aria-checked="true"]').count(),3);
   await page.locator('.compare-model').nth(1).click();await page.locator('.compare-model').nth(1).click();
   await page.locator('.compare-run').click();
   await page.locator('.compare-card[data-state="working"]').first().waitFor();
   assert.equal(await page.locator('.compare-card').count(),3);await shot(`2-running-${theme}`);
   await page.locator('.compare-keep').first().waitFor();
   const cards=page.locator('.compare-card');
   assert.match(await cards.nth(0).innerText(),/Fake alpha[\s\S]*\+2\s*−0\s*1 file[\s\S]*Tests pass[\s\S]*\$0\.0123/);
   assert.match(await cards.nth(1).innerText(),/Fake beta[\s\S]*Tests fail/);
   assert.match(await cards.nth(2).innerText(),/Fake gamma[\s\S]*Failed[\s\S]*provider offline/);
   assert.equal(await page.locator('.compare-keep').nth(2).isDisabled(),true);
   assert.equal(existsSync(resolve(project,'feature.txt')),false);
   assert.equal((await readdir(resolve(home,'worktrees'))).length,1);
   };
   await run();
   await shot(`3-results-${theme}`);
   await page.locator('.compare-keep').nth(0).click();await page.locator('.compare-dialog').waitFor({state:'detached'});
   await page.locator('.toast-message').filter({hasText:'Kept Fake alpha'}).waitFor();await page.waitForTimeout(600);await shot(`4-kept-${theme}`);
   assert.equal(await readFile(resolve(project,'feature.txt'),'utf8'),'alpha line 1\nalpha line 2\n');
   assert.equal(await readFile(resolve(project,'README.md'),'utf8'),'# demo\n');
   assert.equal((await readdir(resolve(home,'worktrees'))).length,0);
   git('clean','-fdq');git('checkout','-q','--','.');
   if(theme==='light'){
    await page.waitForTimeout(3500);await open();await run();
    await page.getByRole('button',{name:'Discard all'}).click();await page.locator('.compare-dialog').waitFor({state:'detached'});
    await page.waitForTimeout(500);assert.equal((await readdir(resolve(home,'worktrees'))).length,0);
    assert.equal(git('status','--porcelain'),'');
   }
  }
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
