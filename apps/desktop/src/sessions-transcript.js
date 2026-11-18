// CLI-session transcript: converts model.mjs items into the same components normal chat uses
// (thread-activity groups, tool widgets, reasoning disclosures, thread-status, transcript dividers).
import {icon} from './ui.js';
import {threadState} from './thread-row.js';
import {createToolWidget} from './tool-widget.js';
import {decorateActivitySummary,syncActivityGroup} from './activity-groups.js';
import {transcriptDivider} from './transcript-divider.js';
import {clampLong} from './message-actions.js';
import {renderCode} from './panel-content.js';
import {summarizeTools} from '../../../packages/backend/src/tui/summary.mjs';
import './sessions-transcript.css';

import {el} from './sessions-util.js';
import {threadViewState as viewState} from './thread-view-state.js';
const base=p=>String(p||'').split('/').filter(Boolean).pop()||'';
const dur=n=>n<60?n+'s':Math.floor(n/60)+'m '+String(n%60).padStart(2,'0')+'s';
const kfmt=n=>n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':String(n);
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
const cap=t=>{t=String(t||'');return t.length>4000?t.slice(0,4000)+'\n… output truncated':t;};
const patchOf=d=>{if(d.patch)return d.patch;const o=d.oldText?d.oldText.split('\n'):[],n=(d.newText||'').split('\n');return `@@ -1,${o.length} +1,${n.length} @@\n`+[...o.map(l=>'-'+l),...n.map(l=>'+'+l)].join('\n');};
// CLI tool name -> the name action-display.js has a verb for. Unknown names pass through and read "Used <Name>".
const TOOL={read:'read',write:'write',edit:'edit',multiedit:'edit',notebookedit:'edit',bash:'bash',grep:'search',glob:'search',websearch:'web_search',webfetch:'fetch_content',ls:'files'};
const CATEGORY={shell:'bash',read:'read',edit:'edit',write:'write',search:'search',web:'fetch_content'};
const toolName=it=>{const n=String(it.name||'').replace(/^mcp__.*__/,'');return TOOL[n.toLowerCase()]||CATEGORY[it.category]||n||'tool';};
const RUN=new Set(['tool','todo','subagent']);
const hide=it=>it.kind==='usage'||it.internal||it.queued;
const spin=summary=>summary.querySelector('.activity-icons')?.replaceChildren(threadState({status:'working'}));

