import {icon} from './ui.js';

// Pull request view. Standalone: renderPrView(container, pr, handlers) builds header, overview and review column.
// pr = {repo, number, title, added, removed, state, author, age, meta:{Branch,Status,Reviewers,Labels,Checks,Thread,Issue},
//       description:[{p}|{ul:[]}], checks:[{name,status,url}], findings:[{severity,text,path,line,resolved}], review:{caption}}
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
const svg = (path, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const PR_ICON = svg('<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M6 8.4v7.2M18 15.6V10a3 3 0 0 0-3-3h-3.5m2.5-3-3 3 3 3"/>', 'pr-icon');
const MINUS = svg('<path d="M6 12h12"/>', 'pr-check-glyph');
const META_ICONS = {Branch: 'branch', Status: 'circle', Reviewers: 'agent', Labels: 'tick', Checks: 'check', Thread: 'message', Issue: 'bug'};
const METHODS = [['Squash and merge', 'Combine all commits'], ['Merge commit', 'Preserve commit history'], ['Rebase and merge', 'Reapply all commits']];

function inlineCode(parent, text) {
  text.split(/`([^`]+)`/).forEach((part, index) => parent.append(index % 2 ? el('code', 'pr-code', part) : document.createTextNode(part)));
}
function button(label, {glyph, cls = '', trailing = ''} = {}) {
  const node = el('button', `pr-button ${cls}`.trim());
  node.type = 'button';
  if (glyph) node.insertAdjacentHTML('beforeend', glyph);
  if (label) node.append(el('span', '', label));
  if (trailing) node.insertAdjacentHTML('beforeend', trailing);
  return node;
}
function section(title) {
  const root = el('section', 'pr-section'), head = el('button', 'pr-section-head');
  head.type = 'button'; head.setAttribute('aria-expanded', 'true');
  head.append(el('span', '', title)); head.insertAdjacentHTML('beforeend', icon('chevron', 'pr-section-chevron'));
  const body = el('div', 'pr-section-body');
  head.addEventListener('click', () => { const open = head.getAttribute('aria-expanded') !== 'true'; head.setAttribute('aria-expanded', String(open)); body.hidden = !open; });
  root.append(head, body);
  return {root, body};
}

function mergePopover(pr, onMerge) {
  const wrap = el('div', 'pr-merge');
  const trigger = button('Merge', {glyph: icon('merge'), cls: 'pr-button--primary', trailing: icon('chevron', 'pr-chevron-down')});
  // Capy tints Merge with the accent; here only a user-set accent does, otherwise the mono primary stays.
  if (document.documentElement.style.getPropertyValue('--blue')) trigger.dataset.accent = 'user';
  trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
  const pop = el('div', 'pr-popover'); pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Merge pull request');
  pop.append(el('div', 'pr-popover-label', `Merging ${pr.number ? '#' + pr.number : 'pull'} into ${pr.meta?.Branch?.base || 'main'}`));
  const stack = el('div', 'pr-stack'); stack.insertAdjacentHTML('beforeend', PR_ICON);
  stack.append(el('span', 'pr-stack-num', '#' + pr.number), el('span', 'pr-stack-title', pr.title)); pop.append(stack);
  const note = el('textarea', 'pr-popover-field'); note.placeholder = 'Leave a comment (optional)'; note.rows = 2; note.setAttribute('aria-label', 'Merge comment');
  pop.append(note, el('div', 'pr-popover-sep'), el('div', 'pr-popover-label', 'Select method'));
  for (const [name, hint] of METHODS) {
    const row = el('button', 'pr-method'); row.type = 'button';
    row.append(el('span', 'pr-method-name', name), el('span', 'pr-method-hint', hint));
    row.addEventListener('click', () => { close(); onMerge?.({method: name, comment: note.value}); });
    pop.append(row);
  }
  const outside = event => { if (!wrap.contains(event.target)) close(); };
  const key = event => { if (event.key === 'Escape') { close(); trigger.focus(); } };
  function close() { pop.hidden = true; trigger.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); }
  trigger.addEventListener('click', () => {
    if (!pop.hidden) return close();
    pop.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key);
  });
  wrap.append(trigger, pop);
  return {wrap, close};
}

function header(pr, handlers, cleanups) {
  const bar = el('header', 'pr-bar');
  const crumb = el('button', 'pr-crumb'); crumb.type = 'button';
  crumb.append(el('span', '', 'Pull requests')); crumb.insertAdjacentHTML('beforeend', icon('chevron', 'pr-crumb-chevron'));
  crumb.addEventListener('click', () => handlers.onBack?.());
  const title = el('div', 'pr-bar-title');
  title.insertAdjacentHTML('beforeend', PR_ICON);
  title.querySelector('.pr-icon').dataset.state = pr.state || 'open';
  title.append(el('span', 'pr-bar-name', pr.title));
  const counts = el('span', 'pr-counts');
  counts.append(el('span', 'diff-added', `+${pr.added}`), el('span', 'diff-removed', `−${pr.removed}`));
  title.append(counts);
  const tabs = el('div', 'pr-tabs'); tabs.setAttribute('role', 'tablist');
  for (const name of ['Overview', 'Guide', 'Diff']) {
    const tab = el('button', 'pr-button pr-tab', name); tab.type = 'button'; tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(name === (pr.tab || 'Overview')));
    tab.addEventListener('click', () => { tabs.querySelectorAll('.pr-tab').forEach(t => t.setAttribute('aria-selected', String(t === tab))); handlers.onTab?.(name); });
    tabs.append(tab);
  }
  const chat = el('div', 'pr-split');
  const chatMain = button('Open thread', {glyph: icon('message')}), chatMore = button('', {glyph: icon('chevron', 'pr-chevron-down')});
  chatMore.classList.add('pr-split-more'); chatMore.setAttribute('aria-label', 'Thread options'); chatMain.addEventListener('click', () => handlers.onThread?.());
  chat.append(chatMain, chatMore);
  const preview = button('Preview', {glyph: icon('monitor')});
  const badge = el('span', 'pr-badge'); badge.dataset.tone = pr.preview || 'success'; preview.querySelector('.icon').after(badge);
  const review = button('Review'); review.addEventListener('click', () => handlers.onReview?.());
  const merge = mergePopover(pr, handlers.onMerge); cleanups.push(merge.close);
  const more = button('', {glyph: icon('more'), cls: 'pr-button--ghost'}); more.setAttribute('aria-label', 'More actions');
  bar.append(crumb, title, tabs, chat, preview, review, merge.wrap, more);
  return bar;
}

function overview(pr) {
  const page = el('div', 'pr-page');
  page.append(el('h1', 'pr-h1', pr.title));
  const by = el('div', 'pr-author');
  by.append(el('span', 'pr-avatar', (pr.author || '?')[0].toUpperCase()), el('span', 'pr-author-name', pr.author), el('span', 'pr-sep'), el('span', '', `${pr.repo}#${pr.number}`), el('span', '', pr.age));
  page.append(by);
  const meta = el('dl', 'pr-meta');
  for (const [label, value] of Object.entries(pr.meta || {})) {
    const row = el('div', 'pr-meta-row'), key = el('dt', 'pr-meta-label');
    key.insertAdjacentHTML('beforeend', icon(META_ICONS[label] || 'circle'));
    key.append(el('span', '', label));
    const val = el('dd', 'pr-meta-value');
    val.append(...(Array.isArray(value) ? value : [value]).map(item => typeof item === 'string' ? el('span', 'pr-chip', item) : el('span', 'pr-chip', item.label || '')));
    row.append(key, val); meta.append(row);
  }
  page.append(meta);
  const desc = section('Description');
  for (const block of pr.description || []) {
    if (block.p) { const p = el('p', 'pr-p'); inlineCode(p, block.p); desc.body.append(p); }
    if (block.ul) { const ul = el('ul', 'pr-ul'); for (const item of block.ul) { const li = el('li'); inlineCode(li, item); ul.append(li); } desc.body.append(ul); }
  }
  const checks = section('Checks');
  for (const check of pr.checks || []) {
    const row = check.url ? el('a', 'pr-check') : el('div', 'pr-check');
    if (check.url) row.href = check.url;
    row.dataset.status = check.status;
    row.insertAdjacentHTML('beforeend', check.status === 'skipped' ? MINUS : check.status === 'failed' ? svg('<path d="M6 6l12 12M18 6 6 18"/>', 'pr-check-glyph') : icon('check', 'pr-check-glyph'));
    row.append(el('span', 'pr-check-name', check.name), el('span', 'pr-check-status', check.status[0].toUpperCase() + check.status.slice(1)));
    if (check.url) row.insertAdjacentHTML('beforeend', icon('external', 'pr-check-arrow'));
    checks.body.append(row);
  }
  page.append(desc.root, checks.root);
  return page;
}

