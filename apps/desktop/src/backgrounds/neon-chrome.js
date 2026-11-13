// Neon skin chrome: the extra sidebar nav, avatars, footer and composer controls the
// neon reference layout needs. Everything added carries .nx and is removed on unmount.
import './neon-composer.css'; // composer menus + dictation (neon-composer.js)
import { mountNeonComposer } from './neon-composer.js';
const S = (d, extra = '') => `<svg class="nx-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
export const NX_ICONS = {
  compose: S('<path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L13 14l-4 1 1-4Z"/>'),
  list: S('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.6"/>'),
  issue: S('<circle cx="12" cy="12" r="8.5" stroke-dasharray="3.2 2.6"/>'),
  pr: S('<circle cx="6" cy="5.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="18.5" r="2"/><path d="M6 7.5v9M18 16.5V9a3 3 0 0 0-3-3h-4"/><path d="m13 4-2 2 2 2"/>'),
  auto: S('<path d="M5 15a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.6 1.4"/><circle cx="16" cy="16" r="4.5"/><path d="M16 14v2l1.3 1"/>'),
  explore: S('<circle cx="12" cy="12" r="8.5"/><path d="m15 9-1.8 4.2L9 15l1.8-4.2Z"/>'),
  more: S('<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="2.8"/>'),
  layout: S('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M12 9.5v10"/>'),
  search: S('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  sidebar: S('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M8.5 4.5v15" stroke-width="3.6"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  folder: S('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>'),
  lock: S('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><path d="M12 14.5v2"/>'),
  pin: S('<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3Z"/><path d="M12 14v6"/>'),
  code: S('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="m10 10-2 2 2 2M14 10l2 2-2 2"/>'),
  cloud: S('<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.6A3.8 3.8 0 0 1 17.5 18.5Z"/>'),
  repo: S('<path d="M12 3.5a8.5 8.5 0 0 0-2.7 16.6c.4 0 .6-.2.6-.5v-1.8c-2.4.5-2.9-1-2.9-1-.4-1-1-1.3-1-1.3-.8-.5.1-.5.1-.5.9.1 1.3.9 1.3.9.8 1.3 2 1 2.6.7 0-.6.3-1 .6-1.2-1.9-.2-3.9-1-3.9-4.2 0-.9.3-1.7.9-2.3-.1-.2-.4-1.1.1-2.3 0 0 .7-.2 2.3.9a8 8 0 0 1 4.2 0c1.6-1.1 2.3-.9 2.3-.9.5 1.2.2 2.1.1 2.3.6.6.9 1.4.9 2.3 0 3.3-2 4-3.9 4.2.3.3.6.8.6 1.6v2.4c0 .3.2.6.6.5A8.5 8.5 0 0 0 12 3.5Z" fill="currentColor" stroke="none"/>'),
  chev: S('<path d="m7 10 5 5 5-5"/>', ' data-chev'),
  sliders: S('<path d="M7 4v6M7 14v6M17 4v2M17 10v10"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="8" r="2"/>'),
  branch: S('<circle cx="6" cy="5.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7.5v9M18 10c0 4-6 3.5-11 7"/>'),
  rows: S('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  // composer menus
  at: S('<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8"/>'),
  slash: S('<path d="M16 4 8 20"/>'),
  image: S('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.5"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>'),
  clipboard: S('<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5h6v2.5H9Z"/>'),
  check: S('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"/>'),
  user: S('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
  exit: S('<path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10M15 8l4 4-4 4M19 12H9.5"/>'),
  stop: S('<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>'),
  worktree: S('<circle cx="6" cy="5.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7.5v9M8 12h8"/>'),
  minus: S('<path d="M5 12h14"/>'),
  dots: S('<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="2.8"/>'),
  mic: S('<rect x="9" y="3.5" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>'),
};
const I = NX_ICONS;

// Original 5x5 mirrored pixel avatars, seeded by the row title.
export function pixelAvatar(seed) {
  let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ h >>> 15, 2246822507) ^ Math.imul(h ^ h >>> 13, 3266489909)) >>> 0) / 4294967296;
  const pal = [['#3b5bd6', '#f2b48c'], ['#c2410c', '#fde2c4'], ['#7c3aed', '#f9c6e3'], ['#0f766e', '#f6d38a'], ['#be185d', '#ffd9b0']][Math.floor(rnd() * 5)];
  let r = '';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (rnd() > .45) {
    const c = rnd() > .3 ? pal[1] : '#2a1a14';
    r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>` + (x < 2 ? `<rect x="${4 - x}" y="${y}" width="1" height="1" fill="${c}"/>` : '');
  }
  return `<svg class="nx-av" viewBox="0 0 5 5" shape-rendering="crispEdges" aria-hidden="true"><rect width="5" height="5" fill="${pal[0]}"/>${r}</svg>`;
}

