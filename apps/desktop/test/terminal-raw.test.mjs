// Raw terminal: the PTY's output is shown as the program wrote it. Hidden Electron only (guard + SUFFICE_TEST_HIDE_WINDOW).
import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {createRequire} from 'node:module';
import {guard} from './electron-guard.mjs';
const {createTerminalManager}=createRequire(import.meta.url)('../electron/terminals.cjs');
const terminalId='terminal:11111111-1111-4111-8111-111111111111';
const fake=()=>{const ptys=[],events=[];const spawn=(shell,args,options)=>{const p={options,writes:[],_writeStream:{_writeQueue:[]},exitCb:null,dataCb:null,
 write(d){this.writes.push(d);this._writeStream._writeQueue.push(d);},resize(){},kill(){},onData(f){this.dataCb=f;},onExit(f){this.exitCb=f;}};ptys.push(p);return p;};
 const manager=createTerminalManager({resolveCwd:async()=>tmpdir(),resolveShell:async()=>'/bin/bash',emit:e=>events.push(e),spawn});return {manager,ptys,events};};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

test('shell env carries no app config',async()=>{
 process.env.SUFFICE_HOME='/x';process.env.ELECTRON_FOO='1';process.env.NODE_OPTIONS='--max-old-space-size=64';
 const {manager,ptys}=fake();await manager.create({threadId:'t',id:terminalId});
 const keys=Object.keys(ptys[0].options.env);assert.deepEqual(keys.filter(k=>/^(SUFFICE_|ELECTRON_|NODE_OPTIONS)/.test(k)),[]);assert.equal(ptys[0].options.env.COLORTERM,'truecolor');
 manager.dispose();
});
test('Ctrl-C goes out ahead of an unsent paste; input is paced behind pty backpressure',async()=>{
 const {manager,ptys}=fake();await manager.create({threadId:'t',id:terminalId});const p=ptys[0];
 manager.write({threadId:'t',id:terminalId,data:'x'.repeat(1000000)});await wait(20);
 assert.ok(p.writes[0].length<=16384);assert.equal(p.writes.length,1,'only one 16 KB chunk is handed to the pty while its queue is busy');
 manager.write({threadId:'t',id:terminalId,data:'\x03'});p._writeStream._writeQueue.length=0;await wait(30);
 assert.deepEqual(p.writes.slice(1),['\x03'],'the rest of the paste is dropped and Ctrl-C is next');
 manager.dispose();
});
test('write after the pty died ends the session instead of throwing',async()=>{
 const {manager,ptys,events}=fake();await manager.create({threadId:'t',id:terminalId});const p=ptys[0];
 p.write=()=>{throw Object.assign(new Error('EIO'),{code:'EIO'});};
 assert.doesNotThrow(()=>manager.write({threadId:'t',id:terminalId,data:'ls\r'}));
 assert.equal(events.at(-1).type,'exit');assert.doesNotThrow(()=>manager.write({threadId:'t',id:terminalId,data:'ls\r'}));
 manager.dispose();
});
test('rendered terminal is raw: platform mono, standard palette, grapheme widths, wheel, interrupt after flood',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-term-raw-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-term-raw-p-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
 const now=new Date().toISOString();await writeFile(resolve(dir,'0.jsonl'),[{type:'session',version:3,id:'fixture-0',timestamp:now,cwd},{type:'message',id:'u0',parentId:null,timestamp:now,message:{role:'user',content:[{type:'text',text:'Raw terminal thread'}],timestamp:Date.now()}}].map(v=>JSON.stringify(v)).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_HISTORY_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-r2-terminal-'+process.pid,SHELL:'/bin/bash'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  let mainErr='';app.process().stderr.on('data',d=>mainErr+=d);
  const page=await app.firstWindow();await page.setViewportSize({width:1440,height:900});
  await page.locator('.thread-row').filter({hasText:'Raw terminal thread'}).click();
  // Settings: nothing that restyles the terminal.
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-section="projects"]').click();/* Terminal settings now live in the Projects tab */
  const settingsText=await page.locator('body').innerText();for(const label of ['Blink cursor','Cursor','Font size'])assert.ok(!new RegExp('(^|\\n)'+label+'(\\n|$)').test(settingsText),'Settings still offers '+label);
  await page.keyboard.press('Escape');
  const asset=(await readdir(resolve('apps/desktop/dist/assets'))).find(n=>/^terminal-view-.*\.js$/.test(n));
  await page.getByRole('button',{name:'Toggle right panel',exact:true}).click();
  const shot=resolve('/Users/abhayg/suffice-desktop-wt/ui-shots/r2-terminal');await mkdir(shot,{recursive:true});
  const probe=await page.evaluate(async asset=>{const {createTerminalViews}=await import(new URL('assets/'+asset,location.href));const views=createTerminalViews({api:window.sufficeDesktop,onLabel(){}});
   const threadId=(await window.sufficeDesktop.threads()).find(t=>t.title==='Raw terminal thread').id,id='terminal:33333333-3333-4333-8333-333333333333';
   const body=document.querySelector('.right-panel-content');const view=await views.mount(body,threadId,id,1);await view.start;window.__raw={view,views,id,threadId};
   const o=view.term.options;return {font:o.fontFamily,size:o.fontSize,lh:o.lineHeight,cur:o.cursorStyle,blink:o.cursorBlink,uni:view.term.unicode.activeVersion,palette:Object.keys(o.theme||{}).filter(k=>!['background','foreground','cursor','selectionBackground'].includes(k))};},asset);
  assert.match(probe.font,/^ui-monospace/);assert.equal(probe.size,12);assert.equal(probe.lh,1);assert.equal(probe.cur,'block');assert.equal(probe.blink,false);assert.match(probe.uni,/graphemes/);assert.deepEqual(probe.palette,[]);
  const send=data=>page.evaluate(d=>window.sufficeDesktop.terminalWrite({threadId:window.__raw.threadId,id:window.__raw.id,data:d}),data);
  const text=()=>page.evaluate(()=>{const b=window.__raw.view.term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i).translateToString(true)).join('\n');});
  // Unicode widths: a thumbs-up is two cells, true colour passes through.
  await send("printf '\\xf0\\x9f\\x91\\x8d|\\x1b[38;2;12;34;56mTRUE\\x1b[0m|\\x45ND\\n'\r");
  await page.waitForFunction(()=>/\|END/m.test(Array.from({length:window.__raw.view.term.buffer.active.length},(_,i)=>window.__raw.view.term.buffer.active.getLine(i).translateToString(true)).join('\n')));
  const cells=await page.evaluate(()=>{const b=window.__raw.view.term.buffer.active;for(let i=0;i<b.length;i++){const l=b.getLine(i),s=l.translateToString(true);if(s.startsWith('\u{1F44D}|')||s.includes('\u{1F44D}|TRUE')){const c=l.getCell(s.indexOf('\u{1F44D}')===0?0:s.indexOf('\u{1F44D}'));const t=l.getCell(3);return {w:c.getWidth(),fg:t.getFgColor(),mode:t.isFgRGB()};}}return null;});
  assert.ok(cells,'emoji row found in: '+JSON.stringify((await text()).split('\n').filter(Boolean).slice(-6)));assert.equal(cells.w,2);assert.equal(cells.mode,true);assert.equal(cells.fg,(12<<16)|(34<<8)|56);
  // Grapheme clusters: a flag (two regional indicators) and a VS16 heart are each one 2-cell glyph.
  await send("printf '\\xf0\\x9f\\x87\\xba\\xf0\\x9f\\x87\\xb8|\\xe2\\x9d\\xa4\\xef\\xb8\\x8f|\\x47FIN\\n'\r");
  await page.waitForFunction(()=>{const b=window.__raw.view.term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i).translateToString(true)).some(s=>s.includes('|GFIN'));});
  const g=await page.evaluate(()=>{const b=window.__raw.view.term.buffer.active;for(let i=0;i<b.length;i++){const l=b.getLine(i);if(l.translateToString(true)==='\u{1F1FA}\u{1F1F8}|❤️|GFIN'){const c=n=>l.getCell(n);return {flag:[c(0).getChars(),c(0).getWidth()],bar1:c(2).getChars(),heart:[c(3).getChars(),c(3).getWidth()],bar2:c(5).getChars()};}}return null;});
  assert.deepEqual(g,{flag:['\u{1F1FA}\u{1F1F8}',2],bar1:'|',heart:['❤️',2],bar2:'|'});
  await page.screenshot({path:shot+"/graphemes.png"});
  // Scrollback wheel moves the viewport.
  await send("for i in $(seq 1 150); do echo WHEEL_$i; done; echo WHEEL_DONE\r");await page.waitForFunction(()=>/^WHEEL_DONE/m.test(Array.from({length:window.__raw.view.term.buffer.active.length},(_,i)=>window.__raw.view.term.buffer.active.getLine(i).translateToString(true)).join('\n')));
  const box=await page.locator('.right-panel-content .terminal-session').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  const before=await page.evaluate(()=>window.__raw.view.term.buffer.active.viewportY);await page.mouse.wheel(0,-600);await page.waitForTimeout(300);
  assert.ok(await page.evaluate(()=>window.__raw.view.term.buffer.active.viewportY)<before,'wheel scrolled the scrollback');
  await page.screenshot({path:shot+'/raw-terminal.png'});
  // Ctrl-C after a 1.1 MB paste returns promptly. The paste goes to the bash readline prompt (a program that reads it; a canonical-mode `sleep` drops input and would pass on the base too).
  await send("PS1='RDY> '\r");await page.waitForTimeout(300);
  await page.evaluate(()=>{window.__raw.view.term.focus();window.__raw.view.term.paste('y'.repeat(1100000));});
  const t0=Date.now();await page.evaluate(()=>{window.__raw.view.term.input('\x03');window.__raw.view.term.input('echo AFTER_INT\r');});
  await page.waitForFunction(()=>Array.from({length:window.__raw.view.term.buffer.active.length},(_,i)=>window.__raw.view.term.buffer.active.getLine(i).translateToString(true)).some(l=>l==='AFTER_INT'),null,{timeout:8000});
  assert.ok(Date.now()-t0<3000,'Ctrl-C lag '+(Date.now()-t0));
  // Closing the tab with a paste queued must not make node-pty log an async EBADF/EIO from its write stream (real pty, real main process).
  await page.evaluate(()=>{const {threadId,id}=window.__raw;for(let i=0;i<4;i++)window.sufficeDesktop.terminalWrite({threadId,id,data:'y'.repeat(900000)}).catch(()=>{});});await page.waitForTimeout(100);
  await page.evaluate(()=>{const {views,id,threadId}=window.__raw;views.close(threadId,id);});await page.waitForTimeout(1500);
  assert.doesNotMatch(mainErr,/Unhandled pty write error|EBADF|EIO/,mainErr);
 }finally{await app.close();}
});
