// Start screen life: runnable placeholder, one real status line, recents, sidebar skeleton, New session icon.
// Everything is read from the live DOM (model label, project, branch, thread rows); nothing is invented.
const $ = (s, r = document) => r.querySelector(s);
const COMPOSE = '<svg class="icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="m9.2 9.8-2.4.6.6-2.4 4.5-4.5a1.1 1.1 0 0 1 1.6 1.6z"/></svg>';

export function connectStartLife() {
  const area = $('.agent-area'), composer = $('.composer'), prompt = $('#prompt');
  if (!area || !composer || !prompt) return;
  prompt.placeholder = 'Try "fix the failing typecheck errors"';

  const life = document.createElement('div');
  life.className = 'start-life';
  life.innerHTML = '<p class="start-status" aria-live="polite"></p><div class="start-recents" hidden><div class="start-label">Recent</div><div class="start-recent-list"></div></div>';
  composer.after(life);
  const status = $('.start-status', life), box = $('.start-recents', life), list = $('.start-recent-list', life);

  const paintStatus = () => {
    const parts = [$('#model-label')?.textContent, $('.project-picker .project-name')?.textContent, $('.git-pill:not([hidden])')?.textContent]
      .map(t => t?.replace(/\s+/g, ' ').trim()).filter(t => t && t !== 'Select project');
    status.textContent = parts.join(' · ');
    status.hidden = !parts.length;
  };
  const paintRecents = () => {
    const rows = [...document.querySelectorAll('.sidebar-sessions .thread-row')].slice(0, 3);
    list.replaceChildren(...rows.map(row => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'start-recent';
      const t = document.createElement('span'); t.className = 'start-recent-title'; t.textContent = $('.row-title', row)?.textContent || '';
      const a = document.createElement('span'); a.className = 'start-recent-age'; a.textContent = $('.thread-age', row)?.textContent || '';
      b.append(t, a); b.addEventListener('click', () => row.click());
      return b;
    }));
    box.hidden = !rows.length;
  };
  const watch = (el, fn, opts) => { if (el) new MutationObserver(fn).observe(el, opts); };
  const all = { subtree: true, childList: true, characterData: true };
  watch($('.toolbar-right'), paintStatus, all);
  watch($('.project-bar'), paintStatus, { ...all, attributes: true, attributeFilter: ['hidden'] });
  watch($('.sidebar-sessions'), paintRecents, all);
  paintStatus(); paintRecents();

  // New session icon: compose-square, 14px.
  const ns = $('.new-session .icon, .new-session svg');
  if (ns) ns.outerHTML = COMPOSE;

  // Sidebar skeleton while sessions load; removed when the first real row lands or after 3 s.
  const sessions = $('.sidebar-sessions');
  const skeleton = () => {
    if (!sessions || $('.sidebar-skeleton')) return;
    const sk = document.createElement('div'); sk.className = 'sidebar-skeleton'; sk.setAttribute('aria-hidden', 'true');
    sk.innerHTML = '<i class="sk-head"></i>' + Array.from({ length: 5 }, () => '<div class="sk-row"><i class="sk-title"></i><i class="sk-meta"></i></div>').join('');
    sessions.prepend(sk);
    const done = () => { sk.remove(); mo.disconnect(); clearTimeout(timer); };
    const mo = new MutationObserver(() => { if ($('.thread-row', sessions)) done(); });
    mo.observe(sessions, { childList: true });
    const timer = setTimeout(done, 3000);
  };
  if (sessions && !$('.thread-row', sessions)) skeleton();
  document.addEventListener('suffice-sidebar-loading', skeleton);
}
