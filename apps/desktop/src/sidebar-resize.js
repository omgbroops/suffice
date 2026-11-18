export function setupPanelResize({handle,panel:sidebar,property,key,side='left',minimum=190,maximum=()=>Math.min(400,Math.max(190,innerWidth-480))}) {
  const root = document.documentElement;
  let resizeFrame = 0, pendingWidth = null,startWidth=0,startX=0;
  const direction=side==='right'?-1:1;
  const current = () => Math.round(sidebar.getBoundingClientRect().width);
  function setWidth(width, save = false) {
    const value = Math.round(Math.max(Math.min(minimum,maximum()), Math.min(maximum(), width)));
    root.style.setProperty(property, `${value}px`);
    handle.setAttribute('aria-valuenow', String(value));
    handle.setAttribute('aria-valuemax', String(maximum()));
    if (save) try { localStorage.setItem(key, String(value)); } catch { /* Optional preference. */ }
  }
  try { const saved = Number(localStorage.getItem(key)); if (saved > 0) setWidth(Math.max(minimum,saved)); else if(current()<minimum)setWidth(minimum); } catch { /* Optional preference. */ }
  handle.setAttribute('aria-valuemin', String(Math.min(minimum,maximum())));
  handle.setAttribute('aria-valuenow', String(current()));
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();startWidth=current();startX=event.clientX;handle.setPointerCapture(event.pointerId);
    root.classList.add('sidebar-resizing');root.dataset.resizingPanel=side;
  });
  handle.addEventListener('pointermove', event => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    pendingWidth = startWidth+(event.clientX-startX)*direction;
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (pendingWidth !== null) { setWidth(pendingWidth); pendingWidth = null; }
    });
  });
  function finish() {
    cancelAnimationFrame(resizeFrame); resizeFrame = 0;
    if (pendingWidth !== null) { setWidth(pendingWidth); pendingWidth = null; }
    setWidth(current(), true);
    root.classList.remove('sidebar-resizing');delete root.dataset.resizingPanel;
    document.dispatchEvent(new Event('sidebar-resize-end'));
  }
  handle.addEventListener('pointerup', event => { if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); });
  handle.addEventListener('lostpointercapture', finish);
  handle.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.shiftKey ? 32 : 8;
    setWidth(event.key === 'Home' ? minimum : event.key === 'End' ? maximum() : current() + (event.key === 'ArrowRight' ? delta : -delta)*direction, true);
  });
  handle.addEventListener('dblclick', () => {
    root.style.removeProperty(property);
    try { localStorage.removeItem(key); } catch { /* Optional preference. */ }
    handle.setAttribute('aria-valuenow', String(current()));
  });
  window.addEventListener('resize', () => { if (innerWidth >= 700 && root.style.getPropertyValue(property)) setWidth(current()); });
}

export function setupSidebarResize(){
  setupPanelResize({handle:document.querySelector('.sidebar-resizer'),panel:document.querySelector('.sidebar'),property:'--sidebar-width',key:'suffice-sidebar-width',minimum:224,maximum:()=>Math.min(330,Math.max(224,innerWidth-480))});
}
