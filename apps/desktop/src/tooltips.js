// One delegated tooltip layer, shared by static and dynamically rendered controls.
export function connectTooltips(){
 const tip=document.createElement('div');tip.id='suffice-tooltip';tip.className='custom-tooltip';tip.setAttribute('role','tooltip');tip.setAttribute('popover','manual');tip.hidden=true;document.body.append(tip);
 let current=null,timer,previousDescription,keyboardNavigation=false;
 function convert(root){if(root.nodeType!==1)return;for(const el of [root,...root.querySelectorAll('[title]')])if(el.hasAttribute('title')){el.dataset.tooltip=el.getAttribute('title');el.removeAttribute('title');}}
 convert(document.body);
 new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')convert(record.target);else record.addedNodes.forEach(convert);}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['title']});
 function hide(){clearTimeout(timer);tip.hidePopover?.();tip.hidden=true;if(current){if(previousDescription)current.setAttribute('aria-describedby',previousDescription);else current.removeAttribute('aria-describedby');}current=null;}
 function show(target,keyboard=false){
  const visible=(target.innerText||'').replace(/[←→⋯]/g,'').trim();
  // A visible label already explains its control. Only reveal extra text when
  // that label was actually clipped; icon-only controls still need a name.
  const clipped=[target,...target.querySelectorAll('span')].some(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1);
  if(visible&&!clipped&&!target.hasAttribute('data-tooltip-extra'))return;
  const text=target.dataset.tooltip||target.getAttribute('aria-label')||visible;if(!text||target.disabled)return;
  hide();current=target;previousDescription=target.getAttribute('aria-describedby');
  timer=setTimeout(()=>{if(!target.isConnected)return;tip.textContent=text;tip.hidden=false;tip.showPopover?.();target.setAttribute('aria-describedby',[previousDescription,tip.id].filter(Boolean).join(' '));const rect=target.getBoundingClientRect();tip.style.left=`${Math.max(6,Math.min(rect.left+rect.width/2-tip.offsetWidth/2,innerWidth-tip.offsetWidth-6))}px`;tip.style.top=`${Math.min(rect.bottom+7,innerHeight-tip.offsetHeight-6)}px`;if(!keyboard&&!matchMedia('(prefers-reduced-motion: reduce)').matches)tip.animate([{opacity:0},{opacity:1}],{duration:120});},300);
 }
 const control=target=>{const el=target.closest?.('button,[data-tooltip]');return el?.hasAttribute('data-rich-tooltip')?null:el;};
 document.addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const target=control(event.target);if(target&&!target.contains(event.relatedTarget))show(target);});
 document.addEventListener('pointerout',event=>{if(current&&!current.contains(event.relatedTarget))hide();});
 document.addEventListener('focusin',event=>{const target=control(event.target);if(keyboardNavigation&&target?.matches(':focus-visible'))show(target,true);});
 document.addEventListener('focusout',hide);document.addEventListener('pointerdown',()=>{keyboardNavigation=false;hide();},true);
 document.addEventListener('keydown',event=>{keyboardNavigation=event.key==='Tab';if(event.key!=='Tab')hide();},true);document.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);window.addEventListener('blur',hide);
}
