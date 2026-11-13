// Flows walk 2: keyboard-only use, a long thread (scroll, follow, jump to latest), pasting/dropping files and images.
// Real main process, hidden window, fake harness (signed in, sessions saved via the real store), env allowlist.
// usage: node apps/desktop/test/flows2-walk.mjs <shots-dir>   (from repo root after `bun run desktop:build`)
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
const out=resolve(process.argv[2]||'flows2-shots');await mkdir(out,{recursive:true});
const home=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-flows2-')));
const alpha=resolve(home,'alpha-site');await mkdir(alpha);
// one long saved thread: 40 turns
const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
{const now=new Date().toISOString();const entries=[{type:'session',version:3,id:'long',timestamp:now,cwd:alpha}];let parent=null;
 for(let i=0;i<40;i++){for(const role of ['user','assistant']){const id=role[0]+i;entries.push({type:'message',id,parentId:parent,timestamp:now,message:{role,content:[{type:'text',text:role==='user'?`Question ${i}`:`Answer ${i}. `+'This line pads the reply so the thread is long. '.repeat(4)}],timestamp:Date.now(),...(role==='assistant'?{stopReason:'stop'}:{})}});parent=id;}}
 entries.push({type:'session_info',id:'name',parentId:parent,timestamp:now,name:'Long thread'});
 await writeFile(resolve(dir,'long.jsonl'),entries.map(e=>JSON.stringify(e)).join('\n')+'\n');}
