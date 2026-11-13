import {icon} from './ui.js';
export function connectSendControls(form,prompt,send){
 let running=false,control=false,drawn=null;
 // swapping the icon mid-click (focusout fires between mousedown and mouseup) drops the click, so only swap on a real change
 function render(){if(drawn!==running)send.innerHTML=running?'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor"/></svg>':icon('arrow');drawn=running;send.setAttribute('aria-label',running?'Stop task':'Start session');send.title=send.getAttribute('aria-label');form.dataset.running=String(running);form.backgroundIntent=control;}
 form.setRunning=value=>{running=value;render();};
 document.addEventListener('keydown',event=>{if(event.key==='Control'&&form.contains(document.activeElement)){control=true;render();}});
 document.addEventListener('keyup',event=>{if(event.key==='Control'){control=false;render();}});
 window.addEventListener('blur',()=>{control=false;render();});
 form.addEventListener('focusout',()=>queueMicrotask(()=>{if(!form.contains(document.activeElement)){control=false;render();}}));
 prompt.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey)form.backgroundSubmit=event.ctrlKey;},true);
 render();
}
