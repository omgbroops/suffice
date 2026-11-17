import {populateThreadRow,tickThreadTimes} from './thread-row.js';
import {showPopover,hidePopover} from './popover-motion.js';
import {el,base,prompt} from './sessions-util.js';
import {createTranscript} from './sessions-transcript.js';
import {createControls} from './sessions-controls.js';
import {createHeader} from './sessions-header.js';
import {createTerminal} from './sessions-terminal.js';
import {createApproval} from './sessions-approval.js';
import './sessions.css';

const sx=window.sufficeDesktop?.sessions;
let avail={ok:true,agents:[]};
sx?.available().then(a=>{avail=a;}).catch(()=>{});
const STATUS={starting:'working',working:'working',waiting_input:'input',needs_permission:'approval',error:'failed',exited:'done'};
const age=ms=>{const s=Math.max(0,(Date.now()-ms)/1000);return s<60?'now':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d';};
const PH=document.querySelector('#prompt')?.placeholder||'';
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
 let import_=null;
 // Shared state for the component modules; they read and write it through `c`.
 const c={sx,toast,form,workspace,header,hooks,states,subs,labels,titles,subLimit:new Map(),cache:new Map(),unsubs:[],
  active:null,mode:'chat',ui:null,cat:null,pend:null,pendTimer:0,box:null,statusEl:null,useItems:false,lastMsgs:[],pool:null,
  cards:null,cardsSig:'',metaEl:null,metaSig:'',openMenu:null,pickSel:-1,lastDraft:'',sessionHint:false,termEl:null};
 c.name=s=>titles.get(s.id)||`${labels.get(s.id)||s.agent} session`;
 c.statusOf=statusOf;c.paint=paint;c.setMode=setMode;
 c.isWorking=()=>!!c.active&&(states.get(c.active.id)==='working'||!!c.ui?.status);
 c.syncRun=()=>{if(c.active&&c.mode==='chat'){form.setRunning?.(c.isWorking());const b=document.querySelector('.send-button');if(b&&c.isWorking()&&!prompt().value.trim())b.disabled=false;}};
 c.paintHeader=createHeader(c);
 const ctl=createControls(c),term=createTerminal(c),{drawChat,showChat,renderChat}=createTranscript(c);
 c.paintMeta=ctl.paintMeta;
 let ctlOff=null,uiUnsub=null,subUnsub=null;
 const approval=createApproval({form,markdown:(n,t)=>hooks.markdown(n,t),answer:index=>sx.control(c.active.id,'answerPrompt',{index}).catch(e=>toast(e.message))});
 const drawPrompt=()=>approval.draw(c.active?c.ui?.prompt:null,c.ui?.items);
 form.addEventListener('submit',e=>{if(form.dataset.approval==='true'){e.preventDefault();e.stopImmediatePropagation();}},true);
 async function refresh(){
  let list;try{list=await sx.list();}catch{return;}
  const seen=new Set();
  for(const s of list){
   seen.add(s.id);labels.set(s.id,avail.agents.find(a=>a.id===s.agent)?.label||s.agent);
   if(!states.has(s.id)){states.set(s.id,'starting');sx.onState(s.id,v=>{states.set(s.id,v?.state||'starting');paint(s);if(c.active?.id===s.id){c.paintHeader();c.syncRun();}});
    sx.onUi(s.id,u=>{const had=prompts.get(s.id),hs=busy.get(s.id);prompts.set(s.id,u?!!u.prompt:undefined);busy.set(s.id,!!u?.status);if(had!==prompts.get(s.id)||hs!==busy.get(s.id)){paint(s);if(c.active?.id===s.id)c.paintHeader();}});}
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
  populateThreadRow(row,{id:'session-'+s.id,title:c.name(s),project:base(s.cwd),status,modified:(s.created&&s.created<1e12?s.created*1000:s.created)||Date.now()});
  const label=labels.get(s.id);const noGit=row.querySelector('.thread-no-branch span');if(noGit)noGit.textContent=label+' CLI';
  row.setAttribute('aria-pressed',String(c.active?.id===s.id));row.title=`${c.name(s)} (${label} CLI)`;
  tickThreadTimes(row);
 }
 const unpress=()=>{for(const r of rows.values())r.setAttribute('aria-pressed','false');};

 function setMode(m){
  if(!c.active)return;c.mode=m;
  form.hidden=m==='terminal';
  c.paintHeader();
  if(m==='terminal')term.enter();else{showChat();term.exit();}
 }
 function open(s){
  leave();hooks.threadView(c.name(s));
  c.active={id:s.id,s};c.mode='chat';unpress();rows.get(s.id)?.setAttribute('aria-pressed','true');
  form.hidden=false;form.dataset.session='';prompt().placeholder=`Message ${labels.get(s.id)||'the agent'}`;
  c.ui=null;approval.clear();c.paintHeader();showChat();
  uiUnsub=sx.onUi(s.id,u=>{c.ui=u;if(c.pend&&u?.meta)ctl.pendDone(u.meta);ctl.paintMeta();if(c.mode==='chat')drawChat();drawPrompt();ctl.paintCards();ctl.syncDraft();c.syncRun();});
  c.cat=null;c.lastDraft='';c.cardsSig='';sx.catalog?.(s.id).then(k=>{if(c.active?.id===s.id){c.cat=k;c.metaSig='';ctl.paintMeta();}}).catch(()=>{});
  ctlOff=ctl.attach();
  subs.clear();c.subLimit.clear();subUnsub=sx.onSubagents?.(s.id,l=>{subs.clear();for(const x of l||[])subs.set(x.callId,x);if(c.mode==='chat')drawChat();});
 }
 function leave(){
  if(!c.active&&!import_)return;
  c.unsubs.forEach(f=>f());c.unsubs=[];uiUnsub?.();uiUnsub=null;subUnsub?.();subUnsub=null;ctlOff?.();ctlOff=null;ctl.closeMenu();c.cards?.remove();c.cards=null;c.cardsSig='';c.ui=null;drawPrompt();
  term.leave();
  c.active=null;form.setRunning?.(false);
  form.hidden=false;delete form.dataset.session;prompt().placeholder=PH;
  header.className='thread-header';header.contentEditable='plaintext-only';delete header.dataset.status;
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
  header.className='thread-header thread-header--session';header.contentEditable='false';header.replaceChildren(el('span','session-title',h.title));
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
  leave(){if(c.active||import_){leave();import_=null;}},
  isActive:()=>!!c.active&&c.mode==='chat',
  stop(){if(!c.active||c.mode!=='chat'||!c.isWorking())return false;sx.control(c.active.id,'interrupt').catch(e=>toast(e.message));return true;},
  send(text){if(c.active)sx.send(c.active.id,text).catch(e=>toast(e.message));},
 };
}