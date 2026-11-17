import {icon} from './ui.js';
import {threadState} from './thread-row.js';
import {el} from './sessions-util.js';
import './sessions-header.css';

// Session header: title, state dot, Chat/Terminal toggle, attach-command copy, controls strip (built by sessions-controls).
export function createHeader(c){
 return function paintHeader(){
  if(!c.active)return;
  const s=c.active.s,status=c.statusOf(s),{header,sx,toast}=c;
  header.className='thread-header thread-header--session';header.dataset.status=status;header.contentEditable='false';header.replaceChildren(); // plaintext-only editing flattens child controls into text
  header.append(el('span','session-title',c.name(s)));
  const dot=threadState({status},{unread:false});dot.classList.add('session-state');header.append(dot);
  const seg=el('div','settings-segment session-toggle');seg.role='group';
  for(const [k,t] of [['chat','Chat'],['terminal','Terminal']]){const b=el('button','',t);b.type='button';b.setAttribute('aria-pressed',String(c.mode===k));b.addEventListener('click',()=>{if(c.mode!==k)c.setMode(k);});seg.append(b);}
  const copy=el('button','session-copy');copy.type='button';copy.innerHTML=icon('copy');
  copy.title='Copy the tmux attach command';copy.setAttribute('aria-label','Open in terminal: copy the tmux attach command');
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(s.attachCommand||await sx.attachCommand(s.id));toast('Attach command copied');}catch(e){toast(e.message);}});
  c.metaEl=el('span','session-meta');c.metaSig='';header.append(c.metaEl,seg,copy);c.paintMeta();
 };
}
