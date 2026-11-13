// Interruptible disclosure motion; the existing rows stay mounted throughout.
const active=new WeakMap();
export function setProjectGroupExpanded(body,expanded){
 const previous=active.get(body),start=body.hidden?0:body.getBoundingClientRect().height;
 const opacity=body.hidden?0:Number(getComputedStyle(body).opacity);
 previous?.cancel();body.hidden=false;body.inert=!expanded;
 const finish=()=>{body.hidden=!expanded;body.style.removeProperty('height');body.style.removeProperty('overflow');active.delete(body);};
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
 const end=expanded?body.scrollHeight:0;body.style.overflow='hidden';
 const animation=body.animate([{height:`${start}px`,opacity},{height:`${end}px`,opacity:expanded?1:0}],{duration:expanded?190:150,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});
 active.set(body,animation);
 animation.finished.then(()=>{if(active.get(body)!==animation)return;finish();animation.cancel();}).catch(()=>{});
}