// ctx: {box(), ui(), working(), background(), sub(callId), short(text), onFirstUser(text)}; hooks: {markdown, bottom}
function createCore({hooks,ctx}){
 const cache=new Map(),subLimit=new Map(),SHOW=200;let statusEl=null;
 const mark=(n,id)=>{n.dataset.itemId=String(id);return n;};

 function target(it){
  const i=it.input||{},cat=it.category;
  if(cat==='read')return base(i.file_path||i.path||i.notebook_path);
  if(cat==='shell')return String(i.command||'');
  if(cat==='edit'||cat==='write')return base(i.file_path||i.path||i.filePath||i.notebook_path||it.output?.diff?.[0]?.path);
  if(cat==='search')return String(i.pattern||i.query||i.path||'');
  if(cat==='web')return String(i.query||i.url||'');
  return JSON.stringify(i).slice(0,2000);
 }
 function buildTool(it,later,working){
  const o=it.output||{},full=target(it),first=full.split('\n')[0];
  const err=it.status==='error'||it.status==='denied'||(o.exitCode??0)!==0,live=it.status==='running'&&working;
  const w=createToolWidget({name:toolName(it),text:ctx.short(full),output:o.diff?.length?'':cap(o.text)+(o.truncated&&!/truncated$/.test(cap(o.text))?'\n… output truncated':''),isError:err,done:!live});
  const sum=w.element.querySelector(':scope > summary');if(first)sum.title+=` · ${ctx.short(first)}`;
  if(it.category==='shell'){const inp=w.element.querySelector('.tool-input');if(inp){inp.classList.add('tool-cmd');inp.title=full;}}
  if(live)spin(sum);
  if((it.category==='edit'||it.category==='write')&&o.diff?.length){const body=w.element.querySelector('.tool-widget-body');
   for(const d of o.diff){const c=el('div','tool-diff');body.append(c);later.push(()=>renderCode(c,{text:patchOf(d),path:d.path},true));}}
  return mark(w.element,it.id);
 }
 // A disclosure with the standard summary (glyph + label); meta is optional muted text on the same line.
 function disclosure(label,meta,cls='',glyph){
  const d=el('details','thread-activity '+cls),s=el('summary'),log=el('div','thread-activity-log');d.append(s,log);
  decorateActivitySummary(s,label);if(glyph)s.querySelector('.activity-icons').innerHTML=icon(glyph);
  if(meta)s.append(el('span','activity-meta',meta));
  return {d,s,log};
 }
 function buildAsk(it){
  const a=it.output?.answer,ans=typeof a==='string'?[a]:a&&typeof a==='object'?Object.values(a).map(String):[];
  const {d,log}=disclosure('Asked: '+ctx.short(it.title||'question'),ans.join(', '),'session-ask');
  for(const q of it.input?.questions||[]){log.append(el('div','session-ask-q',q.question));
   for(const o of q.options||[]){const l=typeof o==='string'?o:o.label||'';log.append(todoRow(ans.includes(l)?'done':'pending',l));}}
  return mark(d,it.id);
 }
 function buildPlan(it){
  const {d,log}=disclosure('Plan',it.output.decision||'','session-plan-log','files');hooks.markdown(log,it.output.plan);return mark(d,it.id);
 }
 const todoRow=(status,text)=>{const r=el('div','session-todo');r.dataset.status=status;const i=el('span','session-todo-icon');i.innerHTML=icon(status==='done'?'check':'circle');r.append(i,el('span','',text));return r;};
 function buildTodo(it){
  const done=it.items.filter(i=>i.status==='done').length;
  const {d,log}=disclosure('Plan',`${done}/${it.items.length}`,'session-todos','files');d.open=true;
  for(const i of it.items)log.append(todoRow(i.status,i.text));return mark(d,it.id);
 }
 function notice(it){
  const kind=it.code==='compacted'?'compacted':it.code==='interrupted'?'interrupted':null;
  if(kind){const dv=transcriptDivider(kind);dv.update(kind,/automatic/i.test(it.text||''));return mark(dv,it.id);}
  if(it.durationMs!=null||/^(?:\d+m\s*)?\d+s$|^\d+m$/.test(String(it.text||'').trim()))return null; // bare "42s" / "1m 1s" CLI rows
  const n=el('div',`session-note${it.level==='info'?'':' is-'+it.level}`,it.text);return mark(n,it.id);
 }
 function build(it,later,depth,working){
  if(it.kind==='user'||it.kind==='assistant'){const a=el('article',`thread-message thread-${it.kind}`);if(it.kind==='assistant')hooks.markdown(a,it.text);else{a.textContent=it.text;clampLong(a,it.text);}if(it.pending){a.classList.add('thread-pending');a.setAttribute('aria-busy','true');}return mark(a,it.id);}
  if(it.kind==='thinking'){const d=el('details','thread-activity'),log=el('div','thread-activity-log'),p=el('div','thread-reasoning');hooks.markdown(p,it.text);log.append(p);d.append(el('summary','','Reasoning'),log);return mark(d,it.id);}
  if(it.kind==='tool'&&it.name==='AskUserQuestion')return buildAsk(it);
  if(it.kind==='tool'&&it.name==='ExitPlanMode'&&it.output?.plan)return buildPlan(it);
  if(it.kind==='tool')return buildTool(it,later,working);
  if(it.kind==='todo')return buildTodo(it);
  if(it.kind==='subagent')return buildSub(it,later,depth,working);
  if(it.kind==='notice')return notice(it);
  return null;
 }
 function subStats(it,working){
  const run=it.status==='running'&&working,bits=[plural(it.toolUses??0,'tool use'),it.tokens!=null&&`${kfmt(it.tokens)} tokens`];
  if(run)bits.push(ctx.short(it.lastAction||''));else if(it.endedAt&&it.startedAt)bits.push(dur(Math.max(0,Math.round((it.endedAt-it.startedAt)/1000))));
  return bits.filter(Boolean).join(' · ');
 }
 function fillSub(it,log,depth,working){
  const later=[],all=it.items||[],key=it.callId,lim=subLimit.get(key)||SHOW;
  // the child's opening user row is the prompt: shown once, as a quote, never as a user bubble
  const first=all.find(x=>x.kind==='user'),prompt=it.prompt||first?.text,body=all.filter(x=>!(x.kind==='user'&&x.text?.trim()===String(prompt||'').trim())),vis=body.slice(-lim);
  log.replaceChildren();
  if(prompt)log.append(el('blockquote','session-sub-prompt',prompt));
  if(body.length>vis.length){const b=el('button','button button--subtle',`Show ${body.length-vis.length} earlier`);b.type='button';b.addEventListener('click',()=>{subLimit.set(key,lim+SHOW);fillSub(it,log,depth,working);});log.append(b);}
  if(depth>=3)log.append(el('div','session-note',`Level ${depth+2}`));
  renderRuns(vis,log,later,depth+1,working);for(const f of later)f();
 }
 function buildSub(it,later,depth,working){
  const live=it.status==='running'&&working;
  const {d,s,log}=disclosure(it.description?`${it.type||it.name} · ${it.description}`:(it.type||it.name),subStats(it,working),'session-sub','agent');
  d.dataset.status=it.status==='error'?'error':live?'pending':'completed';
  if(live)spin(s);
  const fill=()=>{if(!log._built){log._built=true;fillSub(it,log,depth,working);}};
  d._fill=fill;d.addEventListener('toggle',()=>{if(d.open)fill();});
  return mark(d,it.callId||it.id);
 }
 function buildRun(run,later,depth,working){
  if(run.every(it=>it.kind==='subagent')){const w=el('div','session-subs');for(const it of run){const n=build(it,later,depth,working);if(n)w.append(n);}return w.children.length===1?w.firstChild:w;}
  const running=run.some(it=>it.status==='running')&&working;
  const g=el('details','thread-activity'),s=el('summary'),log=el('div','thread-activity-log');g.append(s,log);
  for(const it of run){const n=build(it,later,depth,working);if(n)log.append(n);}
  syncActivityGroup(g);decorateActivitySummary(s,summarizeTools(run,{working}).text);
  if(running){spin(s);g.open=true;}
  g.dataset.running=String(running);return g;
 }
 function group(items){
  const entries=[];for(const it of items){if(hide(it))continue;const l=entries.at(-1);
   if(RUN.has(it.kind)){if(l?.run)l.run.push(it);else entries.push({id:'run:'+(it.callId||it.id),run:[it]});}else entries.push({id:it.id,it});}
  return entries;
 }
 function renderRuns(items,into,later,depth,working){
  for(const e of group(items)){const n=e.run?buildRun(e.run,later,depth,working):build(e.it,later,depth,working);if(n)into.append(n);}
 }
 // Carry the open/closed state of nested disclosures (by item id) from a node being replaced to its rebuild.
 function restore(next,old){
  if(!old||!old.querySelectorAll)return;
  const nested=[...old.querySelectorAll('details[data-item-id]')];if(old.matches?.('details[data-item-id]'))nested.unshift(old);
  for(const o of nested){if(!o.open)continue;const m=(next.dataset?.itemId===o.dataset.itemId)?next:next.querySelector(`details[data-item-id="${CSS.escape(o.dataset.itemId)}"]`);if(m){m._fill?.();m.open=true;}}
  if(old.dataset?.running==='false'&&next.dataset?.running==='false')next.open=old.open;
 }
 function draw(){
  const box=ctx.box(),ui=ctx.ui();if(!box||!ui)return;const working=ctx.working(),later=[];
  const items=[],at=new Map(),first=ctx.pendingUser?.();
  if(first)items.push({kind:'user',id:'pending-user',text:first,pending:true});
  for(let it of ui.items){if(hide(it))continue;if(it.kind==='subagent'&&ctx.sub(it.callId))it={...it,...ctx.sub(it.callId)};
   if(at.has(it.id)){items[at.get(it.id)]=it;continue;}at.set(it.id,items.length);items.push(it);}
  const entries=group(items),keep=new Set();let prev=null;
  for(const e of entries){
   keep.add(e.id);const sg=JSON.stringify(e.run||e.it)+working,c=cache.get(e.id);let node=c?.el;
   if(!c||c.sig!==sg){
    const n=e.run?buildRun(e.run,later,0,working):build(e.it,later,0,working);
    if(!n){if(c){c.el.remove();cache.delete(e.id);}continue;}
    n.dataset.entry=e.id;if(c?.el){restore(n,c.el);c.el.replaceWith(n);}
    node=n;cache.set(e.id,{sig:sg,el:n});
   }
   if(node.parentNode!==box||(prev?prev.nextSibling!==node:box.firstChild!==node))box.insertBefore(node,prev?prev.nextSibling:box.firstChild);
   prev=node;
  }
  for(const [id,c] of cache)if(!keep.has(id)){c.el.remove();cache.delete(id);}
  for(const n of [...box.children])if(n.dataset.entry!==undefined&&!keep.has(n.dataset.entry))n.remove();
  for(const f of later)f();
  const t=ui.items.find(i=>i.kind==='user')?.text?.trim().replace(/\s+/g,' ').slice(0,60);
  if(t)ctx.onFirstUser(t);
  paintStatus(items);
 }
 // The standard live line: "Working for 6s" / "Thinking for 6s", plus "· N background" when tasks run.
 function paintStatus(items=[]){
  const box=ctx.box();if(!box)return;const st=ctx.ui()?.status;
  if(!st){if(statusEl?.parentNode){statusEl.remove();hooks.bottom();}return;}
  if(!statusEl){statusEl=el('div','thread-status');statusEl.setAttribute('role','status');}
  const last=[...ctx.ui().items].reverse().find(i=>!hide(i)),bg=ctx.background();
  const text=[`${last?.kind==='thinking'?'Thinking':'Working'} for ${dur(st.elapsedSec||0)}`,bg>0&&`${bg} background`].filter(Boolean).join(' · ');
  if(statusEl.textContent!==text)statusEl.textContent=text;
  const added=statusEl.parentNode!==box||box.lastChild!==statusEl;if(added){box.append(statusEl);hooks.bottom();}
 }
 // Leaving a session: forget nodes and the status line (box itself is replaced by the caller).
 function reset(){cache.clear();subLimit.clear();statusEl=null;}
 return {draw,paintStatus:()=>paintStatus(),reset};
}

