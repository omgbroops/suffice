import {connectOverlayScrollbar} from './overlay-scrollbar.js';
import {threadViewState} from './thread-view-state.js';
import {icon} from './ui.js';
import {actionTitle} from './action-display.js';
import {leadLine,hint,createLater} from './permission-card.js';

export function connectApprovals(api,toast,agent='Suffice'){
 const form=document.querySelector('.composer'),prompt=form.querySelector('textarea'),requests=new Map();let shown=null,disconnectPreview=()=>{};
 let panel=null,later=null,offKeys=()=>{},always=new Set(); // panel is in the DOM only while a request is pending; always = exact requests the user allowed for this app run
 const signature=event=>event.name+':'+JSON.stringify(event.input??{});
 const key=event=>`${event.threadId||event.clientId}:${event.requestId}`;
 const belongs=event=>[event.threadId,event.clientId].filter(Boolean).includes(threadViewState.id);
 function draw(){
  document.dispatchEvent(new Event('suffice-approvals'));
  const next=[...requests.entries()].find(([,event])=>belongs(event));
  if(!next){disconnectPreview();disconnectPreview=()=>{};const hadFocus=!!panel?.contains(document.activeElement);shown=null;offKeys();later?.drop();panel?.remove();panel=null;delete form.dataset.approval;for(const child of form.children)if(child!==panel)child.inert=false;form.resizePrompt?.();if(hadFocus)prompt.focus({preventScroll:true});return;}
  if(shown===next[0])return;disconnectPreview();shown=next[0];const event=next[1];offKeys();later?.drop();panel?.remove();panel=document.createElement('section');panel.className='composer-approval';panel.setAttribute('aria-label','Agent approval');form.append(panel);form.dataset.approval='true';for(const child of form.children)if(child!==panel)child.inert=true;
  const title=document.createElement('h3');title.textContent='Allow this action?';
  const heading=document.createElement('div');heading.className='approval-action';heading.innerHTML=icon('terminal');const name=document.createElement('span');name.textContent=actionTitle({name:event.name,text:JSON.stringify(event.input??{})});heading.append(name);
  const preview=document.createElement('pre');preview.className='approval-preview';preview.tabIndex=0;preview.setAttribute('aria-label','Requested action');const code=document.createElement('code');code.textContent=event.name==='codemode'&&typeof event.input?.code==='string'?event.input.code:typeof event.input?.command==='string'?event.input.command:JSON.stringify(event.input??{},null,2);preview.append(code);const previewHost=document.createElement('div');previewHost.className='approval-preview-host';previewHost.append(preview);
  const footer=document.createElement('div');footer.className='approval-controls';
  const deny=document.createElement('button'),always_=document.createElement('button'),allow=document.createElement('button');for(const button of [deny,always_,allow]){button.type='button';button.className='provider-dialog-button';}deny.textContent='Deny';always_.textContent='Always allow';allow.textContent='Allow';hint(allow,'Ctrl ↵','Control+Enter');allow.classList.add('provider-dialog-primary');
  let answering=false;const answer=async(value,remember)=>{if(answering)return;if(remember)always.add(signature(event));answering=true;deny.disabled=always_.disabled=allow.disabled=true;try{await api.approvalAnswer({threadId:event.threadId||event.clientId,requestId:event.requestId,allow:value});requests.delete(key(event));shown=null;draw();}catch(error){toast(error.message);answering=false;deny.disabled=always_.disabled=allow.disabled=false;}};
  deny.onclick=()=>void answer(false);allow.onclick=()=>void answer(true);always_.onclick=()=>void answer(true,true);later=createLater(form,panel);
  const keys=e=>{if(panel.hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();later.later();}else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.stopPropagation();void answer(true);}};document.addEventListener('keydown',keys,true);offKeys=()=>document.removeEventListener('keydown',keys,true);
  footer.append(later.button,deny,always_,allow);panel.append(leadLine(agent,'Command'),heading,previewHost,title,footer);disconnectPreview=connectOverlayScrollbar(preview,{inset:6});
  void import('./code-highlight.js').then(({colorCode})=>colorCode(code,event.name==='codemode'?'input.js':event.name==='bash'?'input.sh':'input.json')).catch(()=>{});
  if(form.contains(document.activeElement))deny.focus({preventScroll:true});
 }
 threadViewState.subscribe(event=>{if(['select','adopt','remove'].includes(event.type))draw();});
 form.addEventListener('submit',event=>{if(form.dataset.approval==='true'){event.preventDefault();event.stopImmediatePropagation();}},true);
 const receive=event=>{
  if(event.event==='approval'&&always.has(signature(event))){void api.approvalAnswer({threadId:event.threadId||event.clientId,requestId:event.requestId,allow:true}).catch(error=>toast(error.message));}
  else if(event.event==='approval'){requests.set(key(event),event);draw();}
  if(event.event==='approval_resolved'){requests.delete(key(event));shown=null;draw();}
  if(event.event==='background_completed'){for(const [id,pending] of requests)if([pending.threadId,pending.clientId].includes(event.threadId))requests.delete(id);shown=null;draw();}
 };api.onEvent(receive);
 return {pending:()=>[...requests.values()],receive,restore:(threadId,pending)=>{for(const [id,event] of requests)if([event.threadId,event.clientId].includes(threadId))requests.delete(id);for(const event of pending)requests.set(key(event),event);shown=null;draw();},clear:threadId=>{for(const [id,event] of requests)if([event.threadId,event.clientId].includes(threadId))requests.delete(id);shown=null;draw();}};
}
