import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

const {createPrReview,githubRepo}=createRequire(import.meta.url)('../electron/pr-review.cjs');

const PATCH='@@ -1,4 +1,5 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;\n console.log(a);\n export {a};';
const FIXTURE={
 pulls:[{number:42,state:'open',head:{sha:'abc123'}}],
 pr:{number:42,title:'Add pull request tab',html_url:'https://github.com/acme/widgets/pull/42',state:'open',draft:false,merged:false,user:{login:'abhay'},base:{ref:'main'},head:{ref:'feat/pr-demo'},additions:24,deletions:5,labels:[{name:'ui',color:'7c3aed'},{name:'review',color:'0ea5e9'}],requested_reviewers:[{login:'mohammed'}]},
 reviews:[{user:{login:'carter'},state:'COMMENTED'},{user:{login:'carter'},state:'APPROVED'},{user:{login:'azaan'},state:'CHANGES_REQUESTED'}],
 files:[{filename:'src/app.js',status:'modified',additions:2,deletions:1,patch:PATCH},{filename:'src/new.js',status:'added',additions:3,deletions:0,patch:'@@ -0,0 +1,3 @@\n+export const x = 1;\n+export const y = 2;\n+export const z = 3;'},{filename:'old.txt',status:'removed',additions:0,deletions:4,patch:'@@ -1,2 +1,0 @@\n-gone\n-away'}],
 check_runs:{check_runs:[{name:'lint',status:'completed',conclusion:'success',html_url:'https://github.com/acme/widgets/runs/1'},{name:'test',status:'completed',conclusion:'failure',html_url:'https://github.com/acme/widgets/runs/2'},{name:'build',status:'completed',conclusion:'skipped',html_url:'https://github.com/acme/widgets/runs/3'},{name:'deploy',status:'in_progress',conclusion:null,html_url:'https://github.com/acme/widgets/runs/4'}]},
};

test('load maps gh api data and degrades to clean states', async()=>{
 assert.equal(githubRepo('git@github.com:acme/widgets.git'),'acme/widgets');
 const gitRun=async(root,args)=>args[0]==='rev-parse'?'feat/pr-demo':'git@github.com:acme/widgets.git';
 const calls=[];
 const run=async(file,args)=>{calls.push([file,...args]);const p=args[1];
  if(p.startsWith('repos/acme/widgets/pulls?'))return JSON.stringify(FIXTURE.pulls);
  if(p.endsWith('/reviews?per_page=100'))return JSON.stringify(FIXTURE.reviews);
  if(p.endsWith('/files?per_page=100'))return JSON.stringify(FIXTURE.files);
  if(p.includes('/check-runs'))return JSON.stringify(FIXTURE.check_runs);
  return JSON.stringify(FIXTURE.pr);};
 const data=await createPrReview({run,gitRun}).load('/x');
 assert.equal(data.state,'ok');assert.equal(data.pr.status,'open');
 assert.deepEqual(data.pr.reviewers,[{login:'carter',state:'APPROVED'},{login:'azaan',state:'CHANGES_REQUESTED'},{login:'mohammed',state:'REQUESTED'}]);
 assert.deepEqual(data.checks.map(c=>c.status),['passed','failed','skipped','pending']);
 assert.deepEqual(data.files.map(f=>f.status),['modified','added','deleted']);
 assert.ok(calls.length>=5&&calls.every(c=>c[0]==='gh'&&c[1]==='api'&&c.length===3),'only plain gh api GETs');
 const state=async(over,git=gitRun)=>(await createPrReview({run:over,gitRun:git}).load('/x')).state;
 const enoent=async()=>{throw Object.assign(new Error('spawn gh ENOENT'),{code:'ENOENT'});};
 assert.equal(await state(enoent),'no-gh');
 assert.equal(await state(async()=>{throw Object.assign(new Error('x'),{stderr:'gh auth login required'});}),'no-auth');
 assert.equal(await state(async()=>{throw new Error('boom');}),'error');
 assert.equal(await state(async()=>'[]'),'no-pr');
 assert.equal(await state(run,async(r,a)=>{if(a[0]==='rev-parse')throw new Error('no');}),'no-repo');
 assert.equal(await state(run,async(r,a)=>a[0]==='rev-parse'?'main':'git@gitlab.com:a/b.git'),'no-remote');
});

