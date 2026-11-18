// Hidden capture + checks for the session caption. SHOTS=<dir> picks the output folder; MODE=before skips the new-header assertions.
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const BEFORE=process.env.MODE==='before',socket='sfx-r2-session-header-'+process.pid;
const output=resolve(process.env.SHOTS||'/Users/abhayg/suffice-desktop-wt/ui-shots/r2-session-header');await mkdir(output,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-sh-')));
const home=resolve(tmp,'home'),project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice');
for(const d of [project,data,suffice,resolve(home,'.claude/projects/-tmp-api')])await mkdir(d,{recursive:true});
await writeFile(resolve(home,'.claude/projects/-tmp-api/c1.jsonl'),[{type:'user',uuid:'u1',timestamp:new Date().toISOString(),cwd:'/tmp/api',entrypoint:'cli',message:{content:'Add rate limiting to the API'}},{type:'assistant',uuid:'a1',timestamp:new Date().toISOString(),message:{content:[{type:'text',text:'Added a limiter.'}]}}].map(r=>JSON.stringify(r)).join('\n')+'\n');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_NODE:process.execPath,
 SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs'),
 SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:home});
const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
const pid=app.process().pid;let page,failed=null;
try{
 page=await app.firstWindow();page.setDefaultTimeout(15000);
 await page.locator('[data-action="send-menu"]').waitFor();
 assert.equal(await app.evaluate(()=>process.env.SUFFICE_SESSIONS_SOCKET),socket,'private socket not set');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 const shot=async n=>{await page.waitForTimeout(250);const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(output,n),Buffer.from(b64,'base64'));};
 const startFake=async()=>{const cwd=await app.evaluate(()=>process.env.SUFFICE_START_PROJECT);await page.evaluate(([a,p])=>sufficeDesktop.sessions.start({agent:a,cwd:p}),['fakeclaude',cwd]);await page.reload();await page.locator('[data-action="send-menu"]').waitFor();await page.locator('.sidebar-cli-sessions .thread-row').first().click();await page.locator('.session-row').first().waitFor();await page.waitForFunction(()=>/session/i.test(document.querySelector('.thread-header')?.textContent||''));await page.waitForTimeout(1500);};
 const norm=await page.evaluate(()=>{const h=document.querySelector('.thread-header'),was=h.hidden;h.hidden=false;document.querySelector('.workspace')?.classList.add('thread-view');const b=document.querySelector('.caption-chat-tools'),r=h.getBoundingClientRect();const o={h:r.height,pad:getComputedStyle(h).padding,toolPad:getComputedStyle(b).padding};h.hidden=was;document.querySelector('.workspace')?.classList.remove('thread-view');return o;});console.log('normal',JSON.stringify(norm));
 await startFake();
 const sock=await page.evaluate(()=>[...document.querySelectorAll('.session-row')].length);assert.ok(sock>=1);
 await shot('01-session-chat-header.png');
 const m=await page.evaluate(()=>{const h=document.querySelector('.thread-header'),t=document.querySelector('.workspace-tools'),cs=getComputedStyle(h),box=document.querySelector('.caption-chat-tools');
  const r=x=>x.getBoundingClientRect(),hr=r(h);
  return {h:hr.height,pad:cs.padding,tools:r(t).height,toolPad:getComputedStyle(box).padding,text:h.textContent,kids:[...box.querySelectorAll('button,.context-ring')].map(c=>r(c).right<=r(box).right+0.5),ring:document.querySelector('.context-ring')?.getAttribute('aria-label'),
   fits:h.scrollWidth<=h.clientWidth+1,cls:h.className,wide:r(box).right<=innerWidth};});
 console.log(JSON.stringify(m));
 assert.equal(m.cls,'thread-header');assert.ok(m.kids.length>=3);assert.equal(m.h,norm.h);assert.equal(m.pad,norm.pad);assert.equal(m.toolPad,norm.toolPad);assert.ok(m.kids.every(Boolean));assert.ok(!/in ·|ctx|Manual|Haiku|Open in terminal/.test(m.text),'header text: '+m.text);
 if(!BEFORE){assert.equal(m.ring,'Context usage: 12%');
  // ring tooltip
  await page.locator('.context-ring').hover();await page.waitForTimeout(500);await shot('02-ring-tooltip.png');await page.mouse.move(700,500);
  // rename in place + long title
  // rename keys must not answer the pending approval
  await page.locator('.composer-approval:not([hidden])').waitFor({timeout:20000});
  const hd=page.locator('.thread-header'),htxt=()=>hd.evaluate(e=>e.textContent),row0=await page.evaluate(()=>document.querySelector('.session-row').textContent),t0=await htxt();
  const clean=async why=>{assert.ok(await page.locator('.composer-approval:not([hidden])').count(),'approval answered: '+why);assert.ok(!/denied|allow all/i.test(await page.evaluate(()=>document.querySelector('.workspace').textContent.replace(/Yes, allow all[^\n]*/,''))),'denial in transcript: '+why);};
  await hd.focus();await page.keyboard.press('Meta+A');await page.keyboard.type('Nope');await page.keyboard.press('Escape');await page.waitForTimeout(300);
  assert.equal(await htxt(),t0,'Escape did not revert');assert.equal(await page.evaluate(()=>document.querySelector('.session-row').textContent),row0);await clean('escape');
  await hd.focus();await page.keyboard.press('Meta+A');await page.keyboard.press('Backspace');await page.keyboard.press('Enter');await page.waitForTimeout(300);
  assert.equal(await htxt(),t0,'empty title not restored');assert.equal(await page.evaluate(()=>document.querySelector('.session-row').textContent),row0);await clean('empty');
  await hd.focus();await page.keyboard.press('Meta+A');await page.keyboard.type('Fix 2 bugs');await page.keyboard.press('Enter');await page.waitForTimeout(300);
  assert.equal(await htxt(),'Fix 2 bugs','digit dropped');await clean('digit');
  const h=page.locator('.thread-header');await h.focus();await page.keyboard.press('Meta+A');await page.keyboard.type('Refactor');await shot('03-rename-in-place.png');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.session-row .thread-title, .session-row')?.textContent.includes('Refactor'));
  await h.focus();await page.keyboard.press('Meta+A');await page.keyboard.type('Investigate why the nightly build fails only on the Windows runner after the dependency bump');await page.keyboard.press('Enter');await page.evaluate(()=>document.activeElement?.blur());await page.waitForFunction(()=>{const h=document.querySelector('.thread-header');return getComputedStyle(h).textOverflow==='ellipsis'&&h.scrollWidth>h.clientWidth;},null,{timeout:5000});await page.waitForTimeout(300);
  await shot('04-long-title.png');
  // The drawn pixels must equal a fresh layout of the same box: a stale layout clips the last glyph with no ellipsis.
  const hdPix=async()=>{const r=await page.evaluate(()=>{const b=document.querySelector('.thread-header').getBoundingClientRect();return {x:Math.floor(b.x),y:Math.floor(b.y),width:Math.ceil(b.width),height:Math.ceil(b.height)};});await page.waitForTimeout(200);return app.evaluate(async({BrowserWindow},r)=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage(r)).toBitmap().toString('base64'),r);};
  const drawn=await hdPix();await page.evaluate(()=>{const h=document.querySelector('.thread-header');h.style.display='none';void h.offsetHeight;h.style.display='';});
  assert.equal(await hdPix(),drawn,'long title: ellipsis not drawn (stale layout)');
  const lt=await page.evaluate(()=>{const h=document.querySelector('.thread-header'),r=h.getBoundingClientRect();return {w:r.width,over:getComputedStyle(h).textOverflow,full:h.textContent.length,tr:document.querySelector('.workspace-tools').getBoundingClientRect().right,box:document.querySelector('.caption-chat-tools').getBoundingClientRect().right};});
  console.log(JSON.stringify(lt));assert.ok(lt.w<=240+1);assert.ok(lt.tr<=lt.box+1);
  await h.focus();await page.keyboard.press('Meta+A');await page.keyboard.type('Refactor');await page.keyboard.press('Enter');
  // mode toggle
  const tg=page.locator('.session-mode-toggle');assert.equal(await tg.getAttribute('aria-pressed'),'false');assert.equal(await tg.getAttribute('aria-label'),'Show terminal');
  await tg.click();await page.locator('.session-terminal .xterm-rows').waitFor({timeout:15000});await page.waitForTimeout(700);
  assert.equal(await tg.getAttribute('aria-pressed'),'true');assert.equal(await tg.getAttribute('aria-label'),'Show chat');await shot('05-terminal-mode.png');
  await tg.click();await page.waitForTimeout(700);assert.equal(await tg.getAttribute('aria-pressed'),'false');
  // right panel
  await page.locator('[aria-label="Toggle right panel"]').click();await page.waitForFunction(()=>document.body.classList.contains('right-panel-open'));await shot('06-right-panel.png');
  await page.locator('[aria-label="Toggle right panel"]').click();await page.waitForFunction(()=>!document.body.classList.contains('right-panel-open'));
  // import view
  await page.locator('[data-action="send-menu"]').click().catch(()=>{});
 }
 if(!BEFORE){
  await page.locator('.new-session').click();await page.locator('[data-action="send-menu"]').waitFor({state:'visible'});await page.waitForTimeout(400);
  await page.locator('[data-action="send-menu"]').click();await page.waitForTimeout(250);
  await page.locator('[data-menu-action="import-chat:open"]').click();await page.locator('.session-import-row').first().waitFor();await page.waitForTimeout(300);
  await page.locator('.session-import-row').first().click();await page.waitForSelector('.session-resume:not([hidden])');await shot('07-import-header.png');
  const t=await page.evaluate(()=>({txt:document.querySelector('.thread-header').textContent,res:document.querySelector('.session-resume').textContent,ring:document.querySelector('.context-ring').hidden}));console.log(JSON.stringify(t));
  assert.equal(t.res,'Resume');assert.ok(t.ring);
 }
 const real=await page.evaluate(()=>[...document.querySelectorAll('.session-row')].length);
 console.log('rows',real);
}catch(e){failed=e;console.error('FAIL',e.message);try{await page?.screenshot({path:resolve(output,'fail.png')});}catch{}}
finally{try{process.kill(pid);}catch{}try{execFileSync('tmux',['-L',socket,'kill-server']);}catch{}await rm(tmp,{recursive:true,force:true});}
process.exit(failed?1:0);
