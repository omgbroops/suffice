export function connectDisclosureMotion(root){
 const active=new WeakMap();
 root.addEventListener('click',event=>{
  const summary=event.target.closest('summary');if(!summary||!root.contains(summary)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const details=summary.parentElement;if(details.tagName!=='DETAILS')return;
  event.preventDefault();const current=active.get(details),start=details.getBoundingClientRect().height;
  const opening=current?!current.opening:!details.open;current?.animation.cancel();
  details.open=true;details.style.height='auto';const end=opening?details.getBoundingClientRect().height:summary.getBoundingClientRect().height;
  details.style.overflow='hidden';const animation=details.animate([{height:`${start}px`},{height:`${end}px`}],{duration:200,easing:getComputedStyle(details).getPropertyValue('--ease-out').trim()});
  active.set(details,{animation,opening});animation.finished.then(()=>{if(active.get(details)?.animation!==animation)return;details.open=opening;details.style.removeProperty('height');details.style.removeProperty('overflow');active.delete(details);}).catch(()=>{});
 });
}
