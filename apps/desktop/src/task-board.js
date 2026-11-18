import {createTaskBoard,columnOf,splitTasks,fetchIssues,formatElapsed,formatCost} from './task-board-engine.js';
import {icon} from './ui.js';
import {threadViewState as viewState} from './thread-view-state.js';
import './task-board.css';

const COLUMNS=[['queued','Queued','Waiting for a free slot'],['running','Running','Nothing running'],['needs','Needs you','Nothing needs you'],['done','Done','Nothing finished yet']];
export function createTaskBoardView({api=window.sufficeDesktop,board,host=document.querySelector('.workspace'),fetcher}={}){
 const composer=()=>document.querySelector('.composer');
 board??=createTaskBoard({api,selection:()=>{const form=composer();return {...(form?.modelSelection||{}),effort:form?.modelSelection?.effort||'low',approvalMode:form?.approvalMode};}});
 api?.onEvent?.(event=>board.handleEvent(event));
 const root=document.createElement('section');root.className='task-board';root.hidden=true;root.setAttribute('aria-label','Tasks');
 root.innerHTML=`<header class="tb-head"><div><h2>Tasks</h2><p class="tb-summary" role="status"></p></div><div class="tb-head-tools"><div class="tb-limit" role="group" aria-label="Concurrency"><span>Run</span><button type="button" class="tb-step" data-step="-1" aria-label="Fewer at once">−</button><output aria-live="polite"></output><button type="button" class="tb-step" data-step="1" aria-label="More at once">+</button><span>at once</span></div><button type="button" class="tb-clear text-button">Clear done</button><button type="button" class="tb-close" aria-label="Close tasks">${icon('close')}</button></div></header>
 <form class="tb-add"><label class="sr-only" for="tb-text">Tasks, one per line</label><textarea id="tb-text" rows="2" placeholder="One task per line"></textarea><div class="tb-add-row"><div class="tb-issues" hidden><label class="sr-only" for="tb-repo">Repository</label><input id="tb-repo" placeholder="owner/repo" autocomplete="off" spellcheck="false"><button type="button" class="tb-import">Import</button></div><span class="tb-error" role="alert"></span><button type="button" class="tb-from">From issues</button><button type="submit" class="tb-queue" disabled>Queue</button></div></form>
 <div class="tb-columns">${COLUMNS.map(([key,label])=>`<section class="tb-col" data-col="${key}" aria-label="${label}"><h3>${label}<span class="tb-count"></span></h3><ul class="tb-list"></ul></section>`).join('')}</div>`;
 host.append(root);
 const $=selector=>root.querySelector(selector),text=$('#tb-text'),queue=$('.tb-queue'),error=$('.tb-error'),issues=$('.tb-issues');
 let open=false,returnFocus=null;
 const badge=document.createElement('button');badge.type='button';badge.className='button subtle sidebar-tasks';badge.dataset.action='tasks';badge.setAttribute('aria-label','Tasks');badge.innerHTML=`${icon('plan')}<span>Tasks</span><span class="tb-badge" hidden></span>`;
 document.querySelector('.new-session')?.after(badge);
 const card=task=>{
  const li=document.createElement('li');li.className='tb-card';li.dataset.id=task.id;li.dataset.status=task.status;
  const title=document.createElement('p');title.className='tb-title';title.textContent=task.text;title.title=task.text;
  const state=document.createElement('p');state.className='tb-state';
  state.textContent=task.status==='queued'?'Queued':task.status==='running'?(task.activity||'Working'):task.status==='failed'?(task.error||'Failed'):task.status==='cancelled'?'Cancelled':'Finished';
  const meta=document.createElement('p');meta.className='tb-meta';
  if(task.startedAt)meta.innerHTML=`<span class="tb-elapsed">${formatElapsed(board.elapsed(task))}</span><span class="tb-cost">${formatCost(task.cost)}</span>`;
  const actions=document.createElement('div');actions.className='tb-actions';
  const act=(label,name,glyph)=>{const b=document.createElement('button');b.type='button';b.dataset.act=name;b.innerHTML=`${icon(glyph)}<span>${label}</span>`;b.setAttribute('aria-label',`${label}: ${task.text.slice(0,60)}`);actions.append(b);};
  if(task.status==='queued'||task.status==='running')act('Cancel','cancel','close');
  if(task.status==='failed'||task.status==='cancelled')act('Retry','retry','refresh');
  li.append(title,state,meta,actions);return li;
 };
 function draw(){
  const list=board.tasks(),by={queued:[],running:[],needs:[],done:[]};for(const task of list)by[columnOf(task)].push(task);
  by.done.reverse();
  for(const [key,,empty] of COLUMNS){const col=$(`[data-col="${key}"]`),ul=col.querySelector('.tb-list');col.querySelector('.tb-count').textContent=by[key].length||'';ul.replaceChildren(...(by[key].length?by[key].map(card):[Object.assign(document.createElement('li'),{className:'tb-empty',textContent:empty})]));}
  const active=by.queued.length+by.running.length+by.needs.length;
  $('.tb-summary').textContent=list.length?[by.running.length&&`${by.running.length} running`,by.queued.length&&`${by.queued.length} queued`,by.needs.length&&`${by.needs.length} need you`,by.done.length&&`${by.done.length} done`].filter(Boolean).join(' · '):'Queue as many tasks as you like. They run as threads.';
  $('.tb-limit output').textContent=board.limit();
  const b=badge.querySelector('.tb-badge');b.hidden=!active;b.textContent=active||'';badge.dataset.active=active?'true':'false';
 }
 // Redraw on every tick would drop focus on a button; only the live numbers change between state changes.
 board.subscribe(()=>{const focus=open&&root.contains(document.activeElement)?document.activeElement:null,act=focus?.dataset.act,id=focus?.closest('.tb-card')?.dataset.id;draw();if(act)root.querySelector(`.tb-card[data-id="${id}"] [data-act="${act}"]`)?.focus();});
 const setOpen=(value,restore=true)=>{if(value===open)return;open=value;hideBubble();root.hidden=!value;document.body.classList.toggle('tasks-open',value);badge.setAttribute('aria-pressed',String(value));if(value){returnFocus=document.activeElement;draw();text.focus();}else if(restore){returnFocus?.isConnected&&returnFocus.focus?.();}};
 // Any click outside the board (sidebar, a thread, settings) leaves it; the click keeps its own focus.
 const dirty=()=>text.value.trim()||$('#tb-repo').value.trim();
 const bubble=document.createElement('div');bubble.className='tb-discard';bubble.hidden=true;bubble.setAttribute('role','alertdialog');bubble.setAttribute('aria-label','Discard unsaved tasks');bubble.innerHTML='<span>Discard?</span><button type="button" class="tb-keep">Keep</button><button type="button" class="tb-drop">Discard</button>';root.querySelector('.tb-add').append(bubble);
 const hideBubble=()=>{bubble.hidden=true;};
 function showBubble(){bubble.hidden=false;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)bubble.animate([{transform:'translateY(8px) scale(.94)',opacity:0},{transform:'translateY(-3px) scale(1.02)',opacity:1,offset:.6},{transform:'none',opacity:1}],{duration:260,easing:'cubic-bezier(.34,1.45,.64,1)'});bubble.querySelector('.tb-keep').focus({preventScroll:true});}
 bubble.querySelector('.tb-keep').addEventListener('click',()=>{hideBubble();text.focus();});
 bubble.querySelector('.tb-drop').addEventListener('click',()=>{text.value='';$('#tb-repo').value='';queue.disabled=true;hideBubble();setOpen(false,false);});
 // Leaving the board (any click outside, or a thread/session switch) closes it; unsaved input asks first and never forces the view.
 const leave=()=>{if(!open)return false;if(dirty()){showBubble();return true;}setOpen(false,false);return false;};
 document.addEventListener('click',event=>{if(open&&!root.contains(event.target)&&!badge.contains(event.target)&&!event.target.closest('.popover,dialog')&&leave()){event.preventDefault();event.stopPropagation();}},true);
 viewState.subscribe(event=>{if(event.type==='select')leave();});
 text.addEventListener('input',()=>{queue.disabled=!splitTasks(text.value).length;error.textContent='';});
 $('.tb-add').addEventListener('submit',event=>{event.preventDefault();const lines=splitTasks(text.value);if(!lines.length)return;board.add(lines);text.value='';queue.disabled=true;});
 text.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();$('.tb-add').requestSubmit();}});
 $('.tb-from').addEventListener('click',()=>{issues.hidden=!issues.hidden;if(!issues.hidden)$('#tb-repo').focus();});
 const importIssues=async()=>{const button=$('.tb-import');button.disabled=true;error.textContent='';try{const found=await fetchIssues($('#tb-repo').value,fetcher);if(!found.length)error.textContent='No open issues';else{text.value=[text.value.trim(),...found].filter(Boolean).join('\n');text.dispatchEvent(new Event('input'));issues.hidden=true;}}catch(e){error.textContent=e.message;}finally{button.disabled=false;}};
 $('.tb-import').addEventListener('click',importIssues);
 $('#tb-repo').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();importIssues();}});
 $('.tb-clear').addEventListener('click',()=>board.clearDone());
 $('.tb-close').addEventListener('click',()=>setOpen(false));
 root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.stopPropagation();setOpen(false);}});
 root.addEventListener('click',event=>{
  const step=event.target.closest('.tb-step');if(step)return board.setLimit(board.limit()+Number(step.dataset.step));
  const act=event.target.closest('[data-act]');if(!act)return;const id=act.closest('.tb-card').dataset.id;board[act.dataset.act](id);
 });
 badge.addEventListener('click',()=>setOpen(!open));
 draw();
 return {open:()=>setOpen(true),close:()=>setOpen(false),toggle:()=>setOpen(!open),board,get isOpen(){return open;}};
}
