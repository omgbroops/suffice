export function connectSharedChrome(workspace){
 const wallpaper=document.createElement('div');wallpaper.className='app-wallpaper thread-atmosphere';wallpaper.setAttribute('aria-hidden','true');
 for(const layer of workspace.querySelectorAll(':scope > .atmosphere,:scope > .atmosphere-shade'))wallpaper.append(layer);
 document.body.prepend(wallpaper);let frame;
 function update(){
  const r=workspace.getBoundingClientRect(),radius=parseFloat(getComputedStyle(workspace).borderTopLeftRadius)||0;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${innerWidth}" height="${innerHeight}"><defs><mask id="chrome"><rect width="100%" height="100%" fill="white"/><rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${radius}" fill="black"/></mask></defs><rect width="100%" height="100%" fill="white" mask="url(#chrome)"/></svg>`;
  document.body.style.setProperty('--shared-chrome-mask',`url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
 }
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
 new ResizeObserver(schedule).observe(workspace);
 for(const target of [document.body,document.documentElement])new MutationObserver(schedule).observe(target,{attributes:true,attributeFilter:['class']});
 window.addEventListener('resize',schedule);schedule();
}
