import electronPath from 'electron';
// Hidden capture of the CLI-session UI against a fake agent, a temp tmux socket and a synthetic history home.
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,rm,utimes,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const output=resolve('apps/desktop/visual-review/sessions-ui');await mkdir(output,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-sessions-ui-')));
const socket=`sfx-cap-${process.pid}`;
const home=resolve(tmp,'home'),project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice');
for(const d of [project,data,suffice])await mkdir(d,{recursive:true});
const j=(...rows)=>rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
const day=24*3600e3,old=(n)=>new Date(Date.now()-n*day);
async function seed(rel,body,when){const p=resolve(home,rel);await mkdir(resolve(p,'..'),{recursive:true});await writeFile(p,body);await utimes(p,when,when);}
await seed('.claude/projects/-tmp-api-server/c1.jsonl',j(
 {type:'user',uuid:'u1',timestamp:old(1).toISOString(),cwd:'/tmp/api-server',entrypoint:'cli',message:{content:'Add rate limiting to the API'}},
 {type:'assistant',uuid:'a1',timestamp:old(1).toISOString(),message:{content:[{type:'text',text:'Added a token bucket limiter in `limiter.js`.'}]}}),old(1));
await seed('.claude/projects/-tmp-docs-site/c2.jsonl',j(
 {type:'user',uuid:'u2',timestamp:old(4).toISOString(),cwd:'/tmp/docs-site',entrypoint:'cli',message:{content:'Fix broken links in the docs'}},
 {type:'assistant',uuid:'a2',timestamp:old(4).toISOString(),message:{content:[{type:'text',text:'Fixed 6 links.'}]}}),old(4));
await seed('.codex/sessions/2026/11/01/rollout-2026-11-01T00-00-00-x3.jsonl',j(
 {type:'session_meta',payload:{id:'x3',cwd:'/tmp/cli-tool',timestamp:old(2).toISOString()}},
 {type:'response_item',timestamp:old(2).toISOString(),payload:{type:'message',role:'user',content:[{text:'Port the parser to Rust'}]}}),old(2));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',
 SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,
 SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:home,
 NODE_PATH:process.env.NODE_PATH||'/Users/abhayg/suffice-desktop-wt/voice/node_modules'});
const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),`--user-data-dir=${data}`],env});
let page;try{
 page=await app.firstWindow();page.on('console',m=>{if(m.type()==='error')console.error('PAGE',m.text().slice(0,200));});const errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.locator('[data-action="send-menu"]').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 const shot=n=>page.screenshot({path:resolve(output,n)});
 // (d) start menu
 await page.locator('[data-action="send-menu"]').click();await page.waitForTimeout(300);
 await shot('start-menu.png');
 await page.locator('[data-menu-action="import-chat:open"]').click();
 await page.locator('.session-import-row').first().waitFor();await page.waitForTimeout(350);
 await shot('import.png');          // (e)
 await page.keyboard.press('Escape');await page.waitForTimeout(300);
 await page.locator('[data-action="send-menu"]').click();await page.waitForTimeout(250);
 await page.locator('[data-menu-action="cli-session:fake"]').click();
 await page.locator('.session-row').first().waitFor();
 await page.locator('.thread-header--session').waitFor();
 await page.locator('#prompt').fill('hello');await page.locator('#prompt').press('Enter');
 await page.locator('.thread-message',{hasText:'ECHO:hello'}).waitFor({timeout:15000});
 await page.waitForTimeout(900);
 await shot('chat.png');            // (a)+(b) sidebar row with state and Chat view
 await page.locator('.session-toggle button',{hasText:'Terminal'}).click();
 await page.locator('.session-terminal .xterm-rows').waitFor({timeout:15000});
 await page.waitForFunction(()=>document.querySelector('.session-terminal .xterm-rows')?.textContent.includes('ECHO:hello'),null,{timeout:15000});
 await page.waitForTimeout(300);
 await shot('terminal.png');        // (c)
 await writeFile(resolve(output,'verification.json'),JSON.stringify({viewport:{width:1440,height:900},pageErrors:errors},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({ready:true,output}));
}catch(e){try{console.error('DBG',JSON.stringify(await page.evaluate(()=>({t:document.querySelector('.session-terminal')?.innerHTML.slice(0,600),r:document.querySelector('.session-terminal .xterm-rows')?.textContent.slice(0,300)}))));}catch{}console.error('FAIL',e.message.slice(0,1500));process.exitCode=1;}finally{
 await Promise.race([app.close(),new Promise(r=>setTimeout(r,5000))]).catch(()=>{});
 try{execFileSync('tmux',['-L',socket,'kill-server'],{stdio:'ignore'});}catch{}
 await rm(tmp,{recursive:true,force:true});
}
process.exit(process.exitCode||0);
