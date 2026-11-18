import {WHATS_NEW,RELEASE,seen,markSeen} from './whats-new-data.js';
import {icon} from './ui.js';
import './whats-new.css';
// "What's new" sheet: shown once after an update, and from Cmd+K. `run(item)` opens the feature.
export function createWhatsNew({run,mod}){
 const dialog=document.createElement('dialog');dialog.className='whats-new';dialog.setAttribute('aria-labelledby','whats-new-title');
 dialog.innerHTML=`<header class="whats-new-head"><div><h2 id="whats-new-title">What's new</h2><p>Added in this update</p></div><button type="button" class="whats-new-close" aria-label="Close">${icon('close')}</button></header><ul class="whats-new-list"></ul><footer class="whats-new-foot"><button type="button" class="whats-new-done">Done</button></footer>`;
 document.body.append(dialog);
 const list=dialog.querySelector('.whats-new-list');
 for(const item of WHATS_NEW){
  const li=document.createElement('li');li.dataset.id=item.id;
  const text=document.createElement('div');text.className='whats-new-text';
  const title=document.createElement('strong');title.textContent=item.title;
  const line=document.createElement('span');line.textContent=item.line;
  const entry=document.createElement('span');entry.className='whats-new-entry';
  for(const part of item.entry){const k=document.createElement('kbd');k.textContent=part==='mod'?mod:part;entry.append(k);}
  text.append(title,line,entry);
  const go=document.createElement('button');go.type='button';go.className='whats-new-try';go.textContent='Try it';go.setAttribute('aria-label','Try '+item.title);
  go.addEventListener('click',()=>{close();run(item);});
  li.append(text,go);list.append(li);
 }
 let previous;
 function close(){if(!dialog.open)return;markSeen();dialog.close();previous?.focus?.({preventScroll:true});}
 dialog.querySelector('.whats-new-close').addEventListener('click',close);dialog.querySelector('.whats-new-done').addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
 function open(){if(dialog.open)return;previous=document.activeElement;dialog.showModal();dialog.querySelector('.whats-new-try').focus();}
 // A hidden window (tests, background launch) never auto-opens; the sheet waits for a visible one.
 function maybeShow(){if(seen()===RELEASE||document.visibilityState!=='visible'||window.sufficeDesktop?.testHidden)return false;open();return true;}
 return {open,close,maybeShow};
}
