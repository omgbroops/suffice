import {threadViewState} from './thread-view-state.js';
export function connectComposerSize(form,prompt){
 let width=0,frame=0;
 function fit(){frame=0;const max=Math.min(280,innerHeight*.38);prompt.style.height='0px';const height=Math.max(64,Math.min(max,prompt.scrollHeight));prompt.style.height=height+'px';prompt.style.overflowY=prompt.scrollHeight>height+1?'auto':'hidden';}
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(fit);};
 form.resizePrompt=schedule;prompt.addEventListener('input',schedule);window.addEventListener('resize',schedule);
 threadViewState.subscribe(event=>{if(event.type==='select'||event.type==='adopt')schedule();});
 new ResizeObserver(()=>{const next=prompt.clientWidth;if(next!==width){width=next;schedule();}}).observe(prompt);
 fit();
}
