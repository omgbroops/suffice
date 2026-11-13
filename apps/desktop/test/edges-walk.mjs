// Edge walk: empty sidebar, long reply + stop, provider error mid-reply, project folder gone, relaunch restores the last thread.
// Real main process, hidden window, fake harness (signed in, no network), env allowlist.
// usage: node apps/desktop/test/edges-walk.mjs <shots-dir>   (from repo root after `bun run desktop:build`)
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,mkdir,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
const out=resolve(process.argv[2]||'edges-shots');await mkdir(out,{recursive:true});
const home=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-edges-')));
const alpha=resolve(home,'alpha-site'),gone=resolve(home,'gone-app');await mkdir(alpha);await mkdir(gone);
const errors=[],state={};let n=0,app,page;
async function launch(extra={SUFFICE_FAKE_SIGNED_IN:'1'}){
 app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1',...extra})});
 await app.evaluate(({shell,dialog},p)=>{shell.openExternal=async()=>{};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},alpha);
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.composer').waitFor();await page.waitForTimeout(1500);
}
const seen=async name=>{
 n++;await page.screenshot({path:resolve(out,`${String(n).padStart(2,'0')}-${name}.png`),timeout:30000});
 const s=await page.evaluate(()=>({sidebar:document.querySelector('.sidebar-sessions')?.textContent.replace(/\s+/g,' ').trim().slice(0,80)||'',header:document.querySelector('.thread-header:not([hidden])')?.textContent||'',running:document.querySelector('.composer')?.dataset.running,send:document.querySelector('.send-button')?.getAttribute('aria-label'),last:[...document.querySelectorAll('.thread-message')].at(-1)?.textContent?.trim().slice(0,90)||'',messages:document.querySelectorAll('.thread-message').length,draft:document.querySelector('#prompt')?.value,toast:document.querySelector('.toast:not([hidden])')?.textContent||'',partial:[...document.querySelectorAll('.thread-assistant')].at(-1)?.textContent||'',errorShown:Boolean(document.querySelector('.thread-assistant .thread-error'))}));
 state[name]=s;console.log(String(n).padStart(2,'0'),name.padEnd(16),JSON.stringify(s));
};
const say=async(text,wait)=>{await page.locator('#prompt').fill(text);await page.locator('#prompt').press('Enter');await page.waitForTimeout(wait);};
// one saved thread whose project folder is about to disappear
const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
await launch();
try{
 await seen('empty');
 await page.getByRole('button',{name:'Choose project',exact:true}).click();await page.getByRole('button',{name:'New project',exact:true}).click();await page.waitForTimeout(800);
 await say('slow: write a long reply',1500);await seen('streaming');
 await page.getByRole('button',{name:'Stop task'}).click();await page.waitForTimeout(800);await seen('stopped');
 await say('after stop',1200);await seen('after-stop');
 await say('fail: break mid-reply',2000);await seen('provider-error');
 await say('retry after error',1200);await seen('after-error');
}finally{await app.close().catch(()=>{});}
// signed out: start sign-in, click away while it runs, then the login fails; a later send must ask again
await launch({});
try{
 await say('needs sign in',800);
 await page.getByRole('button',{name:'Continue in browser'}).click();await page.waitForTimeout(800);
 await page.mouse.click(1200,300);await page.waitForTimeout(400);
 await say('needs sign in',600);
 await page.locator('.sign-in-paste').fill('wrong-code');await page.locator('.sign-in-paste').press('Enter');await page.waitForTimeout(1200);
 await page.keyboard.press('Escape');await page.waitForTimeout(400);await seen('sign-in-failed');
 await say('needs sign in',800);await seen('send-after-failed-sign-in');
 state.askedAgain=await page.locator('.sign-in-menu').isVisible();
}finally{await app.close().catch(()=>{});}
// folder gone + relaunch: a saved thread in gone-app, folder deleted before launch
const now=new Date().toISOString();
await writeFile(resolve(dir,'gone.jsonl'),[{type:'session',version:3,id:'gone',timestamp:now,cwd:gone},{type:'message',id:'u',parentId:null,timestamp:now,message:{role:'user',content:[{type:'text',text:'Ship the landing page'}],timestamp:Date.now()}},{type:'message',id:'a',parentId:'u',timestamp:now,message:{role:'assistant',content:[{type:'text',text:'Shipped.'}],timestamp:Date.now(),stopReason:'stop'}},{type:'session_info',id:'name',parentId:'a',timestamp:now,name:'Ship the landing page'}].map(e=>JSON.stringify(e)).join('\n')+'\n');
await rm(gone,{recursive:true});
await launch();
try{
 await page.locator('.thread-row').filter({hasText:'Ship the landing page'}).click();await page.waitForTimeout(1000);await seen('gone-open');
 await say('one more change',1500);await seen('gone-send');
}finally{await app.close().catch(()=>{});}
await launch({SUFFICE_FAKE_SIGNED_IN:'1',SUFFICE_TEST_SLOW_IPC:'suffice:select-project=1500'});
try{
 await page.waitForTimeout(2000);await seen('relaunch');
 await say('where am I',1500);await seen('relaunch-send');
 await page.locator('.thread-row').filter({hasText:'slow: write a long reply'}).click();await page.waitForTimeout(1000);await seen('reopen-errored');
 const saved=await page.evaluate(()=>[...document.querySelectorAll('.thread-message')].map(m=>m.textContent.trim().slice(0,70)));console.log('   saved thread:',JSON.stringify(saved));
 const check=(ok,m)=>{if(!ok)errors.push(m);};
 check(state.streaming.running==='true'&&state.streaming.last.includes('chunk'),'long reply not streaming');
 check(state.stopped.running==='false'&&state.stopped.send==='Start session','stop did not end the task');
 check(state['after-stop'].last.includes('Fake harness reply: after stop'),'could not send after stopping');
 check(state['provider-error'].running==='false'&&/529|busy/i.test(state['provider-error'].last+state['provider-error'].toast),'provider error not shown');
 check(state['provider-error'].partial.includes('chunk 0')&&state['provider-error'].errorShown,'partial reply lost or error not marked as an error');
 check(state['provider-error'].sidebar.includes('slow: write a long reply'),'thread row vanished after a provider error');
 check(state['after-error'].last.includes('Fake harness reply: retry after error'),'could not send after a provider error');
 check(/missing|moved|deleted/i.test(state['gone-send'].last+state['gone-send'].toast),'missing project folder not explained');
 check(!/ENOENT|realpath|no such file/i.test(state['gone-send'].last+state['gone-send'].toast),'raw filesystem error shown for a missing project folder');
 check(state.relaunch.sidebar.includes('slow: write a long reply')&&state.relaunch.sidebar.includes('Ship the landing page'),'saved threads missing after relaunch');
 check(saved.some(t=>t.startsWith('chunk 0 chunk 1 chunk 2 chunk 3'))&&saved.some(t=>/529|busy/.test(t))&&saved.at(-1).includes('retry after error'),'saved thread lost the partial reply, the error or later turns');
 check(/folder is missing/.test(state['relaunch-send'].last),'restored thread ran in the saved project, not its own (startup restore race)');
 check(state.askedAgain,'a failed sign-in left sends blocked');
 check(state.relaunch.header==='Ship the landing page','relaunch did not restore the last thread');
 console.log('errors',JSON.stringify(errors));
}finally{await app.close().catch(()=>{});}
process.exit(errors.length?1:0);
