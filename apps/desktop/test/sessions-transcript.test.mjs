import electronPath from 'electron';
// Hidden (SUFFICE_TEST_HIDE_WINDOW=1) check + capture of the CLI-session transcript against the fake Claude agent on a private tmux socket.
// SHOTS=<dir> also writes PNGs (webContents.capturePage, 1440x900).
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const KEY='session-transcript',SOCK=`sfx-r2-${KEY}-${process.pid}`,SHOTS=process.env.SHOTS;if(SHOTS)await mkdir(SHOTS,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-sess-tr-')));
const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:SOCK,SUFFICE_HISTORY_HOME:home,
 SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs'),
 NODE_PATH:process.env.NODE_PATH||'/Users/abhayg/suffice-desktop-wt/voice/node_modules'});
const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 const sock=await app.evaluate(()=>process.env.SUFFICE_SESSIONS_SOCKET);assert.equal(sock,SOCK,'private socket reaches the app');
 const shot=async n=>{if(!SHOTS)return;const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(SHOTS,n),Buffer.from(b,'base64'));};
 await page.locator('[data-action="send-menu"]').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 const cwd=await app.evaluate(()=>process.env.SUFFICE_START_PROJECT);await page.evaluate(([a,p])=>sufficeDesktop.sessions.start({agent:a,cwd:p}),['fakeclaude',cwd]);await page.reload();await page.locator('[data-action="send-menu"]').waitFor();await page.locator('.sidebar-cli-sessions .thread-row').first().click();
 await page.locator('.composer-approval:not([hidden])').waitFor({timeout:20000});await page.waitForTimeout(600);
 // working: standard live line
 await page.locator('.thread-messages > .thread-status').waitFor();
 const live=await page.locator('.thread-messages > .thread-status').textContent();
 assert.match(live,/^(Working|Thinking) for (\d+m )?\d+s/);assert.ok(!/[↓↑]|Newspapering/.test(live),live);
 assert.equal(await page.locator('.thread-messages .thread-activity[data-running="true"] .thread-state').count()>0,true,'spinner while working');
 await shot('working.png');
 // approve -> done
 await page.locator('.composer-approval button',{hasText:/^\s*(1\.\s*)?Yes\s*$/}).first().click();
 await page.waitForFunction(()=>!document.querySelector('.thread-messages > .thread-status'),null,{timeout:20000});await page.waitForTimeout(700);
 const T='.thread-messages';
 assert.equal(await page.locator(`${T} .session-run`).count(),0);
 assert.equal(await page.locator(`${T} .thread-state`).count(),0,'no spinners after done');
 await shot('done.png');
 // summaries: verbs, no native marker
 const sums=await page.locator(`${T} summary`).evaluateAll(l=>l.map(s=>({t:s.textContent.trim(),ls:getComputedStyle(s).listStyleType,mk:getComputedStyle(s,'::marker').content})));
 assert.ok(sums.length>3);for(const s of sums)assert.ok(s.ls==='none'||s.mk==='none'||s.mk==='""'||s.mk==='normal'&&s.ls==='none',JSON.stringify(s));
 const tools=await page.locator(`${T} details.tool-widget > summary`).evaluateAll(l=>l.map(s=>s.textContent.trim()));
 assert.ok(tools.length>=3);for(const t of tools)assert.match(t,/^(Read|Wrote|Edited|Ran|Searched|Used|Reading|Writing|Editing|Running|Searching|Using)/,t);
 assert.ok(!tools.some(t=>/exit \d/.test(t)));
 // failed tool row is the standard error state
 assert.ok(await page.locator(`${T} .thread-detail[data-status="error"]`).count()>=1,'failed tool row');
 // compaction divider, no bare duration row
 assert.equal(await page.locator(`${T} .thread-divider[data-kind="compacted"]`).count(),1);
 assert.equal(await page.locator(`${T} .session-note`,{hasText:/^\s*\d+m?\s*\d*s\s*$/}).count(),0);
 // run summary: capped, short
 const run=await page.locator(`${T} > details.thread-activity > summary .activity-label`).allTextContents();assert.ok(run.every(t=>t.split(', ').length<=5),run.join('|'));
 // subagents
 const subs=page.locator(`${T} .session-sub`);assert.equal(await subs.count(),2);
 await page.locator(`${T} > details.thread-activity:has(.session-sub)`).evaluateAll(l=>l.forEach(d=>{d.open=true;}));await page.waitForTimeout(300);
 const scroll=l=>l.evaluate(e=>e.scrollIntoView({block:'center'}));
 await scroll(subs.nth(0));await page.waitForTimeout(200);await shot('subagent-collapsed.png');
 await subs.nth(0).locator('> summary').click();await page.waitForTimeout(500);
 assert.equal(await page.locator(`${T} .thread-user:has-text("Find other typos")`).count(),0);
 assert.ok(await subs.nth(0).locator('blockquote.session-sub-prompt').count()>=1,'prompt is a quoted block');
 const stat=await subs.nth(0).locator('> summary .activity-meta').textContent();assert.ok(!/Done/.test(stat)&&/tool use/.test(stat),stat);
 await scroll(subs.nth(0));await page.waitForTimeout(200);await shot('subagent-open.png');
 await subs.nth(0).locator('details.thread-activity:has(.session-sub)').evaluateAll(l=>l.forEach(d=>{d.open=true;}));await page.waitForTimeout(300);
 await subs.nth(0).locator('details.session-sub > summary').first().click();await page.waitForTimeout(500);await shot('subagent-nested.png');
 // diff open, ids unique
 const diffRun=page.locator(`${T} > details.thread-activity:has(.tool-diff)`).first();
 if(!await diffRun.evaluate(e=>e.open))await diffRun.locator('> summary').click();await page.waitForTimeout(400);
 await page.locator(`${T} .tool-widget:has(.tool-diff) > summary`).first().click().catch(()=>{});await page.waitForTimeout(500);
 await page.locator(T).evaluate(e=>e.querySelector('.tool-diff')?.scrollIntoView({block:'center'}));await page.waitForTimeout(300);await shot('diff-open.png');
 const dup=await page.locator(`${T} [data-item-id]`).evaluateAll(l=>{const c={};for(const n of l)c[n.dataset.itemId]=(c[n.dataset.itemId]||0)+1;return Object.entries(c).filter(([,v])=>v>1);});
 assert.deepEqual(dup,[],'one node per item id');
 // gaps inside open subagent stay small
 const gaps=await subs.nth(0).locator('> .thread-activity-log').evaluate(log=>{const k=[...log.children];return k.slice(1).map((c,i)=>c.getBoundingClientRect().top-k[i].getBoundingClientRect().bottom);});
 assert.ok(gaps.every(g=>g<=12),gaps.join(','));
 await page.locator(T).evaluate(e=>{e.parentElement.scrollTop=0;});await page.waitForTimeout(200);await shot('full-top.png');
 // no hard-coded status colors in the transcript css
 console.log('sessions-transcript OK');
}finally{await app.close().catch(()=>{});try{execFileSync('tmux',['-L',SOCK,'kill-server'],{stdio:'ignore'});}catch{}}