const errors=[],state={};let n=0;
const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1',SUFFICE_FAKE_SIGNED_IN:'1'})});
try{
 await app.evaluate(({shell,dialog},p)=>{shell.openExternal=async()=>{};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},alpha);
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.composer').waitFor();await page.waitForTimeout(1500);
 const shot=async name=>{n++;await page.screenshot({path:resolve(out,`${String(n).padStart(2,'0')}-${name}.png`),timeout:30000});};
 const focus=()=>page.evaluate(()=>{const el=document.activeElement;if(!el||el===document.body)return 'body';const label=el.getAttribute('aria-label')||el.title||el.placeholder||el.textContent.trim().slice(0,30);const s=getComputedStyle(el);const ring=s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0||s.boxShadow!=='none'||(el.matches('.composer textarea')&&getComputedStyle(el.closest('.composer')).borderColor!==getComputedStyle(document.querySelector('.thread-row')||document.body).borderColor)||(el.matches('.sidebar-resizer')&&getComputedStyle(el,'::after').opacity>0.3);return `${el.tagName.toLowerCase()}${el.className?'.'+String(el.className).split(' ')[0]:''} "${label}"${ring?'':' (no ring)'}`;});
 // keyboard only: tab order from launch
 const order=[];for(let i=0;i<16;i++){await page.keyboard.press('Tab');await page.waitForTimeout(80);order.push(await focus());}
 console.log('tab order:');order.forEach((f,i)=>console.log('  ',String(i+1).padStart(2),f));state.order=order;
 await shot('tab-focus');
 // shortcuts
 await page.keyboard.press('Meta+k');await page.waitForTimeout(400);state.searchOpen=await page.locator('dialog[open]').count()>0;
 await page.keyboard.type('Long');await page.waitForTimeout(300);await shot('search');
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.waitForTimeout(1200);
 state.searchOpened=await page.locator('.thread-header:not([hidden])').textContent().catch(()=>'');
 await page.keyboard.press('Escape');await page.waitForTimeout(300);state.searchClosed=await page.locator('dialog[open]').count()===0;
 console.log('search open',state.searchOpen,'opened',JSON.stringify(state.searchOpened),'esc closes',state.searchClosed);
 // long thread: opens at the bottom; scroll up; a new reply arrives; is there a way back to latest?
 await page.locator('.sidebar-sessions .thread-row').filter({hasText:'Long thread'}).click();await page.waitForTimeout(1200);
 const scroll=()=>page.evaluate(()=>{const el=document.querySelector('.thread-transcript')||document.querySelector('.thread-messages').parentElement;return {top:Math.round(el.scrollTop),max:Math.round(el.scrollHeight-el.clientHeight),jump:[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/latest|bottom/i.test(b.getAttribute('aria-label')||b.textContent)).map(b=>b.getAttribute('aria-label')||b.textContent.trim())};});
 state.longOpen=await scroll();await shot('long-open');
 await page.locator('#prompt').fill('slow: keep going');await page.locator('#prompt').press('Enter');await page.waitForTimeout(800);
 // reader scrolls up mid-reply (wheel, as a user would)
 await page.mouse.move(1000,400);for(let i=0;i<12;i++){await page.mouse.wheel(0,-800);await page.waitForTimeout(30);}await page.waitForTimeout(300);
 state.longScrolledUp=await scroll();await shot('long-scrolled-up');await page.waitForTimeout(2000);
 state.longWhileStreaming=await scroll();await shot('long-streaming-scrolled-up');
 await page.getByRole('button',{name:'Stop task'}).click().catch(()=>{});await page.waitForTimeout(600);
 console.log('long open',JSON.stringify(state.longOpen),'scrolled up',JSON.stringify(state.longScrolledUp),'streaming',JSON.stringify(state.longWhileStreaming));
 // attachments: paste an image, drop a text file, then send
 await page.locator('#prompt').fill('look at these');
 await page.evaluate(()=>{const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
  const paste=new DataTransfer();paste.items.add(new File([png],'shot.png',{type:'image/png'}));
  document.querySelector('#prompt').dispatchEvent(new ClipboardEvent('paste',{clipboardData:paste,bubbles:true,cancelable:true}));
  const drop=new DataTransfer();drop.items.add(new File(['export const answer=42;\n'],'notes.js',{type:'text/javascript'}));
  const form=document.querySelector('.composer');form.dispatchEvent(new DragEvent('dragover',{dataTransfer:drop,bubbles:true,cancelable:true}));form.dispatchEvent(new DragEvent('drop',{dataTransfer:drop,bubbles:true,cancelable:true}));});
 await page.waitForTimeout(800);
 state.chips=await page.evaluate(()=>[...document.querySelectorAll('.composer [class*="attachment"]')].filter(e=>e.offsetParent&&e.textContent.trim()).map(e=>e.textContent.trim().slice(0,40)));
 await shot('attached');console.log('attached chips',JSON.stringify(state.chips));
 await page.locator('#prompt').press('Enter');await page.waitForTimeout(2000);
 state.attachReply=await page.evaluate(()=>[...document.querySelectorAll('.thread-assistant')].at(-1)?.textContent.trim());
 state.attachUser=await page.evaluate(()=>[...document.querySelectorAll('.thread-user')].at(-1)?.textContent.trim().slice(0,120));
 await shot('attached-sent');console.log('reply',JSON.stringify(state.attachReply),'user bubble',JSON.stringify(state.attachUser));
 // Cmd+N from inside a thread
 await page.mouse.move(1000,400);for(let i=0;i<6;i++){await page.mouse.wheel(0,-800);await page.waitForTimeout(30);}await page.waitForTimeout(300);state.jumpBeforeLeave=await page.locator('.jump-latest').isVisible();console.log('jump visible before leaving:',state.jumpBeforeLeave);
 state.inThread=await page.evaluate(()=>document.querySelector('.workspace').classList.contains('thread-view'));
 await page.keyboard.press('Meta+n');await page.waitForTimeout(600);state.cmdN=state.inThread&&await page.evaluate(()=>!document.querySelector('.workspace').classList.contains('thread-view'));console.log('Cmd+N from a thread -> home:',state.cmdN);
 state.jumpOnHome=await page.locator('.jump-latest').isVisible().catch(()=>false);await shot('cmd-n-home');
 const check=(ok,m)=>{if(!ok)errors.push(m);};
 check(!order.some(f=>f.endsWith('(no ring)')),'a focused control has no visible focus ring');
 check(state.searchOpen&&state.searchOpened==='Long thread'&&state.searchClosed,'Cmd+K search can\'t open a thread by keyboard');
 check(state.cmdN,'Cmd+N does not start a new session');
 check(state.longOpen.max>0&&state.longOpen.top>=state.longOpen.max-4,'long thread did not open at the latest message');
 check(state.longWhileStreaming.top<=state.longScrolledUp.top+4&&state.longScrolledUp.top<state.longScrolledUp.max-500,'new reply yanked the view down while reading older messages');
 check(state.longWhileStreaming.jump.length>0,'no jump-to-latest control while scrolled up during a reply');
 check(/\[images:1\]/.test(state.attachReply||'')&&/\[context:/.test(state.attachReply||''),'pasted image or dropped file did not reach the run');
 check(!state.jumpOnHome,'jump-to-latest left showing on the home screen');
 console.log('errors',JSON.stringify(errors));
}finally{await app.close().catch(()=>{});}
process.exit(errors.length?1:0);
