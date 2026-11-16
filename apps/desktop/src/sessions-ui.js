import {icon} from './ui.js';
import {populateThreadRow,tickThreadTimes,threadState} from './thread-row.js';
import {showPopover,hidePopover} from './popover-motion.js';
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
 if(!sx)return {leave(){},isActive:()=>false,send(){}};
 const side=el('div','sidebar-cli-sessions');
 document.querySelector('.sidebar-sessions').before(side);
 const rows=new Map(),states=new Map(),labels=new Map(),titles=new Map();
 const name=s=>titles.get(s.id)||`${labels.get(s.id)||s.agent} session`;
 let active=null,mode='chat',unsubs=[],termEl=null,views=null,viewPromise=null,import_=null;
 const termIds=new Map();

 async function refresh(){
  let list;try{list=await sx.list();}catch{return;}
  const seen=new Set();
  for(const s of list){
   seen.add(s.id);labels.set(s.id,avail.agents.find(a=>a.id===s.agent)?.label||s.agent);
   if(!states.has(s.id)){states.set(s.id,'starting');sx.onState(s.id,v=>{states.set(s.id,v?.state||'starting');paint(s);if(active?.id===s.id)paintHeader();});}
   paint(s);
  }
  for(const [id,row] of rows)if(!seen.has(id)){row.remove();rows.delete(id);}
 }
 function paint(s){
  let row=rows.get(s.id);
  if(!row){row=el('button','thread-row session-row session-row--sidebar');row.type='button';row.addEventListener('click',()=>open(row._s));rows.set(s.id,row);side.append(row);}
  row._s=s;
  const state=states.get(s.id)||'starting';
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
 function notice(box,s){
  const n=el('div','session-notice');n.append(el('span','',states.get(s.id)==='needs_permission'?'Waiting for you in the terminal':''));
  const b=el('button','button button--subtle','Open terminal');b.type='button';b.addEventListener('click',()=>setMode('terminal'));n.append(b);
  box.append(n);
 }
 function showChat(){
  const box=el('div','thread-messages');hooks.showHistory(box);
  const s=active.s;
  const draw=m=>{renderChat(box,Array.isArray(m)?m:m?.messages||[]);if(states.get(s.id)==='needs_permission')notice(box,s);};
  unsubs.forEach(f=>f());unsubs=[];
  let last=sx.messages(s.id);
  const title=m=>{const t=(Array.isArray(m)?m:m?.messages||[]).find(x=>x.role==='user')?.text?.trim().replace(/\s+/g,' ').slice(0,60);if(t&&titles.get(s.id)!==t){titles.set(s.id,t);paint(s);paintHeader();}};
  unsubs.push(sx.onMessages(s.id,m=>{last=m;title(m);draw(m);}));
  unsubs.push(sx.onState(s.id,()=>draw(last)));
  draw(last);
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
 function setMode(m){
  if(!active)return;mode=m;
  form.hidden=m==='terminal';
  if(termEl)termEl.hidden=m!=='terminal';
  paintHeader();
  if(m==='terminal')void showTerminal();else showChat();
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
  header.append(seg,copy);
 }
 function open(s){
  leave();hooks.threadView(name(s));
  active={id:s.id,s};mode='chat';unpress();rows.get(s.id)?.setAttribute('aria-pressed','true');
  form.hidden=false;form.dataset.session='';prompt().placeholder=`Message ${labels.get(s.id)||'the agent'}`;
  paintHeader();showChat();
 }
 function leave(){
  if(!active&&!import_)return;
  unsubs.forEach(f=>f());unsubs=[];active=null;
  if(termEl)termEl.hidden=true;
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
  send(text){if(active)sx.send(active.id,text).catch(e=>toast(e.message));},
 };
}