const shortTime = t => { const m = /(\d+)\s*(day|week|month|hour|minute)/.exec(t || ''); if (m) return m[1] + m[2][0].replace('m', m[2] === 'month' ? 'mo' : 'm');
  return /last month/.test(t) ? '1mo' : /yesterday/.test(t) ? '1d' : /last week/.test(t) ? '1w' : ''; };

const ago = ms => { const m = Math.max(0, (Date.now() - ms) / 60000); return m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : m < 10080 ? `${Math.round(m / 1440)}d` : m < 43200 ? `${Math.round(m / 10080)}w` : `${Math.round(m / 43200)}mo`; };
const esc = t => String(t).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
function note(text) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = text; document.body.append(t); setTimeout(() => t.remove(), 3200); }

import { createPaneHost, hasPane } from './neon-panes.js';

export function mountNeonChrome() {
  const api = window.sufficeDesktop, added = [], undo = [];
  const put = (parent, html, where = 'beforeend') => { if (!parent) return null; parent.insertAdjacentHTML(where, html); const el = where === 'afterend' ? parent.nextElementSibling : where === 'beforebegin' ? parent.previousElementSibling : where === 'afterbegin' ? parent.firstElementChild : parent.lastElementChild; added.push(el); return el; };
  document.body.dataset.skin = 'neon';

  // sidebar: header icons, nav list, section header, footer
  const side = document.querySelector('.sidebar');
  put(side?.querySelector('.sidebar-heading'), `<div class="nx nx-tools"><button class="nx-ib" data-nx="layout" aria-label="Toggle right panel">${I.layout}</button><button class="nx-ib" data-nx="search" aria-label="Search threads">${I.search}</button><button class="nx-ib" data-nx="sidebar" aria-label="Collapse sidebar">${I.sidebar}</button></div>`);
  const nav = [['compose', 'New thread', 'new'], ['list', 'Threads', 'threads'], ['issue', 'Issues', 'issues'], ['pr', 'Pull requests', 'prs'], ['auto', 'Automations', 'auto'], ['explore', 'Explore', 'explore'], ['more', 'More', 'more']];
  put(side?.querySelector('.new-session'), `<nav class="nx nx-nav" aria-label="Main">${nav.map(([ic, label, key], i) =>
    `<button class="nx-row${i ? '' : ' is-current'}" data-nx="${key}">${I[ic]}<span class="nx-label">${label}</span><span class="nx-badge" hidden></span></button>`).join('')}</nav>`, 'afterend');
  put(side?.querySelector('.session-section'), `<div class="nx nx-sec"><span>Threads</span><span class="nx-sec-tools"><button class="nx-ib" data-nx="density" aria-label="Compact thread list" aria-pressed="false">${I.rows}</button><button class="nx-ib" data-nx="new" aria-label="New thread">${I.plus}</button><button class="nx-ib" data-nx="search" aria-label="Search threads">${I.search}</button></span></div>`, 'afterbegin');
  const foot = put(side, `<div class="nx nx-foot">${pixelAvatar('local')}<span class="nx-who"><span class="nx-name">Local</span><span class="nx-org">No GitHub account</span></span><span class="nx-dot" aria-label="Ready"></span></div>`);

  // thread rows: who started it, age, and (unless compact) branch, its PR and the model
  // shortcut: local threads are all the signed-in user's; team plans need the author saved per thread.
  const list = side?.querySelector('.sidebar-sessions');
  let login = '';
  const prsByCwd = new Map();
  const userAv = () => login ? `<img class="nx-av" src="https://github.com/${encodeURIComponent(login)}.png?size=40" alt="" referrerpolicy="no-referrer" draggable="false">` : pixelAvatar('local');
  const meta = row => {
    const branch = row.dataset.branch, model = row.dataset.model, pr = branch && prsByCwd.get(row.dataset.cwd)?.[branch];
    return [branch && `<span class="nx-branch">${I.branch}<span>${esc(branch)}</span></span>`,
      pr && `<span class="nx-pr" data-state="${esc(pr.state.toLowerCase())}" title="Pull request #${pr.number} ${esc(pr.state.toLowerCase())}">${I.pr}#${pr.number}</span>`,
      model && `<span class="nx-model">${esc(model.split('/').pop())}</span>`].filter(Boolean).join('');
  };
  const fillMeta = () => list?.querySelectorAll('.session-row--sidebar[data-nx-deco]').forEach(row => {
    const m = row.querySelector('.nx-meta'), html = meta(row); if (m && m.dataset.html !== html) { m.dataset.html = html; m.innerHTML = html; m.hidden = !html; } });
  async function loadPrs() {
    if (!api?.branchPrs || !list) return;
    const roots = [...new Set([...list.querySelectorAll('.session-row--sidebar[data-branch][data-cwd]')].map(r => r.dataset.cwd))];
    await Promise.all(roots.map(async root => prsByCwd.set(root, await api.branchPrs(root).catch(() => ({})))));
    fillMeta();
  }
  const deco = () => {
    let fresh = false;
    list?.querySelectorAll('.session-row--sidebar:not([data-nx-deco])').forEach(row => {
      row.dataset.nxDeco = '1';
      const time = row.querySelector('.row-meta'), when = time?.dateTime ? Date.parse(time.dateTime) : NaN;
      row.insertAdjacentHTML('afterbegin', userAv());
      row.querySelector('.row-content')?.insertAdjacentHTML('beforeend', '<span class="nx-meta" hidden></span>');
      row.insertAdjacentHTML('beforeend', `<span class="nx-time">${Number.isFinite(when) ? ago(when) : shortTime(time?.textContent)}</span>`);
      if (row.dataset.cwd && row.dataset.branch && !prsByCwd.has(row.dataset.cwd)) fresh = true;
    });
    fillMeta(); if (fresh) loadPrs();
  };
  deco();
  const mo = list && new MutationObserver(deco); mo?.observe(list, { childList: true, subtree: true });
  // a GitHub avatar that fails to load falls back to the pixel one
  const onAvError = e => { if (e.target.matches?.('img.nx-av')) e.target.outerHTML = pixelAvatar(login || 'local'); };
  side?.addEventListener('error', onAvError, true);
  const density = side?.querySelector('[data-nx="density"]');
  const setCompact = on => { document.body.toggleAttribute('data-nx-compact', on); density?.setAttribute('aria-pressed', String(on)); try { localStorage.setItem('suffice-thread-compact', on ? '1' : ''); } catch {} };
  let compact = false; try { compact = localStorage.getItem('suffice-thread-compact') === '1'; } catch {}
  setCompact(compact);
  undo.push(() => { mo?.disconnect(); side?.removeEventListener('error', onAvError, true); document.body.removeAttribute('data-nx-compact');
    list?.querySelectorAll('[data-nx-deco]').forEach(r => { r.removeAttribute('data-nx-deco'); r.querySelectorAll('.nx-av,.nx-time,.nx-meta').forEach(e => e.remove()); }); });

  // composer: project/branch, where it runs, and repo count above; sliders in the toolbar
  const form = document.querySelector('.home .composer');
  const chips = put(form, `<div class="nx nx-chips"><button type="button" class="nx-chip" data-nx="project">${I.code}<span class="nx-chip-label">Select project</span>${I.chev}</button><button type="button" class="nx-chip" data-nx="env">${I.cloud}<span>Local</span>${I.chev}</button><span class="nx-grow"></span><button type="button" class="nx-chip" data-nx="repos">${I.repo}<span class="nx-chip-label">Repos</span>${I.chev}</button></div>`, 'beforebegin');
  put(form?.querySelector('.composer-toolbar .toolbar-group'), `<button type="button" class="button nx nx-tb" data-nx="tools" aria-label="Attach context">${I.sliders}</button>`);
  const prompt = form?.querySelector('textarea'); const ph = prompt?.placeholder;
  if (prompt) { prompt.placeholder = 'Ask anything, / for commands, @ for context'; undo.push(() => { prompt.placeholder = ph; }); }

  // live git + GitHub data (desktop app only; the browser preview keeps placeholders)
  const data = { issues: null, prs: null };
  const badge = (key, n) => { const b = side?.querySelector(`.nx-row[data-nx="${key}"] .nx-badge`); if (b) { b.hidden = !n; b.textContent = n || ''; } };
  async function refresh() {
    if (!api?.gitInfo) return;
    try {
      const [info, projects, issues, prs] = await Promise.all([api.gitInfo(), api.projects?.() ?? [], api.issues(), api.prs()]);
      Object.assign(data, { issues, prs });
      badge('issues', issues.items.length); badge('prs', prs.items.length);
      const repos = document.querySelector('[data-nx="repos"] .nx-chip-label');
      if (repos) repos.textContent = `${projects.length} repo${projects.length === 1 ? '' : 's'}`;
      foot.querySelector('.nx-name').textContent = info.login || info.author || 'Local';
      foot.querySelector('.nx-org').textContent = info.repo || (info.git ? 'No GitHub remote' : 'Not a git repository');
      if (info.login !== login) { login = info.login || ''; list?.querySelectorAll('.session-row--sidebar > .nx-av').forEach(av => { av.outerHTML = userAv(); }); }
      foot.querySelector('.nx-av').outerHTML = login ? userAv() : pixelAvatar(info.author || 'local');
      loadPrs();
    } catch (error) { note(error.message); }
  }
  refresh();
  const onFocus = () => refresh(); window.addEventListener('focus', onFocus); undo.push(() => window.removeEventListener('focus', onFocus));
  // project switches go through the picker, which mounts after this code: watch its name once it exists
  let pmo = null, timer = 0;
  const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
  const watchPicker = () => { const name = !pmo && document.querySelector('.project-picker .project-name'); if (!name) return;
    // fold Suffice's own project + branch pills into the chip row instead of showing both
    const bar = name.closest('.project-bar');
    if (bar) { chips.querySelector('[data-nx="project"]')?.remove(); for (const el of [...chips.children]) { bar.append(el); added.push(el); } chips.hidden = true; }
    pmo = new MutationObserver(later); pmo.observe(name, { childList: true, characterData: true, subtree: true }); };
  const bootWatch = setInterval(() => { watchPicker(); if (pmo) { clearInterval(bootWatch); later(); } }, 300);
  undo.push(() => { clearInterval(bootWatch); clearTimeout(timer); pmo?.disconnect(); });

  // issue / PR list: row fills the composer, arrow opens GitHub
  let pop = null;
  const closePop = () => { pop?.remove(); pop = null; };
  function openList(kind, anchor) {
    closePop();
    const res = data[kind], label = kind === 'prs' ? 'Pull requests' : 'Issues';
    pop = document.createElement('div'); pop.className = 'nx nx-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', label);
    const items = res?.items || [];
    pop.innerHTML = `<div class="nx-pop-head">${label}${res?.repo ? `<span>${esc(res.repo)}</span>` : ''}</div>` + (!api?.issues ? '<div class="nx-pop-empty">Open the desktop app to load GitHub data.</div>'
      : !res ? '<div class="nx-pop-empty">Loading…</div>'
      : !res.available ? `<div class="nx-pop-empty">${esc(res.reason)}</div>`
      : !items.length ? `<div class="nx-pop-empty">No open ${label.toLowerCase()}.</div>`
      : items.map((x, i) => `<div class="nx-pop-row"><button type="button" class="nx-pop-main" data-i="${i}"><span class="nx-num">#${x.number}</span><span class="nx-pop-title">${esc(x.title)}</span><span class="nx-time">${ago(x.updated)}</span></button><button type="button" class="nx-ib" data-open="${i}" aria-label="Open #${x.number} on GitHub">${S('<path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4"/>')}</button></div>`).join(''));
    document.body.append(pop);
    const r = anchor.getBoundingClientRect(); pop.style.left = `${r.right + 8}px`; pop.style.top = `${Math.min(r.top, innerHeight - pop.offsetHeight - 12)}px`;
    pop.addEventListener('click', e => {
      const open = e.target.closest('[data-open]'), main = e.target.closest('.nx-pop-main');
      if (open) { api.openGithub(items[+open.dataset.open].url).catch(err => note(err.message)); return; }
      if (main && prompt) { const x = items[+main.dataset.i];
        prompt.value = kind === 'prs' ? `Review pull request #${x.number} "${x.title}" (branch ${x.branch}): ${x.url}` : `Fix issue #${x.number} "${x.title}": ${x.url}`;
        prompt.dispatchEvent(new Event('input', { bubbles: true })); prompt.focus(); closePop(); }
    });
  }
  undo.push(closePop);

  // panes: modules registered with registerPane open in the main column
  const panes = createPaneHost({ api, note, esc, ago, icons: I, pixelAvatar, fillComposer: text => { panes.close(); if (prompt) { prompt.value = text; prompt.dispatchEvent(new Event('input', { bubbles: true })); prompt.focus(); } } });
  undo.push(() => panes.close());
  // wire everything to real actions
  const fire = sel => document.querySelector(sel)?.click();
  const actions = {
    new: () => fire('[data-action="new"]'), threads: () => fire('[data-action="search-sessions"]'), search: () => fire('[data-action="search-sessions"]'),
    sidebar: () => fire('[data-action="toggle-sidebar"]'),
    // the right panel toggle exists only while a thread is open
    layout: () => { const t = document.querySelector('.workspace-tool[aria-label="Toggle right panel"]'); if (t && t.offsetParent) t.click(); else note('Open a thread first'); },
    more: () => { // the stock header button is display:none, so anchor the workspace menu on a stand-in at the More row
      const row = document.querySelector('.nx-row[data-nx="more"]'), r = row.getBoundingClientRect(), b = document.createElement('button');
      b.dataset.action = 'workspace-menu'; b.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;opacity:0;pointer-events:none`;
      document.body.append(b); setTimeout(() => { b.click(); b.remove(); }); }, // deferred: the row's own click would otherwise close the menu as an outside click project: () => fire('.project-picker'), repos: () => fire('.project-picker'),
    density: () => setCompact(!document.body.hasAttribute('data-nx-compact')),
    tools: () => fire('[data-action="attach"]'), issues: b => openList('issues', b), prs: b => openList('prs', b),
  };
  const onClick = e => {
    if (pop && !e.target.closest('.nx-pop, [data-nx="issues"], [data-nx="prs"]')) closePop();
    const b = e.target.closest('[data-nx]'); if (!b) return; e.preventDefault();
    const act = actions[b.dataset.nx];
    if (b.closest('.nx-nav') && hasPane(b.dataset.nx)) { panes.open(b.dataset.nx); return; }
    if (b.dataset.nx === 'new') panes.close();
    if (act) act(b); else note(`${b.querySelector('.nx-label, span')?.textContent || b.getAttribute('aria-label')}: not in Suffice yet`);
  };
  const onKey = e => { if (e.key !== 'Escape') return; if (pop) closePop(); else if (panes.current && !e.target.closest?.('input, textarea, select')) panes.close(); };
  document.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
  undo.push(() => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); });
  // composer menus, run options, footer menu, dictation (neon-composer.js)
  undo.push(mountNeonComposer({ api, note, esc, icons: I, S, data, prompt, form, foot, getLogin: () => login }));

  return () => { undo.forEach(f => f()); added.forEach(el => el?.remove()); delete document.body.dataset.skin; };
}
