import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { GradientBackground } from '../components/ui/oceanic-shimmer.tsx';
import './oceanic-shimmer.css';

export function mountOceanicShimmer(canvas, config) {
  const host = document.createElement('div');
  host.className = 'oceanic-shimmer-host'; host.setAttribute('aria-hidden', 'true');
  host.style.setProperty('--oceanic-exposure', config.opacity);
  host.style.setProperty('--oceanic-light-exposure', config.lightOpacity);
  canvas.before(host);
  const previousVisibility = canvas.style.visibility;
  canvas.style.visibility = 'hidden';
  const root = createRoot(host);
  root.render(createElement(GradientBackground, { className: 'oceanic-shimmer' }));
  return () => { root.unmount(); host.remove(); canvas.style.visibility = previousVisibility; };
}
