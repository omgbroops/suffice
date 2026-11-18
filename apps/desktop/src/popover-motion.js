// Shared, interruptible transitions for every desktop menu.
const pending=new WeakMap();
let keyboard=false;
document.addEventListener('keydown',()=>{keyboard=true;document.documentElement.dataset.keyboard='true';},true);
document.addEventListener('pointerdown',()=>{keyboard=false;delete document.documentElement.dataset.keyboard;},true);
export const keyboardInteraction=()=>keyboard;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
export function showPopover(element){
  clearTimeout(pending.get(element));
  // Callers may have unhidden the node already (menu.js measures it): snap to the closed state with no transition, then open. A mid-fade node keeps its current value.
  const fresh=element.dataset.open!=='true'&&!pending.has(element);
  element.dataset.motion='true';if(fresh){element.dataset.instant='true';element.dataset.open='false';}
  element.hidden=false;element.inert=false;
  void element.offsetWidth;
  element.dataset.instant=String(keyboard);element.dataset.open='true';
}
export function hidePopover(element,onHidden){
  clearTimeout(pending.get(element));
  element.dataset.instant=String(keyboard);element.dataset.open='false';element.inert=true;
  const finish=()=>{element.hidden=true;onHidden?.();pending.delete(element);};
  if(keyboard||reduced())finish();else pending.set(element,setTimeout(finish,120));
}
