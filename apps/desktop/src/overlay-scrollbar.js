// An overlay rail keeps row geometry identical before and after overflow.
export function connectOverlayScrollbar(scroller){
 const host=scroller.parentElement;host.classList.add('overlay-scroll-host');
 const rail=document.createElement('div');rail.className='sidebar-scroll-rail';rail.setAttribute('aria-hidden','true');
 const thumb=document.createElement('div');thumb.className='sidebar-scroll-thumb';rail.append(thumb);host.append(rail);
 let frame=0;
 const update=()=>{frame=0;const max=scroller.scrollHeight-scroller.clientHeight;rail.hidden=max<=1;scroller.dataset.fadeTop=String(scroller.scrollTop>1);scroller.dataset.fadeBottom=String(max-scroller.scrollTop>1);rail.style.top=`${scroller.offsetTop}px`;rail.style.height=`${scroller.clientHeight}px`;const size=Math.min(scroller.clientHeight,Math.max(28,scroller.clientHeight*scroller.clientHeight/scroller.scrollHeight));thumb.style.height=`${size}px`;thumb.style.transform=`translateY(${max>0?(scroller.clientHeight-size)*scroller.scrollTop/max:0}px)`;};
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
 scroller.addEventListener('scroll',schedule,{passive:true});new ResizeObserver(schedule).observe(scroller);new MutationObserver(schedule).observe(scroller,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style']});
 rail.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();const rect=thumb.getBoundingClientRect(),offset=event.target===thumb?event.clientY-rect.top:rect.height/2;rail.setPointerCapture(event.pointerId);rail.classList.add('dragging');const move=e=>{const available=rail.clientHeight-thumb.clientHeight;scroller.scrollTop=Math.max(0,e.clientY-rail.getBoundingClientRect().top-offset)/Math.max(1,available)*(scroller.scrollHeight-scroller.clientHeight);};move(event);rail.addEventListener('pointermove',move);const finish=()=>{rail.classList.remove('dragging');rail.removeEventListener('pointermove',move);rail.removeEventListener('pointerup',finish);rail.removeEventListener('lostpointercapture',finish);};rail.addEventListener('pointerup',finish);rail.addEventListener('lostpointercapture',finish);});
 schedule();
}
