import {populateThreadRow,tickThreadTimes,connectThreadHover,formatThreadTime} from './thread-row.js';
import {threadViewState} from './thread-view-state.js';
import {connectSessionContextMenu} from './thread-context-menu.js';
import {showPopover,hidePopover} from './popover-motion.js';
import {el,base,prompt} from './sessions-util.js';
import {createTranscript} from './sessions-transcript.js';
import {createControls} from './sessions-controls.js';
import {connectSessionHeader,viewId,storedTitle} from './sessions-header.js';
import {createTerminal} from './sessions-terminal.js';
import {createApproval} from './sessions-approval.js';
import {updateSessionDirectory} from './thread-directory.js';
import './sessions.css';

const sx=window.sufficeDesktop?.sessions;
let avail={ok:true,agents:[]};
sx?.available().then(a=>{avail=a;}).catch(()=>{});
const STATUS={starting:'working',working:'working',waiting_input:'input',needs_permission:'approval',error:'failed',exited:'done'};
const age=ms=>formatThreadTime(Math.max(0,Math.floor((Date.now()-ms)/1000)));
const project=()=>document.querySelector('.project-picker')?.dataset.tooltip||'';

// Send-options menu: agents are chosen in the model picker, so only Import remains.
export function sessionMenuItems(){return sx?[{label:'Import chat',action:'import-chat:open',separator:true}]:[];}

