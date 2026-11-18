// Motion that CSS cannot express: sidebar/right-panel workspace margin slide, approval hand-back, disclosure reveal.
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||innerWidth<700||document.documentElement.dataset.keyboard==='true';
export function connectMotion(){
const root=document.documentElement,ws=document.querySelector('.workspace');
requestAnimationFrame(()=>requestAnimationFrame(()=>{root.dataset.motionReady='1';}));
if(ws){
  // One timeline for every sidebar / right-panel mover: workspace margin, the panel transform and the fixed header/tool cluster share duration, easing and start, so rapid toggles stay in step.
  const q=s=>document.querySelector(s),dur=()=>{const v=getComputedStyle(root).getPropertyValue('--duration-move').trim();return(parseFloat(v)*(v.endsWith('ms')?1:1000))||200;};
  const parts=()=>[['.workspace',['marginLeft','marginRight']],['.right-sidebar',['transform']]].map(([sel,ps])=>[sel,q(sel),ps]).filter(p=>p[1]);
  const snap=()=>new Map(parts().map(([sel,el,ps])=>{const c=getComputedStyle(el);return[sel,ps.map(k=>c[k])];}));
  let rest=snap();
  new ResizeObserver(()=>{if(!ws.getAnimations().length)rest=snap();}).observe(ws);
  new MutationObserver(()=>{
    const live=ws.getAnimations(),cur=live.length?snap():null;
    parts().forEach(([,el])=>el.getAnimations().filter(a=>a.id==='motion-move').forEach(a=>a.cancel()));
    const to=snap(),from=cur||rest;rest=to;
    // Parts that did not exist at the last rest (thread chrome appears after first paint) just take their final value.
    const moving=parts().filter(([sel])=>from.has(sel)&&from.get(sel).join()!==to.get(sel).join());
    if(reduced()||!moving.length){delete root.dataset.sliding;return;}
    const ease=getComputedStyle(root).getPropertyValue('--ease-out')||'ease-out';
    root.dataset.sliding='';
    const anims=moving.map(([sel,el,ps])=>{const kf=Object.fromEntries(ps.map((k,j)=>[k,[from.get(sel)[j],to.get(sel)[j]]]));const a=el.animate(kf,{duration:dur(),easing:ease});a.id='motion-move';return a;});
    // The header/tool cluster is fixed and re-rendered after the class flips, so it rides the panel's own delta: offset = panel travel still to go.
    const pm=moving.find(m=>m[0]==='.right-sidebar'),cl=q('.caption-chat-tools');
    if(pm&&cl){const tx=v=>new DOMMatrix(v).m41,a=cl.animate({transform:[`translateX(${tx(from.get(pm[0])[0])-tx(to.get(pm[0])[0])}px)`,'translateX(0)']},{duration:dur(),easing:ease});a.id='motion-move';anims.push(a);}
    Promise.allSettled(anims.map(a=>a.finished)).then(()=>{if(!ws.getAnimations().length){delete root.dataset.sliding;rest=snap();}});
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
}
// Approval resolved: composer controls come back with a short fade.
const composer=document.querySelector('.composer');
if(composer)new MutationObserver(records=>{for(const r of records)if(r.oldValue==='true'&&composer.dataset.approval!=='true'&&!reduced()){composer.dataset.returning='';setTimeout(()=>delete composer.dataset.returning,150);}}).observe(composer,{attributes:true,attributeFilter:['data-approval'],attributeOldValue:true});
// Disclosure opened by the user: reveal its body once.
document.addEventListener('click',e=>{const d=e.target.closest?.('.thread-activity > summary')?.parentElement;if(d&&!d.open&&!reduced()){d.dataset.reveal='';setTimeout(()=>delete d.dataset.reveal,150);}},true);
}
