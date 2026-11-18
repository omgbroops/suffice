import electronPath from 'electron';
// Hidden checks + captures for the CLI-session terminal. Always hidden (SUFFICE_TEST_HIDE_WINDOW) and always on the private tmux socket sfx-test-session-terminal.
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const KEY='session-terminal',socket='sfx-test-'+KEY;
const shots=process.env.SHOTS_DIR||`/Users/abhayg/suffice-desktop-wt/ui-shots/${KEY}/after`;await mkdir(shots,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-term-')));
const failures=[];const check=(ok,msg)=>{console.log(ok?'ok  ':'FAIL',msg);if(!ok)failures.push(msg);};
const tmux=(...a)=>{try{return execFileSync('tmux',['-L',socket,...a],{encoding:'utf8'}).trim();}catch(e){return 'ERR '+(e.stderr||e.message);}};
const baseEnv=extra=>{const e={...process.env,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:socket,...extra};delete e.ELECTRON_RUN_AS_NODE;return e;};
const launch=async(env,tag)=>{const data=resolve(tmp,'data-'+tag);await mkdir(data,{recursive:true});
 const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 const sock=await app.evaluate(()=>process.env.SUFFICE_SESSIONS_SOCKET);if(sock!==socket)throw new Error('private socket did not reach the app: '+sock);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);return {app,page};};
const size=(app,w,h)=>app.evaluate(({BrowserWindow},[w,h])=>BrowserWindow.getAllWindows()[0].setBounds({width:w,height:h}),[w,h]);
// Pixel from the real window contents (BGRA bitmap), not a screen capture.
const pixel=(app,x,y)=>app.evaluate(async({BrowserWindow},[x,y])=>{const img=await BrowserWindow.getAllWindows()[0].webContents.capturePage(),s=img.getSize(),b=img.toBitmap();const o=(y*s.width+x)*4;return [b[o+2],b[o+1],b[o]];},[x,y]);
const geo=page=>page.evaluate(()=>{const ws=document.querySelector('.workspace').getBoundingClientRect(),slot=document.querySelector('.session-terminal-slot:not([hidden])'),sc=slot.querySelector('.xterm-screen').getBoundingClientRect(),
 mm=slot.querySelector('.xterm-char-measure-element'),cell=mm.getBoundingClientRect().width/mm.textContent.length,cs=getComputedStyle(slot.querySelector('.terminal-session')),
 inner=slot.querySelector('.terminal-session').clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
 return {cols:Math.round(sc.width/cell),cell,inner,left:sc.left-ws.left,right:ws.right-sc.right,cx:Math.round(ws.left+ws.width/2),cy:Math.round(ws.top+ws.height/2)};});
const tmuxCols=id=>Number(tmux('list-clients','-t','sfx-'+id,'-F','#{client_width}').split('\n')[0]);
const assertGeo=async(page,app,id,label)=>{await page.waitForTimeout(500);const g=await geo(page);
 const tc=tmuxCols(id);check(tc>0,label+': tmux client cols '+tc);const sw=g.cols*g.cell,cw=sw/tc;check(tc>=Math.floor(g.inner/cw)-1,`${label}: cols ${tc} >= floor(${g.inner.toFixed(0)}/${cw.toFixed(2)})-1`);
 check(Math.abs(g.left-g.right)<=4,`${label}: gutters left ${g.left.toFixed(1)} right ${g.right.toFixed(1)}`);
 return g;};
