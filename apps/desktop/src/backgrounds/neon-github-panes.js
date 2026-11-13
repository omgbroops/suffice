// Full-page Issues and Pull requests panes for the neon layout: tabs, filters, rows, and a detail panel.
import './neon-github-panes.css';
import { registerPane } from './neon-panes.js';
import { stateOf, matchesQuery } from './neon-util.js';

const TABS = { prs: [['open', 'Open'], ['merged', 'Merged'], ['closed', 'Closed']], issues: [['open', 'Open'], ['closed', 'Closed']] };

function mountGithub(kind, el, ctx) {
  const { api, esc, ago, icons, pixelAvatar, fillComposer, note } = ctx, isPr = kind === 'prs', gh = isPr ? 'pr' : 'issue';
  const st = { tab: 'open', mine: false, q: '', label: '', login: '', res: null, sel: null, detail: null, seq: 0 };
  el.classList.add('nx-gh-body');
  el.innerHTML = `<div class="nx-gh"><div class="nx-gh-main"><div class="nx-gh-bar"><div class="nx-gh-tabs" role="tablist">${TABS[kind].map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}</button>`).join('')}</div>
    <label class="nx-gh-search">${icons.search}<input type="search" placeholder="Search titles" aria-label="Search titles"></label>
    <button type="button" class="nx-gh-chip" data-mine aria-pressed="false">Mine</button>${isPr ? '' : '<select class="nx-gh-label" aria-label="Filter by label"><option value="">All labels</option></select>'}</div>
    <div class="nx-gh-list" role="list"></div></div><aside class="nx-gh-detail" hidden aria-label="Details"></aside></div>`;
  ctx.actions.innerHTML = '<span class="nx-gh-repo"></span><button type="button" class="nx-gh-refresh" aria-label="Refresh">Refresh</button>';
  const $ = s => el.querySelector(s), listEl = $('.nx-gh-list'), detEl = $('.nx-gh-detail');
  const av = login => login ? `<img class="nx-av" src="https://github.com/${encodeURIComponent(login)}.png?size=40" alt="" referrerpolicy="no-referrer" draggable="false">` : pixelAvatar('?');
  const onErr = e => { if (e.target.matches?.('img.nx-av')) e.target.outerHTML = pixelAvatar(e.target.alt || 'x'); };
  el.addEventListener('error', onErr, true);
  const colour = c => /^[0-9a-f]{6}$/i.test(c || '') ? `#${c}` : '#8b868a';

  const rowHtml = (x, i) => {
    const checks = x.checks && (x.checks.fail ? 'fail' : x.checks.pending ? 'pending' : x.checks.pass ? 'pass' : '');
    const review = { APPROVED: 'Approved', CHANGES_REQUESTED: 'Changes requested', REVIEW_REQUIRED: 'Review needed' }[x.review] || '';
    const state = stateOf(x);
    return `<button type="button" class="nx-gh-row${st.sel === x.number ? ' is-sel' : ''}" role="listitem" data-i="${i}">
      <span class="nx-gh-state" data-state="${state}">${isPr ? icons.pr : icons.issue}</span>
      <span class="nx-gh-num">#${x.number}</span><span class="nx-gh-title">${esc(x.title)}</span>
      ${x.draft ? '<span class="nx-gh-tag">Draft</span>' : ''}
      ${(x.labels || []).slice(0, 3).map(l => `<span class="nx-gh-label-pill" style="--lc:${colour(l.color)}">${esc(l.name)}</span>`).join('')}
      ${isPr ? `<span class="nx-gh-branch" title="${esc(x.branch)} into ${esc(x.base)}">${esc(x.branch)}<span>&rarr;</span>${esc(x.base)}</span>` : (x.comments ? `<span class="nx-gh-meta">${x.comments} comment${x.comments === 1 ? '' : 's'}</span>` : '')}
      ${checks ? `<span class="nx-gh-check" data-c="${checks}" title="Checks: ${x.checks.pass} passed, ${x.checks.fail} failed, ${x.checks.pending} pending"></span>` : ''}
      ${review ? `<span class="nx-gh-review" data-r="${x.review}">${review}</span>` : ''}
      ${isPr ? `<span class="nx-gh-diff"><b>+${x.additions}</b> <i>-${x.deletions}</i></span>` : ''}
      ${av(x.author).replace('alt=""', `alt="${esc(x.author)}"`)}<span class="nx-gh-age">${ago(x.updated)}</span></button>`;
  };
  const visible = () => (st.res?.items || []).filter(x => (!st.mine || x.author === st.login) && (!st.label || x.labels?.some(l => l.name === st.label)) && matchesQuery(x, st.q));
  function renderList() {
    el.querySelectorAll('[data-tab]').forEach(b => { const on = b.dataset.tab === st.tab; b.setAttribute('aria-selected', String(on)); b.classList.toggle('is-on', on); });
    const mine = $('[data-mine]'); mine.classList.toggle('is-on', st.mine); mine.setAttribute('aria-pressed', String(st.mine));
    ctx.actions.querySelector('.nx-gh-repo').textContent = st.res?.repo || '';
    const r = st.res;
    if (!api?.githubList) { listEl.innerHTML = '<div class="nx-gh-empty">Open the desktop app to load GitHub data.</div>'; return; }
    if (!r) { listEl.innerHTML = '<div class="nx-gh-empty">Loading…</div>'; return; }
    if (!r.available) { listEl.innerHTML = `<div class="nx-gh-empty" data-reason>${esc(r.reason)}</div>`; return; }
    const rows = visible();
    listEl.innerHTML = rows.length ? rows.map(x => rowHtml(x, r.items.indexOf(x))).join('')
      : `<div class="nx-gh-empty" data-empty>${r.items.length ? 'Nothing matches these filters.' : `No ${st.tab} ${isPr ? 'pull requests' : 'issues'}.`}</div>`;
    const sel = $('.nx-gh-label'); if (sel) { const names = [...new Set(r.items.flatMap(x => x.labels.map(l => l.name)))].sort(); sel.innerHTML = '<option value="">All labels</option>' + names.map(n => `<option${n === st.label ? ' selected' : ''}>${esc(n)}</option>`).join(''); }
  }
  async function load() {
    const n = ++st.seq; st.res = null; st.sel = null; detEl.hidden = true; renderList();
    try { const r = await api.githubList({ kind: gh, state: st.tab, limit: 100 }); if (n === st.seq) { st.res = r; renderList(); } }
    catch (error) { if (n === st.seq) { st.res = { available: false, reason: error.message, items: [] }; renderList(); } }
  }
  async function openDetail(x) {
    st.sel = x.number; st.detail = null; listEl.querySelectorAll('.nx-gh-row').forEach(r => r.classList.toggle('is-sel', +r.dataset.i === st.res.items.indexOf(x)));
    const prompt = isPr ? `Review pull request #${x.number} "${x.title}" (branch ${x.branch}): ${x.url}` : `Fix issue #${x.number} "${x.title}": ${x.url}`;
    const draw = d => { detEl.hidden = false; detEl.innerHTML = `<div class="nx-gh-dh"><span class="nx-gh-state" data-state="${stateOf(x)}">${isPr ? icons.pr : icons.issue}</span><h3>${esc(x.title)}</h3><button type="button" class="nx-gh-x" data-close aria-label="Close details">${icons.plus}</button></div>
      <div class="nx-gh-sub">#${x.number} by ${esc(x.author)} &middot; ${esc(stateOf(x))}${isPr ? ` &middot; ${esc(x.branch)} &rarr; ${esc(x.base)}` : ''}${d ? ` &middot; ${d.comments} comment${d.comments === 1 ? '' : 's'}` : ''}</div>
      <div class="nx-gh-btns"><button type="button" class="nx-gh-btn is-primary" data-fill>${isPr ? 'Review this PR' : 'Fix this issue'}</button><button type="button" class="nx-gh-btn" data-gh>Open on GitHub</button></div>
      <div class="nx-gh-scroll">${d ? `<pre class="nx-gh-body-text">${esc(d.body.trim() || 'No description provided.')}</pre>${isPr ? `<h4>Changed files (${d.files.length})</h4><ul class="nx-gh-files">${d.files.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}` : '<div class="nx-gh-empty">Loading…</div>'}</div>`;
      detEl.querySelector('[data-fill]').onclick = () => fillComposer(prompt);
      detEl.querySelector('[data-gh]').onclick = () => api.openGithub(x.url).catch(e => note(e.message));
      detEl.querySelector('[data-close]').onclick = () => { st.sel = null; detEl.hidden = true; renderList(); }; };
    draw(null);
    try { const d = await api.githubDetail({ kind: gh, number: x.number }); if (st.sel === x.number) draw(d); }
    catch (error) { if (st.sel === x.number) { draw({ body: `Could not load details: ${error.message}`, comments: 0, files: [] }); } }
  }
  el.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]'), row = e.target.closest('.nx-gh-row');
    if (tab && tab.dataset.tab !== st.tab) { st.tab = tab.dataset.tab; load(); }
    else if (e.target.closest('[data-mine]')) { st.mine = !st.mine; renderList(); }
    else if (row) openDetail(st.res.items[+row.dataset.i]);
  });
  $('.nx-gh-search input').addEventListener('input', e => { st.q = e.target.value.trim().toLowerCase(); renderList(); });
  $('.nx-gh-label')?.addEventListener('change', e => { st.label = e.target.value; renderList(); });
  const refresh = () => load(); ctx.actions.querySelector('.nx-gh-refresh').addEventListener('click', refresh);
  api?.gitInfo?.().then(i => { st.login = i.login || ''; if (st.mine) renderList(); }).catch(() => {});
  if (api?.githubList) load(); else renderList();
  return () => { el.classList.remove('nx-gh-body'); el.removeEventListener('error', onErr, true); st.seq++; };
}

registerPane('issues', { title: 'Issues', mount: (el, ctx) => mountGithub('issues', el, ctx) });
registerPane('prs', { title: 'Pull requests', mount: (el, ctx) => mountGithub('prs', el, ctx) });
