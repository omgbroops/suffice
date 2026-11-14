import {threadAppearance} from './thread-appearance.js';

export function createThreadTransition(workspace,composer){
 workspace.dataset.threadBackground=threadAppearance.background;
 workspace.style.setProperty('--thread-motion-duration',`${threadAppearance.duration}ms`);
 const atmosphere=document.createElement('div');atmosphere.className='thread-atmosphere';atmosphere.setAttribute('aria-hidden','true');
 for(const node of workspace.querySelectorAll(':scope > .atmosphere,:scope > .atmosphere-shade,:scope > .gradient-ascii-host,:scope > .sonar-grid-host,:scope > .oceanic-shimmer-host'))atmosphere.append(node);
 const dim=document.createElement('div');dim.className='thread-backdrop';dim.setAttribute('aria-hidden','true');workspace.prepend(atmosphere,dim);
 const reduced=()=>document.documentElement.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const ease=()=>getComputedStyle(workspace).getPropertyValue('--ease-out').trim();
 let animations=[],ghost;
 function cancel(){for(const animation of animations)animation.cancel();animations=[];ghost?.remove();ghost=null;}
 function enter(change){
  const first=composer.getBoundingClientRect();cancel();if(reduced()){change();return;}
  const bar=workspace.querySelector('.project-bar'),bounds=workspace.getBoundingClientRect();
  if(bar){const r=bar.getBoundingClientRect();ghost=bar.cloneNode(true);ghost.classList.add('project-bar-ghost');ghost.setAttribute('aria-hidden','true');ghost.inert=true;Object.assign(ghost.style,{position:'absolute',left:`${r.left-bounds.left}px`,top:`${r.top-bounds.top}px`,width:`${r.width}px`,margin:'0',zIndex:'3',pointerEvents:'none'});workspace.append(ghost);}
  change();const last=composer.getBoundingClientRect();
  const transcript=workspace.querySelector('.thread-transcript');if(transcript)animations.push(transcript.animate([{opacity:0},{opacity:1}],{duration:160,delay:threadAppearance.duration,easing:ease(),fill:'backwards'}));
  animations.push(composer.animate([{transform:`translate(${first.left-last.left}px,${first.top-last.top}px)`},{transform:'translate(0,0)'}],{duration:threadAppearance.duration,easing:ease()}));
  if(ghost){const node=ghost,fade=node.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-4px)'}],{duration:180,easing:ease(),fill:'forwards'});animations.push(fade);fade.finished.then(()=>node.remove()).catch(()=>{});}
 }
 function leave(change){const first=composer.getBoundingClientRect();cancel();change();if(reduced())return;const last=composer.getBoundingClientRect();animations.push(composer.animate([{transform:`translate(${first.left-last.left}px,${first.top-last.top}px)`},{transform:'translate(0,0)'}],{duration:threadAppearance.duration,easing:ease()}));const bar=workspace.querySelector('.project-bar');if(bar)animations.push(bar.animate([{opacity:0},{opacity:1}],{duration:180,delay:threadAppearance.duration-80,easing:ease(),fill:'backwards'}));}
 function reveal(element,role,delay=threadAppearance.duration){if(reduced())return;animations.push(element.animate([{opacity:0,transform:role==='user'?'translateY(12px)':'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:threadAppearance.bubbleDuration,delay,easing:ease(),fill:'backwards'}));}
 return {enter,leave,reveal,cancel};
}
