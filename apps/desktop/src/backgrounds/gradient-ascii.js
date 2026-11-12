import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import GradientASCII from '../vendor/reactbits/GradientASCII.jsx';

// Keep the application in its current stack and mount the supplied component
// only for this background. Its own canvas avoids 2D/WebGL context conflicts.
export function mountGradientAscii(canvas, config) {
  const host = document.createElement('div');
  host.className = 'gradient-ascii-host';
  host.setAttribute('aria-hidden', 'true');
  canvas.before(host);
  const previousVisibility = canvas.style.visibility;
  canvas.style.visibility = 'hidden';
  const root = createRoot(host);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;
  function render() {
    if (disposed) return;
    const paused = canvas.dataset.motion === 'paused';
    const light = document.documentElement.dataset.theme === 'light';
    host.style.opacity = light ? config.lightOpacity ?? config.opacity : config.opacity;
    root.render(createElement(GradientASCII, {
      ...config.props,
      key: reduce.matches ? 'still' : 'live',
      intro: !reduce.matches && !paused,
      paused,
      lightMode: light,
      mouseInteraction: false,
      clickEffect: 'none',
      fontFamily: '"Geist Pixel", monospace',
      dpr: Math.min(devicePixelRatio || 1, 1.5),
    }));
  }
  reduce.addEventListener('change', render);
  canvas.addEventListener('motion-change', render);
  document.addEventListener('suffice-theme-change', render);
  render();
  return () => {
    disposed = true;
    reduce.removeEventListener('change', render);
    canvas.removeEventListener('motion-change', render);
    document.removeEventListener('suffice-theme-change', render);
    root.unmount(); host.remove();
    canvas.style.visibility = previousVisibility;
  };
}