const rowsFit=async m=>check(await page.evaluate(()=>{const sl=document.querySelector('.session-terminal-slot:not([hidden])'),edge=sl.querySelector('.xterm-screen').getBoundingClientRect().right;let worst=0;for(const r of sl.querySelectorAll('.xterm-rows > div')){const l=r.lastElementChild;if(l)worst=Math.max(worst,l.getBoundingClientRect().right);}console.log('rowsFit',worst,edge);return worst<=edge+2;}),m);
let app,page;
try{
 const env=baseEnv({SUFFICE_HOME:resolve(tmp,'suffice'),SUFFICE_START_PROJECT:resolve(tmp,'proj'),SUFFICE_HISTORY_HOME:resolve(tmp,'home'),
  SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs')});
 for(const d of ['proj','home','suffice'])await mkdir(resolve(tmp,d),{recursive:true});
 ({app,page}=await launch(env,'a'));page.on('console',m=>{if(/^(rowsFit|copy right)/.test(m.text()))console.log(m.text());});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const shot=n=>page.screenshot({path:resolve(shots,n)});
 const start=async agent=>{await page.locator('[data-action="send-menu"]').click();await page.waitForTimeout(250);await page.locator(`[data-menu-action="cli-session:${agent}"]`).click();await page.locator('.thread-header--session').waitFor();};
 const ids=()=>page.evaluate(async()=>(await sufficeDesktop.sessions.list()).map(s=>s.id));
const titleW=()=>page.evaluate(()=>document.querySelector('.session-title')?.getBoundingClientRect().width||0);
 const startNew=async agent=>{const before=await ids();await start(agent);let n=[];for(let i=0;i<40&&!n.length;i++){n=(await ids()).filter(x=>!before.includes(x));if(!n.length)await page.waitForTimeout(100);}if(n.length!==1)throw new Error('expected one new session, got '+n);return n[0];};
 await page.locator('[data-action="send-menu"]').waitFor();
 // fake agent
 const id=await startNew('fake');
 await page.locator('#prompt').fill('hello');await page.locator('#prompt').press('Enter');
 await page.locator('.thread-message',{hasText:'ECHO:hello'}).waitFor({timeout:15000});await page.waitForTimeout(900);
 const g0=await geo(page).catch(()=>null);const ws=await page.evaluate(()=>{const r=document.querySelector('.workspace').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};});
 const chatPx=await pixel(app,ws.x,ws.y);await shot('chat.png');
 check(tmux('show-options','-t','sfx-'+id,'mouse')==='mouse on','tmux mouse on: '+tmux('show-options','-t','sfx-'+id,'mouse'));
 {const w=await titleW();check(w>20,'fake session: .session-title visible, width '+Math.round(w));}
 const t0=Date.now();await page.locator('.session-toggle button',{hasText:'Terminal'}).click();
 await page.locator('.session-terminal .xterm-rows').waitFor();
 await page.waitForFunction(()=>document.querySelector('.session-terminal .xterm-rows')?.textContent.includes('ECHO:hello'));
 console.log('terminal visible after',Date.now()-t0,'ms');await page.waitForTimeout(400);
 check(await page.evaluate(()=>getComputedStyle(document.querySelector('.thread-transcript')).visibility==='hidden'),'transcript hidden in terminal mode');
 check(await page.evaluate(()=>document.querySelector('.xterm-helper-textarea')===document.activeElement),'xterm focused on show');
 await shot('sess-terminal.png');
 const tp=await pixel(app,ws.x,ws.y);const diffFlat=Math.max(...tp.map((v,i)=>Math.abs(v-14)));const diffChat=Math.max(...tp.map((v,i)=>Math.abs(v-chatPx[i])));
 check(diffFlat>2,`terminal pixel ${tp} differs from flat #0e0e0e`);check(diffChat<=12,`terminal pixel ${tp} matches chat pixel ${chatPx}`);
 await assertGeo(page,app,id,'1440x900');
 await rowsFit('no row overflows the xterm screen on the right');
 // light theme
 await page.evaluate(()=>{document.documentElement.dataset.theme='light';});await page.waitForTimeout(400);await shot('sess-terminal-light.png');
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});await page.waitForTimeout(300);
 // resize round trip
 await size(app,1100,800);await page.waitForFunction(()=>innerWidth===1100);await assertGeo(page,app,id,'1100x800');await shot('sess-terminal-1100x800.png');
 await size(app,1440,900);await page.waitForFunction(()=>innerWidth===1440);await assertGeo(page,app,id,'back to 1440x900');await shot('sess-terminal-1440x900-again.png');
 // scrollback: fill tmux history, wheel up
 await page.evaluate(async i=>{for(let n=0;n<70;n++)await sufficeDesktop.sessions.send(i,'line '+n);},id);await page.waitForTimeout(2500);
 await page.mouse.move(ws.x,ws.y);for(let n=0;n<8;n++){await page.mouse.wheel(0,-900);await page.waitForTimeout(150);}await page.waitForTimeout(500);
 check(tmux('display-message','-p','-t','sfx-'+id,'#{pane_in_mode}')==='1','wheel enters tmux copy-mode');check(Number(tmux('display-message','-p','-t','sfx-'+id,'#{scroll_position}'))>0,'wheel scrolled history (scroll_position > 0)');await shot('sess-terminal-scrolled.png');await rowsFit('copy-mode indicator row not clipped on the right');
 tmux('send-keys','-t','sfx-'+id,'q');await page.waitForTimeout(300);
 // back to chat, immediately
 await page.locator('.session-toggle button',{hasText:'Chat'}).click();await page.waitForTimeout(60);await shot('sess-chat-after-switch.png');
 check(await page.evaluate(()=>document.querySelector('.session-terminal').hidden&&getComputedStyle(document.querySelector('.thread-transcript')).visibility!=='hidden'),'chat view only after switching back');
 check(await page.evaluate(()=>document.activeElement===document.querySelector('#prompt')),'composer focused after return');
 // terminal again: same xterm comes back sized
 await page.locator('.session-toggle button',{hasText:'Terminal'}).click();await assertGeo(page,app,id,'second show');
 // fake Claude
 await page.locator('.new-session').click();await page.locator('[data-action="send-menu"]').waitFor({state:'visible'});await page.waitForTimeout(400);
 const cid=await startNew('fakeclaude');
 await page.locator('.composer-approval:not([hidden])').waitFor({timeout:20000});await page.waitForTimeout(600);
 check(tmux('show-options','-t','sfx-'+cid,'mouse')==='mouse on','fake claude session: tmux mouse on');
 {const w=await titleW();check(w>40,'Claude session: .session-title visible, width '+Math.round(w));}
 {const b=await page.locator('.session-toggle button',{hasText:'Terminal'}).boundingBox();check(!!b&&b.x+b.width<=1440,'Claude header: Chat/Terminal toggle on screen');await page.locator('.session-toggle button',{hasText:'Terminal'}).click();}
 await page.locator('.session-terminal .xterm-rows').waitFor();
 check(await page.evaluate(()=>{const c=document.querySelector('.session-copy').getBoundingClientRect();console.log('copy right',c.right,innerWidth);return c.right<=innerWidth;}),'Claude header: Open in terminal on screen');
 await page.waitForFunction(()=>/Do you want to proceed/.test(document.querySelector('.session-terminal-slot:not([hidden]) .xterm-rows')?.textContent||''));await page.waitForTimeout(500);
 await shot('sess-terminal-prompt.png');await assertGeo(page,app,cid,'fake claude');
 check(errors.length===0,'no page errors '+errors.join(';'));
 await app.close().catch(()=>{});app=null;tmux('kill-server'); // phase 2 starts with an empty private socket
 // right-panel terminal in a normal chat (regression)
 const home=resolve(tmp,'pi'),cwd=resolve(tmp,'proj2'),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});await mkdir(cwd,{recursive:true});
 const now=new Date().toISOString();await writeFile(resolve(dir,'0.jsonl'),[{type:'session',version:3,id:'fixture-0',timestamp:now,cwd},{type:'message',id:'u0',parentId:null,timestamp:now,message:{role:'user',content:[{type:'text',text:'Terminal thread one'}],timestamp:Date.now()}}].map(v=>JSON.stringify(v)).join('\n')+'\n');
 ({app,page}=await launch(baseEnv({PI_OFFLINE:'1',SUFFICE_HOME:home,SHELL:'/bin/bash'}),'b'));
 await page.locator('.thread-row').filter({hasText:'Terminal thread one'}).click();
 await page.getByRole('button',{name:'Toggle right panel',exact:true}).click();await page.locator('.panel-launcher').getByRole('button',{name:'Terminal',exact:true}).click();
 const input=page.locator('.terminal-session .xterm-helper-textarea');await input.waitFor();await input.focus();await page.keyboard.type('echo PANEL_OK');await page.keyboard.press('Enter');
 await page.locator('.terminal-session').filter({hasText:'PANEL_OK'}).waitFor();await page.waitForTimeout(400);
 await page.screenshot({path:resolve(shots,'right-panel-terminal.png')});
 const rg=await page.evaluate(()=>({w:document.querySelector('.terminal-session').clientWidth,cols:(m=>Math.round(document.querySelector('.xterm-screen').getBoundingClientRect().width/(m.getBoundingClientRect().width/m.textContent.length)))(document.querySelector('.xterm-char-measure-element'))}));
 check(rg.cols>30,'right-panel terminal fitted, cols '+rg.cols);
}catch(e){console.error('FAIL',e.stack?.slice(0,1500));try{console.error('HDR',await page.evaluate(()=>(h=>h&&h.outerHTML.replace(/</g,'[').slice(0,900)+' DISPLAY='+getComputedStyle(h).display+' W='+h.getBoundingClientRect().width+' KIDS='+h.children.length)(document.querySelector('.thread-header'))));await page.screenshot({path:resolve(tmp,'fail.png')});await (await import('node:fs/promises')).copyFile(resolve(tmp,'fail.png'),resolve(shots,'fail.png'));}catch{}failures.push(e.message);}
finally{try{await app?.close();}catch{}tmux('kill-server');await rm(tmp,{recursive:true,force:true});}
if(failures.length){console.error('failures:',failures);process.exit(1);}
console.log('all checks passed');process.exit(0);
