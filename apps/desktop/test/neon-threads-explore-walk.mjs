// Neon Threads + Explore pane walk: real main process, hidden window, fake harness.
// usage: node apps/desktop/test/neon-threads-explore-walk.mjs <shots-dir> <git-repo-with-github-remote>   (after the desktop build)
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,mkdir,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
const out=resolve(process.argv[2]||'neon-te-shots'),repo=resolve(process.argv[3]||resolve(process.env.HOME,'suffice-desktop'));await mkdir(out,{recursive:true});
const home=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-neon-te-')));
// second project: a small git repo with a README, a nested folder, two commits and two branches
const proj=resolve(home,'notes-app');await mkdir(resolve(proj,'src/lib'),{recursive:true});
await writeFile(resolve(proj,'README.md'),'# Notes app\n\nA **tiny** notes app.\n\n- one\n- two\n\n```js\nconsole.log(1)\n```\n');
await writeFile(resolve(proj,'src/main.js'),'export const a = 1;\nexport const b = 2;\n');await writeFile(resolve(proj,'src/lib/util.js'),'export const x = 1;\n');
const g=(...a)=>execFileSync('git',['-C',proj,'-c','user.name=Tester','-c','user.email=t@example.com',...a],{stdio:'pipe'});
g('init','-q','-b','main');g('add','.');g('commit','-qm','Initial notes app');await writeFile(resolve(proj,'src/main.js'),'export const a = 1;\n');g('commit','-qam','Trim main');g('branch','feature-x');
const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
for(const [id,title,mins,cwd] of [['one','Fix the session restore race',40,repo],['two','Speed up the seafood tests',60*26,repo],['three','Add the neon layout',60*24*6,repo],['four','Sketch the notes sync',60*24*40,proj],['five','Notes search index',90,proj]]){
 const t=new Date(Date.now()-mins*60000).toISOString();
 const entries=[{type:'session',version:3,id,timestamp:t,cwd},{type:'message',id:'u',parentId:null,timestamp:t,message:{role:'user',content:[{type:'text',text:title}],timestamp:Date.parse(t)}},{type:'message',id:'a',parentId:'u',timestamp:t,message:{role:'assistant',content:[{type:'text',text:'Done.'}],provider:'fake',model:'fake-model-1',usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.parse(t)}}];
 await writeFile(resolve(dir,id+'.jsonl'),entries.map(e=>JSON.stringify(e)).join('\n')+'\n');
}
const {threadId}=await import('../electron/threads.mjs');
await writeFile(resolve(home,'thread-meta.json'),JSON.stringify({[threadId(resolve(dir,'one.jsonl'))]:{branch:'bg-perf'}}));
const errors=[];
const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1',SUFFICE_FAKE_SIGNED_IN:'1'})});
try{
 await app.evaluate(({shell,dialog},p)=>{shell.openExternal=async()=>{};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},proj);
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('.composer').waitFor();
 await page.evaluate(()=>localStorage.setItem('suffice-background','neon-mech'));await page.reload();
 await page.locator('.nx-nav').waitFor();await page.locator('.thread-row').first().waitFor({timeout:15000});
 const shot=async name=>page.screenshot({path:resolve(out,name+'.png'),timeout:30000});
 const pane=page.locator('.nx-pane');

 // Explore with no project: empty state, button opens the picker (the project list menu)
 await page.locator('.nx-row[data-nx="explore"]').click();await pane.locator('.te-big').waitFor();
 assert.match(await pane.locator('.te-big').textContent(),/No project selected/);await shot('01-explore-empty');
 await page.evaluate(()=>{window.__picked=0;document.querySelector('.project-picker').addEventListener('click',()=>window.__picked++,{capture:true});});
 await pane.locator('[data-pick]').click();assert.equal(await page.evaluate(()=>window.__picked),1,'empty-state button clicks the project picker');
 await page.keyboard.press('Escape');await page.mouse.click(5,5);

 // Threads pane
 await page.locator('.nx-row[data-nx="threads"]').click();await pane.locator('.te-row').first().waitFor();
 await page.waitForFunction(()=>document.querySelector('.nx-pane .nx-pr'),null,{timeout:20000});
 const rows=()=>pane.locator('.te-row').allTextContents();
 console.log('rows',await rows());assert.equal((await rows()).length,5,'all saved threads listed');
 assert.deepEqual(await pane.locator('.te-group').allTextContents(),['Today','Yesterday','This week','Older'],'recency groups');
 assert.equal(await pane.locator('.te-row .nx-av').count(),5,'avatar on every row');
 const first=(await rows())[0];assert.ok(first.includes('Fix the session restore race')&&first.includes('suffice-desktop'),'newest first with project');
 assert.ok((await rows()).some(t=>t.includes('bg-perf')&&t.includes('#2')&&t.includes('fake-model-1')),'branch, PR and model on the row');
 await shot('02-threads');
 await pane.locator('.te-input').fill('seafood');assert.equal((await rows()).length,1,'search filters by title');await shot('03-threads-search');
 await pane.locator('.te-input').fill('zzzz');assert.match(await pane.locator('.te-empty').textContent(),/No threads match/,'empty filter state');
 await pane.locator('.te-input').fill('');
 await pane.locator('[data-f="project"]').selectOption('notes-app');assert.equal((await rows()).length,2,'project filter');
 await pane.locator('[data-f="project"]').selectOption('');
 await pane.locator('[data-f="pr"]').selectOption('has');assert.equal((await rows()).length,1,'Has PR filter');await shot('04-threads-pr');
 const st=(await pane.locator('.nx-pr').first().getAttribute('data-state'));
 await pane.locator('[data-f="pr"]').selectOption(st==='merged'?'merged':'open');assert.equal((await rows()).length,1,'PR state filter ('+st+')');
 await pane.locator('[data-f="pr"]').selectOption(st==='merged'?'open':'merged');assert.equal((await rows()).length,0,'other PR state hides it');
 await pane.locator('[data-f="pr"]').selectOption('all');
 await pane.locator('.te-row',{hasText:'Notes search index'}).click();
 await page.locator('.thread-row[aria-pressed="true"]').waitFor();
 assert.equal(await page.locator('.nx-pane').count(),0,'opening a thread closes the pane');
 assert.match(await page.locator('.thread-row[aria-pressed="true"]').textContent(),/Notes search index/,'the clicked thread opened');
 await shot('05-thread-opened');

 // Explore with the project selected (opening the thread selected notes-app)
 await page.locator('.nx-row[data-nx="explore"]').click();await pane.locator('.te-md').waitFor();
 assert.ok((await pane.locator('.te-md strong').textContent())==='tiny','README renders as markdown');
 assert.deepEqual(await pane.locator('.te-tree > .te-node > .te-dir, .te-tree > .te-file').allTextContents(),['src','README.md'],'tree: folders first');await shot('06-explore-readme');
 await pane.locator('.te-dir',{hasText:'src'}).first().click();await pane.locator('.te-kids .te-file',{hasText:'main.js'}).waitFor();
 await pane.locator('.te-dir',{hasText:'lib'}).click();await pane.locator('.te-file',{hasText:'util.js'}).waitFor();
 await pane.locator('.te-file',{hasText:'main.js'}).click();await pane.locator('.te-code').waitFor();
 assert.ok((await pane.locator('.te-code').textContent()).includes('export const a = 1;'),'file contents');assert.equal(await pane.locator('.te-ln').count(),2,'line numbers');await shot('07-explore-file');
 await page.locator('[data-view="branches"]').click();await pane.locator('.te-trow').first().waitFor();
 const br=await pane.locator('.te-trow').allTextContents();console.log('branches',br);assert.ok(br.length===2&&br.some(t=>t.includes('feature-x'))&&br.some(t=>t.includes('main')&&t.includes('current')),'branches with current marked');await shot('08-explore-branches');
 await page.locator('[data-view="commits"]').click();await pane.locator('.te-sha').first().waitFor();
 const cm=await pane.locator('.te-trow').allTextContents();console.log('commits',cm);assert.ok(cm.length===2&&cm[0].includes('Trim main')&&cm[0].includes('Tester'),'recent commits');await shot('09-explore-commits');
 await page.locator('[data-view="tree"]').click();await pane.locator('.te-code').waitFor();
 await page.locator('[data-ask]').click();
 assert.equal(await page.locator('.nx-pane').count(),0,'Ask closes the pane');assert.equal(await page.locator('#prompt').inputValue(),'@src/main.js ','Ask fills the composer');await shot('10-ask');
 assert.deepEqual(errors,[],'no page errors');
 console.log('PASS');
}finally{await app.close();}
