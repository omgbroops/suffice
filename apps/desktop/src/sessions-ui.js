import {icon} from './ui.js';
import {populateThreadRow,tickThreadTimes,threadState} from './thread-row.js';
import {showPopover,hidePopover} from './popover-motion.js';
import {createToolWidget} from './tool-widget.js';
import {renderCode} from './panel-content.js';
import {summarizeTools} from '../../../packages/backend/src/tui/summary.mjs';
import './sessions.css';

const sx=window.sufficeDesktop?.sessions;
let avail={ok:true,agents:[]};
sx?.available().then(a=>{avail=a;}).catch(()=>{});
const STATUS={starting:'working',working:'working',waiting_input:'input',needs_permission:'approval',error:'failed',exited:'done'};
const base=p=>String(p||'').split('/').filter(Boolean).pop()||'/';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const age=ms=>{const s=Math.max(0,(Date.now()-ms)/1000);return s<60?'now':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d';};
const PH=document.querySelector('#prompt')?.placeholder||'';const prompt=()=>document.querySelector('#prompt');
const project=()=>document.querySelector('.project-picker')?.dataset.tooltip||'';

// Items for the new-thread menu. Agents come from `available()`; a missing tmux becomes one disabled line.
export function sessionMenuItems(){
 if(!sx)return [];
 const items=avail.agents.map((a,i)=>a.missing?{label:`${a.label} session`,detail:`${a.label} CLI not found`,disabled:true,separator:i===0}:{label:`${a.label} session`,action:'cli-session:'+a.id,separator:i===0});
 if(!avail.ok)items.push({label:`CLI sessions: ${avail.reason||'unavailable'}`,detail:avail.reason,disabled:true,separator:true});
 items.push({label:'Import chat',action:'import-chat:open',separator:!items.length});
 return items;
}

export function connectSessions({toast,form,workspace,header,hooks}){
 if(!sx)return {leave(){},isActive:()=>false,stop:()=>false,send(){}};
 const side=el('div','sidebar-cli-sessions');
 document.querySelector('.sidebar-sessions').before(side);
 const rows=new Map(),states=new Map(),prompts=new Map(),subs=new Map(),labels=new Map(),titles=new Map();
 const name=s=>titles.get(s.id)||`${labels.get(s.id)||s.agent} session`;
 let active=null,mode='chat',unsubs=[],termEl=null,views=null,viewPromise=null,import_=null;
 let ui=null,statusEl=null,uiUnsub=null,subUnsub=null,box=null,useItems=false,lastMsgs=[],card=null,cardSig='',metaEl=null,termBtn=null;const cache=new Map();
 const termIds=new Map();
 form.addEventListener('submit',e=>{if(card){e.preventDefault();e.stopImmediatePropagation();}},true);

 async function refresh(){
  let list;try{list=await sx.list();}catch{return;}
  const seen=new Set();
  for(const s of list){
   seen.add(s.id);labels.set(s.id,avail.agents.find(a=>a.id===s.agent)?.label||s.agent);
   if(!states.has(s.id)){states.set(s.id,'starting');sx.onState(s.id,v=>{states.set(s.id,v?.state||'starting');paint(s);if(active?.id===s.id){paintHeader();syncRun();}});
    sx.onUi(s.id,u=>{const had=prompts.get(s.id);prompts.set(s.id,u?!!u.prompt:undefined);if(had!==prompts.get(s.id))paint(s);});}
   paint(s);
  }
  for(const [id,row] of rows)if(!seen.has(id)){row.remove();rows.delete(id);}
 }
 function paint(s){
  let row=rows.get(s.id);
  if(!row){row=el('button','thread-row session-row session-row--sidebar');row.type='button';row.addEventListener('click',()=>open(row._s));rows.set(s.id,row);side.append(row);}
  row._s=s;
  let state=states.get(s.id)||'starting';
  if(state==='needs_permission'&&prompts.get(s.id)===false)state='working'; // badge follows the screen: no prompt on it, no "?"
  populateThreadRow(row,{id:'session-'+s.id,title:name(s),project:base(s.cwd),status:STATUS[state]||'working',modified:(s.created&&s.created<1e12?s.created*1000:s.created)||Date.now()});
  const label=labels.get(s.id);const noGit=row.querySelector('.thread-no-branch span');if(noGit)noGit.textContent=label+' CLI';
  row.setAttribute('aria-pressed',String(active?.id===s.id));row.title=`${name(s)} (${label} CLI)`;
  tickThreadTimes(row);
 }
 const unpress=()=>{for(const r of rows.values())r.setAttribute('aria-pressed','false');};

 // Chat view reuses the normal message components.
 function renderChat(box,messages){
  box.replaceChildren();
  for(const m of messages){const role=m.role==='user'?'user':'assistant';const a=el('article',`thread-message thread-${role}`);if(role==='assistant')hooks.markdown(a,m.text);else a.textContent=m.text;box.append(a);}
  hooks.bottom();
 }
 const notice=(box,s)=>{
  const n=el('div','session-notice');n.append(el('span','',states.get(s.id)==='needs_permission'?'Waiting for you in the terminal':''));
  const b=el('button','button button--subtle','Open terminal');b.type='button';b.addEventListener('click',()=>setMode('terminal'));n.append(b);
  box.append(n);
 };
 // Display-only path shortening: cwd-relative, home as ~, one path over 80 chars elided in the middle. Full text goes in a tooltip.
 const short=t=>String(t).replace(/\/[\w.@+~-]+(?:\/[\w.@+~ -]*[\w.@+~-])+/g,p=>{const cwd=active?.s.cwd||'',home=sx.home||'';
  let r=cwd&&p.startsWith(cwd+'/')?p.slice(cwd.length+1):home&&p.startsWith(home+'/')?'~'+p.slice(home.length):p;
  if(r.length>80){const seg=r.split('/');r='…/'+seg.slice(-2).join('/');}return r;});
 // Items feed (Claude/Codex): one element per item id, replaced in place when its content changes.
 const cap=t=>{t=String(t||'');return t.length>4000?t.slice(0,4000)+'\n… output truncated':t;};
 const patchOf=d=>{if(d.patch)return d.patch;const o=d.oldText?d.oldText.split('\n'):[],n=(d.newText||'').split('\n');return `@@ -1,${o.length} +1,${n.length} @@\n`+[...o.map(l=>'-'+l),...n.map(l=>'+'+l)].join('\n');};
 function buildTool(it,later){
  const o=it.output||{},edit=it.category==='edit'||it.category==='write',shell=it.category==='shell';
  const full=shell?String(it.input?.command||''):edit?'':JSON.stringify(it.input??{},null,2).slice(0,2000),text=short(full);
  const err=it.status==='error'||it.status==='denied'||(o.exitCode??0)!==0;
  const w=createToolWidget({name:shell?'bash':it.name,text,output:cap(o.text)+(o.truncated&&!/truncated$/.test(cap(o.text))?'\n… output truncated':''),isError:err,done:it.status!=='running'});
  const sum=w.element.querySelector('summary');sum.textContent=short(it.title||it.name);sum.title=it.title||it.name;
  const inp=w.element.querySelector('.tool-input');if(shell&&inp){inp.classList.add('tool-cmd');inp.title=full;}
  if(it.status==='running')sum.prepend(threadState({status:'working'}));
  if(o.exitCode)sum.append(el('span','tool-exit',`exit ${o.exitCode}`));
  if(edit&&o.diff?.length){const body=w.element.querySelector('.tool-widget-body');
   for(const d of o.diff){const c=el('div','tool-diff');body.append(c);later.push(()=>renderCode(c,{text:patchOf(d),path:d.path},true));}}
  return w.element;
 }
 function build(it,later,depth=0){
  if(it.kind==='user'||it.kind==='assistant'){const a=el('article',`thread-message thread-${it.kind}`);if(it.kind==='assistant')hooks.markdown(a,it.text);else a.textContent=it.text;return a;}
  if(it.kind==='thinking'){const d=el('details','thread-activity');const log=el('div','thread-activity-log');log.append(el('div','thread-reasoning',it.text));d.append(el('summary','','Reasoning'),log);return d;}
  if(it.kind==='tool')return buildTool(it,later);
  if(it.kind==='todo'){const d=el('details','thread-activity');d.open=true;const log=el('div','thread-activity-log');
   const done=it.items.filter(i=>i.status==='done').length;d.append(el('summary','',`Plan ${done}/${it.items.length}`),log);
   for(const i of it.items)log.append(el('div','session-todo',(i.status==='done'?'✓ ':i.status==='active'?'› ':'○ ')+i.text));return d;}
  if(it.kind==='subagent')return buildSub(it,later,depth);
  if(it.kind==='notice')return el('div',`session-notice session-notice--quiet${it.level==='info'?'':' is-'+it.level}`,it.text);
  return null;
 }
 // Subagent block: header + quiet stats line; children (same renderers) are built only when opened, last 200 shown.
 const SHOW=200,subLimit=new Map(),kfmt=n=>n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':String(n);
 const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
 function subStats(it){
  const run=it.status==='running',bits=[plural(it.toolUses??0,'tool use'),it.tokens!=null&&`${kfmt(it.tokens)} tokens`];
  if(run)bits.push(it.lastAction);else if(it.endedAt&&it.startedAt)bits.push(dur(Math.max(0,Math.round((it.endedAt-it.startedAt)/1000))));
  return (run?'':it.status==='error'?'Failed · ':'Done · ')+bits.filter(Boolean).join(' · ');
 }
 function fillSub(it,body,depth){
  const later=[],all=it.items||[],key=it.callId,lim=subLimit.get(key)||SHOW,vis=all.slice(-lim);
  body.replaceChildren();
  if(all.length>vis.length){const b=el('button','button button--subtle',`Show ${all.length-vis.length} earlier`);b.type='button';b.addEventListener('click',()=>{subLimit.set(key,lim+SHOW);fillSub(it,body,depth);});body.append(b);}
  if(depth>=3)body.append(el('div','session-notice--quiet session-notice',`Level ${depth+2}`));
  renderRuns(vis,body,later,depth+1);for(const f of later)f();
 }
 function renderRuns(items,into,later,depth){
  const entries=[];for(const it of items){if(it.kind==='usage')continue;const l=entries.at(-1);
   if(RUN.has(it.kind)){if(l?.run)l.run.push(it);else entries.push({run:[it]});}else entries.push({it});}
  for(const e of entries){const n=e.run?buildRun(e.run,later,null,depth):build(e.it,later,depth);if(n)into.append(n);}
 }
 function buildSub(it,later,depth){
  const d=el('details','thread-detail tool-widget session-sub');d.dataset.status=it.status==='running'?'pending':it.status==='error'?'error':'completed';
  const s=el('summary','session-sub-sum'),head=el('span','session-sub-head',it.description?`${it.type||it.name} · ${it.description}`:(it.type||it.name));
  if(it.status==='running')s.prepend(threadState({status:'working'}));
  s.append(head,el('span','session-sub-stats',subStats(it)));
  const b=el('div',depth>=3?'tool-widget-body session-sub-body session-sub-flat':'thread-activity-log session-sub-body');
  if(!it.items?.length&&it.prompt)b.append(el('pre','tool-input',it.prompt));
  d.append(s,b);
  d.addEventListener('toggle',()=>{if(d.open&&it.items?.length&&!b._built){b._built=true;fillSub(it,b,depth);}});
  return d;
 }
 const RUN=new Set(['tool','todo','subagent']),isRun=it=>it.kind==='tool'?it.status==='running':it.status==='running';
 // A maximal run of tool/todo/subagent items is one disclosure labelled by summarizeTools; running = open at its latest row, done = collapsed.
 function buildRun(run,later,old,depth=0){
  const running=run.some(isRun),d=el('details','session-run thread-detail');d.dataset.running=String(running);
  const sum=el('summary','',summarizeTools(run).text);if(running)sum.prepend(threadState({status:'working'}));
  const body=el('div','session-run-body');run.forEach((it,i)=>{const n=build(it,later,depth);if(!n)return;if(running&&i<run.length-1&&it.kind!=='subagent')n.hidden=true;body.append(n);});
  d.append(sum,body);d.open=running?true:old&&old.dataset.running==='false'?old.open:false;return d;
 }
 function drawItems(){
  if(!box||!ui)return;const later=[];let prev=null;
  const entries=[];for(let it of ui.items){if(it.kind==='usage')continue;if(it.kind==='subagent'&&subs.get(it.callId))it={...it,...subs.get(it.callId)};const l=entries.at(-1);
   if(RUN.has(it.kind)){if(l?.run)l.run.push(it);else entries.push({id:'run:'+it.id,run:[it]});}else entries.push({id:it.id,it});}
  for(const e of entries){
   const sg=JSON.stringify(e.run||e.it),c=cache.get(e.id);let node=c?.el;
   if(!c||c.sig!==sg){const n=e.run?buildRun(e.run,later,c?.el):build(e.it,later);if(!n)continue;if(c?.el){if(!e.run&&c.el.tagName==='DETAILS'&&n.tagName==='DETAILS')n.open=c.el.open;c.el.replaceWith(n);}node=n;cache.set(e.id,{sig:sg,el:n});}
   if(node.parentNode!==box||(prev?prev.nextSibling!==node:box.firstChild!==node))box.insertBefore(node,prev?prev.nextSibling:box.firstChild);
   prev=node;
  }
  for(const f of later)f();
  const t=ui.items.find(i=>i.kind==='user')?.text?.trim().replace(/\s+/g,' ').slice(0,60);
  if(t&&titles.get(active.id)!==t){titles.set(active.id,t);paint(active.s);paintHeader();}
  paintStatus();
 }
 // One live row at the bottom: "Newspapering… 6s · ↓388 · thought 4s". Text is updated in place; the row only adds or removes its own height.
 const dur=n=>n<60?n+'s':Math.floor(n/60)+'m '+String(n%60).padStart(2,'0')+'s';
 function paintStatus(){
  if(!box)return;const st=ui?.status;
  if(!st){if(statusEl?.parentNode){statusEl.remove();hooks.bottom();}return;}
  if(!statusEl){statusEl=el('div','session-status');statusEl.append(threadState({status:'working'}),el('span','session-status-text'));}
  const k=st.tokens,tok=k==null?'':(st.tokenDirection==='up'?'↑':'↓')+(k>=1000?(k/1000).toFixed(1).replace(/\.0$/,'')+'k':k);
  statusEl.lastChild.textContent=[`${st.verb}… ${dur(st.elapsedSec||0)}`,tok,st.thoughtSec!=null&&`thought ${dur(st.thoughtSec)}`].filter(Boolean).join(' · ');
  const added=statusEl.parentNode!==box||box.lastChild!==statusEl;if(added)box.append(statusEl);
  if(added)hooks.bottom();
 }
 function drawChat(){
  if(!box||!active)return;
  const items=!!ui?.items?.length;
  if(items!==useItems||(!items&&!cache.size&&false)){useItems=items;box.replaceChildren();cache.clear();}
  if(items)drawItems();else{renderChat(box,lastMsgs);if(states.get(active.id)==='needs_permission'&&!ui?.prompt)notice(box,active.s);paintStatus();}
 }
 function paintMeta(){
  if(!metaEl||!active)return;const m=ui?.meta||{};
  metaEl.textContent=[m.model,m.effort,m.mode,m.contextUsedPct!=null&&`ctx ${Math.round(m.contextUsedPct)}%`,base(m.cwd||active.s.cwd)].filter(Boolean).join(' · ');
 }
 function drawPrompt(){
  const p=active?ui?.prompt:null,sg=p?JSON.stringify(p):'';
  if(sg===cardSig)return;cardSig=sg;
  if(card){card.remove();card=null;delete form.dataset.approval;for(const c of form.children)c.inert=false;form.resizePrompt?.();}
  if(!p)return;
  card=el('section','composer-approval');card.setAttribute('aria-label','Agent approval');
  card.append(el('h3','',p.title||'Agent needs input'));
  const body=(p.body||'').split('\n').filter(l=>!/^\s*(Claude Code v|claude-\S+ with \w+ effort)/.test(l)).join('\n').trim();
  if(body){const a=el('div','approval-action');a.innerHTML=icon('terminal');a.append(el('span','',p.type==='trust'?'Folder':'Request'));
   const host=el('div','approval-preview-host'),pre=el('pre','approval-preview');pre.tabIndex=0;pre.setAttribute('aria-label','Request details');pre.append(el('code','',body));host.append(pre);card.append(a,host);}
  const ctl=el('div','approval-controls');
  for(const o of p.options){const b=el('button',`provider-dialog-button${o.index===p.selected?' provider-dialog-primary':''}`,o.label);b.type='button';
   b.addEventListener('click',()=>{sx.control(active.id,'answerPrompt',{index:o.index}).catch(e=>toast(e.message));});ctl.append(b);}
  card.append(ctl);form.append(card);form.dataset.approval='true';
  for(const c of form.children)c.inert=c!==card;
 }
 function syncRun(){if(active&&mode==='chat'){form.setRunning?.(states.get(active.id)==='working');const b=document.querySelector('.send-button');if(b&&states.get(active.id)==='working'&&!prompt().value.trim())b.disabled=false;}}
 function showChat(){
  box=el('div','thread-messages');hooks.showHistory(box);cache.clear();useItems=false;
  const s=active.s;
  unsubs.forEach(f=>f());unsubs=[];
  const msgs=m=>Array.isArray(m)?m:m?.messages||[];
  const title=m=>{const t=m.find(x=>x.role==='user')?.text?.trim().replace(/\s+/g,' ').slice(0,60);if(t&&titles.get(s.id)!==t){titles.set(s.id,t);paint(s);paintHeader();}};
  lastMsgs=msgs(sx.messages(s.id));
  unsubs.push(sx.onMessages(s.id,m=>{lastMsgs=msgs(m);if(!ui?.items?.length){title(lastMsgs);drawChat();}}));
  unsubs.push(sx.onState(s.id,()=>{if(!ui?.items?.length)drawChat();syncRun();}));
  drawChat();syncRun();
 }
 async function showTerminal(){
  if(!termEl){termEl=el('div','session-terminal');workspace.append(termEl);}
  termEl.hidden=false;
  if(!viewPromise)viewPromise=import('./terminal-view.js').then(({createTerminalViews})=>{views=createTerminalViews({api:window.sufficeDesktop,onLabel(){}});return views;});
  const v=await viewPromise;const id=active?.id;if(!id||mode!=='terminal')return;
  if(!termIds.has(id))termIds.set(id,'terminal:'+crypto.randomUUID());
  const slot=termEl.querySelector(`[data-sid="${id}"]`)||termEl.appendChild(Object.assign(el('div','session-terminal-slot'),{}));
  slot.dataset.sid=id;
  for(const o of termEl.children)o.hidden=o!==slot;
  await v.mount(slot,'session-'+id,termIds.get(id),1,{sessionId:id});
 }
 // Terminal "venom": goo blobs spread from the Terminal button and retract into it. WAAPI on transform/opacity only; overlay and filter are removed at rest.
 let ov=null;
 const venomEnd=()=>{if(!ov)return;ov.anims.forEach(a=>a.cancel());ov.svg.remove();ov=null;};
 function venom(dir){
  const T=termEl,k=window.__motionSlow||1,D=420*k,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!T||(dir<0&&T.hidden&&!ov))return;
  if(ov?.dummy||reduce)venomEnd();
  if(reduce){T.dataset.solid='';T.hidden=false;const a=T.animate({opacity:dir>0?[0,1]:[1,0]},{duration:120*k,fill:'both'});
   ov={svg:document.createElement('i'),anims:[a],dummy:true};a.onfinish=()=>{venomEnd();if(dir<0){T.hidden=true;delete T.dataset.solid;}};return;}
  if(!ov){
   const b=header.querySelector('.session-toggle button:last-child'),r=(b||header).getBoundingClientRect(),w=workspace.getBoundingClientRect();
   const W=w.width,H=w.height,ox=r.left+r.width/2-w.left,oy=r.top+r.height/2-w.top,R=Math.hypot(Math.max(ox,W-ox),Math.max(oy,H-oy))+40;
   const col=getComputedStyle(document.querySelector('.sidebar')).backgroundColor;T.style.setProperty('--venom',col);delete T.dataset.solid;
   const NS='http://www.w3.org/2000/svg',n=(t,at={})=>{const e=document.createElementNS(NS,t);for(const q in at)e.setAttribute(q,at[q]);return e;};
   const svg=n('svg',{class:'session-venom',width:W,height:H});
   const f=n('filter',{id:'venom-goo',filterUnits:'userSpaceOnUse',x:-60,y:-60,width:W+120,height:H+120,'color-interpolation-filters':'sRGB'});
   f.append(n('feGaussianBlur',{stdDeviation:14}),n('feColorMatrix',{values:'1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9'}));
   const g=n('g',{filter:'url(#venom-goo)',fill:col});svg.append(n('defs'),g);svg.firstChild.append(f);
   const E=['cubic-bezier(0.2,0.9,0.2,1)','cubic-bezier(0.1,0.8,0.3,1)','cubic-bezier(0.3,0.6,0.1,1)','cubic-bezier(0.05,0.9,0.4,1)'];
   const base=Math.atan2(H/2-oy,W/2-ox),J=[.1,-.15,.2,-.05,.15,-.2,.05,-.1],S=[.9,.62,1,.74,.95,.68,.85,.58];
   const anims=[];
   const add=(cx,cy,rad,x,y,delay,dur,ease)=>{const c=n('circle',{cx,cy,r:rad});c.style.cssText='transform-box:fill-box;transform-origin:center;will-change:transform';g.append(c);
    anims.push(c.animate([{transform:'translate(0px,0px) scale(0)'},{transform:`translate(${x}px,${y}px) scale(1)`}],{delay,duration:dur,easing:ease,fill:'both'}));};
   add(ox,oy,R,0,0,60*k,D-60*k,E[0]); // body: guarantees full coverage; tendrils start 60 ms ahead of it
   S.forEach((q,i)=>{const a=base+(i-3.5)*.42+J[i],d=R*q*.62,rad=R*(.13+.05*(i%3));add(ox,oy,rad,Math.cos(a)*d,Math.sin(a)*d,0,D,E[i%4]);});
   const off=Math.max(0,(D-120*k)/D);
   anims.push(T.animate([{opacity:0},{opacity:0,offset:off},{opacity:1}],{duration:D,fill:'both'})); // terminal content fades in over the last 120 ms
   workspace.insertBefore(svg,T);ov={svg,anims};
   if(dir<0)anims.forEach(a=>{a.currentTime=D;});
   anims.at(-1).onfinish=()=>{const fwd=anims.at(-1).playbackRate>0;venomEnd();if(fwd)T.dataset.solid='';else{T.hidden=true;delete T.dataset.solid;}};
  }
  delete T.dataset.solid;T.hidden=false;
  ov.anims.forEach(a=>{a.updatePlaybackRate(dir>0?1:-1.4);a.play();});
 }
 function setMode(m){
  if(!active)return;mode=m;
  form.hidden=m==='terminal';
  paintHeader();
  if(m==='terminal'){void showTerminal();venom(1);}else{showChat();venom(-1);}
 }
 function paintHeader(){
  if(!active)return;
  const s=active.s,state=states.get(s.id)||'starting';
  header.className='thread-header thread-header--session';header.dataset.status=STATUS[state]||'working';header.replaceChildren();
  header.append(el('span','session-title',name(s)));
  const dot=threadState({status:STATUS[state]||'working'},{unread:false});dot.classList.add('session-state');header.append(dot);
  const seg=el('div','settings-segment session-toggle');seg.role='group';
  for(const [k,t] of [['chat','Chat'],['terminal','Terminal']]){const b=el('button','',t);b.type='button';b.setAttribute('aria-pressed',String(mode===k));b.addEventListener('click',()=>{if(mode!==k)setMode(k);});seg.append(b);}
  const copy=el('button','button button--subtle session-copy');copy.type='button';copy.innerHTML=icon('copy')+'<span>Open in terminal</span>';
  copy.title='Copy the tmux attach command';
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(s.attachCommand||await sx.attachCommand(s.id));toast('Attach command copied');}catch(e){toast(e.message);}});
  metaEl=el('span','session-meta');header.append(metaEl,seg,copy);paintMeta();
 }
 function open(s){
  leave();hooks.threadView(name(s));
  active={id:s.id,s};mode='chat';unpress();rows.get(s.id)?.setAttribute('aria-pressed','true');
  form.hidden=false;form.dataset.session='';prompt().placeholder=`Message ${labels.get(s.id)||'the agent'}`;
  ui=null;cardSig='';paintHeader();showChat();
  uiUnsub=sx.onUi(s.id,u=>{ui=u;paintMeta();if(mode==='chat')drawChat();drawPrompt();});
  subs.clear();subLimit.clear();subUnsub=sx.onSubagents?.(s.id,l=>{subs.clear();for(const x of l||[])subs.set(x.callId,x);if(mode==='chat')drawChat();});
 }
 function leave(){
  if(!active&&!import_)return;
  unsubs.forEach(f=>f());unsubs=[];uiUnsub?.();uiUnsub=null;subUnsub?.();subUnsub=null;ui=null;drawPrompt();active=null;form.setRunning?.(false);
  venomEnd();if(termEl){termEl.hidden=true;delete termEl.dataset.solid;}
  form.hidden=false;delete form.dataset.session;prompt().placeholder=PH;
  header.className='thread-header';delete header.dataset.status;
  unpress();
 }
 async function start(agent){
  const cwd=project();if(!cwd){toast('Choose a project');return;}
  try{const s=await sx.start({agent,cwd});await refresh();open(rows.get(s.id)?._s||s);}catch(e){toast(e.message);}
 }

 // Import: searchable history, read-only in the chat renderer, Resume starts a live session.
 function openImport(){
  document.querySelector('.session-import')?.remove();
  const pop=el('div','popover session-import');pop.role='dialog';pop.setAttribute('aria-label','Import chat');
  const input=el('input','project-search');input.placeholder='Search chats';input.setAttribute('aria-label','Search chats');
  const list=el('div','session-import-list');pop.append(input,list);document.body.append(pop);
  const close=()=>{document.removeEventListener('pointerdown',away,true);document.removeEventListener('keydown',esc,true);hidePopover(pop,()=>pop.remove());};
  const away=e=>{if(!pop.contains(e.target))close();};
  const esc=e=>{if(e.key==='Escape')close();};
  document.addEventListener('pointerdown',away,true);document.addEventListener('keydown',esc,true);
  let timer,seq=0;
  async function load(){
   const mine=++seq;let rowsData=[];
   try{rowsData=await sx.history.list({query:input.value.trim()});}catch(e){toast(e.message);}
   if(mine!==seq)return;
   list.replaceChildren();
   if(!rowsData.length)list.append(el('div','session-import-empty','No chats found'));
   for(const h of rowsData){
    const b=el('button','menu-item session-import-row');b.type='button';
    b.append(el('span','session-import-title',h.title),el('span','session-import-meta',[agentName(h.source),base(h.cwd),age(h.updatedAt)].join('  ')));
    b.addEventListener('click',()=>{close();void view(h);});list.append(b);
   }
  }
  input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,150);});
  showPopover(pop);input.focus();void load();
 }
 const agentName=src=>({'claude-code':'Claude Code',codex:'Codex',opencode:'OpenCode','claude-desktop':'Claude Desktop',cursor:'Cursor'}[src]||src);
 async function view(h){
  let msgs;try{msgs=await sx.history.read({source:h.source,path:h.path});}catch(e){toast(e.message);return;}
  leave();hooks.threadView(h.title);import_=h;
  header.className='thread-header thread-header--session';header.replaceChildren(el('span','session-title',h.title));
  const resume=el('button','button button--primary session-copy','Resume');resume.type='button';
  resume.addEventListener('click',async()=>{try{const s=await sx.resume({source:h.source,sessionId:h.sessionId,cwd:h.cwd});import_=null;await refresh();open(rows.get(s.id)?._s||s);}catch(e){toast(e.message);}});
  header.append(el('span','session-meta',agentName(h.source)),resume);
  form.hidden=true;
  const box=el('div','thread-messages');hooks.showHistory(box);renderChat(box,msgs);
 }

 document.addEventListener('click',e=>{
  const item=e.target.closest?.('[data-menu-action^="cli-session:"],[data-menu-action^="import-chat:"]');if(!item)return;
  const [type,value]=item.dataset.menuAction.split(':');
  if(type==='cli-session')void start(value);else openImport();
 });
 void refresh();
 setInterval(()=>tickThreadTimes(side),30000);
 return {
  leave(){if(active||import_){leave();import_=null;}},
  isActive:()=>!!active&&mode==='chat',
  stop(){if(!active||mode!=='chat'||states.get(active.id)!=='working')return false;sx.control(active.id,'interrupt').catch(e=>toast(e.message));return true;},
  send(text){if(active)sx.send(active.id,text).catch(e=>toast(e.message));},
 };
}
