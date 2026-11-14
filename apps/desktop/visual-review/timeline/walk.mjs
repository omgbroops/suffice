// Timeline walk. usage (from ~/suffice-neon, after `vite build`): node apps/desktop/visual-review/timeline/walk.mjs
// Starts seed_api.py per scenario, drives the real Electron app (hidden window), writes PNGs plus click-script.json (step -> frame).
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,mkdir,realpath} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {electronPath,hiddenMain,testEnv} from '../../test/electron-app.mjs';
import {threadId} from '../../electron/threads.mjs';
const here=dirname(fileURLToPath(import.meta.url)),out=here;
const home=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-tl-walk-')));
const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
const t=new Date().toISOString();
await writeFile(resolve(dir,'todo.jsonl'),[{type:'session',version:3,id:'todo',timestamp:t,cwd:home},
 {type:'message',id:'u',parentId:null,timestamp:t,message:{role:'user',content:[{type:'text',text:'Add bulk complete to the todo app'}],timestamp:Date.now()}},
 {type:'message',id:'a',parentId:'u',timestamp:t,message:{role:'assistant',content:[{type:'text',text:'Done. Bulk complete is in; the checkout test failed at step 4.'}],stopReason:'stop',timestamp:Date.now()}}].map(x=>JSON.stringify(x)).join('\n')+'\n');
