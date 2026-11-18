import {el} from './sessions-util.js';
import {paintTerminalTab} from './session-state-chip.js';
import './sessions-terminal.css';

// Terminal view of a session: one xterm per session on the shared glass. Switching is instant, no animation.
export function createTerminal(c){
 const {workspace}=c;
 let views=null,loading=null;const termIds=new Map();
 const frame=()=>new Promise(r=>requestAnimationFrame(r));
 async function show(){
  const id=c.active?.id;if(!id)return;
  workspace.dataset.sessionMode='terminal';
  if(!c.termEl){c.termEl=el('div','session-terminal');workspace.append(c.termEl);}
  const termEl=c.termEl;termEl.hidden=false;
  loading??=import('./terminal-view.js').then(m=>views=m.createTerminalViews({api:window.sufficeDesktop,onLabel(){}}));
  const v=await loading;if(c.active?.id!==id||c.mode!=='terminal')return;
  if(!termIds.has(id))termIds.set(id,'terminal:'+crypto.randomUUID());
  let slot=termEl.querySelector(`[data-sid="${id}"]`);
  if(!slot){slot=el('div','session-terminal-slot');slot.dataset.sid=id;termEl.append(slot);}
  for(const o of termEl.querySelectorAll('.session-terminal-slot'))o.hidden=o!==slot;
  paintTerminalTab(termEl,'Terminal',c.statusOf(c.active.s));
  await frame(); // the slot has a real size before xterm measures it
  if(c.active?.id!==id||c.mode!=='terminal')return;
  const view=await v.mount(slot,'session-'+id,termIds.get(id),1,{sessionId:id});
  requestAnimationFrame(()=>{if(c.active?.id!==id||c.mode!=='terminal'||!slot.clientWidth||!slot.clientHeight)return;view.fit.fit();view.term.focus();
   window.sufficeDesktop.terminalResize({threadId:'session-'+id,id:termIds.get(id),cols:view.term.cols,rows:view.term.rows}).catch(()=>{});});
 }
 function hide(){delete workspace.dataset.sessionMode;if(c.termEl)c.termEl.hidden=true;}
 return {
  enter(){void show();},
  exit(){hide();prompt0();},
  // Called while c.active is still set: closes this session's terminal tab and hides the layer.
  leave(){
   const id=c.active?.id;
   if(id&&termIds.has(id)){views?.close('session-'+id,termIds.get(id));termIds.delete(id);c.termEl?.querySelector(`[data-sid="${id}"]`)?.remove();}
   hide();
  },
 };
 function prompt0(){requestAnimationFrame(()=>document.querySelector('#prompt')?.focus());}
}
