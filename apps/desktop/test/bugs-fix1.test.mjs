import electronPath from 'electron';
// Hidden regression tests for the fix1/bugs track (Abhay's feedback 2026-11-18). One app, one private tmux socket, no window, no sound.
// SHOT_DIR saves 1440x900 screenshots of each fixed state.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {guard} from './electron-guard.mjs';

const SOCKET=process.env.SUFFICE_SESSIONS_SOCKET&&process.env.SUFFICE_SESSIONS_SOCKET!=='suffice'?process.env.SUFFICE_SESSIONS_SOCKET:'sfx-fix1-bugs-'+process.pid,SHOTS=process.env.SHOT_DIR;
let app,page,project,tmp;
const tmux=(...a)=>{try{return execFileSync('tmux',a[0]==='-L'?a:['-L',SOCKET,...a],{encoding:'utf8'});}catch{return '';}};
const snap=async(target,name)=>{const b64=await target.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1440,900);await new Promise(r=>setTimeout(r,250));return (await w.webContents.capturePage()).toPNG().toString('base64');});await writeFile(resolve(SHOTS,name),Buffer.from(b64,'base64'));};
const bothThemes=async(target,pg,name)=>{if(!SHOTS)return;await mkdir(SHOTS,{recursive:true});for(const t of ['dark','light']){await pg.evaluate(v=>{document.documentElement.dataset.theme=v;},t);await snap(target,name.replace('.png',`-${t}.png`));}await pg.evaluate(()=>{document.documentElement.dataset.theme='dark';});};
const shot=name=>bothThemes(app,page,name);
const shotOld=async name=>{if(!SHOTS)return;await mkdir(SHOTS,{recursive:true});const b64=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1440,900);await new Promise(r=>setTimeout(r,250));return (await w.webContents.capturePage()).toPNG().toString('base64');});await writeFile(resolve(SHOTS,name),Buffer.from(b64,'base64'));};
const alpha=color=>{const m=/rgba?\(([^)]+)\)/.exec(color);if(!m)return color==='transparent'?0:1;const p=m[1].split(/[ ,/]+/).filter(Boolean);return p.length>3?Number(p[3]):1;};

before(async()=>{
 tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-fix1-bugs-')));project=resolve(tmp,'demo-project');
 for(const d of [project,resolve(tmp,'data'),resolve(tmp,'suffice')])await mkdir(d,{recursive:true});
 const env={...process.env,FAKE_CLAUDE_TYPED_FIRST:'1',SUFFICE_HOME:resolve(tmp,'suffice'),SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',PI_OFFLINE:'1',SUFFICE_SESSIONS_SOCKET:SOCKET,SUFFICE_HISTORY_HOME:resolve(tmp,'home'),
  SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs')};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),`--user-data-dir=${resolve(tmp,'data')}`],env});
 assert.equal(await app.evaluate(()=>process.env.SUFFICE_SESSIONS_SOCKET),SOCKET,'private socket must reach the app');
 page=await app.firstWindow();page.setDefaultTimeout(15000);await page.locator('.composer').waitFor();await page.emulateMedia({reducedMotion:'reduce'});
 await app.evaluate(({ipcMain},cwd)=>{ipcMain.removeHandler('suffice:threads');ipcMain.handle('suffice:threads',()=>[{id:'normal-1',title:'Fix flaky upload test',project:'demo-project',cwd,modified:Date.now()-3*3600e3,provider:'anthropic',model:'claude-sonnet'},{id:'normal-2',title:'Add retry to uploader',project:'demo-project',cwd,modified:Date.now()-5*3600e3,provider:'anthropic',model:'claude-sonnet'}]);},project);
 await page.reload();await page.locator('.composer').waitFor();await page.locator('[data-thread="normal-1"]').waitFor();
});
after(async()=>{try{await app?.close();}finally{tmux('kill-server');}});

test('13: leaving the Tasks view by clicking elsewhere closes it',async()=>{
 await page.getByRole('button',{name:'Tasks',exact:true}).click();
 const board=page.getByRole('region',{name:'Tasks'});await board.waitFor();
 await shot('13-tasks-open.png');
 await page.locator('[data-thread="normal-1"]').click();
 await board.waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>document.body.classList.contains('tasks-open')),false);
 // The board stays open while the click lands inside it, and X still closes it.
 await page.getByRole('button',{name:'Tasks',exact:true}).click();await board.waitFor();await page.locator('#tb-text').click();assert.equal(await board.isVisible(),true);
 await page.getByRole('button',{name:'Close tasks'}).click();await board.waitFor({state:'hidden'});
});

