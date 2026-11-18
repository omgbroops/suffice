import {fadeGlassContent} from './glass-content-motion.js';
import {icon} from './ui.js';
import {projectBadge,threadState,threadProviders,tickThreadTimes} from './thread-row.js';
import {getThreadDirectory} from './thread-directory.js';
import './spotlight.css';
// A floating command surface, independent of the sidebar's visible/filter state.
export function createSpotlight({commands}){
 const dialog=document.createElement('dialog');dialog.className='spotlight';dialog.setAttribute('aria-label','Search Suffice');
 dialog.innerHTML=`<div class="spotlight-search">${icon('search')}<input id="spotlight-query" type="search" placeholder="Search threads and commands…" aria-label="Search threads and commands" role="combobox" aria-expanded="true" aria-controls="spotlight-results" aria-autocomplete="list" autocomplete="off" spellcheck="false"><button class="spotlight-close" aria-label="Close search">${icon('close')}</button></div><div class="spotlight-scopes" role="tablist" aria-label="Search scope"></div><div id="spotlight-results" class="spotlight-results" role="listbox" aria-label="Search results"></div><div class="sr-only" role="status" aria-live="polite"></div><footer class="spotlight-footer"><span><kbd>Enter</kbd> Open</span><span><kbd>↑</kbd><kbd>↓</kbd> Navigate <kbd>Ctrl</kbd><kbd>Tab</kbd> Scope <kbd>Esc</kbd> Close</span></footer>`;
 document.body.append(dialog);const input=dialog.querySelector('input'),list=dialog.querySelector('.spotlight-results'),scopes=dialog.querySelector('.spotlight-scopes');
 // Native modal backdrops form a separate compositing layer. Blur that layer,
 // clipped to the search surface, so the dialog samples the actual wallpaper.
 const glassStyle=document.createElement('style');document.head.append(glassStyle);
 const syncGlass=()=>{if(!dialog.open)return;const r=dialog.getBoundingClientRect();const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${innerWidth}" height="${innerHeight}"><rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" rx="16" fill="white"/></svg>`;glassStyle.textContent=`.desktop-app dialog.spotlight::backdrop {backdrop-filter:blur(20px) saturate(1.1);-webkit-backdrop-filter:blur(20px) saturate(1.1);clip-path:none;mask-image:url("data:image/svg+xml,${encodeURIComponent(svg)}");mask-size:100% 100%;mask-repeat:no-repeat;}`;};
 new ResizeObserver(syncGlass).observe(dialog);
 window.addEventListener('resize',syncGlass);
 let scope='all',selected=0,items=[],previousFocus,cancelContentFade,closing=false,closeId=0,fades=[],announceTimer;
 const live=dialog.querySelector('[aria-live]');
 const announce=()=>{clearTimeout(announceTimer);live.textContent=`${dialog.querySelector('[role=tab][aria-selected=true]').firstChild.textContent}, ${items.length} results`;};
 const span=(cls,text)=>{const el=document.createElement('span');el.className=cls;el.textContent=text;return el;};
 const matches=(text,query)=>query.split(/\s+/).every(term=>text.toLowerCase().includes(term));
 function source(){const directory=getThreadDirectory();const threads=directory.threads.map(thread=>({id:'thread:'+thread.id,scope:'threads',title:thread.title,detail:[thread.project||'No project',thread.branch].filter(Boolean).join(' · '),thread,run:()=>directory.open(thread.id)}));return [...threads,...commands().map(command=>({...command,scope:'commands'}))];}
 function highlight(index,scroll=false){selected=Math.max(0,Math.min(index,items.length-1));const rows=[...list.querySelectorAll('[role="option"]')];for(const [i,row] of rows.entries())row.setAttribute('aria-selected',String(i===selected));const row=rows[selected];if(row){input.setAttribute('aria-activedescendant',row.id);if(scroll)row.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
 function setScope(id){scope=id;selected=0;render(true);announce();}
 function render(animate=false){const all=source(),query=input.value.trim().toLowerCase(),filtered=all.filter(item=>matches(item.title+' '+(item.detail||''),query));items=filtered.filter(item=>scope==='all'||item.scope===scope);
  scopes.replaceChildren();for(const [id,label] of [['all','All'],['threads','Threads'],['commands','Commands']]){const tab=document.createElement('button');tab.type='button';tab.role='tab';tab.textContent=label;tab.setAttribute('aria-selected',String(scope===id));tab.tabIndex=scope===id?0:-1;tab.dataset.scope=id;const count=id==='all'?filtered.length:filtered.filter(item=>item.scope===id).length;tab.append(span('spotlight-count',String(count)));tab.addEventListener('click',()=>{setScope(id);input.focus();});scopes.append(tab);}
  list.replaceChildren();let section='';for(const [index,item] of items.slice(0,100).entries()){
   if(item.scope!==section&&scope==='all'){section=item.scope;list.append(span('spotlight-section',section==='threads'?'Threads':'Commands'));}
   const row=document.createElement('div');row.className='spotlight-result';row.id='spotlight-option-'+index;row.role='option';row.dataset.result=item.id;
   const mark=document.createElement('span');mark.className='spotlight-result-icon';if(item.thread)mark.append(projectBadge(item.thread));else mark.innerHTML=icon(item.icon||'plus');
   const content=span('spotlight-result-content','');content.append(span('spotlight-result-title',item.title));
   if(item.thread){row.classList.add('spotlight-thread');row.dataset.status=item.thread.status||'idle';row.dataset.unread=String(!!item.thread.unread);const detail=span('spotlight-result-detail',''),project=span('spotlight-project',item.thread.project||'No project');project.title=project.textContent;detail.append(project);if(item.thread.branch){const branch=span('spotlight-branch','');branch.innerHTML=icon('branch');const name=span('',item.thread.branch);branch.append(name);branch.title=item.thread.branch;detail.append(branch);}content.append(detail);}else if(item.detail)content.append(span('spotlight-result-detail',item.detail));row.append(mark,content);
   if(item.thread){const thread=item.thread;if(thread.diff?.scope==='chat'&&(thread.diff.added||thread.diff.removed)){const diff=span('thread-diff','');diff.append(span('thread-added','+'+thread.diff.added),span('thread-removed','−'+thread.diff.removed));diff.setAttribute('aria-label','Chat lines added and removed');row.append(diff);}row.append(threadProviders(thread),threadState(thread));}
   if(item.thread){const age=span('spotlight-age thread-age','');age.dataset.started=item.thread.status==='working'?String(item.thread.startedAt||item.thread.modified):'';age.dataset.modified=String(item.thread.modified);row.append(age);}
   row.addEventListener('pointermove',()=>highlight(index));row.addEventListener('click',()=>run(index));list.append(row);
  }
  items=items.slice(0,100);input.setAttribute('aria-expanded',String(items.length>0));
  if(!items.length){const empty=span('spotlight-empty','No results');empty.role='status';list.append(empty);}
  tickThreadTimes(list);highlight(selected);list.scrollTop=0;updateFade();
  if(animate&&!document.documentElement.classList.contains('reduce-motion')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)list.animate([{opacity:.65},{opacity:1}],{duration:100,easing:'ease-out'});
 }
 function updateFade(){list.dataset.top=String(list.scrollTop>1);list.dataset.bottom=String(list.scrollHeight-list.scrollTop-list.clientHeight>1);}
 new ResizeObserver(updateFade).observe(list);list.addEventListener('scroll',updateFade,{passive:true});
 function cancelClose(){if(!closing)return;closeId++;closing=false;fades.forEach(animation=>animation.cancel());fades=[];}
 function close(instant=false){if(!dialog.open||closing)return;cancelContentFade?.();const id=++closeId,done=()=>{if(id!==closeId)return;dialog.close();closing=false;previousFocus?.focus({preventScroll:true});};if(instant||document.documentElement.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches){done();return;}closing=true;fades=[...dialog.children].map(element=>element.animate([{opacity:1},{opacity:0}],{duration:110,easing:'ease-out'}));Promise.all(fades.map(animation=>animation.finished)).then(done).catch(done);}
 function run(index=selected){const item=items[index];if(!item)return;close(true);void item.run();}
 dialog.querySelector('.spotlight-close').addEventListener('click',()=>close());
 dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
 input.addEventListener('input',()=>{selected=0;render(true);clearTimeout(announceTimer);announceTimer=setTimeout(announce,250);});
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(true);return;}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();highlight((selected+(event.key==='ArrowDown'?1:-1)+items.length)%Math.max(1,items.length),true);}if(event.key==='Enter'){event.preventDefault();run();}if(event.key==='Tab'){const ids=['all','threads','commands'];if(event.ctrlKey){event.preventDefault();setScope(ids[(ids.indexOf(scope)+(event.shiftKey?2:1))%3]);input.focus();}else{const stops=[...dialog.querySelectorAll('input,button:not([tabindex="-1"])')],at=stops.indexOf(document.activeElement),next=stops[(at+(event.shiftKey?stops.length-1:1))%stops.length];event.preventDefault();next.focus();}}if((event.key==='ArrowLeft'||event.key==='ArrowRight')&&event.target.getAttribute?.('role')==='tab'){event.preventDefault();const ids=['all','threads','commands'];setScope(ids[(ids.indexOf(scope)+(event.key==='ArrowRight'?1:2))%3]);scopes.querySelector('[aria-selected=true]').focus();}if((event.ctrlKey||event.metaKey)&&event.key==='k'){event.preventDefault();event.stopPropagation();if(closing)cancelClose();else close(true);}});
 setInterval(()=>{if(dialog.open)tickThreadTimes(list);},1000);
 document.addEventListener('suffice-thread-directory',()=>{if(dialog.open)render();});
 return {open({keyboard=false}={}){if(dialog.open){cancelClose();input.focus();return;}previousFocus=document.activeElement;scope='all';selected=0;input.value='';render();dialog.showModal();syncGlass();input.focus();cancelContentFade=fadeGlassContent(dialog);},close};
}
