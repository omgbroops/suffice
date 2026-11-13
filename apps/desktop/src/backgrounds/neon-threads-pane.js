// Threads pane: every saved thread, filterable and grouped by recency. Opening a row clicks the sidebar row.
import { registerPane } from './neon-panes.js';
import './neon-panes-te.css';

const prCache = new Map(); // cwd -> { branch: pr }, shared across opens
const DAY = 86400000;
const bucket = t => { const d0 = new Date().setHours(0, 0, 0, 0); return t >= d0 ? 'Today' : t >= d0 - DAY ? 'Yesterday' : t >= d0 - 6 * DAY ? 'This week' : 'Older'; };

registerPane('threads', {
  title: 'Threads',
  mount(el, { api, esc, ago, icons: I, userAv, close, note }) {
    let threads = null, alive = true;
    const f = { q: '', project: '', pr: 'all' };
    el.innerHTML = `<div class="te-bar"><input class="te-input" type="search" placeholder="Search threads" aria-label="Search threads"><select class="te-select" data-f="project" aria-label="Project"><option value="">All projects</option></select><select class="te-select" data-f="pr" aria-label="Pull request"><option value="all">All PR states</option><option value="has">Has PR</option><option value="open">Open</option><option value="merged">Merged</option></select></div><div class="te-list"><div class="te-empty">Loading threads…</div></div>`;
    const q = el.querySelector('.te-input'), proj = el.querySelector('[data-f="project"]'), list = el.querySelector('.te-list');
    const prOf = t => t.cwd && t.branch && prCache.get(t.cwd)?.[t.branch];
    function draw() {
      if (!threads) return;
      const shown = threads.filter(t => (!f.q || t.title.toLowerCase().includes(f.q)) && (!f.project || t.project === f.project) && (() => {
        if (f.pr === 'all') return true; const pr = prOf(t); return f.pr === 'has' ? !!pr : pr?.state.toLowerCase() === f.pr; })());
      if (!shown.length) { list.innerHTML = `<div class="te-empty">${threads.length ? 'No threads match these filters.' : 'No threads yet. Start one from the composer.'}</div>`; return; }
      let html = '', last = '';
      for (const t of shown) {
        const b = bucket(t.modified), pr = prOf(t);
        if (b !== last) { html += `<div class="te-group">${b}</div>`; last = b; }
        html += `<button type="button" class="te-row" data-id="${esc(t.id)}">${userAv()}<span class="te-title">${esc(t.title)}</span><span class="te-chip">${I.folder}${esc(t.project)}</span>${t.branch ? `<span class="te-chip">${I.branch}${esc(t.branch)}</span>` : ''}${pr ? `<span class="nx-pr" data-state="${esc(pr.state.toLowerCase())}">${I.pr}#${pr.number}</span>` : ''}${t.model ? `<span class="te-chip te-model">${esc(t.model.split('/').pop())}</span>` : ''}<span class="te-age">${ago(t.modified)}</span></button>`;
      }
      list.innerHTML = html;
    }
    el.addEventListener('input', e => { if (e.target === q) { f.q = q.value.trim().toLowerCase(); draw(); } });
    el.addEventListener('change', e => { const k = e.target.dataset?.f; if (k) { f[k] = e.target.value; draw(); } });
    list.addEventListener('click', e => {
      const row = e.target.closest('.te-row'); if (!row) return;
      const side = [...document.querySelectorAll('.thread-row')].find(r => r.dataset.thread === row.dataset.id);
      if (!side) { note('That thread is not in the sidebar list yet'); return; }
      close(); side.click();
    });
    (async () => {
      try { threads = await api.threads(); } catch (error) { list.innerHTML = `<div class="te-empty">${esc(error.message)}</div>`; return; }
      if (!alive) return;
      threads.sort((a, b) => b.modified - a.modified);
      for (const p of [...new Set(threads.map(t => t.project))].sort()) proj.insertAdjacentHTML('beforeend', `<option value="${esc(p)}">${esc(p)}</option>`);
      draw();
      const roots = [...new Set(threads.filter(t => t.cwd && t.branch && !prCache.has(t.cwd)).map(t => t.cwd))];
      await Promise.all(roots.map(async r => prCache.set(r, await api.branchPrs(r).catch(() => ({})))));
      if (alive && roots.length) draw();
    })();
    return () => { alive = false; };
  },
});