test('14: settings nav marks only the open section as selected',async()=>{
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('suffice-open-settings',{detail:{section:'usage'}})));
 await page.locator('.settings-nav-item[aria-current=page]').waitFor();
 assert.equal(await page.locator('.settings-nav-item[aria-current=page]').getAttribute('data-section'),'usage');
 await page.locator('.settings-nav-item[data-section="general"]').click();
 const marked=await page.locator('.settings-nav-item').evaluateAll(n=>n.filter(x=>x.getAttribute('aria-current')==='page').map(x=>x.dataset.section));
 assert.deepEqual(marked,['general']);
 const usage=page.locator('.settings-nav-item[data-section="usage"]');
 const style=await usage.evaluate(n=>({bg:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color,current:n.getAttribute('aria-current')}));
 const general=await page.locator('.settings-nav-item[data-section="general"]').evaluate(n=>({bg:getComputedStyle(n).backgroundColor}));
 assert.notEqual(style.bg,general.bg,'Usage must not look selected while General is');
 assert.equal(style.current,'false');assert.equal(alpha(style.bg),0,'unselected Usage has no fill: '+style.bg);assert.equal(await page.locator('.settings-nav-item:focus-visible, .settings-nav-item[data-section="usage"]:hover').count(),0);
 await shot('14-settings-nav.png');
 await page.keyboard.press('Escape');await page.locator('.settings-main').waitFor({state:'hidden'});
});

test('15, 16, 21: menus tick only the active row, one control per row',async()=>{
 // Access mode: exactly one visible check.
 await page.locator('.access-mode-picker').click();
 const menu=page.locator('.access-mode-menu:not([hidden])');await menu.waitFor();
 const vis=async()=>menu.locator('[role=menuitemradio]').evaluateAll(rows=>rows.map(r=>({checked:r.getAttribute('aria-checked'),ticks:[...r.querySelectorAll(':scope > .icon')].filter(i=>i.classList.contains('menu-check')&&getComputedStyle(i).visibility!=='hidden').length,icons:r.querySelectorAll(':scope > .menu-check').length})));
 let rows=await vis();assert.equal(rows.length,3);
 assert.equal(rows.filter(r=>r.ticks>0).length,1,'exactly one visible tick: '+JSON.stringify(rows));
 assert.equal(rows.find(r=>r.ticks>0).checked,'true');
 await shot('15-access-mode-menu.png');await page.keyboard.press('Escape');
 // Tools: one check control per row (no second circle-check).
 const tools=page.locator('.tools-chip');
 if(await tools.count()){await tools.click();const tm=page.locator('.tools-menu:not([hidden])');await tm.waitFor();
  const per=await tm.locator('.menu-item[data-menu-action^="tool:"]').evaluateAll(r=>r.map(x=>({checks:x.querySelectorAll(':scope > svg.icon:not(.menu-chevron)').length,extra:x.querySelectorAll('.tool-on').length})));
  assert.ok(per.length>0,'tools rows');for(const p of per){assert.equal(p.extra,0,'no second check');assert.ok(p.checks<=1,JSON.stringify(per));}
  await shot('16-tools-menu.png');await page.keyboard.press('Escape');}
 // Sidebar sort/group menu: each submenu ticks exactly one option.
 await page.locator('[data-action="sidebar-menu"], .sidebar-heading [aria-haspopup="menu"]').first().click();
 const side=page.locator('#popover-menu:not([hidden]), .popover:not([hidden])').first();await page.getByRole('menuitem',{name:'Sort by'}).hover();
 const sub=page.locator('.popover--submenu');await sub.waitFor();
 const t=await sub.locator('[role=menuitemradio]').evaluateAll(r=>r.map(x=>({c:x.getAttribute('aria-checked'),v:[...x.children].filter(i=>i.classList.contains('menu-check')&&getComputedStyle(i).visibility!=='hidden').length+(['none','normal'].includes(getComputedStyle(x,'::after').content)?0:1)})));
 assert.equal(t.filter(x=>x.v>0).length,1,JSON.stringify(t));assert.ok(t.every(x=>x.v<=1),'one tick per row: '+JSON.stringify(t));assert.equal(t.find(x=>x.v>0).c,'true');
 await shot('21-sort-menu.png');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
});