async function launch(path){
 const sh=resolve(tmpdir(),'sfx-pr-'+process.pid+'-'+Math.random().toString(36).slice(2));
 const home=await mkdtemp(resolve(tmpdir(),'suffice-pr-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-pr-project-')),bin=resolve(sh,'bin');
 await mkdir(bin,{recursive:true});await symlink('/usr/bin/git',resolve(bin,'git'));
 const git=args=>promisify(execFile)('git',['-C',cwd,...args],{windowsHide:true});
 await git(['init','-q','-b','feat/pr-demo']);await git(['remote','add','origin','git@github.com:acme/widgets.git']);
 await writeFile(resolve(cwd,'a.txt'),'x\n');await git(['add','a.txt']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']);
 if(path==='gh'){
  await writeFile(resolve(sh,'fixture.json'),JSON.stringify(FIXTURE));await writeFile(resolve(sh,'scenario'),'pr');
  const script=`#!${process.execPath}\nconst fs=require('fs'),d=${JSON.stringify(sh)},f=JSON.parse(fs.readFileSync(d+'/fixture.json','utf8')),s=fs.readFileSync(d+'/scenario','utf8').trim(),p=process.argv[3]||'';\nif(process.argv[2]!=='api'||process.argv.length!==4){console.error('unexpected gh call');process.exit(9);}\nconst out=v=>console.log(JSON.stringify(v));\nif(p.includes('/pulls?')) out(s==='none'?[]:f.pulls);\nelse if(p.includes('/reviews')) out(f.reviews);else if(p.includes('/files')) out(f.files);else if(p.includes('/check-runs')) out(f.check_runs);else out(f.pr);\n`;
  await writeFile(resolve(bin,'gh'),script);await chmod(resolve(bin,'gh'),0o755);
 }
 const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});const timestamp=new Date().toISOString(),id='one';
 await writeFile(resolve(dir,id+'.jsonl'),[{type:'session',version:3,id,timestamp,cwd},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Thread one'}],timestamp:Date.now()}},{type:'message',id:'assistant',parentId:'user',timestamp,message:{role:'assistant',content:[{type:'text',text:'Reply one'}],timestamp:Date.now(),stopReason:'stop'}}].map(e=>JSON.stringify(e)).join('\n')+'\n');
 const env={...process.env,PATH:bin,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_START_PROJECT:cwd,SUFFICE_SESSIONS_SOCKET:'sfx-feat-pr-review-'+process.pid,SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-pr-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,fileURLToPath(new URL('..',import.meta.url)),'--user-data-dir='+resolve(home,'electron')],env});
 return {app,sh,page:await app.firstWindow()};
}
const shots=process.env.PR_SHOTS_DIR;
async function snap(app,name){if(!shots)return;await mkdir(shots,{recursive:true});const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,name+'.png'),Buffer.from(b64,'base64'));}
async function snapBoth(app,page,name){for(const theme of ['dark','light']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(250);await snap(app,`${name}-${theme}`);}await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});}
async function openPr(page){
 await page.locator('.thread-row').filter({hasText:'Thread one'}).click();await page.locator('.thread-header').filter({hasText:'Thread one'}).waitFor();
 await page.getByRole('button',{name:'Toggle right panel'}).click();
 await page.locator('.panel-launcher').getByRole('button',{name:'Pull request',exact:true}).click();
}

