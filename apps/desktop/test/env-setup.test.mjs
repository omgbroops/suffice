import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const require=createRequire(import.meta.url),{createEnvSetup,scriptFor}=require('../electron/env-setup.cjs');
const SHOTS=process.env.ENV_SHOTS||'';
const git=(cwd,...a)=>execFileSync('git',['-C',cwd,'-c','user.name=t','-c','user.email=t@example.com',...a],{encoding:'utf8'});
async function repo(){const dir=await mkdtemp(join(tmpdir(),'env-repo-'));git(dir,'init','-q');await writeFile(join(dir,'bun.lock'),'one');git(dir,'add','.');git(dir,'commit','-qm','init');return dir;}

test('setup runs once, skips on an unchanged lockfile, reruns when the lockfile or script changes, never caches failure',async()=>{
 const dir=await repo(),file=join(await mkdtemp(join(tmpdir(),'env-cache-')),'c.json'),env=createEnvSetup({file}),log=[],emit=e=>log.push(e);
 const script='echo hi >> ran.txt; echo out; echo err 1>&2';
 assert.equal((await env.run(dir,script,emit)).ran,true);
 assert.match(log.filter(e=>e.phase==='output').map(e=>e.text).join(''),/out[\s\S]*err|err[\s\S]*out/);
 assert.equal((await env.run(dir,script,emit)).ran,false);assert.equal(log.at(-1).phase,'skipped');
 await writeFile(join(dir,'bun.lock'),'two');assert.equal((await env.run(dir,script,emit)).ran,true);
 assert.equal((await env.run(dir,script+' ',emit)).ran,true);
 assert.equal((await readFile(join(dir,'ran.txt'),'utf8')).trim().split('\n').length,3);
 await assert.rejects(env.run(dir,'exit 3',emit),/exit 3/);await assert.rejects(env.run(dir,'exit 3',emit),/exit 3/);
});
test('a worktree inherits its project script and has an empty cache',async()=>{
 const dir=await repo(),tree=join(await mkdtemp(join(tmpdir(),'env-wt-')),'w');git(dir,'worktree','add','-q','-b','x',tree);
 const items=[{path:dir,envSetup:'make'}];
 assert.equal(await scriptFor(tree,items),'make');assert.equal(await scriptFor(tree,[{path:dir}]),'');
});
test('desktop: Settings edits the script, a task shows the collapsible setup card, second task skips',{timeout:240000},async()=>{
 const dir=await repo(),home=await mkdtemp(join(tmpdir(),'suffice-env-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:dir,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-agent-env-'+process.pid,SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 const shot=async(page,name)=>{await page.waitForTimeout(700);if(!SHOTS)return;for(const t of ['light','dark']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},t);await page.waitForTimeout(200);await page.screenshot({path:resolve(SHOTS,`${name}-${t}.png`)});}};
 try{
  const page=app.windows()[0]||await app.firstWindow({timeout:100000});await page.setViewportSize({width:1440,height:900}).catch(()=>{});await page.locator('.composer').waitFor();
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>[{id:'fixture',provider:'openai',name:'Fixture model',efforts:['low','medium','high']}]);});await page.reload();await page.locator('.composer').waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-section="projects"]').click();
  if(process.env.THEME==='light'){await page.locator('[data-section="appearance"]').click();await page.getByRole('button',{name:'Light',exact:true}).click();await page.locator('[data-section="projects"]').click();}
  await page.locator('#env-script').fill('echo installing deps; sleep 1; echo ready');
  await shot(page,'settings-'+(process.env.THEME||'dark'));
  await page.locator('[data-environment] button').click();await page.locator('.env-note',{hasText:'Saved'}).waitFor();
  await page.keyboard.press('Escape');await page.locator('.composer').waitFor();
  const send=async text=>{await page.locator('#prompt').fill(text);await page.locator('.composer').evaluate(el=>el.requestSubmit());};
  await send('first');
  const card=page.locator('.env-setup-card').first();await card.waitFor();
  await page.locator('.env-setup-log',{hasText:'installing deps'}).waitFor();await shot(page,'running-'+(process.env.THEME||'dark'));
  await page.waitForFunction(()=>document.querySelector('.env-setup-card')?.dataset.state==='done',null,{timeout:20000});
  assert.equal(await card.locator('summary').textContent(),'Environment ready');
  assert.ok((await card.locator('.env-setup-log').textContent()).includes('ready'));
  await card.locator('summary').click();assert.equal(await card.evaluate(e=>e.open),true);await shot(page,'done-'+(process.env.THEME||'dark'));
  await page.waitForFunction(()=>document.querySelector('.composer').dataset.running!=='true',null,{timeout:30000}).catch(()=>{});
  await send('second');
  await page.waitForFunction(()=>[...document.querySelectorAll('.env-setup-card')].some(c=>c.dataset.state==='skipped'),null,{timeout:20000});
  await shot(page,'skipped-'+(process.env.THEME||'dark'));
  await page.evaluate(()=>window.sufficeDesktop.environment({script:'echo broke; exit 2'}));await page.waitForFunction(()=>document.querySelector('.composer').dataset.running!=='true',null,{timeout:30000});await send('third');
  await page.waitForFunction(()=>[...document.querySelectorAll('.env-setup-card')].some(c=>c.dataset.state==='failed'&&c.open),null,{timeout:20000}).catch(async e=>{throw new Error(e.message+' '+await page.evaluate(()=>document.body.innerText.slice(0,1500)+JSON.stringify(document.querySelector('.composer').dataset)));});
  assert.match(await page.locator('.env-setup-card[data-state="failed"] summary').textContent(),/failed · exit 2/);await shot(page,'failed-'+(process.env.THEME||'dark'));
 }finally{await app.close();}
});