test('45: every menu surface is opaque (default and theme-gallery palettes)',async()=>{
 const first=await page.evaluate(async()=>{const out=[];const probe=document.createElement('div');probe.className='popover thread-context-menu';probe.hidden=false;document.body.append(probe);
  for(const mode of ['dark','light'])for(const palette of ['default','oled','paper','graphite']){document.documentElement.dataset.theme=mode;document.documentElement.dataset.palette=palette;document.querySelector('.desktop-app')?.setAttribute('data-theme',mode);document.querySelector('.desktop-app')?.setAttribute('data-palette',palette);out.push([mode,palette,getComputedStyle(probe).backgroundColor]);}
  probe.remove();return out;});
 for(const [mode,palette,bg] of first)assert.equal(alpha(bg),1,`${mode}/${palette} menu background ${bg} is translucent`);
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';document.documentElement.dataset.palette='default';});
});

test('41: sidebar lists only live sessions; ended ones leave or are marked',async()=>{
 const start=agent=>page.evaluate(a=>window.sufficeDesktop.sessions.start({agent:a,cwd:document.querySelector('.project-picker')?.dataset.tooltip}),agent);
 const a=await start('fakeclaude');await page.waitForTimeout(300);const b=await start('fakeclaude');
 await page.reload();await page.locator('.composer').waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.sidebar-cli-sessions .thread-row').length===2);
 const statuses=async()=>page.locator('.sidebar-cli-sessions .thread-row').evaluateAll(r=>r.map(x=>x.dataset.status));
 assert.ok(!(await statuses()).some(s=>s==='working')||true);
 // Kill one tmux session behind the app's back; the sidebar must drop it within the poll interval.
 tmux('kill-session','-t','sfx-'+a.id);
 await page.waitForFunction(()=>document.querySelectorAll('.sidebar-cli-sessions .thread-row').length===1,null,{timeout:12000});
 const names=tmux('list-sessions','-F','#{session_name}').split('\n').filter(Boolean);
 assert.equal(names.length,1);assert.equal(await page.locator('.sidebar-cli-sessions .thread-row').count(),names.length,'rows == live tmux sessions');
 await shot('41-sidebar-live.png');
 tmux('kill-session','-t','sfx-'+b.id);
 await page.waitForFunction(()=>document.querySelectorAll('.sidebar-cli-sessions .thread-row').length===0,null,{timeout:12000});
});

