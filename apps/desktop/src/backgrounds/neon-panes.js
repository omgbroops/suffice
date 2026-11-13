// Full-page panes for the neon sidebar nav (Threads, Issues, Pull requests, Automations, Explore).
// A pane covers the main column; "New thread" or Escape returns to the composer.
// Each pane module calls registerPane(key, { title, mount(el, ctx) }) and mount may return a cleanup function.
const panes = new Map();
export const registerPane = (key, def) => panes.set(key, def);
export const hasPane = key => panes.has(key);

export function createPaneHost(ctx) {
  const main = document.querySelector('.workspace');
  let el = null, cleanup = null, current = null;
  const mark = key => document.querySelectorAll('.nx-nav .nx-row').forEach(r => r.classList.toggle('is-current', r.dataset.nx === (key || 'new')));
  function close() {
    try { cleanup?.(); } catch (error) { console.error(error); }
    el?.remove(); el = cleanup = current = null; mark(null);
  }
  function open(key) {
    const def = panes.get(key); if (!def || !main) return false;
    close();
    el = document.createElement('section'); el.className = 'nx nx-pane'; el.dataset.pane = key; el.setAttribute('aria-label', def.title);
    el.innerHTML = `<header class="nx-pane-head"><h2>${def.title}</h2><div class="nx-pane-actions"></div></header><div class="nx-pane-body"></div>`;
    main.append(el); current = key; mark(key);
    try { cleanup = def.mount(el.querySelector('.nx-pane-body'), { ...ctx, actions: el.querySelector('.nx-pane-actions'), close }) || null; }
    catch (error) { el.querySelector('.nx-pane-body').textContent = error.message; }
    return true;
  }
  return { open, close, get current() { return current; } };
}
