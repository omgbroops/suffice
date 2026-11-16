// Sweep: every tui-sim scenario through the real app (hidden window, own tmux socket, temp data). Compares the Chat view with the terminal screen and the scenario file.
// Run from the worktree root: node apps/desktop/test/sessions-sim.sweep.mjs   (SWEEP_ONLY=a,b limits scenarios)
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,readdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createClaudeMapper} from '../../../packages/backend/src/tui/claude.mjs';

const root=resolve('.'),SIM=resolve(root,'packages/backend/tools/tui-sim'),FIX=resolve(root,'packages/backend/test/fixtures/tui-real/claude');
const out=resolve(root,'apps/desktop/visual-review/sessions-sim');await mkdir(out,{recursive:true});
const only=process.env.SWEEP_ONLY?.split(',').filter(Boolean);
const names=(await readdir(resolve(SIM,'scenarios'))).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5)).filter(n=>!only||only.includes(n)).sort();
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-sim-')));
const socket=`sfx-sim-${process.pid}`,data=resolve(tmp,'data'),project=resolve(tmp,'demo-project'),dist=resolve(tmp,'dist');
for(const d of [data,project,resolve(tmp,'home'),resolve(tmp,'suffice')])await mkdir(d,{recursive:true});
execFileSync('npx',['vite','build','--outDir',dist,'--emptyOutDir'],{cwd:resolve(root,'apps/desktop'),stdio:'ignore'});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:resolve(tmp,'suffice'),SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_DIST:dist,SUFFICE_TEST_NODE:process.execPath,
 SUFFICE_TEST_SIM_AGENT:resolve(SIM,'sim.mjs'),SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:resolve(tmp,'home'),NODE_PATH:process.env.NODE_PATH||'/Users/abhayg/suffice-desktop-wt/voice/node_modules'});