function review(pr, handlers) {
  const col = el('aside', 'pr-review');
  const head = el('div', 'pr-review-head'); head.append(el('span', '', 'Review'), ...[icon('chevron', 'pr-section-chevron')].map(h => { const s = el('span', 'pr-review-chevron'); s.innerHTML = h; return s; }));
  const findings = pr.findings || [], open = findings.filter(f => !f.resolved), done = findings.length - open.length;
  const summary = el('p', 'pr-review-summary', `${findings.length} findings from the last review`);
  const tally = el('p', 'pr-review-tally', `${open.length} open · ${done} resolved`);
  const list = el('div', 'pr-findings');
  const LIMIT = 5;
  findings.forEach((finding, index) => {
    const row = el('button', 'pr-finding'); row.type = 'button'; row.dataset.severity = finding.severity.toLowerCase(); row.hidden = index >= LIMIT;
    const top = el('span', 'pr-finding-top'); top.append(el('span', 'pr-finding-sev', finding.severity), el('span', 'pr-finding-text', finding.text));
    row.append(top, el('span', 'pr-finding-path', `${finding.path} · Line ${finding.line}`));
    row.addEventListener('click', () => handlers.onFinding?.(finding));
    list.append(row);
  });
  col.append(head, summary, tally, list);
  if (findings.length > LIMIT) {
    const more = el('button', 'pr-show-more', `Show ${findings.length - LIMIT} more`); more.type = 'button';
    more.addEventListener('click', () => { list.querySelectorAll('[hidden]').forEach(n => { n.hidden = false; }); more.remove(); });
    col.append(more);
  }
  const rerun = el('div', 'pr-split pr-split--full');
  const again = button('Rerun review', {glyph: icon('refresh')}), opts = button('', {glyph: icon('chevron', 'pr-chevron-down')});
  opts.classList.add('pr-split-more'); opts.setAttribute('aria-label', 'Review options'); again.addEventListener('click', () => handlers.onRerun?.());
  rerun.append(again, opts);
  col.append(rerun, el('p', 'pr-caption', pr.review?.caption || 'Organization default · Medium'));
  return col;
}

export function renderPrView(container, pr, handlers = {}) {
  const cleanups = [], root = el('div', 'pr-view');
  root.append(header(pr, handlers, cleanups));
  const body = el('div', 'pr-body');
  body.append(overview(pr), review(pr, handlers));
  root.append(body);
  container.append(root);
  return {root, destroy() { cleanups.forEach(fn => fn()); root.remove(); }};
}