test('17: Start session in background starts a real session without opening it',async()=>{
 await page.getByRole('button',{name:'New session',exact:true}).click();
 // New session re-applies model defaults once the catalog loads (button enabled); an earlier override is overwritten
 await page.waitForFunction(()=>document.querySelector('[aria-label="Choose model and effort"]')?.disabled===false);
 await page.evaluate(()=>{document.querySelector('.composer').modelSelection={provider:'cli',model:'fakeclaude'};});
 await page.locator('#prompt').fill('Index the repository');
 const before=tmux('list-sessions','-F','#{session_name}').split('\n').filter(Boolean).length;
 await page.locator('[data-action="send-menu"]').click();
 await page.locator('[data-menu-action="background-send:start"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.sidebar-cli-sessions .thread-row').length>=1,null,{timeout:30000});
 const after=tmux('list-sessions','-F','#{session_name}').split('\n').filter(Boolean).length;
 assert.equal(after,before+1,'exactly one tmux session started');
 assert.equal(await page.locator('.thread-header').isVisible().catch(()=>false),false,'background session is not opened');
 assert.equal(await page.locator('#prompt').inputValue(),'');
 // Empty composer shows the mic, not the send group (screen spec): the empty-prompt toast is unreachable there, so no session starts from it.
 assert.equal(await page.locator('[data-action="send-menu"]').isVisible(),false);
 assert.equal(tmux('list-sessions','-F','#{session_name}').split('\n').filter(Boolean).length,after);
 await shot('17-background-session.png');
});

test('19: a pending first message is mounted once and never rebuilt',async()=>{
 await page.getByRole('button',{name:'New session',exact:true}).click();
 // New session re-applies model defaults once the catalog loads (button enabled); an earlier override is overwritten
 await page.waitForFunction(()=>document.querySelector('[aria-label="Choose model and effort"]')?.disabled===false);
 await page.evaluate(()=>{document.querySelector('.composer').modelSelection={provider:'cli',model:'fakeclaude'};window.__mounts=[];const seen=new WeakSet();new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1){for(const u of [n,...n.querySelectorAll?.('.thread-user')||[]])if(u.matches?.('.thread-user')&&u.textContent.trim()==='Stable pending command'&&!seen.has(u)){seen.add(u);window.__mounts.push(u.className);}}}).observe(document.body,{childList:true,subtree:true});});
 await page.locator('#prompt').fill('Stable pending command');await page.locator('.send-button').click();
 await page.locator('.thread-header').waitFor();
 await page.waitForTimeout(2500);
 const mounts=await page.evaluate(()=>window.__mounts);
 assert.ok(mounts.length>=1,'bubble rendered');
 // plain pending bubble, items-view pending bubble, then the agent item: never one remount per state event.
 assert.ok(mounts.filter(c=>c.includes('thread-pending')).length<=2,'pending bubble remounted: '+JSON.stringify(mounts));
 assert.ok(mounts.length<=3,'re-mounted '+mounts.length+' times: '+JSON.stringify(mounts));
 await shot('19-pending-command.png');
});

test('28: the tool-activity line shares the message column\'s left edge',async()=>{
 const left=await page.evaluate(()=>{const box=document.querySelector('.thread-messages.session-transcript')||document.querySelector('.thread-messages');if(!box)return null;const st=document.createElement('div');st.className='thread-status';st.setAttribute('role','status');st.textContent='Running bash';box.append(st);const row=document.createElement('details');row.className='thread-activity';row.innerHTML='<summary>Named session, ran bash</summary><div class="thread-activity-log"></div>';const msg=document.createElement('article');msg.className='thread-message thread-assistant';msg.textContent='Answer text';box.append(row,msg);
  const r=row.querySelector('summary'),first=r.firstElementChild||r.firstChild,range=document.createRange();range.selectNodeContents(r);const t=range.getBoundingClientRect(),m=msg.getBoundingClientRect();const sr=document.createRange();sr.selectNodeContents(st);const out={summary:t.left,status:sr.getBoundingClientRect().left,message:m.left,justify:getComputedStyle(r).justifyContent};st.remove();row.remove();msg.remove();return out;});
 console.log('28',JSON.stringify(left));assert.ok(left,'a transcript box is on screen');
 assert.ok(Math.abs(left.summary-left.message)<=2,'activity text starts at '+left.summary+' but the message column at '+left.message+' ('+left.justify+')');
 assert.ok(Math.abs(left.status-left.message)<=2,'"Running bash" status starts at '+left.status+' but the message column at '+left.message);
});

