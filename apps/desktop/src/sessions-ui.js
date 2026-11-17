import {icon} from './ui.js';
import {populateThreadRow,tickThreadTimes,threadState} from './thread-row.js';
import {showPopover,hidePopover} from './popover-motion.js';
import {createToolWidget} from './tool-widget.js';
import {renderCode} from './panel-content.js';
import {summarizeTools} from '../../../packages/backend/src/tui/summary.mjs';
import {createSessionControls} from './sessions-controls.js';
import './sessions.css';

const sx=window.sufficeDesktop?.sessions;
let avail={ok:true,agents:[]};
sx?.available().then(a=>{avail=a;}).catch(()=>{});
const STATUS={starting:'working',working:'working',waiting_input:'input',needs_permission:'approval',error:'failed',exited:'done'};
const base=p=>String(p||'').split('/').filter(Boolean).pop()||'/';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const age=ms=>{const s=Math.max(0,(Date.now()-ms)/1000);return s<60?'now':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d';};
const prompt=()=>document.querySelector('#prompt');
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
 const busy=new Map(),rows=new Map(),states=new Map(),prompts=new Map(),subs=new Map(),labels=new Map(),titles=new Map();
 const name=s=>titles.get(s.id)||`${labels.get(s.id)||s.agent} session`;
 let active=null,mode='chat',unsubs=[],termEl=null,views=null,viewPromise=null,import_=null;
 let ui=null,statusEl=null,uiUnsub=null,subUnsub=null,box=null,useItems=false,lastMsgs=[],card=null,cardSig='',metaEl=null,termBtn=null;const cache=new Map();
 const termIds=new Map();
 let metaSig='',lastDraft='',pool=null,ctlOff=null;const ctl=createSessionControls({form,sx,toast});
 form.addEventListener('submit',e=>{if(card){e.preventDefault();e.stopImmediatePropagation();}},true);

 async function refresh(){
  let list;try{list=await sx.list();}catch{return;}
  const seen=new Set();
  for(const s of list){
   seen.add(s.id);labels.set(s.id,avail.agents.find(a=>a.id===s.agent)?.label||s.agent);
   if(!states.has(s.id)){states.set(s.id,'starting');sx.onState(s.id,v=>{states.set(s.id,v?.state||'starting');paint(s);if(active?.id===s.id){paintHeader();syncRun();}});
    sx.onUi(s.id,u=>{const had=prompts.get(s.id),hs=busy.get(s.id);prompts.set(s.id,u?!!u.prompt:undefined);busy.set(s.id,!!u?.status);if(had!==prompts.get(s.id)||hs!==busy.get(s.id)){paint(s);if(active?.id===s.id)paintHeader();}});}
   paint(s);
  }
  for(const [id,row] of rows)if(!seen.has(id)){row.remove();rows.delete(id);}
 }
 function statusOf(s){
  let state=states.get(s.id)||'starting';
  if(state==='needs_permission'&&prompts.get(s.id)===false)state='working';
  if(state==='waiting_input'&&busy.get(s.id)&&prompts.get(s.id)===false)state='working'; // badge follows the screen: no prompt on it, no "?"
  if(state==='waiting_input'&&prompts.get(s.id)===false&&!busy.get(s.id))return 'done'; // nothing on screen needs you: clear the badge
  return STATUS[state]||'working';
 }
 function paint(s){
  let row=rows.get(s.id);
  if(!row){row=el('button','thread-row session-row session-row--sidebar');row.type='button';row.addEventListener('click',()=>open(row._s));rows.set(s.id,row);side.append(row);}
  row._s=s;
  const status=statusOf(s);
  populateThreadRow(row,{id:'session-'+s.id,title:name(s),project:base(s.cwd),status,modified:(s.created&&s.created<1e12?s.created*1000:s.created)||Date.now()});
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
 const SHOW=200,subLimit=new Map(),kfmt=n=>n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':String(n);
 const hide=it=>it.kind==='usage'||it.internal||it.queued;
 const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
 function subStats(it){
  const run=it.status==='running',bits=[plural(it.toolUses??0,'tool use'),it.tokens!=null&&`${kfmt(it.tokens)} tokens`];
  if(run)bits.push(short(it.lastAction||''));else if(it.endedAt&&it.startedAt)bits.push(dur(Math.max(0,Math.round((it.endedAt-it.startedAt)/1000))));
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
  const old=it.callId&&pool?.get(it.callId);if(old){pool.delete(it.callId);updateSub(old,it);return old;}
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
  if(!box||!ui)return;const later=[];let prev=null;
  const entries=[];for(let it of ui.items){if(hide(it))continue;if(it.kind==='subagent'&&subs.get(it.callId))it={...it,...subs.get(it.callId)};const l=entries.at(-1);
   if(RUN.has(it.kind)){if(l?.run)l.run.push(it);else entries.push({id:'run:'+it.id,run:[it]});}else entries.push({id:it.id,it});}
  for(const e of entries){
   const sg=JSON.stringify(e.run||e.it),c=cache.get(e.id);let node=c?.el;
   if(!c||c.sig!==sg){pool=c?.el?new Map([...c.el.querySelectorAll('details.session-sub[data-call-id]')].filter(x=>x.dataset.callId).map(x=>[x.dataset.callId,x])):null;const n=e.run?buildRun(e.run,later,c?.el):build(e.it,later);pool=null;if(!n)continue;if(c?.el){if(!e.run&&c.el.tagName==='DETAILS'&&n.tagName==='DETAILS')n.open=c.el.open;c.el.replaceWith(n);}node=n;cache.set(e.id,{sig:sg,el:n});}
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
 // Header controls: model / effort / mode menus, quiet usage text, background chip, cwd. Rebuilt only when its inputs change.
 const bgCount=v=>typeof v==='number'?v:Number(v?.count)||0;
 function paintMeta(){
  if(!metaEl||!active)return;const m=ui?.meta||{},u=m.usage;
  const ul=(Array.isArray(u?.lines)?u.lines:String(u?.lines||'').split(' · ')).map(String).filter(x=>x&&!x.startsWith('$'));
  const sg=JSON.stringify([m.model,m.effort,m.mode,ul,u?.inputTokens,u?.outputTokens,bgCount(m.backgroundTasks),m.cwd]);
  if(sg===metaSig)return;metaSig=sg;metaEl.replaceChildren();
  if(ul.length){const t=el('span','session-usage',ul.join(' · '));if(u?.inputTokens!=null)t.title=`${u.inputTokens} tokens in · ${u.outputTokens??0} out`;metaEl.append(t);}
  else if(m.contextUsedPct!=null)metaEl.append(el('span','session-usage',`ctx ${Math.round(m.contextUsedPct)}%`));
  const n=bgCount(m.backgroundTasks);
  if(n){const c=el('span','attachment-chip session-bg',`${n} background`);c.title='Background tasks running';metaEl.append(c);}
  metaEl.append(el('span','session-cwd',base(m.cwd||active.s.cwd)));
 }
 const esc=e=>{if(e.key==='Escape'&&!ctl.menuOpen()&&active&&mode==='chat'&&!e.target.value?.trim?.()&&isWorking()){e.preventDefault();sx.control(active.id,'interrupt').catch(er=>toast(er.message));}};
 // Mirror the terminal's half-typed input only into an empty, unfocused composer.
 function syncDraft(){
  const p=prompt(),d=ui?.meta?.draft;if(!active||mode!=='chat'||typeof d!=='string'||d===lastDraft)return;lastDraft=d;
  if(d&&!p.value&&document.activeElement!==p){p.value=d;p.dispatchEvent(new Event('input',{bubbles:true}));}
 }
 function drawPrompt(){
  const p=active?ui?.prompt:null,sg=p?JSON.stringify(p):'';
  if(sg===cardSig)return;cardSig=sg;
  if(card){card.remove();card=null;delete form.dataset.approval;for(const c of form.children)c.inert=false;form.resizePrompt?.();}
  if(!p)return;
  card=el('section','composer-approval');card.setAttribute('aria-label','Agent approval');
  card.append(el('h3','',p.title||'Agent needs input'));
  const body=(p.body||'').split('\n').filter(l=>!/^\s*(Claude Code v|claude-\S+ with \w+ effort)/.test(l)).join('\n').trim();
  if(p.type==='choice'&&body&&hooks.markdown){const a=el('div','approval-action');a.innerHTML=icon('terminal');a.append(el('span','',p.plan?'Plan':'Request'));const md=el('div','approval-preview-host session-plan');hooks.markdown(md,p.plan||body);card.append(a,md);}
  else if(body){const a=el('div','approval-action');a.innerHTML=icon('terminal');a.append(el('span','',p.type==='trust'?'Folder':'Request'));
   const host=el('div','approval-preview-host'),pre=el('pre','approval-preview');pre.tabIndex=0;pre.setAttribute('aria-label','Request details');pre.append(el('code','',body));host.append(pre);card.append(a,host);}
  for(const q of Array.isArray(p.questions)?p.questions:[]){ // optional structured fields; absent for the current parsers
   const g=el('div','session-question');g.append(el('div','session-question-text',q.question||q.text||q.title||''));
   for(const o of q.options||[]){const lab=typeof o==='string'?o:o.label,b=el('button','provider-dialog-button',lab);b.type='button';
    b.addEventListener('click',()=>{if(q.multiSelect)b.classList.toggle('provider-dialog-primary');else sx.control(active.id,'answerPrompt',{index:o.index??q.options.indexOf(o)}).catch(e=>toast(e.message));});g.append(b);}
   card.append(g);}
  const ctl=el('div','approval-controls');
  for(const o of p.options){const b=el('button',`provider-dialog-button${o.index===p.selected?' provider-dialog-primary':''}`,o.label);b.type='button';
   b.addEventListener('click',()=>{sx.control(active.id,'answerPrompt',{index:o.index}).catch(e=>toast(e.message));});ctl.append(b);}
  card.append(ctl);form.append(card);form.dataset.approval='true';
  for(const c of form.children)c.inert=c!==card;
 }
 const isWorking=()=>!!active&&(states.get(active.id)==='working'||!!ui?.status);
 function syncRun(){if(active&&mode==='chat'){form.setRunning?.(isWorking());const b=document.querySelector('.send-button');if(b&&isWorking()&&!prompt().value.trim())b.disabled=false;}}
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
  form.hidden=m==='terminal';ctl.hide(m==='terminal');
  paintHeader();
  if(m==='terminal'){void showTerminal();venom(1);}else{showChat();venom(-1);}
 }
 function paintHeader(){
  if(!active)return;
  const s=active.s,status=statusOf(s);
  header.className='thread-header thread-header--session';header.dataset.status=status;header.replaceChildren();
  header.append(el('span','session-title',name(s)));
  const dot=threadState({status},{unread:false});dot.classList.add('session-state');header.append(dot);
  const seg=el('div','settings-segment session-toggle');seg.role='group';
  for(const [k,t] of [['chat','Chat'],['terminal','Terminal']]){const b=el('button','',t);b.type='button';b.setAttribute('aria-pressed',String(mode===k));b.addEventListener('click',()=>{if(mode!==k)setMode(k);});seg.append(b);}
  const copy=el('button','button button--subtle session-copy');copy.type='button';copy.innerHTML=icon('copy')+'<span>Open in terminal</span>';
  copy.title='Copy the tmux attach command';
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(s.attachCommand||await sx.attachCommand(s.id));toast('Attach command copied');}catch(e){toast(e.message);}});
  metaEl=el('span','session-meta');metaSig='';header.append(metaEl,seg,copy);paintMeta();
 }
 function open(s){
  leave();hooks.threadView(name(s));
  active={id:s.id,s};mode='chat';unpress();rows.get(s.id)?.setAttribute('aria-pressed','true');
  form.hidden=false;form.dataset.session='';
  ui=null;cardSig='';ctl.attach(s);paintHeader();showChat();
  uiUnsub=sx.onUi(s.id,u=>{ui=u;ctl.update(u);paintMeta();if(mode==='chat')drawChat();drawPrompt();syncDraft();syncRun();});
  lastDraft='';sx.catalog?.(s.id).then(c=>{if(active?.id===s.id)ctl.setCatalog(c);}).catch(()=>{});
  const p=prompt();p.addEventListener('keydown',esc);ctlOff=()=>p.removeEventListener('keydown',esc);
  subs.clear();subLimit.clear();subUnsub=sx.onSubagents?.(s.id,l=>{subs.clear();for(const x of l||[])subs.set(x.callId,x);if(mode==='chat')drawChat();});
 }
 function leave(){
  if(!active&&!import_)return;
  unsubs.forEach(f=>f());unsubs=[];uiUnsub?.();uiUnsub=null;subUnsub?.();subUnsub=null;ctlOff?.();ctlOff=null;ctl.detach();ui=null;drawPrompt();
  if(active&&termIds.has(active.id)){views?.close('session-'+active.id,termIds.get(active.id));termIds.delete(active.id);termEl?.querySelector(`[data-sid="${active.id}"]`)?.remove();}
  active=null;form.setRunning?.(false);
  venomEnd();if(termEl){termEl.hidden=true;delete termEl.dataset.solid;}
  form.hidden=false;delete form.dataset.session;
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
  stop(){if(!active||mode!=='chat'||!isWorking())return false;sx.control(active.id,'interrupt').catch(e=>toast(e.message));return true;},
  send(text){if(active)sx.send(active.id,text).catch(e=>toast(e.message));},
 };
}