test('Pull request tab walks overview, checks, files and diff, then empty state', {timeout:90000},async()=>{
 const {app,sh,page}=await launch('gh');
 try{
  await page.setViewportSize({width:1440,height:900}).catch(()=>{});
  await openPr(page);
  const panel=page.locator('.pq-panel');await panel.waitFor();
  assert.equal(await page.getByRole('tab',{name:/Pull request/}).count(),1);
  assert.equal(await panel.locator('.pq-title').textContent(),'Add pull request tab');
  assert.equal(await panel.locator('.pq-status').textContent(),'Open');
  assert.match(await panel.locator('.pq-meta').textContent(),/feat\/pr-demo → main · abhay/);
  assert.match(await panel.locator('.pq-labels').textContent(),/uireview/);
  assert.deepEqual(await panel.locator('.pq-row-name').allTextContents(),['carter','azaan','mohammed']);
  await snapBoth(app,page,'overview');
  const tab=name=>panel.getByRole('tab',{name:new RegExp('^'+name)});
  await tab('Checks').click();
  assert.deepEqual(await panel.locator('.pq-check').evaluateAll(rows=>rows.map(r=>r.dataset.status)),['passed','failed','skipped','pending']);
  assert.equal(await panel.getByRole('button',{name:'Open test on GitHub'}).count(),1);
  await snapBoth(app,page,'checks');
  await tab('Files').click();
  assert.equal(await panel.locator('.pq-file').count(),3);
  await snapBoth(app,page,'files');
  await panel.locator('.pq-file[data-path="src/new.js"]').click();
  assert.equal(await tab('Diff').getAttribute('aria-selected'),'true');
  await panel.locator('.pq-diff-file[data-selected="true"]').waitFor();
  assert.equal(await panel.locator('.pq-diff-file[data-selected="true"]').getAttribute('data-path'),'src/new.js');
  assert.equal(await panel.locator('.pq-diff-file[data-path="src/app.js"] .code-line.addition').count(),2);
  assert.equal(await panel.locator('.pq-diff-file[data-path="src/app.js"] .code-line.deletion').count(),1);
  assert.equal(await panel.locator('.pq-diff-file[data-path="src/app.js"] .code-line.hunk').count(),1);
  assert.equal(await panel.locator('.pq-diff-file[data-path="src/app.js"] .code-number').first().evaluate(el=>getComputedStyle(el).userSelect),'none');
  const tints=await panel.locator('.pq-diff-file[data-path="src/app.js"]').evaluate(el=>({add:getComputedStyle(el.querySelector('.addition')).backgroundColor,del:getComputedStyle(el.querySelector('.deletion')).backgroundColor}));
  assert.notEqual(tints.add,tints.del);assert.notEqual(tints.add,'rgba(0, 0, 0, 0)');
  await page.getByRole('tab',{name:/Diff/}).waitFor();await snapBoth(app,page,'diff');
  const gap=await panel.locator('.pq-diff-file[data-path="src/app.js"]').evaluate(el=>el.querySelector('.code-line.hunk').getBoundingClientRect().top-el.querySelector('.pq-diff-head').getBoundingClientRect().bottom);
  assert.ok(gap>=0&&gap<=1.5,'hunk row flush under diff header, gap '+gap+' '+await panel.locator('.pq-diff-file[data-path="src/app.js"] .pq-diff-code').evaluate(el=>{const c=el.querySelector('.panel-code'),h=el.querySelector('.hunk');return JSON.stringify([c.style.cssText,getComputedStyle(c).paddingTop,getComputedStyle(h).marginTop,h.previousElementSibling&&h.previousElementSibling.className,el.firstElementChild.className,getComputedStyle(el).paddingTop]);}));
  await tab('Overview').click();await tab('Overview').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await tab('Checks').getAttribute('aria-selected'),'true');assert.equal(await tab('Checks').evaluate(el=>document.activeElement===el),true);
  // no PR: close and reopen the panel to refetch
  await writeFile(resolve(sh,'scenario'),'none');
  const toggle=page.getByRole('button',{name:'Toggle right panel'});await toggle.click();await panel.waitFor({state:'hidden'});await toggle.click();await panel.waitFor();
  const none=page.locator('.pq-empty[data-state="no-pr"]');await none.waitFor({timeout:8000}).catch(async e=>{throw new Error(e.message+' | '+await page.evaluate(()=>document.querySelector('.pq-panel')?.innerText.slice(0,300)))});
  assert.match(await none.textContent(),/No pull request for feat\/pr-demo/);
  await snapBoth(app,page,'no-pr');
  await writeFile(resolve(sh,'scenario'),'pr');await none.getByRole('button',{name:'Refresh'}).click();await panel.waitFor();
  // refresh keeps scroll and tab focus
  await tab('Overview').click();
  await page.addStyleTag({content:'.pq-view{max-height:120px!important;overflow:auto!important}'});
  const before=await panel.locator('.pq-view').evaluate(el=>{el.scrollTop=40;return el.scrollTop;});assert.ok(before>0,'view scrollable');
  await panel.getByRole('button',{name:'Refresh pull request'}).click();await page.waitForTimeout(800);
  assert.equal(await panel.locator('.pq-view').evaluate(el=>el.scrollTop),before,'scroll kept after refresh');
  await tab('Overview').focus();await panel.getByRole('button',{name:'Refresh pull request'}).evaluate(el=>el.click());await page.waitForTimeout(800);
  assert.equal(await page.evaluate(()=>document.activeElement?.matches('.pq-tab')),true,'tab focus kept after refresh');
 }finally{await app.close();}
});

test('Pull request tab explains a missing gh', {timeout:60000},async()=>{
 const {app,page}=await launch('none');
 try{
  await openPr(page);
  const empty=page.locator('.pq-empty[data-state="no-gh"]');await empty.waitFor();
  assert.match(await empty.textContent(),/GitHub CLI not found/);
  await snapBoth(app,page,'no-gh');
 }finally{await app.close();}
});
