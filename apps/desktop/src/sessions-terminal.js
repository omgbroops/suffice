import {el} from './sessions-util.js';
import './sessions-terminal.css';

// Terminal view of a session (xterm tab mounted over the workspace) plus the "venom" reveal animation.
export function createTerminal(c){
 const {workspace,header}=c;
 let views=null,viewPromise=null;const termIds=new Map();
 async function showTerminal(){
  if(!c.termEl){c.termEl=el('div','session-terminal');workspace.append(c.termEl);}
  const termEl=c.termEl;termEl.hidden=false;
  if(!viewPromise)viewPromise=import('./terminal-view.js').then(({createTerminalViews})=>{views=createTerminalViews({api:window.sufficeDesktop,onLabel(){}});return views;});
  const v=await viewPromise;const id=c.active?.id;if(!id||c.mode!=='terminal')return;
  if(!termIds.has(id))termIds.set(id,'terminal:'+crypto.randomUUID());
  const slot=termEl.querySelector(`[data-sid="${id}"]`)||termEl.appendChild(Object.assign(el('div','session-terminal-slot'),{}));
  slot.dataset.sid=id;
  for(const o of termEl.children)o.hidden=o!==slot;
  await v.mount(slot,'session-'+id,termIds.get(id),1,{sessionId:id});
 }
 // Terminal "venom": goo blobs spread from the Terminal button and retract into it. WAAPI on transform/opacity only; overlay and filter are removed at rest.
 let ov=null;
 const venomEnd=()=>{if(!ov)return;ov.anims.forEach(a=>a.cancel());ov.svg.remove();ov=null;};
 function venom(dir){
  const T=c.termEl,k=window.__motionSlow||1,D=420*k,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!T||(dir<0&&T.hidden&&!ov))return;
  if(ov?.dummy||reduce)venomEnd();
  if(reduce){T.dataset.solid='';T.hidden=false;const a=T.animate({opacity:dir>0?[0,1]:[1,0]},{duration:120*k,fill:'both'});
   ov={svg:document.createElement('i'),anims:[a],dummy:true};a.onfinish=()=>{venomEnd();if(dir<0){T.hidden=true;delete T.dataset.solid;}};return;}
  if(!ov){
   const b=header.querySelector('.session-mode-toggle'),r=(b||header).getBoundingClientRect(),w=workspace.getBoundingClientRect();
   const W=w.width,H=w.height,ox=r.left+r.width/2-w.left,oy=r.top+r.height/2-w.top,R=Math.hypot(Math.max(ox,W-ox),Math.max(oy,H-oy))+40;
   const col=getComputedStyle(document.querySelector('.sidebar')).backgroundColor;T.style.setProperty('--venom',col);delete T.dataset.solid;
   const NS='http://www.w3.org/2000/svg',n=(t,at={})=>{const e=document.createElementNS(NS,t);for(const q in at)e.setAttribute(q,at[q]);return e;};
   const svg=n('svg',{class:'session-venom',width:W,height:H});
   const f=n('filter',{id:'venom-goo',filterUnits:'userSpaceOnUse',x:-60,y:-60,width:W+120,height:H+120,'color-interpolation-filters':'sRGB'});
   f.append(n('feGaussianBlur',{stdDeviation:14}),n('feColorMatrix',{values:'1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9'}));
   const g=n('g',{filter:'url(#venom-goo)',fill:col});svg.append(n('defs'),g);svg.firstChild.append(f);
   const E=['cubic-bezier(0.2,0.9,0.2,1)','cubic-bezier(0.1,0.8,0.3,1)','cubic-bezier(0.3,0.6,0.1,1)','cubic-bezier(0.05,0.9,0.4,1)'];
   const base=Math.atan2(H/2-oy,W/2-ox),J=[.1,-.15,.2,-.05,.15,-.2,.05,-.1],S=[.9,.62,1,.74,.95,.68,.85,.58];
   const anims=[];
   const add=(cx,cy,rad,x,y,delay,dur,ease)=>{const c=n('circle',{cx,cy,r:rad});c.style.cssText='transform-box:fill-box;transform-origin:center;will-change:transform';g.append(c);
    anims.push(c.animate([{transform:'translate(0px,0px) scale(0)'},{transform:`translate(${x}px,${y}px) scale(1)`}],{delay,duration:dur,easing:ease,fill:'both'}));};
   add(ox,oy,R,0,0,60*k,D-60*k,E[0]); // body: guarantees full coverage; tendrils start 60 ms ahead of it
   S.forEach((q,i)=>{const a=base+(i-3.5)*.42+J[i],d=R*q*.62,rad=R*(.13+.05*(i%3));add(ox,oy,rad,Math.cos(a)*d,Math.sin(a)*d,0,D,E[i%4]);});
   const off=Math.max(0,(D-120*k)/D);
   anims.push(T.animate([{opacity:0},{opacity:0,offset:off},{opacity:1}],{duration:D,fill:'both'})); // terminal content fades in over the last 120 ms
   workspace.insertBefore(svg,T);ov={svg,anims};
   if(dir<0)anims.forEach(a=>{a.currentTime=D;});
   anims.at(-1).onfinish=()=>{const fwd=anims.at(-1).playbackRate>0;venomEnd();if(fwd)T.dataset.solid='';else{T.hidden=true;delete T.dataset.solid;}};
  }
  delete T.dataset.solid;T.hidden=false;
  ov.anims.forEach(a=>{a.updatePlaybackRate(dir>0?1:-1.4);a.play();});
 }
 return {
  enter(){void showTerminal();venom(1);},
  exit(){venom(-1);},
  // Called while c.active is still set: closes this session's terminal tab and hides the layer.
  leave(){
   const id=c.active?.id;
   if(id&&termIds.has(id)){views?.close('session-'+id,termIds.get(id));termIds.delete(id);c.termEl?.querySelector(`[data-sid="${id}"]`)?.remove();}
   venomEnd();if(c.termEl){c.termEl.hidden=true;delete c.termEl.dataset.solid;}
  },
 };
}
