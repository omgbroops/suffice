export function connectScrollEdges(scroller){
 let frame=0;
 const update=()=>{frame=0;scroller.dataset.fadeTop=String(scroller.scrollTop>1);scroller.dataset.fadeBottom=String(scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop>1);};
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
 const resize=new ResizeObserver(schedule);resize.observe(scroller);
 const mutation=new MutationObserver(()=>{resize.disconnect();resize.observe(scroller);for(const child of scroller.children)resize.observe(child);schedule();});mutation.observe(scroller,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style','aria-expanded']});
 scroller.addEventListener('scroll',schedule,{passive:true});schedule();
 return()=>{cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();scroller.removeEventListener('scroll',schedule);};
}
