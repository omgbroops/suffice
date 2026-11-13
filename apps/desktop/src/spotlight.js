import {icon} from './ui.js';
import {projectBadge} from './thread-row.js';
import {getThreadDirectory} from './thread-directory.js';
import './spotlight.css';
// A floating command surface, independent of the sidebar's visible/filter state.
export function createSpotlight({commands}){
 const dialog=document.createElement('dialog');dialog.className='spotlight';dialog.setAttribute('aria-label','Search Suffice');
 dialog.innerHTML=`<div class="spotlight-search">${icon('search')}<input id="spotlight-query" type="search" placeholder="Search threads and commands…" aria-label="Search threads and commands" role="combobox" aria-expanded="true" aria-controls="spotlight-results" aria-autocomplete="list" autocomplete="off" spellcheck="false"><button class="spotlight-close" aria-label="Close search">${icon('close')}</button></div><div class="spotlight-scopes" role="tablist" aria-label="Search scope"></div><div id="spotlight-results" class="spotlight-results" role="listbox" aria-label="Search results"></div><footer class="spotlight-footer"><span><kbd>Enter</kbd> Open</span><span><kbd>↑</kbd><kbd>↓</kbd> Navigate <kbd>Tab</kbd> Scope <kbd>Esc</kbd> Close</span></footer>`;
 document.body.append(dialog);const input=dialog.querySelector('input'),list=dialog.querySelector('.spotlight-results'),scopes=dialog.querySelector('.spotlight-scopes');
 let scope='all',selected=0,items=[],previousFocus,animation;
 const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const span=(cls,text)=>{const el=document.createElement('span');el.className=cls;el.textContent=text;return el;};
 const matches=(text,query)=>query.split(/\s+/).every(term=>text.toLowerCase().includes(term));
 function source(){const directory=getThreadDirectory();const threads=directory.threads.map(thread=>({id:'thread:'+thread.id,scope:'threads',title:thread.title,detail:[thread.project||'No project',thread.branch].filter(Boolean).join(' · '),thread,run:()=>directory.open(thread.id)}));return [...threads,...commands().map(command=>({...command,scope:'commands'}))];}
 function highlight(index,scroll=false){selected=Math.max(0,Math.min(index,items.length-1));const rows=[...list.querySelectorAll('[role="option"]')];for(const [i,row] of rows.entries())row.setAttribute('aria-selected',String(i===selected));const row=rows[selected];if(row){input.setAttribute('aria-activedescendant',row.id);if(scroll)row.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
 function render(animate=false){const all=source(),query=input.value.trim().toLowerCase(),filtered=all.filter(item=>matches(item.title+' '+(item.detail||''),query));items=filtered.filter(item=>scope==='all'||item.scope===scope);
  scopes.replaceChildren();for(const [id,label] of [['all','All'],['threads','Threads'],['commands','Commands']]){const tab=document.createElement('button');tab.type='button';tab.role='tab';tab.textContent=label;tab.setAttribute('aria-selected',String(scope===id));const count=id==='all'?filtered.length:filtered.filter(item=>item.scope===id).length;tab.append(span('spotlight-count',String(count)));tab.addEventListener('click',()=>{scope=id;selected=0;render(true);input.focus();});scopes.append(tab);}
  list.replaceChildren();let section='';for(const [index,item] of items.slice(0,100).entries()){
   if(item.scope!==section&&scope==='all'){section=item.scope;list.append(span('spotlight-section',section==='threads'?'Threads':'Commands'));}
   const row=document.createElement('div');row.className='spotlight-result';row.id='spotlight-option-'+index;row.role='option';row.dataset.result=item.id;
   const mark=document.createElement('span');mark.className='spotlight-result-icon';if(item.thread)mark.append(projectBadge(item.thread));else mark.innerHTML=icon(item.icon||'plus');
   const content=span('spotlight-result-content','');content.append(span('spotlight-result-title',item.title));if(item.detail)content.append(span('spotlight-result-detail',item.detail));row.append(mark,content);
   if(item.thread){const age=span('spotlight-age','');const minutes=Math.max(0,Math.floor((Date.now()-item.thread.modified)/60000));age.textContent=minutes<1?'now':minutes<60?minutes+'m':minutes<1440?Math.floor(minutes/60)+'h':Math.floor(minutes/1440)+'d';row.append(age);}
   row.addEventListener('pointermove',()=>highlight(index));row.addEventListener('click',()=>run(index));list.append(row);
  }
  items=items.slice(0,100);
  if(!items.length){const empty=span('spotlight-empty','No results');empty.role='status';list.append(empty);}
  highlight(selected);list.scrollTop=0;updateFade();
  if(animate&&!reduce())list.animate([{opacity:.65},{opacity:1}],{duration:100,easing:'ease-out'});
 }
 function updateFade(){list.dataset.top=String(list.scrollTop>1);list.dataset.bottom=String(list.scrollHeight-list.scrollTop-list.clientHeight>1);}
 new ResizeObserver(updateFade).observe(list);list.addEventListener('scroll',updateFade,{passive:true});
 function close(instant=false){if(!dialog.open)return;animation?.cancel();const done=()=>{dialog.close();previousFocus?.focus({preventScroll:true});};if(instant||reduce()){done();return;}animation=dialog.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(-3px) scale(.99)'}],{duration:110,easing:'ease-out'});animation.finished.then(done).catch(()=>{});}
 function run(index=selected){const item=items[index];if(!item)return;close(true);void item.run();}
 dialog.querySelector('.spotlight-close').addEventListener('click',()=>close());
 dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
 input.addEventListener('input',()=>{selected=0;render(true);});
 dialog.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();highlight((selected+(event.key==='ArrowDown'?1:-1)+items.length)%Math.max(1,items.length),true);}if(event.key==='Enter'){event.preventDefault();run();}if(event.key==='Tab'){event.preventDefault();const ids=['all','threads','commands'];scope=ids[(ids.indexOf(scope)+(event.shiftKey?2:1))%3];selected=0;render();input.focus();}if((event.ctrlKey||event.metaKey)&&event.key==='k'){event.preventDefault();event.stopPropagation();close(true);}});
 return {open({keyboard=false}={}){if(dialog.open){input.focus();return;}previousFocus=document.activeElement;scope='all';selected=0;input.value='';render();dialog.showModal();input.focus();animation?.cancel();if(!reduce())animation=dialog.animate([{opacity:0,transform:'translateY(-6px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:180,easing:getComputedStyle(dialog).getPropertyValue('--ease-out').trim()||'ease-out'});},close};
}
