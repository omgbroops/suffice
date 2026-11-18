import {icon} from './ui.js';
import {providerMark} from './provider-icons.js';
import {sentAttachmentGrid} from './attachment-view.js';
const duration=ms=>ms<1000?'<1s':ms<60000?`${Math.floor(ms/1000)}s`:`${Math.floor(ms/60000)}m ${Math.floor(ms/1000)%60}s`;
export function connectMessageActions(workspace,transcript){
 const owners=new WeakMap(),bar=document.createElement('div');bar.className='message-toolbar';bar.hidden=true;bar.setAttribute('role','toolbar');workspace.append(bar);let shown=null,hovered=null,timer;
 const owner=node=>{while(node&&node!==workspace){if(owners.has(node))return owners.get(node);node=node.parentElement;}return null;};
 function hide(){clearTimeout(timer);bar.hidden=true;shown=null;}
 function position(){if(!shown?.anchor?.isConnected||shown.active){hide();return;}const anchor=shown.anchor.getBoundingClientRect(),host=workspace.getBoundingClientRect(),viewport=transcript.getBoundingClientRect();if(anchor.bottom<viewport.top||anchor.top>viewport.bottom){hide();return;}const composer=workspace.querySelector('.composer')?.getBoundingClientRect();if(composer&&anchor.bottom+6+bar.offsetHeight>composer.top&&anchor.bottom<composer.bottom){bar.hidden=true;return;}const left=shown.role==='user'?anchor.right-bar.offsetWidth:anchor.left;bar.style.left=Math.max(10,Math.min(host.width-bar.offsetWidth-10,left-host.left))+'px';bar.style.top=anchor.bottom-host.top+6+'px';}
 function show(info){
  clearTimeout(timer);if(info.active||!info.anchor?.isConnected){hide();return;}if(shown===info&&!bar.hidden){position();return;}shown=info;bar.replaceChildren();bar.dataset.role=info.role;bar.setAttribute('aria-label',info.role==='user'?'User message actions':'Agent turn actions');
  if(info.role==='user'&&Number.isFinite(info.timestamp)){const time=document.createElement('time'),date=new Date(info.timestamp);time.dateTime=date.toISOString();time.textContent=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(date);bar.append(time);}
  if(info.role==='assistant'){
   const meta=info.meta;if(Number.isFinite(meta.startedAt)&&Number.isFinite(meta.endedAt)){const elapsed=document.createElement('span');elapsed.className='message-turn-duration';elapsed.title='Full turn duration, including tools and approval waits';elapsed.textContent=duration(Math.max(0,meta.endedAt-meta.startedAt));bar.append(elapsed);}
   if(meta.model){const model=document.createElement('span');model.className='message-turn-model';if(meta.provider)model.append(providerMark(meta.provider));const label=document.createElement('span');label.textContent=meta.modelName||meta.model;model.append(label);model.title=[meta.provider,meta.model].filter(Boolean).join(' · ');bar.append(model);}
   if(meta.effort){const effort=document.createElement('span');effort.className='message-turn-effort';effort.textContent=meta.effort==='off'?'No reasoning':meta.effort[0].toUpperCase()+meta.effort.slice(1);bar.append(effort);}
  }
  let fork;if(info.entryId){fork=document.createElement('button');fork.type='button';fork.className='message-fork';const before=info.role==='user';fork.title=before?'Fork before this message and edit it':'Fork from here';fork.setAttribute('aria-label',fork.title);fork.innerHTML=icon('branch');fork.onclick=()=>{hide();document.dispatchEvent(new CustomEvent('suffice-fork-thread',{detail:{entryId:info.entryId,before,text:before?info.text:undefined}}));};}
  const copyText=info.role==='user'?info.text:[...info.texts.values()].filter(Boolean).join('\n\n');
  const copy=document.createElement('button');copy.disabled=!copyText?.trim();copy.title=copy.disabled?'No response text to copy':'Copy';copy.type='button';copy.className='message-copy';copy.setAttribute('aria-label',info.role==='user'?'Copy message':'Copy full response');copy.innerHTML=icon('copy');copy.onclick=async()=>{try{await navigator.clipboard.writeText(copyText);copy.innerHTML=icon('tick');copy.setAttribute('aria-label','Copied');}catch{copy.innerHTML=icon('warning');copy.setAttribute('aria-label','Copy failed');}};if(info.role==='assistant')bar.prepend(copy);else bar.append(copy);if(fork)copy.after(fork);bar.hidden=false;position();
 }
 function register(element,info){owners.set(element,info);if(element.matches('.thread-message'))element.tabIndex=0;}
 workspace.addEventListener('pointerover',event=>{if(bar.contains(event.target))return;const info=owner(event.target);hovered=info;if(info)show(info);});
 workspace.addEventListener('pointerout',event=>{const from=owner(event.target),to=owner(event.relatedTarget);if(from&&from!==to&&!bar.contains(event.relatedTarget)){hovered=to;clearTimeout(timer);timer=setTimeout(hide,120);}});
 workspace.addEventListener('focusin',event=>{const info=owner(event.target);if(info)show(info);});
 bar.addEventListener('pointerenter',()=>clearTimeout(timer));bar.addEventListener('pointerleave',()=>{timer=setTimeout(hide,120);});
 bar.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide();}});
 workspace.addEventListener('focusout',event=>{if(!event.relatedTarget)return;if(!workspace.contains(event.relatedTarget)||(!owner(event.relatedTarget)&&!bar.contains(event.relatedTarget)))hide();});
 transcript.addEventListener('scroll',()=>{hovered=null;hide();},{passive:true});window.addEventListener('blur',hide);new ResizeObserver(()=>{if(shown)position();}).observe(workspace);
 const composer=workspace.querySelector('.composer');if(composer)new ResizeObserver(()=>{if(shown)position();}).observe(composer);
 return {
  hide,
  reposition(){if(shown)position();},
  user(element,{timestamp,text,attachments=[],images=[],entryId}={}){const info={role:'user',anchor:element,timestamp,text:text??element.textContent,entryId};register(element,info);const grid=sentAttachmentGrid(attachments,images);if(grid){element.before(grid);register(grid,info);}return info;},
  turn(meta={},active=false){return {role:'assistant',meta:{...meta},active,anchor:null,texts:new Map()};},
  assistant(element,turn,text,entryId){if(entryId)turn.entryId=entryId;turn.anchor=element;turn.texts.set(element,text);register(element,turn);},
  work(element,turn){turn.anchor=element;register(element,turn);},
  complete(turn,meta={}){Object.assign(turn.meta,meta);turn.active=false;if(hovered===turn){hide();show(turn);}}
 };
}
