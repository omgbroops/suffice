// During a sidebar drag, stretch the cached canvas. Rebuild expensive seeded
// artwork only at its final size, rather than blocking every pointer frame.
export function observeBackgroundResize(target, callback) {
  let width = target.clientWidth, height = target.clientHeight;
  function update() {
    if (document.documentElement.classList.contains('sidebar-resizing')) return;
    const nextWidth = target.clientWidth, nextHeight = target.clientHeight;
    if (width === nextWidth && height === nextHeight) return;
    width = nextWidth; height = nextHeight;
    callback();
  }
  const observer = new ResizeObserver(update);
  observer.observe(target);
  document.addEventListener('sidebar-resize-end', update);
  return { disconnect() { observer.disconnect(); document.removeEventListener('sidebar-resize-end', update); } };
}