// Session glue: owns the plain-message fallback, chat show/draw and the items feed (core above).
export function createTranscript(c){
 const {sx,hooks,states,titles,subs}=c;
 // Display-only path shortening: cwd-relative, home as ~, one path over 80 chars elided in the middle. Full text goes in a tooltip.
 const short=t=>String(t).replace(/\/[\w.@+~-]+(?:\/[\w.@+~ -]*[\w.@+~-])+/g,p=>{const cwd=c.active?.s.cwd||'',home=sx.home||'';
  let r=cwd&&p.startsWith(cwd+'/')?p.slice(cwd.length+1):home&&p.startsWith(home+'/')?'~'+p.slice(home.length):p;
  if(r.length>80){const seg=r.split('/');r='…/'+seg.slice(-2).join('/');}return r;});
 const bgCount=v=>typeof v==='number'?v:Number(v?.count)||0;
 const tr=createCore({hooks,ctx:{box:()=>c.box,ui:()=>c.ui,working:()=>c.isWorking(),background:()=>bgCount(c.ui?.meta?.backgroundTasks),sub:id=>subs.get(id),short,
  pendingUser:()=>{const f=c.active&&c.firstText.get(c.active.id),flat=t=>String(t||'').trim().replace(/\s+/g,' ');return f&&!c.ui.items.some(i=>i.kind==='user'&&flat(i.text)===flat(f))?f:null;},
  onFirstUser:t=>{if(c.active&&!titles.has(c.active.id)){titles.set(c.active.id,t);c.paint(c.active.s);c.paintHeader();}}}});
 function renderChat(box,messages){
  box.replaceChildren();
  for(const m of messages){const role=m.role==='user'?'user':'assistant';const a=el('article',`thread-message thread-${role}`);if(role==='assistant')hooks.markdown(a,m.text);else a.textContent=m.text;box.append(a);}
  hooks.bottom();
 }
 const notice=(box,s)=>{
  const n=el('div','session-notice');n.append(el('span','',states.get(s.id)==='needs_permission'?'Waiting for you in the terminal':''));
  const b=el('button','button button--subtle','Open terminal');b.type='button';b.addEventListener('click',()=>c.setMode('terminal'));n.append(b);
  box.append(n);
 };
 // Reopening a session puts the reader back at the saved message (index + offset, as threads-ui saves it) once the first item render exists.
 let saved=null;
 function restoreScroll(box,st){
  const root=box.parentElement;if(!root||st.following!==false||!st.anchor)return;
  let inputs=0;const seen=()=>{inputs++;};for(const t of ['wheel','keydown','pointerdown'])root.addEventListener(t,seen,{passive:true,capture:true,once:true});
  const pin=()=>{const n=box.children[st.anchor.i];if(n)root.scrollTop+=n.getBoundingClientRect().top-root.getBoundingClientRect().top-st.anchor.y;};
  pin();for(const ms of [100,300,700,1500])setTimeout(()=>{if(c.box===box&&!inputs)pin();},ms);
 }
 function drawChat(){
  if(!c.box||!c.active)return;
  const items=!!c.ui?.items?.length;
  if(items!==c.useItems){c.useItems=items;c.box.replaceChildren();tr.reset();}
  if(items)tr.draw();else{
   // The plain view rebuilds only when its content changed: a pending command is mounted once, not once per state event.
   const first=c.firstText.get(c.active.id),perm=states.get(c.active.id)==='needs_permission'&&!c.ui?.prompt,sig=JSON.stringify([c.lastMsgs.map(m=>[m.role,m.text]),first,perm]);
   if(c.plainSig!==sig||!c.box.firstChild&&(first||c.lastMsgs.length)){c.plainSig=sig;renderChat(c.box,c.lastMsgs);if(first&&!c.lastMsgs.some(m=>m.role==='user'))c.box.prepend(Object.assign(el('article','thread-message thread-user thread-pending',first),{ariaBusy:'true'}));if(perm)notice(c.box,c.active.s);}
   tr.paintStatus();}
  if(items&&saved){const st=saved;saved=null;restoreScroll(c.box,st);}
 }
 function showChat(){
  c.box=el('div','thread-messages session-transcript');hooks.showHistory(c.box);tr.reset();c.useItems=false;c.plainSig=null;saved={...viewState.state};
  const s=c.active.s;
  c.unsubs.forEach(f=>f());c.unsubs=[];
  const msgs=m=>Array.isArray(m)?m:m?.messages||[];
  const title=m=>{const t=m.find(x=>x.role==='user')?.text?.trim().replace(/\s+/g,' ').slice(0,60);if(t&&!titles.has(s.id)){titles.set(s.id,t);c.paint(s);c.paintHeader();}};
  c.lastMsgs=msgs(sx.messages(s.id));
  c.unsubs.push(sx.onMessages(s.id,m=>{c.lastMsgs=msgs(m);if(!c.ui?.items?.length){title(c.lastMsgs);drawChat();}}));
  c.unsubs.push(sx.onState(s.id,()=>{drawChat();c.syncRun();}));
  drawChat();c.syncRun();
 }
 return {drawChat,showChat,renderChat};
}
