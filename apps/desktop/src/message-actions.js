import {icon} from './ui.js';
import {providerMark} from './provider-icons.js';
import {sentAttachmentGrid} from './attachment-view.js';
import {messageAsMarkdown} from './message-export.js';
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
  const copyText=info.role==='user'?info.text:[...info.texts.values()].filter(Boolean).join('\n\n');
  const copy=document.createElement('button');copy.disabled=!copyText?.trim();copy.title=copy.disabled?'No response text to copy':'Copy';copy.type='button';copy.className='message-copy';copy.setAttribute('aria-label',info.role==='user'?'Copy message':'Copy full response');copy.innerHTML=icon('copy');copy.onclick=async()=>{try{await navigator.clipboard.writeText(copyText);copy.innerHTML=icon('tick');copy.setAttribute('aria-label','Copied');}catch{copy.innerHTML=icon('warning');copy.setAttribute('aria-label','Copy failed');}};const markdown=document.createElement('button');markdown.type='button';markdown.className='message-action message-copy-markdown';markdown.disabled=copy.disabled;markdown.title=markdown.disabled?'Nothing to copy':'Copy as Markdown';markdown.setAttribute('aria-label','Copy as Markdown');markdown.innerHTML=icon('code');markdown.onclick=async()=>{try{await navigator.clipboard.writeText(messageAsMarkdown(info.role,copyText,info.attachments));markdown.innerHTML=icon('tick');markdown.setAttribute('aria-label','Copied as Markdown');}catch{markdown.innerHTML=icon('warning');markdown.setAttribute('aria-label','Copy failed');}};
  const tools=[copy,markdown];
  // Edit-and-resend applies to the newest user message only, and only while the chat is idle.
  if(info.role==='user'&&[...transcript.querySelectorAll('.thread-user')].at(-1)===info.anchor&&workspace.querySelector('.composer')?.dataset.running!=='true'){const edit=document.createElement('button');edit.type='button';edit.className='message-action message-edit';edit.title='Edit and resend';edit.setAttribute('aria-label','Edit and resend');edit.innerHTML=icon('pencil');edit.onclick=()=>{hide();document.dispatchEvent(new CustomEvent('suffice-edit-last',{detail:{text:copyText}}));};tools.unshift(edit);}
  if(info.role==='assistant')bar.prepend(...tools);else bar.append(...tools);bar.hidden=false;position();
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
  user(element,{timestamp,text,attachments=[],images=[]}={}){const info={role:'user',anchor:element,timestamp,attachments,text:text??element.textContent};register(element,info);const grid=sentAttachmentGrid(attachments,images);if(grid){element.before(grid);register(grid,info);}return info;},
  turn(meta={},active=false){return {role:'assistant',meta:{...meta},active,anchor:null,texts:new Map()};},
  assistant(element,turn,text){turn.anchor=element;turn.texts.set(element,text);register(element,turn);},
  work(element,turn){turn.anchor=element;register(element,turn);},
  complete(turn,meta={}){Object.assign(turn.meta,meta);turn.active=false;if(hovered===turn){hide();show(turn);}}
 };
}
