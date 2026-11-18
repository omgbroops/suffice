// Motion that CSS cannot express: sidebar-collapse workspace slide (FLIP, transform only), approval hand-back, disclosure reveal.
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||innerWidth<700||document.documentElement.dataset.keyboard==='true';
export function connectMotion(){
const root=document.documentElement,ws=document.querySelector('.workspace');
requestAnimationFrame(()=>requestAnimationFrame(()=>{root.dataset.motionReady='1';}));
if(ws){
  let left=ws.offsetLeft,was=document.body.classList.contains('sidebar-collapsed');
  new ResizeObserver(()=>{if(!ws.getAnimations().length)left=ws.offsetLeft;}).observe(ws);
  new MutationObserver(()=>{
    const now=document.body.classList.contains('sidebar-collapsed'),next=ws.offsetLeft;
    if(now!==was){
      was=now;
      const live=ws.getAnimations(),tx=live.length?new DOMMatrix(getComputedStyle(ws).transform).m41:0;live.forEach(a=>a.cancel());
      const from=left-next+tx;
      if(from&&!reduced()){
        root.style.overflowX='clip'; // the wider workspace is clipped, not scrolled, while it slides
        const a=ws.animate({transform:[`translateX(${from}px)`,'none']},{duration:200,easing:getComputedStyle(root).getPropertyValue('--ease-out')||'ease-out'});
        a.onfinish=a.oncancel=()=>{if(!ws.getAnimations().length)root.style.overflowX='';};
      }
    }
    left=next;
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
}
// Approval resolved: composer controls come back with a short fade.
const composer=document.querySelector('.composer');
if(composer)new MutationObserver(records=>{for(const r of records)if(r.oldValue==='true'&&composer.dataset.approval!=='true'&&!reduced()){composer.dataset.returning='';setTimeout(()=>delete composer.dataset.returning,180);}}).observe(composer,{attributes:true,attributeFilter:['data-approval'],attributeOldValue:true});
// Disclosure opened by the user: reveal its body once.
document.addEventListener('click',e=>{const d=e.target.closest?.('.thread-activity > summary')?.parentElement;if(d&&!d.open&&!reduced()){d.dataset.reveal='';setTimeout(()=>delete d.dataset.reveal,200);}},true);
}
