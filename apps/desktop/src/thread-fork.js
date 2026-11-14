import {createMenu} from './menu.js';
export function connectThreadFork(list,{api,toast,onFork}){
 const popup=document.createElement('div');popup.className='popover thread-fork-menu';popup.hidden=true;document.body.append(popup);const menu=createMenu(popup);let selected;
 list.addEventListener('contextmenu',event=>{if(event.defaultPrevented)return;const row=event.target.closest('.thread-row');if(!row||row.dataset.status==='working')return;event.preventDefault();selected=row.dataset.thread;menu.open(row,[{label:'Fork conversation',icon:'branch',action:'fork-conversation'}],'Conversation');popup.style.left=Math.min(event.clientX,innerWidth-popup.offsetWidth-8)+'px';popup.style.top=Math.min(event.clientY,innerHeight-popup.offsetHeight-8)+'px';});
 popup.addEventListener('click',event=>{if(event.target.closest('[data-menu-action="fork-conversation"]')){menu.close();document.dispatchEvent(new CustomEvent('suffice-fork-thread',{detail:{id:selected}}));}});
 document.addEventListener('suffice-fork-thread',async event=>{try{const fork=await api.forkThread(event.detail.id);if(fork)await onFork(fork);}catch(error){toast(error.message);}});
}
