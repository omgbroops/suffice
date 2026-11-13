import './neon-automations-pane.js';
import './neon-threads-pane.js';
import './neon-explore-pane.js';
import './neon-github-panes.js';
import './neon-composer.css';
import { mountNeonComposer } from './neon-composer.js';
import { mountUserMenu } from './neon-user-menu.js';
import { createPaneHost, hasPane } from './neon-panes.js';
import { S, NX_ICONS } from './neon-icons.js';
import { esc, ago, shortTime, note, clearNotes, stateOf } from './neon-util.js';

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

export function mountNeonChrome() {
  const api = window.sufficeDesktop, added = [], undo = [];
  const put = (parent, html, where = 'beforeend') => { if (!parent) return null; parent.insertAdjacentHTML(where, html); const el = where === 'afterend' ? parent.nextElementSibling : where === 'beforebegin' ? parent.previousElementSibling : where === 'afterbegin' ? parent.firstElementChild : parent.lastElementChild; added.push(el); return el; };
  document.body.dataset.skin = 'neon';

  const side = document.querySelector('.sidebar');
  put(side?.querySelector('.sidebar-heading'), `<div class="nx nx-tools"><button class="nx-ib" data-nx="layout" aria-label="Toggle right panel">${I.layout}</button><button class="nx-ib" data-nx="search" aria-label="Search threads">${I.search}</button><button class="nx-ib" data-nx="sidebar" aria-label="Collapse sidebar">${I.sidebar}</button></div>`);
  const nav = [['compose', 'New thread', 'new'], ['list', 'Threads', 'threads'], ['issue', 'Issues', 'issues'], ['pr', 'Pull requests', 'prs'], ['auto', 'Automations', 'auto'], ['explore', 'Explore', 'explore'], ['more', 'More', 'more']];
  put(side?.querySelector('.new-session'), `<nav class="nx nx-nav" aria-label="Main">${nav.map(([ic, label, key], i) =>
    `<button class="nx-row${i ? '' : ' is-current'}" data-nx="${key}">${I[ic]}<span class="nx-label">${label}</span><span class="nx-badge" hidden></span></button>`).join('')}</nav>`, 'afterend');
  put(side?.querySelector('.session-section'), `<div class="nx nx-sec"><span>Threads</span><span class="nx-sec-tools"><button class="nx-ib" data-nx="density" aria-label="Compact thread list" aria-pressed="false">${I.rows}</button><button class="nx-ib" data-nx="new" aria-label="New thread">${I.plus}</button><button class="nx-ib" data-nx="search" aria-label="Search threads">${I.search}</button></span></div>`, 'afterbegin');
  const foot = put(side, `<div class="nx nx-foot"></div>`);

  // shortcut: local threads are all the signed-in user's; team plans need the author saved per thread.
  const list = side?.querySelector('.sidebar-sessions');
  let login = '';
  const prsByCwd = new Map();
  const userAv = () => login ? `<img class="nx-av" src="https://github.com/${encodeURIComponent(login)}.png?size=40" alt="" referrerpolicy="no-referrer" draggable="false">` : pixelAvatar('local');
  const um = mountUserMenu({ api, icons: I, pixelAvatar, userAv, foot });
  undo.push(um.cleanup);
  const meta = row => {
    const branch = row.dataset.branch, model = row.dataset.model, pr = branch && prsByCwd.get(row.dataset.cwd)?.[branch];
    return [branch && `<span class="nx-branch">${I.branch}<span>${esc(branch)}</span></span>`,
      pr && `<span class="nx-pr" data-state="${esc(stateOf(pr))}" title="Pull request #${pr.number} ${esc(stateOf(pr))}">${I.pr}#${pr.number}</span>`,
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
  const onAvError = e => { if (e.target.matches?.('img.nx-av')) e.target.outerHTML = pixelAvatar(login || 'local'); };
  side?.addEventListener('error', onAvError, true);
  const density = side?.querySelector('[data-nx="density"]');
  const setCompact = on => { document.body.toggleAttribute('data-nx-compact', on); density?.setAttribute('aria-pressed', String(on)); try { localStorage.setItem('suffice-thread-compact', on ? '1' : ''); } catch {} };
  let compact = false; try { compact = localStorage.getItem('suffice-thread-compact') === '1'; } catch {}
  setCompact(compact);
  undo.push(() => { mo?.disconnect(); side?.removeEventListener('error', onAvError, true); document.body.removeAttribute('data-nx-compact');
    list?.querySelectorAll('[data-nx-deco]').forEach(r => { r.removeAttribute('data-nx-deco'); r.querySelectorAll('.nx-av,.nx-time,.nx-meta').forEach(e => e.remove()); }); });

  const form = document.querySelector('.home .composer');
  const chips = put(form, `<div class="nx nx-chips"><button type="button" class="nx-chip" data-nx="project">${I.code}<span class="nx-chip-label">Select project</span>${I.chev}</button><button type="button" class="nx-chip" data-nx="env">${I.cloud}<span>Local</span>${I.chev}</button><span class="nx-grow"></span><button type="button" class="nx-chip" data-nx="repos">${I.repo}<span class="nx-chip-label">Repos</span>${I.chev}</button></div>`, 'beforebegin');
  put(form?.querySelector('.composer-toolbar .toolbar-group'), `<button type="button" class="button nx nx-tb" data-nx="tools" aria-label="Attach context">${I.sliders}</button>`);
  const prompt = form?.querySelector('textarea'); const ph = prompt?.placeholder;
  if (prompt) { prompt.placeholder = 'Ask anything, / for commands, @ for context'; undo.push(() => { prompt.placeholder = ph; }); }

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
      if (info.login !== login) { login = info.login || ''; list?.querySelectorAll('.session-row--sidebar > .nx-av').forEach(av => { av.outerHTML = userAv(); }); } um.set(info);
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

  const panes = createPaneHost({ api, note, esc, ago, icons: I, pixelAvatar, userAv, fillComposer: text => { panes.close(); if (prompt) { prompt.value = text; prompt.dispatchEvent(new Event('input', { bubbles: true })); prompt.focus(); } } });
  undo.push(() => panes.close());
  let moreTimer = 0, moreBtn = null;
  const fire = sel => document.querySelector(sel)?.click();
  const actions = {
    new: () => fire('[data-action="new"]'), threads: () => fire('[data-action="search-sessions"]'), search: () => fire('[data-action="search-sessions"]'),
    sidebar: () => fire('[data-action="toggle-sidebar"]'),
    // the right panel toggle exists only while a thread is open
    layout: () => { const t = document.querySelector('.workspace-tool[aria-label="Toggle right panel"]'); if (t && t.offsetParent) t.click(); else note('Open a thread first'); },
    more: () => { // the stock header button is display:none, so anchor the workspace menu on a stand-in at the More row
      const row = document.querySelector('.nx-row[data-nx="more"]'), r = row.getBoundingClientRect(), b = document.createElement('button');
      b.dataset.action = 'workspace-menu'; b.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;opacity:0;pointer-events:none`;
      document.body.append(b); moreBtn = b; moreTimer = setTimeout(() => { b.click(); b.remove(); }); }, // deferred: the row's own click would otherwise close the menu as an outside click
    project: () => fire('.project-picker'), repos: () => fire('.project-picker'),
    density: () => setCompact(!document.body.hasAttribute('data-nx-compact')),
    tools: () => fire('[data-action="attach"]'),
  };
  const onClick = e => {
    const b = e.target.closest('[data-nx]'); if (!b) return; e.preventDefault();
    const act = actions[b.dataset.nx];
    if (b.closest('.nx-nav') && hasPane(b.dataset.nx)) { panes.open(b.dataset.nx); return; }
    if (b.dataset.nx === 'new') panes.close();
    if (act) act(b); else note(`${b.querySelector('.nx-label, span')?.textContent || b.getAttribute('aria-label')}: not in Suffice yet`);
  };
  const onKey = e => { if (e.key !== 'Escape') return; if (panes.current && !e.target.closest?.('input, textarea, select')) panes.close(); };
  document.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
  undo.push(() => { clearTimeout(moreTimer); moreBtn?.remove(); document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); });
  undo.push(mountNeonComposer({ api, note, esc, icons: I, S, data, prompt, form }));

  return () => { undo.forEach(f => f()); clearNotes(); added.forEach(el => el?.remove()); delete document.body.dataset.skin; };
}
