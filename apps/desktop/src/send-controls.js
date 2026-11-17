import {preference} from './settings-preferences.js';
import {icon} from './ui.js';
export function connectSendControls(form,prompt,send){
 let running=false,control=false,displayed;
 function render(){const preferred=preference('working-send','Steer');form.workingSendMode=control?(preferred==='Queue'?'Steer':'Queue'):preferred;const stopping=running&&!prompt.value.trim()&&!form.attachments?.count;if(displayed!==stopping){displayed=stopping;send.innerHTML=stopping?'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3.5" fill="currentColor"/></svg>':icon('arrow');}send.setAttribute('aria-label',stopping?'Stop task':running?(form.workingSendMode==='Queue'?'Queue message':'Steer agent'):'Start session');send.title=send.getAttribute('aria-label');form.dataset.running=String(running);form.backgroundIntent=!running&&control&&preference('send','Enter')==='Enter';}
 form.setRunning=value=>{running=value;render();};
 document.addEventListener('keydown',event=>{if(event.key==='Control'&&form.contains(document.activeElement)){control=true;render();}});
 document.addEventListener('keyup',event=>{if(event.key==='Control'){control=false;render();}});
 window.addEventListener('blur',()=>{control=false;render();});
 form.addEventListener('focusout',()=>queueMicrotask(()=>{if(!form.contains(document.activeElement)){control=false;render();}}));
 prompt.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){form.backgroundSubmit=!running&&event.ctrlKey&&preference('send','Enter')==='Enter';if(running){const preferred=preference('working-send','Steer');form.workingSendMode=event.ctrlKey?(preferred==='Queue'?'Steer':'Queue'):preferred;}}},true);
 prompt.addEventListener('input',render);
 document.addEventListener('suffice-preference',event=>{if(['send','working-send'].includes(event.detail.id))render();});
 render();
}