export function connectSessions({toast,form,workspace,header,hooks}){
 if(!sx)return {leave(){},isActive:()=>false,stop:()=>false,send(){},start:async()=>{toast('Sessions are unavailable');return false;}};
 const side=el('div','sidebar-cli-sessions');
 document.querySelector('.sidebar-sessions').before(side);
 const busy=new Map(),rows=new Map(),states=new Map(),prompts=new Map(),subs=new Map(),labels=new Map(),titles=new Map(),firstText=new Map(),handBack=new Map(),activity=new Map();
 let import_=null,republished=false;
 const uiSeen=new Set();const bump=id=>{activity.set(id,Date.now());};
 const agentLabel=a=>({claude:'Claude Code',codex:'Codex'}[a]||(/claude/.test(a)?'Claude Code':/codex/.test(a)?'Codex':avail.agents.find(x=>x.id===a)?.label||a));
 const providerOf=a=>/claude/.test(a)?'anthropic':/codex/.test(a)?'openai':a;
 // Shared state for the component modules; they read and write it through `c`.
 const c={sx,toast,form,workspace,header,hooks,states,subs,labels,titles,firstText,subLimit:new Map(),cache:new Map(),unsubs:[],
  active:null,mode:'chat',ui:null,cat:null,pend:null,pendTimer:0,box:null,statusEl:null,useItems:false,lastMsgs:[],pool:null,
  cards:null,cardsSig:'',metaEl:null,metaSig:'',openMenu:null,pickSel:-1,lastDraft:'',sessionHint:false,termEl:null};
 c.name=s=>storedTitle(s.id)||titles.get(s.id)||'New session';
 c.statusOf=statusOf;c.paint=paint;c.setMode=setMode;
 c.isWorking=()=>!!c.active&&(states.get(c.active.id)==='working'||!!c.ui?.status);
 c.syncRun=()=>{if(c.active&&c.mode==='chat'){form.setRunning?.(c.isWorking());const b=document.querySelector('.send-button');if(b&&c.isWorking()&&!prompt().value.trim())b.disabled=false;}};
 const sh=connectSessionHeader(header,{current:()=>c.active?.id,renamed:id=>{const r=rows.get(id);if(r)paint(r._s);}});
 c.paintHeader=()=>{if(!c.active)return;sh.paint({title:c.name(c.active.s),mode:c.mode,onMode:setMode});c.metaEl=el('span','session-meta');c.metaSig='';c.paintMeta?.();}; // metaEl stays detached: the composer carries these controls
 const ctl=createControls(c),term=createTerminal(c),{drawChat,showChat,renderChat}=createTranscript(c);
 c.paintMeta=ctl.paintMeta;
 let uiUnsub=null,subUnsub=null;
 const approval=createApproval({form,markdown:(n,t)=>hooks.markdown(n,t),answer:index=>sx.control(c.active.id,'answerPrompt',{index}).catch(e=>toast(e.message))});
 const drawPrompt=()=>approval.draw(c.active?c.ui?.prompt:null,c.ui?.items);
 form.addEventListener('submit',e=>{if(form.dataset.approval==='true'){e.preventDefault();e.stopImmediatePropagation();}},true);
 async function refresh(){
  let list;try{list=await sx.list(republished?undefined:{republish:true});republished=true;}catch{return;}
  const seen=new Set();
  for(const s of list){
   seen.add(s.id);labels.set(s.id,agentLabel(s.agent));if(!activity.has(s.id))activity.set(s.id,(s.created&&s.created<1e12?s.created*1000:s.created)||Date.now());
   if(!states.has(s.id)){states.set(s.id,'starting');sx.onState(s.id,v=>{states.set(s.id,v?.state||'starting');if(v?.since)activity.set(s.id,v.since<1e12?v.since*1000:v.since);paint(s);if(c.active?.id===s.id){c.paintHeader();c.syncRun();}});
    sx.onUi(s.id,u=>{const had=prompts.get(s.id),hs=busy.get(s.id),first=!uiSeen.has(s.id);uiSeen.add(s.id);const ft=u?.items?.find(i=>i.kind==='user')?.text?.trim().replace(/\s+/g,' ').slice(0,60);if(ft&&!titles.has(s.id)){titles.set(s.id,ft);paint(s);}prompts.set(s.id,u?!!u.prompt:undefined);busy.set(s.id,!!u?.status);if(had!==prompts.get(s.id)||hs!==busy.get(s.id)){if(!first)bump(s.id);paint(s);if(c.active?.id===s.id)c.paintHeader();}});}
   paint(s);
  }
  for(const [id,row] of rows)if(!seen.has(id)){row.remove();rows.delete(id);}
  publish();
 }
 function statusOf(s){
  let state=states.get(s.id)||'starting';
  if(state==='needs_permission'&&prompts.get(s.id)===false)state='working';
  if(state==='waiting_input'&&busy.get(s.id)&&prompts.get(s.id)===false)state='working'; // badge follows the screen: no prompt on it, no "?"
  if(state==='waiting_input'&&prompts.get(s.id)===false&&!busy.get(s.id))return 'done'; // nothing on screen needs you: clear the badge
  return STATUS[state]||'working';
 }
 function publish(){updateSessionDirectory([...rows.values()].map(r=>({id:'session-'+r._s.id,title:c.name(r._s),project:base(r._s.cwd),status:statusOf(r._s),modified:activity.get(r._s.id)||Date.now(),agent:labels.get(r._s.id),open:()=>open(r._s)})));}
 function paint(s){
  let row=rows.get(s.id);
  if(!row){row=el('button','thread-row session-row session-row--sidebar');row.type='button';row.addEventListener('click',()=>open(row._s));rows.set(s.id,row);side.append(row);}
  row._s=s;
  const status=statusOf(s);
  const label=labels.get(s.id);
  populateThreadRow(row,{id:'session-'+s.id,title:c.name(s),project:base(s.cwd),status,modified:activity.get(s.id)||Date.now(),agent:label,provider:providerOf(s.agent),model:label});
  row.setAttribute('aria-pressed',String(c.active?.id===s.id));row.title=`${c.name(s)} · ${base(s.cwd)}`;
  tickThreadTimes(row);sortRows();publish();
 }
 // Newest activity first, like the thread list.
 function sortRows(){const order=[...rows.entries()].sort((a,b)=>(activity.get(b[0])||0)-(activity.get(a[0])||0)).map(e=>e[1]);if(order.some((r,i)=>side.children[i]!==r))side.append(...order);}
 const unpress=()=>{for(const r of rows.values())r.setAttribute('aria-pressed','false');};

 function setMode(m){
  if(!c.active)return;c.mode=m;
  form.hidden=m==='terminal';ctl.hide(m==='terminal');
  c.paintHeader();
  if(m==='terminal')term.enter();else{showChat();term.exit();}
 }
 function open(s,animate=false){
  leave();hooks.threadView(c.name(s),animate);
  c.active={id:s.id,s};c.mode='chat';sh.select(viewId(s.id));unpress();rows.get(s.id)?.setAttribute('aria-pressed','true');
  form.hidden=false;form.dataset.session='';
  c.ui=null;approval.clear();c.paintHeader();showChat();
  uiUnsub=sx.onUi(s.id,u=>{c.ui=u;sh.usage(u?.meta);ctl.update();ctl.paintMeta();if(c.mode==='chat')drawChat();drawPrompt();ctl.syncDraft();c.syncRun();});
  c.cat=null;c.lastDraft='';c.cardsSig='';sx.catalog?.(s.id).then(k=>{if(c.active?.id===s.id)ctl.setCatalog(k);}).catch(()=>{});
  ctl.attach();
  if(handBack.has(s.id)){restore(handBack.get(s.id));handBack.delete(s.id);}
  subs.clear();c.subLimit.clear();subUnsub=sx.onSubagents?.(s.id,l=>{subs.clear();for(const x of l||[])subs.set(x.callId,x);if(c.mode==='chat')drawChat();});
 }
 function leave(){
  if(!c.active&&!import_)return;
  c.unsubs.forEach(f=>f());c.unsubs=[];uiUnsub?.();uiUnsub=null;subUnsub?.();subUnsub=null;ctl.detach();c.ui=null;drawPrompt();
  term.leave();
  c.active=null;form.setRunning?.(false);
  form.hidden=false;delete form.dataset.session;
  delete header.dataset.status;sh.deselect();
  unpress();
 }
 // Start flow from the composer: the typed text is the first message; resolves false when nothing started.
 async function start(agent,text){
  const cwd=project();if(!cwd){toast('Choose a project');return false;}
  try{const s=await sx.start({agent,cwd});bump(s.id);await refresh();if(text){titles.set(s.id,text.replace(/\s+/g,' ').slice(0,60));firstText.set(s.id,text);sendWhenReady(s.id,text);}open(rows.get(s.id)?._s||s,true);return true;}catch(e){toast(e.message);return false;}
 }
 // The CLI drops keys until its input box is drawn (and Enter would accept a trust prompt): hold the first message, shown as pending, until the screen parses as ready. Never delivered (exit, error, 45 s with no prompt up): hand it back to the composer.
 // Put a held message back without losing what the user typed since: it goes first, blank line between.
 function restore(text){const p=document.querySelector('#prompt');if(p)p.value=p.value?`${text}\n\n${p.value}`:text;}
 function sendWhenReady(id,text){
  let t=0,poll=0,gone=false,off=()=>{},offState=()=>{};const stop=()=>{gone=true;clearTimeout(t);clearInterval(poll);off();offState();};
  const giveUp=why=>{if(gone)return;stop();firstText.delete(id);const here=c.active?.id===id,name=titles.get(id)||'session';
   if(here)restore(text);else handBack.set(id,text);
   toast(here?why:`${why}: ${name}`);if(here&&c.mode==='chat')drawChat();};
  const arm=()=>{clearTimeout(t);t=setTimeout(()=>giveUp('Agent did not start, message not sent'),45000);};
  arm();
  // The backend notices a dead CLI only when sessions.list runs, so list while the message is held.
  poll=setInterval(()=>{sx.list().catch(()=>{});},1000);
  off=sx.onUi(id,u=>{if(!u)return;if(u.ready){stop();sx.send(id,text).catch(e=>giveUp(e.message));}else if(u.prompt){clearTimeout(t);t=0;}else if(!t)arm();});
  if(gone)off();
  offState=sx.onState(id,v=>{if(v?.state==='exited'||v?.state==='error')giveUp('Agent exited, message not sent');});
  if(gone)offState();
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
  sh.select(viewId('import'));
  const resume=async()=>{try{const s=await sx.resume({source:h.source,sessionId:h.sessionId,cwd:h.cwd});import_=null;await refresh();open(rows.get(s.id)?._s||s);}catch(e){toast(e.message);}};
  sh.paintImport({title:h.title,onResume:resume});
  form.hidden=true;
  const box=el('div','thread-messages');hooks.showHistory(box);renderChat(box,msgs);
 }

 document.addEventListener('click',e=>{if(e.target.closest?.('[data-menu-action^="import-chat:"]'))openImport();});
 connectThreadHover(side);
 connectSessionContextMenu(side,{toast,getSession:row=>{const s=row._s;return s&&{id:s.id,title:c.name(s),attach:()=>sx.attachCommand(s.id),show:()=>{if(c.active?.id!==s.id)open(s);setMode('terminal');},stop:async()=>{await sx.stop(s.id);if(c.active?.id===s.id)hooks.clear?.();await refresh();}};}});
 threadViewState.subscribe(ev=>{if(ev.type==='update'&&ev.changed?.includes('sidebar')){for(const r of rows.values())paint(r._s);if(c.active)c.paintHeader();}});
 void refresh();
 setInterval(()=>tickThreadTimes(side),30000);
 return {
  leave(){if(c.active||import_){leave();import_=null;}},
  isActive:()=>!!c.active&&c.mode==='chat',
  stop(){if(!c.active||c.mode!=='chat'||!c.isWorking())return false;sx.control(c.active.id,'interrupt').catch(e=>toast(e.message));return true;},
  send(text){if(c.active)sx.send(c.active.id,text).catch(e=>toast(e.message));},
  start,
 };
}