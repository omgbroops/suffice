import './sessions-terminal.css';
// One xterm per CLI session, on the same glass as the chat. Switching is instant: no animation, only a hidden flag.
export function createSessionTerminal({workspace}){
 let termEl=null,views=null,loading=null,current=null;const ids=new Map();
 const frame=()=>new Promise(r=>requestAnimationFrame(r));
 async function show(id){
  current=id;workspace.dataset.sessionMode='terminal';
  if(!termEl){termEl=document.createElement('div');termEl.className='session-terminal';workspace.append(termEl);}
  termEl.hidden=false;
  loading??=import('./terminal-view.js').then(m=>views=m.createTerminalViews({api:window.sufficeDesktop,onLabel(){}}));
  const v=await loading;if(current!==id)return;
  if(!ids.has(id))ids.set(id,'terminal:'+crypto.randomUUID());
  let slot=termEl.querySelector(`[data-sid="${id}"]`);
  if(!slot){slot=document.createElement('div');slot.className='session-terminal-slot';slot.dataset.sid=id;termEl.append(slot);}
  for(const o of termEl.children)o.hidden=o!==slot;
  await frame(); // the slot has laid out with a real size before xterm measures it
  if(current!==id)return;
  const view=await v.mount(slot,'session-'+id,ids.get(id),1,{sessionId:id});
  requestAnimationFrame(()=>{if(current!==id||!slot.clientWidth||!slot.clientHeight)return;view.fit.fit();view.term.focus();
   window.sufficeDesktop.terminalResize({threadId:'session-'+id,id:ids.get(id),cols:view.term.cols,rows:view.term.rows}).catch(()=>{});});
 }
 function hide(){current=null;delete workspace.dataset.sessionMode;if(termEl)termEl.hidden=true;}
 function close(id){if(!ids.has(id))return;views?.close('session-'+id,ids.get(id));ids.delete(id);termEl?.querySelector(`[data-sid="${id}"]`)?.remove();}
 return {show,hide,close};
}
