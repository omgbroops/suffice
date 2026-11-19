import {icon} from './ui.js';
import {sentAttachmentGrid} from './attachment-view.js';
import {messageAsMarkdown} from './message-export.js';
const duration=ms=>ms<1000?'<1s':ms<60000?`${Math.floor(ms/1000)}s`:`${Math.floor(ms/60000)}m ${Math.floor(ms/1000)%60}s`;
// Long prompts collapse to 288px with a bottom fade; click or Enter/Space expands.
export function clampLong(element,text=element.textContent){
 if((text||'').length<=420)return;element.dataset.clamp='true';element.tabIndex=0;element.setAttribute('role','button');element.setAttribute('aria-expanded','false');
 const flip=()=>{const open=element.dataset.clamp==='true';element.dataset.clamp=open?'false':'true';element.setAttribute('aria-expanded',String(open));};
 element.addEventListener('click',()=>{if(!getSelection()?.toString())flip();});
 element.addEventListener('keydown',event=>{if(event.target===element&&(event.key==='Enter'||event.key===' ')){event.preventDefault();flip();}});
}
export function connectMessageActions(workspace,transcript){
 const owners=new WeakMap(),bar=document.createElement('div');bar.className='message-toolbar';bar.hidden=true;bar.setAttribute('role','toolbar');workspace.append(bar);let shown=null,hovered=null,timer;
 const owner=node=>{while(node&&node!==workspace){if(owners.has(node))return owners.get(node);node=node.parentElement;}return null;};
 function hide(){clearTimeout(timer);bar.hidden=true;shown=null;}
 // The bar sits in normal flow: a reserved slot right after the message holds it, so it never covers the next message.
 const slotAfter=anchor=>anchor?.nextElementSibling?.classList.contains('message-actions-slot')?anchor.nextElementSibling:null;
 function ensureSlot(anchor,role){if(!anchor?.parentNode)return null;let slot=slotAfter(anchor);if(!slot){slot=document.createElement('div');slot.className='message-actions-slot';anchor.after(slot);}slot.dataset.role=role;return slot;}
 const lazyBars=new WeakMap(),lazyIO=new IntersectionObserver(entries=>{for(const e of entries){const turn=lazyBars.get(e.target);if(!turn||turn.active)continue;if(e.isIntersecting){if(!turn.bar.firstChild)fill(turn.bar,turn);}else{turn.bar.replaceChildren();turn.bar.hidden=true;}}},{rootMargin:'1200px 0px'});
 function place(turn){if(turn.active||!turn.anchor?.parentNode)return;const slot=ensureSlot(turn.anchor,'assistant');if(turn.slotEl&&turn.slotEl!==slot)turn.slotEl.remove();turn.slotEl=slot;if(!turn.bar){turn.bar=document.createElement('div');turn.bar.className='message-toolbar';turn.bar.setAttribute('role','toolbar');}
  // Long transcripts build each turn's bar only while its slot is near the viewport, so the DOM stays bounded.
  if(turn.lazy??=turn.anchor.parentNode.childElementCount>240){lazyBars.set(slot,turn);lazyIO.observe(slot);if(turn.bar.firstChild)fill(turn.bar,turn);else turn.bar.hidden=true;}else fill(turn.bar,turn);
  if(turn.bar.parentNode!==slot)slot.append(turn.bar);}
 function position(){if(!shown?.anchor?.isConnected||shown.active){hide();return;}const slot=ensureSlot(shown.anchor,shown.role);if(slot&&bar.parentNode!==slot)slot.append(bar);}
 function fill(bar,info){
  bar.replaceChildren();bar.dataset.role=info.role;bar.setAttribute('aria-label',info.role==='user'?'User message actions':'Agent turn actions');
  if(info.role==='user'&&Number.isFinite(info.timestamp)){const time=document.createElement('time'),date=new Date(info.timestamp);time.dateTime=date.toISOString();time.textContent=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(date);bar.append(time);}
  if(info.role==='assistant'){
   const meta=info.meta;if(Number.isFinite(meta.startedAt)&&Number.isFinite(meta.endedAt)){const elapsed=document.createElement('span');elapsed.className='message-turn-duration';elapsed.title='Full turn duration, including tools and approval waits';elapsed.textContent=duration(Math.max(0,meta.endedAt-meta.startedAt));bar.append(elapsed);}
   if(meta.model){const model=document.createElement('span');model.className='message-turn-model';const label=document.createElement('span');label.textContent=meta.modelName||meta.model;model.append(label);model.title=[meta.provider,meta.model].filter(Boolean).join(' · ');bar.append(model);}
   if(meta.effort){const effort=document.createElement('span');effort.className='message-turn-effort';effort.textContent=meta.effort==='off'?'No reasoning':meta.effort[0].toUpperCase()+meta.effort.slice(1);bar.append(effort);}
  }
  let fork;{fork=document.createElement('button');fork.type='button';fork.disabled=!info.entryId;fork.className='message-fork';const before=info.role==='user';fork.title=before?'Fork before this message and edit it':'Fork from here';fork.setAttribute('aria-label',fork.title);fork.innerHTML=icon('branch');fork.onclick=()=>{hide();document.dispatchEvent(new CustomEvent('suffice-fork-thread',{detail:{entryId:info.entryId,before,text:before?info.text:undefined}}));};}
  const copyText=info.role==='user'?info.text:[...info.texts.values()].filter(Boolean).join('\n\n');
  const copy=document.createElement('button');copy.disabled=!copyText?.trim();copy.title=copy.disabled?'No response text to copy':'Copy';copy.type='button';copy.className='message-copy';copy.setAttribute('aria-label',info.role==='user'?'Copy message':'Copy full response');copy.innerHTML=icon('copy');copy.onclick=async()=>{try{await navigator.clipboard.writeText(copyText);copy.innerHTML=icon('tick');copy.setAttribute('aria-label','Copied');}catch{copy.innerHTML=icon('warning');copy.setAttribute('aria-label','Copy failed');}};const markdown=document.createElement('button');markdown.type='button';markdown.className='message-action message-copy-markdown';markdown.disabled=copy.disabled;markdown.title=markdown.disabled?'Nothing to copy':'Copy as Markdown';markdown.setAttribute('aria-label','Copy as Markdown');markdown.innerHTML=icon('code');markdown.onclick=async()=>{try{await navigator.clipboard.writeText(messageAsMarkdown(info.role,copyText,info.attachments));markdown.innerHTML=icon('tick');markdown.setAttribute('aria-label','Copied as Markdown');}catch{markdown.innerHTML=icon('warning');markdown.setAttribute('aria-label','Copy failed');}};
  const tools=[copy,markdown];
  // Edit-and-resend applies to the newest user message only, and only while the chat is idle.
  if(info.role==='user'&&[...transcript.querySelectorAll('.thread-user')].at(-1)===info.anchor&&workspace.querySelector('.composer')?.dataset.running!=='true'){const edit=document.createElement('button');edit.type='button';edit.className='message-action message-edit';edit.title='Edit and resend';edit.setAttribute('aria-label','Edit and resend');edit.innerHTML=icon('pencil');edit.onclick=()=>{hide();document.dispatchEvent(new CustomEvent('suffice-edit-last',{detail:{text:copyText}}));};tools.unshift(edit);}
  if(info.role==='assistant')bar.prepend(...tools);else bar.append(...tools);if(fork)copy.after(fork);bar.hidden=false;
 }
 // Agent turns keep their own bar in the slot, always visible; only user messages share the hover bar.
 function show(info){
  clearTimeout(timer);if(info.role==='assistant'||info.active||!info.anchor?.isConnected){hide();return;}if(shown===info&&!bar.hidden){position();return;}shown=info;fill(bar,info);position();
 }
 function register(element,info){owners.set(element,info);if(element.matches('.thread-message'))element.tabIndex=0;}
 workspace.addEventListener('pointerover',event=>{if(bar.contains(event.target))return;const info=owner(event.target);hovered=info;if(info)show(info);});
 workspace.addEventListener('pointerout',event=>{const from=owner(event.target),to=owner(event.relatedTarget);if(from&&from!==to&&!bar.contains(event.relatedTarget)){hovered=to;clearTimeout(timer);timer=setTimeout(hide,120);}});
 workspace.addEventListener('focusin',event=>{const info=owner(event.target);if(info)show(info);});
 bar.addEventListener('pointerenter',()=>clearTimeout(timer));bar.addEventListener('pointerleave',()=>{timer=setTimeout(hide,120);});
 bar.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide();}});
 workspace.addEventListener('focusout',event=>{if(!event.relatedTarget)return;if(!workspace.contains(event.relatedTarget)||(!owner(event.relatedTarget)&&!bar.contains(event.relatedTarget)))hide();});
 transcript.addEventListener('scroll',()=>{hovered=null;},{passive:true});window.addEventListener('blur',hide);new ResizeObserver(()=>{if(shown)position();}).observe(workspace);
 const composer=workspace.querySelector('.composer');if(composer)new ResizeObserver(()=>{if(shown)position();}).observe(composer);
 return {
  hide,
  reposition(){if(shown)position();},
  user(element,{timestamp,text,attachments=[],images=[],entryId}={}){const info={role:'user',anchor:element,timestamp,text:text??element.textContent,attachments,entryId};register(element,info);ensureSlot(element,'user');clampLong(element,info.text);const grid=sentAttachmentGrid(attachments,images);if(grid){element.before(grid);register(grid,info);}return info;},
  turn(meta={},active=false){return {role:'assistant',meta:{...meta},active,anchor:null,texts:new Map()};},
  assistant(element,turn,text,entryId){if(entryId)turn.entryId=entryId;turn.anchor=element;turn.texts.set(element,text);register(element,turn);place(turn);},
  // Live messages get their transcript entry id after the turn is saved, which turns on their fork button.
  resolve(element,entryId){const info=owners.get(element);if(!info||!entryId)return;info.entryId=entryId;if(info.bar)fill(info.bar,info);else if(shown===info&&!bar.hidden){const at=bar.scrollTop;shown=null;show(info);bar.scrollTop=at;}},
  work(element,turn){turn.anchor=element;register(element,turn);place(turn);},
  complete(turn,meta={}){Object.assign(turn.meta,meta);turn.active=false;place(turn);}
 };
}