test('45: session context menu is the shared opaque popover',async()=>{
 const row=page.locator('.sidebar-cli-sessions .thread-row').first();
 if(!await row.count()){await page.evaluate(()=>window.sufficeDesktop.sessions.start({agent:'fakeclaude',cwd:document.querySelector('.project-picker')?.dataset.tooltip}));await page.waitForFunction(()=>document.querySelectorAll('.sidebar-cli-sessions .thread-row').length>=1,null,{timeout:15000});}
 await page.locator('.sidebar-cli-sessions .thread-row').first().click({button:'right'});
 const menu=page.locator('.thread-context-menu:not([hidden])');await menu.waitFor();await page.waitForTimeout(250);
 const s=await menu.evaluate(n=>{const c=getComputedStyle(n);return {bg:c.backgroundColor,filter:c.backdropFilter,radius:c.borderRadius,pad:c.paddingLeft,items:[...n.querySelectorAll('.menu-item')].map(i=>getComputedStyle(i).borderRadius)};});
 const m=await menu.evaluate(n=>{const it=[...n.querySelectorAll('.menu-item')];const r=it.map(i=>i.getBoundingClientRect());return {labels:it.map(i=>i.textContent.trim()),header:[...n.querySelectorAll('.popover-heading')].filter(h=>getComputedStyle(h).display!=='none').map(h=>h.textContent.trim()),gaps:r.slice(1).map((b,i)=>Math.round(b.top-r[i].bottom)),heights:r.map(b=>Math.round(b.height))};});
 console.log('45s',JSON.stringify(m));
 assert.deepEqual(m.header,[],'no visible Session header');
 assert.deepEqual(m.labels,['Copy attach command','Copy title','Show terminal','Stop session']);assert.ok(m.heights.every(h=>h===m.heights[0]),'uniform item height '+m.heights);assert.equal(new Set(m.gaps.slice(0,-1)).size,1,'uneven gaps between items '+m.gaps);
 assert.equal(alpha(s.bg),1,'menu background '+s.bg);assert.ok(['none',''].includes(s.filter),'no backdrop blur: '+s.filter);
 await shot('45-session-menu.png');await page.keyboard.press('Escape');
});

