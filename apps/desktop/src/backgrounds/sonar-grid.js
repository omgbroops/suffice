import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import SonarGrid from '../components/ui/sonar-grid.jsx';

export function mountSonarGrid(canvas, config) {
  const host = document.createElement('div');
  host.className = 'sonar-grid-host'; host.setAttribute('aria-hidden', 'true');
  canvas.before(host);
  const previousVisibility = canvas.style.visibility;
  canvas.style.visibility = 'hidden';
  const root = createRoot(host), workspace = canvas.parentElement;
  let disposed = false;
  function render() {
    if (!disposed) root.render(createElement(SonarGrid, { ...config.props, paused: canvas.dataset.motion === 'paused' }));
  }
  function ping(event) {
    if (event.target.closest('button, a, input, textarea, select, label, dialog, [role="menu"], .panel, .composer')) return;
    const sonar = host.querySelector('[data-slot="sonar-grid"]');
    if (!sonar) return;
    const rect = sonar.getBoundingClientRect();
    sonar.dispatchEvent(new CustomEvent('sonar-ping', { detail: { x: event.clientX - rect.left, y: event.clientY - rect.top } }));
  }
  canvas.addEventListener('motion-change', render);
  workspace.addEventListener('pointerdown', ping);
  render();
  return () => {
    disposed = true;
    canvas.removeEventListener('motion-change', render); workspace.removeEventListener('pointerdown', ping);
    root.unmount(); host.remove(); canvas.style.visibility = previousVisibility;
  };
}