const key='suffice-thread-view-v1:'+threadId(resolve(dir,'todo.jsonl'));
let port=8800,seed=null;
const startSeed=async modes=>{if(seed)seed.kill();const p=++port;seed=spawn('python3',['-I',resolve(here,'seed_api.py'),String(p),modes],{stdio:'ignore'});await new Promise(r=>setTimeout(r,900));return p;};
const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1'})});
const log=[],errors=[];
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 // The shipped CSP is connect-src 'none', so the page cannot reach a facade yet. The walk bridges fetch through Node; the app CSP is untouched.
 await page.exposeFunction('__seedFetch',async(url,init)=>{const r=await fetch(url,{method:init?.method,headers:init?.headers,body:init?.body});return {status:r.status,body:await r.text()};});
 await page.addInitScript(()=>{const f=window.fetch;window.fetch=async(u,i)=>{if(String(u).startsWith('http://127.0.0.1:')){const r=await window.__seedFetch(String(u),i?{method:i.method,headers:i.headers,body:i.body}:{});return new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json'}});}return f(u,i);};});
 await page.setViewportSize({width:1600,height:1000});await page.locator('.composer').waitFor();
 let n=0;const shot=async(name,step)=>{n++;const f=`${String(n).padStart(2,'0')}-${name}.png`;await page.screenshot({path:resolve(out,f),timeout:30000});log.push({step,frame:f});};
 const open=async(modes,{theme='dark',w=1600,wait=true}={})=>{const p=await startSeed(modes);await page.setViewportSize({width:w,height:1000});
  await page.evaluate(([k,p,theme])=>{localStorage.setItem('suffice-background','neon-mech');localStorage.setItem('suffice-api','http://127.0.0.1:'+p);localStorage.setItem(k,JSON.stringify({cloud:true,panelOpen:true,tabs:['preview','tests','timeline'],activeTab:'timeline'}));document.documentElement.dataset.theme=theme;},[key,p,theme]);
  await page.reload();await page.evaluate(th=>{document.documentElement.dataset.theme=th;},theme);await page.locator('.nx-nav').waitFor();await page.locator('.thread-row').first().click();await page.locator('.thread-header').waitFor();
  if(wait)await page.locator('.cloud-tl-row:not(.cloud-tl-skel), .cloud-tl-empty').first().waitFor({timeout:15000});await page.waitForTimeout(300);};
 const row=i=>page.locator('.cloud-tl-row').nth(i);
 // 1 loading
 await open('slowload',{wait:false});await page.locator('.cloud-tl-skel').first().waitFor();await shot('loading','Open Timeline while the server is slow: skeleton rows');
 await open('empty');await shot('empty','New app with no saves');
 await open('');await shot('normal','Normal: 9 saves, newest selected, no Rewind button (it is the current state)');
 await row(2).click();await shot('failing-test','Click the failing-test save (22 minutes before the newest)');
 await page.getByRole('button',{name:/^Rewind to/}).click();await shot('confirm-failing','Click Rewind to: confirm shows what changes');
 await page.keyboard.press('Escape');await row(4).click();await page.getByRole('button',{name:/^Rewind to/}).click();await shot('confirm-destructive','Select the save from before the notes migration, open confirm: the rewind brings tasks.notes back');
 await page.keyboard.press('Escape');await row(2).click();await page.getByRole('button',{name:/^Rewind to/}).click();await shot('confirm-after-migration','Select a save after the migration: the data stays gone, newest save that still has it is named');
 await page.keyboard.press('Escape');await row(4).click();await page.getByRole('button',{name:/^Rewind to/}).click();
 // rewind done
 await page.getByRole('button',{name:'Rewind',exact:true}).click();await page.locator('.cloud-tl-status[data-kind=done]').waitFor();await page.waitForTimeout(200);await shot('rewind-done','Click Rewind: done sentence, head marked Current, undo save added');
 // rewinding
 await open('slowrewind');await row(4).click();await page.getByRole('button',{name:/^Rewind to/}).click();await page.getByRole('button',{name:'Rewind',exact:true}).click();await page.waitForTimeout(500);await shot('rewinding','Click Rewind with a slow server: buttons disabled, label Rewinding');
 await page.locator('.cloud-tl-status[data-kind=done]').waitFor({timeout:10000});
 // failed
 await open('failrewind');await row(4).click();await page.getByRole('button',{name:/^Rewind to/}).click();await page.getByRole('button',{name:'Rewind',exact:true}).click();await page.locator('.cloud-tl-error').waitFor();await shot('rewind-failed','Server answers 500 on rewind: plain sentence, Try again');
 await open('failload');await shot('load-failed','Server answers 500 on load');
 await open('long');await row(2).click();await shot('long-message','Very long save message wraps and selected row shows 6 lines');
 await row(2).click();await page.getByRole('button',{name:/^Rewind to/}).click();await shot('long-message-confirm','Confirm with the long name');
 // 200
 await open('many');const perf=await page.evaluate(async()=>{const l=document.querySelector('.cloud-tl-list'),sc=l.closest('.cloud-pane');const rows=l.children.length;const t0=performance.now();let frames=0,worst=0,last=performance.now();
  await new Promise(res=>{const step=()=>{const now=performance.now();worst=Math.max(worst,now-last);last=now;frames++;sc.scrollTop+=400;if(sc.scrollTop+sc.clientHeight<sc.scrollHeight-2&&frames<400)requestAnimationFrame(step);else res();};requestAnimationFrame(step);});
  return {rows,frames,total_ms:Math.round(performance.now()-t0),worst_frame_ms:Math.round(worst)};});
 log.push({step:'Scroll 200 saves to the bottom at 400 px per frame',perf});await shot('many-bottom','200 saves scrolled to the bottom');
 await page.evaluate(()=>{document.querySelector('.cloud-pane').scrollTop=0;});
 // keyboard
 await open('');await row(0).focus();await shot('kb-1-focus','Tab to the list: focus ring on the newest save');
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await shot('kb-2-arrows','ArrowDown twice: selection moves to the third save');
 await page.keyboard.press('Enter');await page.waitForTimeout(200);await shot('kb-3-enter','Enter: confirm opens, focus on Rewind');
 await page.keyboard.press('Escape');await page.waitForTimeout(200);await shot('kb-4-escape','Escape: confirm closes, focus back on the save row');
 log.push({step:'Active element after Escape',value:await page.evaluate(()=>document.activeElement.className+' '+document.activeElement.getAttribute('aria-selected'))});
 // narrow + light
 await open('',{w:820});await row(2).click();await page.getByRole('button',{name:/^Rewind to/}).click();await shot('narrow-confirm','Narrow window 820 px, confirm open');
 for(const w of [820,1024]){await open('',{w});await shot('normal-'+w,'Normal at '+w+' px');await row(4).click();await page.getByRole('button',{name:/^Rewind to/}).click();await shot('confirm-destructive-'+w,'Destructive confirm at '+w+' px');}
 await open('',{theme:'light'});await shot('light-normal','Light theme, normal');
 await row(4).click();await page.getByRole('button',{name:/^Rewind to/}).click();await shot('light-confirm','Light theme, confirm with destructive sentence');
 await writeFile(resolve(out,'click-script.json'),JSON.stringify({steps:log,errors},null,1));
 console.log(JSON.stringify({frames:n,errors,perf:log.find(x=>x.perf)?.perf}));
}catch(e){const pg=app.windows()[0];await pg?.screenshot({path:'/tmp/tl-fail.png'}).catch(()=>{});console.log(await pg?.evaluate(()=>document.body.innerText.slice(0,400)).catch(()=>''));throw e;}finally{seed?.kill();await app.close();}
