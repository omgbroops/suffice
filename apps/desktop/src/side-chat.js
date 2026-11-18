import './side-chat.css';
import {icon} from './ui.js';
import {threadViewState as viewState} from './thread-view-state.js';
// Side chat: a read-only snapshot of the open thread for quick questions. Nothing typed here reaches the thread.
export function connectSideChat({api,form,toast,markdown}){
 const panel=document.createElement('aside');panel.className='side-chat';panel.id='side-chat';panel.setAttribute('aria-label','Side chat');panel.inert=true;panel.setAttribute('aria-hidden','true');
 panel.innerHTML=`<header class="side-chat-head"><div class="side-chat-heading"><h2 class="side-chat-title">Side chat</h2><p class="side-chat-note">Read-only copy of this thread. Nothing here is added to it.</p></div><button type="button" class="button button--ghost side-chat-tool" data-side="new" aria-label="Start a fresh side chat" title="Start fresh">${icon('refresh')}</button><button type="button" class="button button--ghost side-chat-tool" data-side="close" aria-label="Close side chat">${icon('close')}</button></header><div class="side-chat-log" role="log" aria-live="polite" tabindex="0"></div><form class="side-chat-form"><textarea class="side-chat-input" rows="1" placeholder="Ask about this thread" aria-label="Side question"></textarea><button type="submit" class="side-chat-send" aria-label="Send side question" disabled>${icon('arrow')}</button></form>`;
 document.querySelector('#app').append(panel);
 const log=panel.querySelector('.side-chat-log'),input=panel.querySelector('.side-chat-input'),send=panel.querySelector('.side-chat-send'),chat=panel.querySelector('form');
 const chats=new Map();let open=false,activeId=null;
 const eligible=()=>activeId&&!String(activeId).startsWith('session-')&&!String(activeId).startsWith('pending:')&&/^[a-f0-9]{32}$/.test(activeId);
 const state=id=>{let s=chats.get(id);if(!s){s={node:document.createElement('div'),running:false,draft:''};s.node.className='side-chat-messages';chats.set(id,s);}return s;};
 function empty(s){if(s.node.children.length)return;const hint=document.createElement('p');hint.className='side-chat-empty';hint.textContent='Ask a quick question. The agent reads this thread as it is now and can look at files, but cannot change anything.';s.node.append(hint);}
 function paint(){
  const s=eligible()?state(activeId):null;log.replaceChildren(...(s?[s.node]:[]));if(s)empty(s);
  input.disabled=!s;send.disabled=!s||s.running||!input.value.trim();input.value=s?.draft||'';size();log.scrollTop=log.scrollHeight;
 }
 function set(value){
  const next=!!value&&eligible();open=next;document.body.classList.toggle('side-chat-open',next);panel.inert=!next;panel.setAttribute('aria-hidden',String(!next));
  document.querySelector('.side-chat-toggle')?.setAttribute('aria-expanded',String(next));
  if(next){paint();requestAnimationFrame(()=>input.focus());setTimeout(()=>{if(open&&!panel.contains(document.activeElement))input.focus();},260);}
 }
 const size=()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,120)+'px';};
 function bubble(s,role,text){s.node.querySelector('.side-chat-empty')?.remove();const el=document.createElement('article');el.className=`side-chat-message side-chat-${role}`;if(role==='assistant'&&text)markdown(el,text);else el.textContent=text;s.node.append(el);if(s.node.isConnected)log.scrollTop=log.scrollHeight;return el;}
 async function ask(){
  const id=activeId,s=state(id),text=input.value.trim();if(!text||s.running||!eligible())return;
  s.running=true;input.value='';s.draft='';size();send.disabled=true;bubble(s,'user',text);
  const answer=bubble(s,'assistant','');answer.classList.add('side-chat-pending');answer.setAttribute('role','status');answer.textContent='Reading the thread';
  const clientId='side:'+id;let streamed='';
  const off=api.onEvent(event=>{if(event.clientId!==clientId)return;if(event.event==='assistant_start')streamed='';if(event.event==='text'){streamed+=event.text;answer.classList.remove('side-chat-pending');answer.removeAttribute('role');markdown(answer,streamed);if(s.node.isConnected)log.scrollTop=log.scrollHeight;}if(event.event==='tool_start'&&!streamed)answer.textContent='Looking at '+event.name;});
  try{
   const selection=form.modelSelection||{effort:'low'};
   const result=await api.sideRun({threadId:id,prompt:text,provider:selection.provider,model:selection.model,effort:selection.effort||'low',clientId});
   answer.classList.remove('side-chat-pending');answer.removeAttribute('role');markdown(answer,result?.text||streamed||'No answer.');
  }catch(error){answer.classList.remove('side-chat-pending');answer.classList.add('side-chat-error');answer.setAttribute('role','alert');answer.textContent=error.message;}
  finally{if(typeof off==='function')off();s.running=false;if(activeId===id){send.disabled=!input.value.trim();if(s.node.isConnected)log.scrollTop=log.scrollHeight;}}
 }
 async function end(id,{keep=false}={}){const s=chats.get(id);if(!s||s.running)return false;chats.delete(id);try{await api.sideEnd(id);}catch(error){toast(error.message);}if(keep&&activeId===id)paint();return true;}
 chat.addEventListener('submit',event=>{event.preventDefault();void ask();});
 input.addEventListener('input',()=>{const s=chats.get(activeId);if(s)s.draft=input.value;send.disabled=!input.value.trim()||!!s?.running;size();});
 input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();chat.requestSubmit();}});
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();set(false);document.querySelector('#prompt')?.focus();}});
 panel.addEventListener('click',async event=>{const control=event.target.closest('[data-side]');if(!control)return;if(control.dataset.side==='close'){set(false);document.querySelector('#prompt')?.focus();}if(control.dataset.side==='new'){if(chats.get(activeId)?.running){toast('Wait for the answer to finish');return;}await end(activeId,{keep:true});}});
 document.addEventListener('suffice-side-chat-toggle',()=>{if(eligible())set(!open);else toast('Open a thread to start a side chat');});
 document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.shiftKey&&!event.altKey&&event.code==='KeyU'){event.preventDefault();document.dispatchEvent(new Event('suffice-side-chat-toggle'));}});
 document.addEventListener('suffice-thread-deleted',event=>{const id=event.detail?.id;if(id)void end(id);});
 viewState.subscribe(event=>{if(event.type!=='select'&&event.type!=='adopt')return;activeId=event.id;if(open&&!eligible())set(false);else if(open)paint();});
 activeId=viewState.id;
 return {toggle:()=>document.dispatchEvent(new Event('suffice-side-chat-toggle')),isOpen:()=>open};
}