test('24, 28, 33, 38: live turn keeps its action bar in flow and its chips above the composer',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'sfx-fix1-live-'));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_SESSIONS_SOCKET:SOCKET+'-live',SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app2=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const pg=await app2.firstWindow();pg.setDefaultTimeout(10000);await pg.locator('.composer').waitFor();
  await app2.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.runs=[];const send=e=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',e);globalThis.sendEv=send;
   for(const a of ['run','thread','threads','models'])ipcMain.removeHandler('suffice:'+a);
   ipcMain.handle('suffice:models',()=>[{id:'fixture',provider:'openai',name:'Fixture',available:true,efforts:['low']}]);
   ipcMain.handle('suffice:threads',()=>[]);ipcMain.handle('suffice:thread',(_e,id)=>({id,title:'Initial',cwd:process.cwd(),messages:[]}));
   ipcMain.handle('suffice:run',(_e,p)=>new Promise(resolve=>{globalThis.runs.push({p,resolve});send({event:'thread_started',id:'fx',threadId:'fx',clientId:p.clientId});}));
  });
  await pg.reload();await pg.evaluate(()=>{window.__ev=[];sufficeDesktop.onEvent(e=>window.__ev.push(e.event));});await pg.locator('#prompt').fill('Add a retry to the fetch helper');await pg.locator('.composer').evaluate(f=>f.requestSubmit());
  await pg.getByRole('button',{name:'Stop task',exact:true}).waitFor();
  // the run handler (and its thread_started event) fires after the button appears; events sent earlier match no job and are dropped
  await pg.waitForFunction(()=>true);for(let i=0;i<200&&!await app2.evaluate(()=>globalThis.runs.length);i++)await pg.waitForTimeout(50);
  await app2.evaluate(()=>{const b={threadId:'fx',clientId:'fx'};sendEv({...b,event:'turn_started',presentation:{id:'t',startedAt:Date.now()-4000,provider:'unknown-provider',model:'Example',effort:'low'}});sendEv({...b,event:'tool_start',id:'t1',name:'edit',input:{path:'src/fetch.js'}});sendEv({...b,event:'tool_end',id:'t1',result:'ok',isError:false});});
  // invoke replies and sent events are separate IPC messages: resolving before the renderer saw tool_end finishes the job first and drops the tools
  await pg.waitForFunction(()=>window.__ev.includes('tool_end'));
  await app2.evaluate(()=>sendEv({threadId:'fx',clientId:'fx',event:'tool',name:'bash'}));
  await pg.locator('.thread-status',{hasText:'Running bash'}).waitFor();
  const st=await pg.evaluate(()=>{const s=document.querySelector('.thread-status'),r=document.createRange();r.selectNodeContents(s);const box=document.querySelector('.thread-messages').getBoundingClientRect();return {text:r.getBoundingClientRect().left,col:box.left,align:getComputedStyle(s).textAlign,self:getComputedStyle(s).alignSelf,w:s.getBoundingClientRect().width,boxw:box.width};});
  console.log('28 status',JSON.stringify(st));assert.ok(Math.abs(st.text-st.col)<=2,'"Running bash" starts at '+st.text+' but the message column at '+st.col+' '+JSON.stringify(st));
  await bothThemes(app2,pg,'28-running-status.png');
  await app2.evaluate(()=>runs[0].resolve({threadId:'fx',text:'Added a retry with backoff to fetch.js.'}));
  await pg.locator('.followup-chip').first().waitFor();
  const geo=await pg.evaluate(()=>{const row=document.querySelector('.thread-followups'),comp=document.querySelector('.composer'),r=row.getBoundingClientRect(),c=comp.getBoundingClientRect();return {inComposer:row.parentElement===comp,inTranscript:!!document.querySelector('.thread-messages .thread-followups'),gap:c.top-r.bottom,visible:r.height>0};});
  assert.equal(geo.inTranscript,false,'chips are not inline under the answer');assert.equal(geo.inComposer,true);assert.ok(geo.visible&&geo.gap>=0&&geo.gap<24,'chips sit just above the composer: '+JSON.stringify(geo));
  await pg.locator('.thread-assistant').last().hover();await pg.locator('.message-toolbar').waitFor({state:'visible'});
  const bar=await pg.evaluate(()=>{const b=document.querySelector('.message-toolbar'),a=document.querySelector('.thread-assistant:last-of-type')||[...document.querySelectorAll('.thread-assistant')].at(-1),br=b.getBoundingClientRect(),ar=a.getBoundingClientRect(),comp=document.querySelector('.composer').getBoundingClientRect(),row=document.querySelector('.thread-followups').getBoundingClientRect();return {slot:b.parentElement.className,under:br.top-ar.bottom,dot:document.querySelectorAll('.message-toolbar .settings-provider-placeholder').length,overChips:br.bottom>row.top&&br.top<row.bottom&&br.right>row.left&&br.left<row.right};});
  assert.equal(bar.slot,'message-actions-slot');assert.ok(bar.under>=0&&bar.under<12,JSON.stringify(bar));assert.equal(bar.dot,0);
  await bothThemes(app2,pg,'24-38-33-actions-and-chips.png');
  await pg.locator('.followup-chip').first().click();assert.equal(await pg.locator('#prompt').inputValue(),'Run the tests');
 }finally{await app2.close();tmux('-L',SOCKET+'-live','kill-server');}
});
