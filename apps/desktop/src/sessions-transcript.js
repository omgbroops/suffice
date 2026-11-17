import {threadState} from './thread-row.js';
import {createToolWidget} from './tool-widget.js';
import {renderCode} from './panel-content.js';
import {summarizeTools} from '../../../packages/backend/src/tui/summary.mjs';
import {el,plural} from './sessions-util.js';
import './sessions-transcript.css';

// Chat transcript: plain messages, or the items feed (tools, plans, questions, subagents) with a live status row.
export function createTranscript(c){
 const {sx,hooks,states,titles,subs}=c;
 const syncRun=()=>c.syncRun();
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
 // Display-only path shortening: cwd-relative, home as ~, one path over 80 chars elided in the middle. Full text goes in a tooltip.
 const short=t=>String(t).replace(/\/[\w.@+~-]+(?:\/[\w.@+~ -]*[\w.@+~-])+/g,p=>{const cwd=c.active?.s.cwd||'',home=sx.home||'';
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
 // AskUserQuestion: "Asked: <question> · <answer>", expands to every option with the chosen one marked.
 function buildAsk(it){
  const a=it.output?.answer,ans=typeof a==='string'?[a]:a&&typeof a==='object'?Object.values(a).map(String):[];
  const d=el('details','thread-activity session-ask'),s=el('summary','','Asked: '+short(it.title||'question')),log=el('div','thread-activity-log');
  if(ans.length)s.append(el('span','session-meta',' · '+ans.join(', ')));
  for(const q of it.input?.questions||[]){log.append(el('div','session-ask-q',q.question));
   for(const o of q.options||[]){const l=typeof o==='string'?o:o.label||'';log.append(el('div','session-todo',(ans.includes(l)?'✓ ':'○ ')+l));}}
  d.append(s,log);return d;
 }
 // ExitPlanMode: "Plan · approved|rejected", expands to the plan as markdown.
 function buildPlan(it){
  const d=el('details','thread-activity session-plan'),s=el('summary','','Plan'),log=el('div','thread-activity-log');
  if(it.output.decision)s.append(el('span','session-meta',' · '+it.output.decision));
  hooks.markdown(log,it.output.plan);d.append(s,log);return d;
 }
 function build(it,later,depth=0){
  if(it.kind==='user'||it.kind==='assistant'){const a=el('article',`thread-message thread-${it.kind}`);if(it.kind==='assistant')hooks.markdown(a,it.text);else a.textContent=it.text;return a;}
  if(it.kind==='thinking'){const d=el('details','thread-activity');const log=el('div','thread-activity-log');log.append(el('div','thread-reasoning',it.text));d.append(el('summary','','Reasoning'),log);return d;}
  if(it.kind==='tool'&&it.name==='AskUserQuestion')return buildAsk(it);
  if(it.kind==='tool'&&it.name==='ExitPlanMode'&&it.output?.plan)return buildPlan(it);
  if(it.kind==='tool')return buildTool(it,later);
  if(it.kind==='todo'){const d=el('details','thread-activity');d.open=true;const log=el('div','thread-activity-log');
   const done=it.items.filter(i=>i.status==='done').length;d.append(el('summary','',`Plan ${done}/${it.items.length}`),log);
   for(const i of it.items)log.append(el('div','session-todo',(i.status==='done'?'✓ ':i.status==='active'?'› ':'○ ')+i.text));return d;}
  if(it.kind==='subagent')return buildSub(it,later,depth);
  if(it.kind==='notice')return el('div',`session-notice session-notice--quiet${it.level==='info'?'':' is-'+it.level}`,it.text);
  return null;
 }
 // Subagent block: header + quiet stats line; children (same renderers) are built only when opened, last 200 shown.
 const SHOW=200,kfmt=n=>n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':String(n);
 const hide=it=>it.kind==='usage'||it.internal||it.queued;
 const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
 function subStats(it){
  const run=it.status==='running',bits=[plural(it.toolUses??0,'tool use'),it.tokens!=null&&`${kfmt(it.tokens)} tokens`];
  if(run)bits.push(short(it.lastAction||''));else if(it.endedAt&&it.startedAt)bits.push(dur(Math.max(0,Math.round((it.endedAt-it.startedAt)/1000))));
  return (run?'':it.status==='error'?'Failed · ':'Done · ')+bits.filter(Boolean).join(' · ');
 }
 function fillSub(it,body,depth){
  const later=[],all=it.items||[],key=it.callId,lim=c.subLimit.get(key)||SHOW,vis=all.slice(-lim);
  body.replaceChildren();
  if(all.length>vis.length){const b=el('button','button button--subtle',`Show ${all.length-vis.length} earlier`);b.type='button';b.addEventListener('click',()=>{c.subLimit.set(key,lim+SHOW);fillSub(it,body,depth);});body.append(b);}
  if(depth>=3)body.append(el('div','session-notice--quiet session-notice',`Level ${depth+2}`));
  renderRuns(vis,body,later,depth+1);for(const f of later)f();
 }
 function renderRuns(items,into,later,depth){
  const entries=[];for(const it of items){if(hide(it))continue;const l=entries.at(-1);
   if(RUN.has(it.kind)){if(l?.run)l.run.push(it);else entries.push({run:[it]});}else entries.push({it});}
  for(const e of entries){const n=e.run?buildRun(e.run,later,null,depth):build(e.it,later,depth);if(n)into.append(n);}
 }
 // Item 13: a running block is updated in place (keyed by callId) so its inner open/closed state survives.
 function updateSub(d,it){
  d._it=it;d.dataset.status=it.status==='running'?'pending':it.status==='error'?'error':'completed';
  const s=d.firstChild;s.querySelector('.session-sub-head').textContent=it.description?`${it.type||it.name} · ${it.description}`:(it.type||it.name);
  s.querySelector('.session-sub-stats').textContent=subStats(it);
  const dot=s.querySelector('.thread-state');if(it.status!=='running')dot?.remove();
  const b=d.lastChild;if(b._built)fillSub(it,b,d._depth);
 }
 function buildSub(it,later,depth){
  const old=it.callId&&c.pool?.get(it.callId);if(old){c.pool.delete(it.callId);updateSub(old,it);return old;}
  const d=el('details','thread-detail tool-widget session-sub');d.dataset.status=it.status==='running'?'pending':it.status==='error'?'error':'completed';
  d.dataset.callId=it.callId||'';d._it=it;d._depth=depth;
  const s=el('summary','session-sub-sum'),head=el('span','session-sub-head',it.description?`${it.type||it.name} · ${it.description}`:(it.type||it.name));
  if(it.status==='running')s.prepend(threadState({status:'working'}));
  s.append(head,el('span','session-sub-stats',subStats(it)));
  const b=el('div',depth>=3?'tool-widget-body session-sub-body session-sub-flat':'thread-activity-log session-sub-body');
  if(!it.items?.length&&it.prompt)b.append(el('pre','tool-input',it.prompt));
  d.append(s,b);
  d.addEventListener('toggle',()=>{if(d.open&&d._it.items?.length&&!b._built){b._built=true;fillSub(d._it,b,depth);}});
  return d;
 }
 const RUN=new Set(['tool','todo','subagent']),isRun=it=>it.kind==='tool'?it.status==='running':it.status==='running';
 // A maximal run of tool/todo/subagent items is one disclosure labelled by summarizeTools; running = open at its latest row, done = collapsed.
 function buildRun(run,later,old,depth=0){
  if(run.every(it=>it.kind==='subagent')){const w=el('div','session-subs');for(const it of run){const n=build(it,later,depth);if(n)w.append(n);}return w;}
  const running=run.some(isRun),d=el('details','session-run thread-detail');d.dataset.running=String(running);
  const sum=el('summary','',summarizeTools(run).text);if(running)sum.prepend(threadState({status:'working'}));
  const body=el('div','session-run-body');run.forEach((it,i)=>{const n=build(it,later,depth);if(!n)return;if(running&&i<run.length-1&&it.kind!=='subagent')n.hidden=true;body.append(n);});
  d.append(sum,body);d.open=running?true:old&&old.dataset.running==='false'?old.open:false;return d;
 }
 function drawItems(){
  if(!c.box||!c.ui)return;const later=[];let prev=null;
  const entries=[];for(let it of c.ui.items){if(hide(it))continue;if(it.kind==='subagent'&&subs.get(it.callId))it={...it,...subs.get(it.callId)};const l=entries.at(-1);
   if(RUN.has(it.kind)){if(l?.run)l.run.push(it);else entries.push({id:'run:'+it.id,run:[it]});}else entries.push({id:it.id,it});}
  for(const e of entries){
   const sg=JSON.stringify(e.run||e.it),ce=c.cache.get(e.id);let node=ce?.el;
   if(!ce||ce.sig!==sg){c.pool=ce?.el?new Map([...ce.el.querySelectorAll('details.session-sub[data-call-id]')].filter(x=>x.dataset.callId).map(x=>[x.dataset.callId,x])):null;const n=e.run?buildRun(e.run,later,ce?.el):build(e.it,later);c.pool=null;if(!n)continue;if(ce?.el){if(!e.run&&ce.el.tagName==='DETAILS'&&n.tagName==='DETAILS')n.open=ce.el.open;ce.el.replaceWith(n);}node=n;c.cache.set(e.id,{sig:sg,el:n});}
   if(node.parentNode!==c.box||(prev?prev.nextSibling!==node:c.box.firstChild!==node))c.box.insertBefore(node,prev?prev.nextSibling:c.box.firstChild);
   prev=node;
  }
    for(const f of later)f();
  const t=c.ui.items.find(i=>i.kind==='user')?.text?.trim().replace(/\s+/g,' ').slice(0,60);
  if(t&&titles.get(c.active.id)!==t){titles.set(c.active.id,t);c.paint(c.active.s);c.paintHeader();}
  paintStatus();
 }
 // One live row at the bottom: "Newspapering… 6s · ↓388 · thought 4s". Text is updated in place; the row only adds or removes its own height.
 const dur=n=>n<60?n+'s':Math.floor(n/60)+'m '+String(n%60).padStart(2,'0')+'s';
 function paintStatus(){
  if(!c.box)return;const st=c.ui?.status;
  if(!st){if(c.statusEl?.parentNode){c.statusEl.remove();hooks.bottom();}return;}
  if(!c.statusEl){c.statusEl=el('div','session-status');c.statusEl.append(threadState({status:'working'}),el('span','session-status-text'));}
  const k=st.tokens,tok=k==null?'':(st.tokenDirection==='up'?'↑':'↓')+(k>=1000?(k/1000).toFixed(1).replace(/\.0$/,'')+'k':k);
  c.statusEl.lastChild.textContent=[`${st.verb}… ${dur(st.elapsedSec||0)}`,tok,st.thoughtSec!=null&&`thought ${dur(st.thoughtSec)}`].filter(Boolean).join(' · ');
  const added=c.statusEl.parentNode!==c.box||c.box.lastChild!==c.statusEl;if(added)c.box.append(c.statusEl);
  if(added)hooks.bottom();
 }
 function drawChat(){
  if(!c.box||!c.active)return;
  const items=!!c.ui?.items?.length;
  if(items!==c.useItems||(!items&&!c.cache.size&&false)){c.useItems=items;c.box.replaceChildren();c.cache.clear();}
  if(items)drawItems();else{renderChat(c.box,c.lastMsgs);if(states.get(c.active.id)==='needs_permission'&&!c.ui?.prompt)notice(c.box,c.active.s);paintStatus();}
 }
 function showChat(){
  c.box=el('div','thread-messages');hooks.showHistory(c.box);c.cache.clear();c.useItems=false;
  const s=c.active.s;
  c.unsubs.forEach(f=>f());c.unsubs=[];
  const msgs=m=>Array.isArray(m)?m:m?.messages||[];
  const title=m=>{const t=m.find(x=>x.role==='user')?.text?.trim().replace(/\s+/g,' ').slice(0,60);if(t&&titles.get(s.id)!==t){titles.set(s.id,t);c.paint(s);c.paintHeader();}};
  c.lastMsgs=msgs(sx.messages(s.id));
  c.unsubs.push(sx.onMessages(s.id,m=>{c.lastMsgs=msgs(m);if(!c.ui?.items?.length){title(c.lastMsgs);drawChat();}}));
  c.unsubs.push(sx.onState(s.id,()=>{if(!c.ui?.items?.length)drawChat();syncRun();}));
  drawChat();syncRun();
 }
 return {drawChat,showChat,renderChat};
}