const tmux=(...a)=>{try{return execFileSync('tmux',['-L',socket,...a],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{return '';}};
const screen=()=>{const s=tmux('list-sessions','-F','#{session_name}').split('\n').filter(Boolean).at(-1);return s?tmux('capture-pane','-p','-t',s):'';};
const strip=s=>String(s).replace(/\u001b\[[0-9;?]*[A-Za-z]/g,'');
const mapper=createClaudeMapper();

// ---- expectations from the scenario file
function expectedOf(scn){
 const maps=new Map(),items=[],seen=new Set(),texts=[];
 for(const b of scn.beats)for(const sp of b.transcript||[]){
  if(!sp.rec)continue;const key=`${sp.rec}|${sp.fresh||''}`;
  if(!maps.has(key)){const m=createClaudeMapper();maps.set(key,{m,st:m.newState?.()??{}});}
  const {m,st}=maps.get(key);
  let L;try{L=requireLines(sp.rec);}catch{continue;}
  for(const l of L.slice(sp.from,sp.to)){let o;try{o=JSON.parse(l);}catch{continue;}
   for(const it of m.mapLine(o,st)||[]){if(it.kind==='usage'||it.internal)continue;const id=key+'|'+it.id;
    if(!seen.has(id)){seen.add(id);items.push({id,it});}else items[items.findIndex(x=>x.id===id)]={id,it};}}}
 return items.map(x=>x.it);
}
const cache={};
function requireLines(rec){return cache[rec]??=execFileSync('cat',[resolve(FIX,rec,'transcript.jsonl')],{encoding:'utf8',maxBuffer:1<<28}).split('\n').filter(Boolean);}
const tokenOf=t=>{const w=String(t||'').replace(/\s+/g,' ').trim().split(' ').map(x=>x.replace(/[`'"]/g,'').split('/').pop()).filter(x=>x.length>=3&&!/^\d+[smh]$/.test(x));return (w.sort((a,b)=>b.length-a.length)[0]||'').slice(0,40);};
const sigOf=it=>it.kind==='tool'?tokenOf(it.title||it.name):it.kind==='todo'||it.kind==='plan'?tokenOf((it.items?.[0]?.text)||it.title||'todo'):it.kind==='subagent'?tokenOf(it.title||it.description||it.name||'agent'):tokenOf(it.text);

// ---- steps from the beat list
function stepsOf(scn){
 const s=[];
 for(const b of scn.beats){
  if(b.onInterrupt||b.working?.onInterrupt)s.push({k:'interrupt'});
  if(b.wait==='input'){const t=b.expectInput?b.expectInput.split('|')[0].replace(/^\^/,'').replace(/\\/g,''):(b.transcript||[]).map(sp=>{if(!sp.rec)return null;const m=createClaudeMapper(),st=m.newState?.()??{};for(const l of requireLines(sp.rec).slice(sp.from,sp.to)){for(const it of m.mapLine(JSON.parse(l),st)||[])if(it.kind==='user'&&it.text)return it.text;}return null;}).find(Boolean)||'continue';s.push({k:'wait',text:t.slice(0,120)});}
  if(b.dialog)s.push({k:b.dialog.kind});
 }
 return s;
}

// ---- in-page helpers
const INSTALL=`(()=>{if(window.__sw)return;window.__sw=1;window.__gap=0;window.__idle=0;let last=performance.now();
 const f=t=>{window.__gap=Math.max(window.__gap,t-last);last=t;requestAnimationFrame(f);};requestAnimationFrame(f);
 let since=0;setInterval(()=>{const idle=!document.querySelector('.session-status,.composer-approval:not([hidden]),.session-picker');if(!idle)since=0;else if(!since)since=performance.now();window.__idle=since?performance.now()-since:0;},100);})()`;
const SNAP=`(()=>{
 const q=s=>document.querySelector(s),t=(e,n=200)=>(e?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,n);
 const box=q('.thread-messages'),rows=[];
 const kind=e=>{const c=e.className||'';return /thread-user/.test(c)?'user':/thread-assistant/.test(c)?'assistant':/thread-reasoning/.test(c)?'reasoning':/session-run/.test(c)?'run':/session-sub/.test(c)?'subagent':/session-status/.test(c)?'working':/session-queued/.test(c)?'queued':/session-notice/.test(c)?'notice':/session-todo/.test(c)?'plan':/tool-widget|thread-detail/.test(c)?'tool':'other:'+c.slice(0,30);};
 for(const e of box?box.children:[]){const r={kind:kind(e),text:t(e),open:e.tagName==='DETAILS'?e.open:undefined};
  if(r.kind==='run'){r.summary=t(e.querySelector(':scope > summary'));r.children=[...e.querySelectorAll('.session-run-body > *')].slice(0,60).map(c=>({kind:kind(c),text:t(c,120),open:c.tagName==='DETAILS'?c.open:undefined,id:c.dataset?.callId}));r.full=e.textContent.length;}
  rows.push(r);}
 const card=q('.composer-approval:not([hidden])'),pk=q('.session-picker'),p=q('#prompt'),sb=q('.send-button'),hdr=q('.thread-header--session'),row=q('.session-row[aria-pressed="true"]')||q('.session-row');
 const sp=getComputedStyle(box||document.body);
 return {rows,box:{children:box?.children.length||0,nodes:box?box.querySelectorAll('*').length:0,text:box?.textContent.length||0},total:document.querySelectorAll('*').length,
  header:{text:t(hdr,300),ctls:[...document.querySelectorAll('.session-ctl')].map(x=>t(x,60)),usage:t(q('.session-usage')),bg:t(q('.session-bg')),cwd:t(q('.session-cwd'))},
  badge:row?{cls:row.className,status:row.dataset.status||row.querySelector('[data-status]')?.dataset.status||'',text:t(row,120),html:row.innerHTML.match(/status[-\\w]*[^>]*/g)?.slice(0,3)}:null,
  composer:{disabled:!!p?.disabled||!!p?.closest('[inert]'),ph:p?.placeholder,send:sb?{cls:sb.className,label:sb.getAttribute('aria-label')||sb.title||t(sb,20),disabled:sb.disabled}:null,approval:q('form[data-approval],[data-approval]')?.dataset.approval||null},
  card:card?{title:t(card.querySelector('h3')),body:t(card.querySelector('.approval-preview-host'),400),opts:[...card.querySelectorAll('.approval-controls button')].map(b=>({t:t(b),sel:b.classList.contains('provider-dialog-primary')}))}:null,
  picker:pk?{title:t(pk.querySelector('.popover-heading')),opts:[...pk.querySelectorAll('.menu-item')].map(b=>({t:t(b),sel:!!b.querySelector('.menu-check')}))}:null,
  mem:performance.memory?.usedJSHeapSize||0,gap:window.__gap,idle:window.__idle};})()`;

const app=await _electron.launch({executablePath:electronPath,args:[resolve(root,'apps/desktop'),`--user-data-dir=${data}`],env});
const pid=app.process().pid;let launches=1;
let result={};try{result=JSON.parse(await readFile(resolve(out,'SWEEP.json'),'utf8'));}catch{}
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('[data-action="send-menu"]').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 await page.evaluate(INSTALL);
 const snap=()=>page.evaluate(SNAP);
 for(const name of names){
  const scn=JSON.parse(await readFile(resolve(SIM,'scenarios',name+'.json'),'utf8'));
  const speed=name==='storm'?2:name==='long-session'?3:5,deadline=name==='storm'||name==='long-session'?300000:90000;
  for(const d of [data,resolve(data,'sessions')]){await mkdir(d,{recursive:true});await writeFile(resolve(d,'sim-run.json'),JSON.stringify({scenario:name,speed,seed:1}));}
  const R={name,steps:[],beats:[],verdicts:{},measure:{},notes:[]};result[name]=R;const t0=Date.now();
  try{
   const expected=expectedOf(scn),steps=stepsOf(scn);R.steps=steps.map(s=>s.k+(s.text?`:${s.text.slice(0,20)}`:''));
   await page.evaluate(()=>{window.__gap=0;window.__ipc=0;});
   await page.locator('.new-session').click();await page.locator('[data-action="send-menu"]').waitFor({state:'visible'});await page.waitForTimeout(400);
   await page.locator('[data-action="send-menu"]').click();await page.locator('[data-menu-action="cli-session:simclaude"]').click();
   await page.locator('.thread-header--session').waitFor();
   const sid=await page.evaluate(async()=>{const l=await sufficeDesktop.sessions.list();const s=l.filter(x=>x.agent==='simclaude').at(-1);let n=0;sufficeDesktop.sessions.onUi(s.id,()=>{window.__ipc=(window.__ipc||0)+1;});return s.id;});
   const mem0=(await snap()).mem;const tStart=Date.now();
   const beat=async(label)=>{const s=await snap();R.beats.push({label,t:Date.now()-tStart,snap:s,screen:strip(screen())});return s;};
   const cardWait=(ms=60000)=>page.waitForFunction(()=>document.querySelector('.composer-approval:not([hidden]),.session-picker'),null,{timeout:ms,polling:200});
   const clear=async()=>{try{await page.waitForFunction(()=>!document.querySelector('.composer-approval:not([hidden]),.session-picker'),null,{timeout:6000,polling:200});return true;}catch{return false;}};
   const deny=/deny|redirect/.test(name)||name==='bash-deny';
   let cleared=[],modeOk=null,modelOk=null;
   for(const [i,st] of steps.entries()){
    if(Date.now()-t0>deadline){R.notes.push('deadline at step '+i+' '+st.k);break;}
    if(st.k==='trust'||st.k==='perm'||st.k==='picker'){
     await cardWait();await page.waitForTimeout(500);const s=await beat(st.k+'-open');
     const opts=s.card?.opts||s.picker?.opts||[];let idx=0;
     if(st.k==='trust')idx=Math.max(0,opts.findIndex(o=>/^(1\.\s*)?yes/i.test(o.t)));
     else if(st.k==='perm'&&deny&&i>0)idx=Math.max(0,opts.findIndex(o=>/^(\d\.\s*)?no\b/i.test(o.t)));
     const scr=strip(screen()),pp=mapper.parsePrompt(scr);
     R.beats.at(-1).parsed=pp&&{title:pp.title,opts:pp.options.map(o=>o.label),sel:pp.selected};
     const target=page.locator(s.card?'.composer-approval .approval-controls button':'.session-picker .menu-item').nth(idx);
     await target.click();
     const nx=steps[i+1]?.k,ok=nx==='perm'||nx==='picker'?true:await clear(); // a chained dialog may legitimately follow at once
     cleared.push(ok);await page.waitForTimeout(600);await beat(st.k+'-after');
     if(st.k==='picker')modelOk=true;
    }else if(st.k==='wait'){
     await page.waitForFunction(()=>window.__idle>1200,null,{timeout:60000,polling:200});await beat('wait-before');
     const p=page.locator('#prompt');await p.fill(st.text);await p.press('Enter');await page.waitForTimeout(500);
     if(await p.inputValue().catch(()=> ''))await p.press('Enter');
     await page.waitForTimeout(700);await beat('wait-after');R.beats.at(-1).typed=st.text;
    }else if(st.k==='modal'){
     await page.waitForFunction(()=>window.__idle>1500,null,{timeout:60000,polling:200});await beat('modal-open');
     await page.locator('.session-toggle button',{hasText:'Terminal'}).click();await page.locator('.session-terminal .xterm-rows').waitFor();
     await page.locator('.session-terminal .xterm').click().catch(()=>{});await page.keyboard.press('Escape');await page.waitForTimeout(600);
     await page.locator('.session-toggle button',{hasText:'Chat'}).click();await page.waitForTimeout(400);
    }else if(st.k==='interrupt'){
     await page.waitForFunction(()=>document.querySelector('.session-status'),null,{timeout:60000,polling:200});await page.waitForTimeout(3000);await beat('interrupt-working');
     await page.locator('.send-button').click();await page.waitForTimeout(800);
    }
   }
   if(name==='mode-cycle'||name==='model-switch'){
    await page.waitForFunction(()=>window.__idle>1500,null,{timeout:30000,polling:200}).catch(()=>{});
    const before=await snap();
    const ctl=page.locator('.session-ctl').nth(name==='mode-cycle'?2:0);
    if(await ctl.count()){await ctl.click();await page.waitForTimeout(400);const items=page.locator('.popover .menu-item,.session-menu .menu-item');R.measure.menuItems=await items.count();
     await beat('menu-open');if(R.measure.menuItems>1){await items.nth(1).click();await page.waitForTimeout(2500);}else await page.keyboard.press('Escape');}
    const after=await snap();R.measure.ctlBefore=before.header.ctls;R.measure.ctlAfter=after.header.ctls;
    if(name==='mode-cycle')modeOk=JSON.stringify(before.header.ctls)!==JSON.stringify(after.header.ctls);
   }
   // settle, then final snapshot
   await page.waitForFunction(()=>window.__idle>2500,null,{timeout:30000,polling:200}).catch(()=>R.notes.push('never idle'));
   const fin=await beat('final');R.final=fin;
   // stress
   const ipc=await page.evaluate(()=>window.__ipc||0),secs=(Date.now()-tStart)/1000;
   R.measure={...R.measure,domRows:fin.box.children,domNodes:fin.box.nodes,domTotal:fin.total,gapMaxMs:Math.round(fin.gap),ipcPerSec:+(ipc/secs).toFixed(1),ipcCount:ipc,memBeforeMB:+(mem0/1e6).toFixed(1),memAfterMB:+(fin.mem/1e6).toFixed(1),seconds:+secs.toFixed(1)};
   if(name==='long-session'){const sc=await page.evaluate(()=>{const b=document.querySelector('.thread-messages');let e=b;while(e&&!(e.scrollHeight>e.clientHeight+5&&/auto|scroll/.test(getComputedStyle(e).overflowY)))e=e.parentElement;if(!e)return null;const t0=performance.now();e.scrollTop=e.scrollHeight;return {atBottom:e.scrollHeight-e.scrollTop-e.clientHeight<6,ms:Math.round(performance.now()-t0),h:e.scrollHeight};});R.measure.scroll=sc;
    const t1=Date.now();await page.locator('.session-row').first().click();await page.waitForTimeout(100);R.measure.reopenMs=Date.now()-t1;R.measure.showEarlier=await page.locator('button',{hasText:/earlier/i}).count();}
   if(name==='huge-output'){
    R.measure.nodesCollapsed=fin.box.nodes;
    for(let k=0;k<4;k++){const sums=page.locator('.thread-messages details > summary:visible');const n=await sums.count();let opened=0;for(let j=0;j<n;j++){const d=sums.nth(j);if(!await d.evaluate(e=>e.parentElement.open)){await d.click().catch(()=>{});opened++;}}if(!opened)break;await page.waitForTimeout(300);}
    const ex=await snap();R.measure.nodesExpanded=ex.box.nodes;R.measure.textExpanded=ex.box.text;R.measure.showMore=await page.locator('.thread-messages button',{hasText:/more|truncated|earlier/i}).count();R.measure.truncNote=await page.locator('.thread-messages',{hasText:/truncated/}).count();}
   await page.evaluate(()=>{const b=document.querySelector('.thread-messages');let e=b;while(e&&!(e.scrollHeight>e.clientHeight+5))e=e.parentElement;if(e)e.scrollTop=e.scrollHeight;});
   await page.screenshot({path:resolve(out,name+'.png')});
   // ---- verdicts
   const dom=fin.rows,full=dom.map(r=>r.kind==='run'||r.kind==='subagent'?r.text:r.text).join(' \n ');
   const text=await page.evaluate(()=>document.querySelector('.thread-messages')?.textContent.replace(/\s+/g,' ')||'');
   let cur=0;const missing=[];
   for(const it of expected){const sg=sigOf(it);if(!sg)continue;const at=text.indexOf(sg,cur);if(at<0)missing.push(it.kind+':'+sg);else cur=at;}
   R.verdicts.expectedInOrder={pass:missing.length===0,expected:expected.length,missing:missing.slice(0,12)};
   const seenTxt=new Map(),dups=[];
   for(const r of dom)if(['user','assistant','notice','reasoning'].includes(r.kind)&&r.text){const n=(seenTxt.get(r.text)||0)+1;seenTxt.set(r.text,n);}
   const expCount=new Map();for(const it of expected)if(it.text)expCount.set(tokenOf(it.text),(expCount.get(tokenOf(it.text))||0)+1);
   for(const [tx,n] of seenTxt)if(n>1&&n>(expCount.get(tokenOf(tx))||1))dups.push(tx.slice(0,60)+' x'+n);
   R.verdicts.noDuplicates={pass:!dups.length,dups:dups.slice(0,8)};
   const known=new Set(steps.filter(s=>s.text).map(s=>s.text)),extra=[];
   for(const r of dom){if(!['user','assistant','reasoning'].includes(r.kind))continue;const tk=tokenOf(r.text);if(!expected.some(it=>it.text&&(it.text.replace(/\s+/g,' ').includes(tk)||r.text.includes(tokenOf(it.text))))&&![...known].some(k=>r.text.includes(k)))extra.push(r.kind+':'+r.text.slice(0,60));}
   R.verdicts.nothingExtra={pass:!extra.length,extra:extra.slice(0,8)};
   const cardBeats=R.beats.filter(b=>b.snap.card&&b.parsed),bad=[];
   for(const b of cardBeats){const c=b.snap.card.opts.map(o=>o.t.replace(/^\d+\.\s*/,'')),pl=b.parsed.opts.map(o=>o.replace(/^\d+\.\s*/,''));const cs=b.snap.card.opts.findIndex(o=>o.sel);
    if(JSON.stringify(c)!==JSON.stringify(pl)||cs!==b.parsed.sel)bad.push({beat:b.label,card:c,screen:pl,cs,ss:b.parsed.sel});}
   R.verdicts.cardMatchesScreen={pass:!bad.length,checked:cardBeats.length,bad:bad.slice(0,3)};
   R.verdicts.clearsAfterAnswer={pass:cleared.every(Boolean)&&!fin.card&&!fin.picker,answered:cleared.length};
   R.verdicts.badgeClearAtEnd={pass:!/needs|permission|working/i.test((fin.badge?.cls||'')+(fin.badge?.status||'')+(fin.badge?.html||[]).join(' ')),badge:fin.badge&&{status:fin.badge.status,html:fin.badge.html}};
   R.verdicts.headerNotWorking={pass:!fin.rows.some(r=>r.kind==='working')&&!/\bworking\b/i.test(fin.header.text),header:fin.header.text.slice(0,120)};
   const badC=R.beats.filter(b=>!!b.snap.card!==!!b.snap.composer.disabled&&/-open$/.test(b.label)&&b.snap.card);
   R.verdicts.composerDisabledOnlyWithPrompt={pass:!badC.length&&!fin.composer.disabled,openBeatsChecked:R.beats.filter(b=>b.snap.card).length};
   if(modeOk!==null)R.verdicts.headerFollowsMode={pass:modeOk};
   if(name==='parallel-subagents'||name==='subagent'||name==='long-session'){const subs=dom.filter(r=>r.kind==='subagent'||(r.children||[]).some(c=>c.kind==='subagent'));R.measure.subagentBlocks=(await page.locator('.session-sub').count());R.verdicts.subagentBlocks={pass:R.measure.subagentBlocks>=(name==='parallel-subagents'?3:1)};}
   {const ov=await page.evaluate(()=>{const m=document.querySelector('.thread-messages');return m?[...m.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>m.getBoundingClientRect().right+2&&!e.closest('pre,.tool-diff,.session-terminal')).length:0;});R.verdicts.noHorizontalOverflow={pass:ov===0,count:ov};}
   R.verdicts.noPageErrors={pass:!errors.length,errors:errors.slice(0,3)};errors.length=0;
   R.verdicts.sizeOk=name==='huge-output'?{pass:R.measure.nodesExpanded<3000&&(R.measure.showMore>0||R.measure.truncNote>0),nodes:R.measure.nodesExpanded}:undefined;
   R.pass=Object.values(R.verdicts).filter(Boolean).every(v=>v.pass);
   await page.evaluate(id=>sufficeDesktop.sessions.stop(id),sid).catch(()=>{});
  }catch(e){R.error=String(e.message||e).slice(0,300);R.pass=false;try{await page.screenshot({path:resolve(out,name+'.png')});}catch{}
   await page.evaluate(async()=>{for(const s of await sufficeDesktop.sessions.list())await sufficeDesktop.sessions.stop(s.id).catch(()=>{});}).catch(()=>{});}
  console.log(name,R.pass?'PASS':'FAIL',R.error||Object.entries(R.verdicts).filter(([,v])=>v&&!v.pass).map(([k])=>k).join(','));
  await writeFile(resolve(out,'SWEEP.json'),JSON.stringify(result,(k,v)=>k==='final'?undefined:v,1));
 }
}finally{
 try{process.kill(pid,'SIGKILL');}catch{}
 tmux('kill-server');
 const rows=Object.values(result);
 const line=(r)=>`${r.pass?'PASS':'FAIL'}  ${r.name.padEnd(20)} ${r.error?'ERROR '+r.error.slice(0,80):Object.entries(r.verdicts).filter(([,v])=>v&&!v.pass).map(([k])=>k).join(', ')}`;
 await writeFile(resolve(out,'SWEEP.txt'),rows.map(line).join('\n')+'\n\nMeasurements\n'+rows.filter(r=>r.measure&&r.measure.domRows!=null).map(r=>`${r.name.padEnd(20)} rows=${r.measure.domRows} nodes=${r.measure.domNodes} gapMax=${r.measure.gapMaxMs}ms ipc/s=${r.measure.ipcPerSec} mem=${r.measure.memBeforeMB}->${r.measure.memAfterMB}MB`).join('\n')+'\n');
 console.log('launches',launches);
}
