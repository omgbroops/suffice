import {fadeGlassContent} from './glass-content-motion.js';
import {icon,mark} from './ui.js';
import {tickThreadTimes} from './thread-row.js';
import {getThreadDirectory} from './thread-directory.js';
import './spotlight.css';
// Command menu (Cmd/Ctrl+K): threads, live sessions, actions and settings in one
// floating surface, independent of the sidebar's visible/filter state.
const TABS=[['all','All'],['threads','Threads'],['sessions','Sessions'],['actions','Actions'],['settings','Settings']];
const GROUPS=['sessions','threads','actions','settings'];
const STATUS={working:'Working',approval:'Needs approval',input:'Needs input',failed:'Failed',done:'Completed',waiting:'Waiting',idle:'Idle'};
const LIVE=new Set(['working','approval','input']);
// Filter chips apply to thread-like rows; each kind keeps one value.
const KINDS=[['project','Project',t=>t.project||'No project',v=>v],['agent','Agent',t=>t.provider||'',v=>v],['status','Status',t=>t.status||'idle',v=>STATUS[v]||v]];
export function createSpotlight({commands}){
 const dialog=document.createElement('dialog');dialog.className='spotlight';dialog.setAttribute('aria-label','Search Suffice');
 dialog.innerHTML=`<div class="spotlight-search"><input id="spotlight-query" type="search" placeholder="Search threads, sessions and actions…" aria-label="Search threads and commands" role="combobox" aria-expanded="true" aria-controls="spotlight-results" aria-autocomplete="list" autocomplete="off" spellcheck="false"><button type="button" class="spotlight-new">New thread</button><button class="spotlight-close" aria-label="Close search">${icon('close')}</button></div><div class="spotlight-bar"><div class="spotlight-scopes" role="tablist" aria-label="Search scope"></div><button type="button" class="spotlight-add" aria-haspopup="menu" aria-expanded="false">${icon('plus')}Filter</button></div><div class="spotlight-chips" aria-label="Active filters" hidden></div><div class="spotlight-chipmenu" role="menu" hidden></div><div id="spotlight-results" class="spotlight-results" role="listbox" aria-label="Search results"></div><div class="sr-only" role="status" aria-live="polite"></div><footer class="spotlight-footer">${mark}<div class="spotlight-hints"><span><kbd>Enter</kbd><i class="spotlight-run">Open</i></span><span><kbd>↑</kbd><kbd>↓</kbd>Navigate</span><span><kbd>Ctrl</kbd><kbd>Tab</kbd>Category</span><span><kbd>Esc</kbd>Close</span></div></footer>`;
 document.body.append(dialog);
 const $=s=>dialog.querySelector(s),input=$('input'),list=$('.spotlight-results'),scopes=$('.spotlight-scopes'),chipBar=$('.spotlight-chips'),menu=$('.spotlight-chipmenu'),addButton=$('.spotlight-add');
 let scope='all',selected=0,items=[],previousFocus,cancelContentFade,closing=false,closeId=0,fades=[],announceTimer;const chips=new Map();
 const live=$('[aria-live]'),announce=()=>{clearTimeout(announceTimer);live.textContent=`${$('[role=tab][aria-selected=true]').firstChild.textContent}, ${items.length} results`;};
 const reduced=()=>document.documentElement.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const span=(cls,text)=>{const el=document.createElement('span');el.className=cls;el.textContent=text;return el;};
 const matches=(text,query)=>query.split(/\s+/).every(term=>text.toLowerCase().includes(term));
 const threadRows=()=>getThreadDirectory().threads;
 function source(){const directory=getThreadDirectory();const rows=directory.threads.map(thread=>({id:'thread:'+thread.id,scope:LIVE.has(thread.status)?'sessions':'threads',title:thread.title,detail:[thread.project,thread.provider,STATUS[thread.status]].filter(Boolean).join(' '),thread,run:()=>directory.open(thread.id)}));return [...rows,...commands().map(command=>({...command,scope:command.scope||'actions'}))];}
 const chipMatch=item=>[...chips].every(([kind,value])=>item.thread&&KINDS.find(k=>k[0]===kind)[2](item.thread)===value);
 function highlight(index,scroll=false){selected=Math.max(0,Math.min(index,items.length-1));const rows=[...list.querySelectorAll('[role="option"]')];for(const [i,row] of rows.entries())row.setAttribute('aria-selected',String(i===selected));const row=rows[selected];$('.spotlight-run').textContent=items[selected]?.thread?'Open':'Run';if(row){input.setAttribute('aria-activedescendant',row.id);if(scroll)row.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
 function setScope(id){scope=id;selected=0;render(true);announce();}
 function renderChips(){chipBar.hidden=!chips.size;chipBar.replaceChildren();for(const [kind,value] of chips){const k=KINDS.find(x=>x[0]===kind),label=k[1]+': '+k[3](value);const chip=document.createElement('button');chip.type='button';chip.className='spotlight-chip';chip.dataset.kind=kind;chip.setAttribute('aria-label','Remove filter '+label);chip.append(span('',label));chip.insertAdjacentHTML('beforeend',icon('close'));chip.addEventListener('click',()=>{chips.delete(kind);selected=0;render(true);input.focus();});chipBar.append(chip);}}
 function row(item,index){
  const el=document.createElement('div');el.className='spotlight-result';el.id='spotlight-option-'+index;el.role='option';el.dataset.result=item.id;
  const content=span('spotlight-result-content','');content.append(span('spotlight-result-title',item.title));
  if(item.thread){const t=item.thread;el.classList.add('spotlight-thread');el.dataset.status=t.status||'idle';el.dataset.unread=String(!!t.unread);const dot=span('spotlight-dot','');dot.title=STATUS[t.status]||'Idle';dot.setAttribute('role','img');dot.setAttribute('aria-label',dot.title);const project=span('spotlight-project',t.project||'No project');project.title=project.textContent;const age=span('spotlight-age thread-age','');age.dataset.started=t.status==='working'?String(t.startedAt||t.modified):'';age.dataset.modified=String(t.modified);el.append(dot,content,project,age);}
  else{const mark=span('spotlight-result-icon','');mark.innerHTML=icon(item.icon||'plus');if(item.detail)content.append(span('spotlight-result-detail',item.detail));el.append(mark,content);if(item.keys){const keys=span('spotlight-keys','');for(const key of item.keys){const k=document.createElement('kbd');k.textContent=key;keys.append(k);}el.append(keys);}}
  el.addEventListener('pointermove',()=>highlight(index));el.addEventListener('click',()=>run(index));return el;}
 function render(animate=false){const query=input.value.trim().toLowerCase(),filtered=source().filter(item=>chipMatch(item)&&matches(item.title+' '+(item.detail||'')+' '+(item.keywords||''),query));
  items=filtered.filter(item=>scope==='all'||item.scope===scope).sort((a,b)=>GROUPS.indexOf(a.scope)-GROUPS.indexOf(b.scope)).slice(0,100);
  scopes.replaceChildren();for(const [id,label] of TABS){const tab=document.createElement('button');tab.type='button';tab.role='tab';tab.textContent=label;tab.dataset.scope=id;tab.setAttribute('aria-selected',String(scope===id));tab.tabIndex=scope===id?0:-1;tab.append(span('spotlight-count',String(id==='all'?filtered.length:filtered.filter(item=>item.scope===id).length)));tab.addEventListener('click',()=>{setScope(id);input.focus();});scopes.append(tab);}
  renderChips();list.replaceChildren();let section='';for(const [index,item] of items.entries()){if(item.scope!==section&&scope==='all'){section=item.scope;list.append(span('spotlight-section',TABS.find(t=>t[0]===section)[1]));}list.append(row(item,index));}
  input.setAttribute('aria-expanded',String(items.length>0));
  if(!items.length){const empty=span('spotlight-empty','No results');empty.role='status';list.append(empty);}
  tickThreadTimes(list);highlight(selected);list.scrollTop=0;updateFade();
  if(animate&&!reduced())list.animate([{opacity:.65},{opacity:1}],{duration:100,easing:'ease-out'});
 }
 function updateFade(){list.dataset.top=String(list.scrollTop>1);list.dataset.bottom=String(list.scrollHeight-list.scrollTop-list.clientHeight>1);}
 new ResizeObserver(updateFade).observe(list);list.addEventListener('scroll',updateFade,{passive:true});
 function cancelClose(){if(!closing)return;closeId++;closing=false;delete dialog.dataset.closing;fades.forEach(animation=>animation.cancel());fades=[];}
 function close(instant=false){if(!dialog.open||closing)return;cancelContentFade?.();const id=++closeId,done=()=>{if(id!==closeId)return;delete dialog.dataset.closing;dialog.close();closing=false;previousFocus?.focus({preventScroll:true});};if(instant||document.documentElement.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches){done();return;}closing=true;dialog.dataset.closing='';fades=[...dialog.children].map(element=>element.animate([{opacity:1},{opacity:0}],{duration:150,easing:'ease-out'}));Promise.all(fades.map(animation=>animation.finished)).then(done).catch(done);}
 // Filter picker: kind first, then a value taken from the threads that exist.
 function closeMenu(refocus=true){menu.hidden=true;addButton.setAttribute('aria-expanded','false');if(refocus)addButton.focus();}
 function openMenu(kind){menu.replaceChildren();menu.hidden=false;addButton.setAttribute('aria-expanded','true');const entry=(label,fn,extra='')=>{const b=document.createElement('button');b.type='button';b.role='menuitem';b.className='spotlight-menu-item'+extra;b.textContent=label;b.addEventListener('click',fn);menu.append(b);return b;};
  if(!kind){for(const k of KINDS)entry(k[1],()=>openMenu(k[0]));}
  else{const k=KINDS.find(x=>x[0]===kind);entry('Back',()=>openMenu(),' spotlight-menu-back');const values=[...new Set(threadRows().map(k[2]).filter(Boolean))].sort();for(const value of values)entry(k[3](value),()=>{chips.set(kind,value);selected=0;closeMenu(false);render(true);input.focus();});if(!values.length)menu.append(span('spotlight-menu-empty','Nothing to filter'));}
  menu.querySelector('button')?.focus();}
 function menuKeys(event){const buttons=[...menu.querySelectorAll('button')],at=buttons.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();closeMenu();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}else if(event.key==='Tab'){event.preventDefault();closeMenu(false);input.focus();}}
 addButton.addEventListener('click',()=>menu.hidden?openMenu():closeMenu());
 function run(index=selected){const item=items[index];if(!item)return;close(true);void item.run();}
 dialog.querySelector('.spotlight-close').addEventListener('click',()=>close());dialog.querySelector('.spotlight-new').addEventListener('click',()=>{close(true);document.querySelector('.new-session')?.click();});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});
 dialog.addEventListener('click',event=>{if(!menu.hidden&&event.target.isConnected&&!event.target.closest('.spotlight-chipmenu,.spotlight-add'))closeMenu(false);if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
 input.addEventListener('input',()=>{selected=0;render(true);clearTimeout(announceTimer);announceTimer=setTimeout(announce,250);});
 dialog.addEventListener('keydown',event=>{
  if(event.target.closest('.spotlight-chipmenu')){menuKeys(event);return;}
  if(event.key==='Escape'){event.preventDefault();close(true);return;}
  if((event.ctrlKey||event.metaKey)&&event.key==='k'){event.preventDefault();event.stopPropagation();if(closing)cancelClose();else close(true);return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();highlight((selected+(event.key==='ArrowDown'?1:-1)+items.length)%Math.max(1,items.length),true);}
  if(event.key==='Enter'&&!event.target.closest('button')){event.preventDefault();run();}
  if(event.key==='Backspace'&&!input.value&&chips.size){chips.delete([...chips.keys()].pop());selected=0;render(true);}
  if(event.key==='Tab'){event.preventDefault();if(event.ctrlKey){const ids=TABS.map(t=>t[0]);setScope(ids[(ids.indexOf(scope)+(event.shiftKey?ids.length-1:1))%ids.length]);input.focus();}else{const stops=[...dialog.querySelectorAll('input,button:not([tabindex="-1"]):not([hidden])')].filter(el=>!el.closest('[hidden]')),at=stops.indexOf(document.activeElement);stops[(at+(event.shiftKey?stops.length-1:1))%stops.length].focus();}}
  if((event.key==='ArrowLeft'||event.key==='ArrowRight')&&event.target.getAttribute?.('role')==='tab'){event.preventDefault();const ids=TABS.map(t=>t[0]);setScope(ids[(ids.indexOf(scope)+(event.key==='ArrowRight'?1:ids.length-1))%ids.length]);scopes.querySelector('[aria-selected=true]').focus();}
 });
 setInterval(()=>{if(dialog.open)tickThreadTimes(list);},1000);
 document.addEventListener('suffice-thread-directory',()=>{if(dialog.open)render();});
 return {open({keyboard=false}={}){if(dialog.open){cancelClose();input.focus();return;}previousFocus=document.activeElement;scope='all';selected=0;input.value='';chips.clear();closeMenu(false);render();dialog.showModal();input.focus();cancelContentFade=fadeGlassContent(dialog);},close};
}
